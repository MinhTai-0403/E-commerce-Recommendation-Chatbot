import os
import json
import hashlib
import time
from io import BytesIO
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import faiss
import numpy as np
import open_clip
import requests
import torch
from dotenv import load_dotenv
from PIL import Image
from pymongo import MongoClient
from pymongo.errors import (
    AutoReconnect,
    ConnectionFailure,
    NetworkTimeout,
    PyMongoError,
    ServerSelectionTimeoutError,
)

# ==========================================================
# CẤU HÌNH
# ==========================================================
EMBEDDING_DIM = 512
SAVE_EVERY = 100  # Lưu mỗi 100 ảnh; metadata checkpoint chỉ lưu ID nên vẫn nhẹ.
CHECKPOINT_VERSION = 3

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
DATA_ROOT = os.path.join(BASE_DIR, "data")
DATA_DIR = os.path.join(DATA_ROOT, "products")
IMAGE_CACHE_DIR = os.path.join(DATA_DIR, "_downloaded")
FAISS_DIR = os.path.join(BASE_DIR, "index")

os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
os.makedirs(FAISS_DIR, exist_ok=True)

INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMB_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
META_PATH = os.path.join(FAISS_DIR, "products.json")
FAILED_PRODUCTS_PATH = os.path.join(FAISS_DIR, "failed_products.json")

PARTIAL_EMB_PATH = os.path.join(FAISS_DIR, "embeddings_partial.npy")
PARTIAL_META_PATH = os.path.join(FAISS_DIR, "products_partial.json")
PROGRESS_PATH = os.path.join(FAISS_DIR, "progress.json")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Thiết bị đang dùng: {DEVICE}")


# ==========================================================
# ĐỌC BIẾN MÔI TRƯỜNG MONGODB
# Hỗ trợ .env nằm cùng build_index.py hoặc ở thư mục cha.
# ==========================================================
def load_environment() -> None:
    env_candidates = [
        os.path.join(BASE_DIR, ".env"),
        os.path.join(PARENT_DIR, ".env"),
    ]

    loaded_paths: List[str] = []
    for env_path in env_candidates:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False, encoding="utf-8-sig")
            loaded_paths.append(env_path)

    # Cho phép python-dotenv tự tìm thêm .env theo thư mục hiện hành.
    load_dotenv(override=False, encoding="utf-8-sig")

    if loaded_paths:
        print("Đã đọc biến môi trường từ:")
        for path in loaded_paths:
            print(f"- {path}")


load_environment()

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB = os.getenv("MONGODB_DB", "").strip()
MONGODB_PRODUCTS_COLLECTION = (
    os.getenv("MONGODB_PRODUCTS_COLLECTION")
    or os.getenv("MONGODB_PRODUCTS_COLLECTION_NAME")
    or os.getenv("MONGODB_PRODUCTS")
    or ""
).strip()

if not MONGODB_URI or not MONGODB_DB or not MONGODB_PRODUCTS_COLLECTION:
    raise ValueError(
        "Thiếu cấu hình MongoDB. File .env phải có đủ:\n"
        "MONGODB_URI=...\n"
        "MONGODB_DB=cosarii\n"
        "MONGODB_PRODUCTS_COLLECTION=cellphones_products"
    )


# Đọc MongoDB theo từng trang nhỏ để tránh cursor dài bị hủy.
MONGODB_FETCH_BATCH_SIZE = max(
    50, int(os.getenv("MONGODB_FETCH_BATCH_SIZE", "200"))
)
MONGODB_FETCH_MAX_RETRIES = max(
    1, int(os.getenv("MONGODB_FETCH_MAX_RETRIES", "5"))
)
MONGODB_FETCH_RETRY_SECONDS = max(
    1, int(os.getenv("MONGODB_FETCH_RETRY_SECONDS", "5"))
)
MONGODB_SOCKET_TIMEOUT_MS = max(
    60000, int(os.getenv("MONGODB_SOCKET_TIMEOUT_MS", "600000"))
)
FORCE_REBUILD_INDEX = os.getenv(
    "FORCE_REBUILD_INDEX", "false"
).strip().lower() in {"1", "true", "yes", "y", "on"}


# ==========================================================
# NẠP OPENCLIP
# ==========================================================
model = None
preprocess = None

print(f"Đang tải mô hình CLIP ({CLIP_MODEL_NAME}, {DEVICE})...")
try:
    model, _, preprocess = open_clip.create_model_and_transforms(
        CLIP_MODEL_NAME,
        pretrained=CLIP_PRETRAINED,
    )
    model.to(DEVICE).eval()
    print("Mô hình OpenCLIP đã tải thành công.")
except Exception as exc:
    print(f"Lỗi tải mô hình OpenCLIP: {exc}")
    model = None
    preprocess = None


# ==========================================================
# HÀM TIỆN ÍCH
# ==========================================================
def normalize_identity(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def get_product_id(product: Dict[str, Any]) -> str:
    """ID chính dùng cho checkpoint và nhận diện sản phẩm."""
    for key in (
        "productKey",
        "_id",
        "id",
        "productId",
        "product_id",
        "sku",
        "slug",
        "url",
        "name",
        "title",
    ):
        value = normalize_identity(product.get(key))
        if value:
            return value
    return ""


def get_product_aliases(product: Dict[str, Any]) -> Set[str]:
    """Các khóa phụ giúp đối chiếu metadata local cũ với MongoDB."""
    aliases: Set[str] = set()

    for key in (
        "productKey",
        "_id",
        "id",
        "productId",
        "product_id",
        "sku",
        "slug",
        "url",
    ):
        value = normalize_identity(product.get(key))
        if value:
            aliases.add(value)

    # Chỉ dùng tên làm khóa cuối khi sản phẩm không có mã/slug/url.
    if not aliases:
        for key in ("name", "title"):
            value = normalize_identity(product.get(key))
            if value:
                aliases.add(value)
                break

    return aliases


def save_json_atomic(path: str, data: Any) -> None:
    temp_path = f"{path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2, default=str)
    os.replace(temp_path, path)


def save_npy_atomic(path: str, array: np.ndarray) -> None:
    temp_path = f"{path}.tmp"
    with open(temp_path, "wb") as file:
        np.save(file, array)
    os.replace(temp_path, path)


def faiss_gpu_available() -> bool:
    try:
        return torch.cuda.is_available() and faiss.get_num_gpus() > 0
    except Exception:
        return False


def index_to_cpu(index):
    if index is None:
        return None

    if faiss_gpu_available() and hasattr(faiss, "index_gpu_to_cpu"):
        try:
            return faiss.index_gpu_to_cpu(index)
        except Exception:
            return index

    return index


def create_l2_index(embeddings: np.ndarray):
    index = faiss.IndexFlatL2(EMBEDDING_DIM)

    if faiss_gpu_available():
        try:
            index = faiss.index_cpu_to_all_gpus(index)
            print("FAISS GPU khả dụng: đã chuyển index sang GPU.")
        except Exception as exc:
            print(f"Không thể dùng FAISS GPU, chuyển sang CPU: {exc}")

    if embeddings.shape[0] > 0:
        index.add(embeddings.astype("float32"))

    return index


# ==========================================================
# CHECKPOINT / RESUME
# ==========================================================
def get_image_reference_fingerprint(product: Dict[str, Any]) -> str:
    """
    Tạo dấu vân tay từ các trường ảnh.

    Nếu MongoDB đổi URL hoặc danh sách ảnh nhưng giữ nguyên ID, embedding cũ
    và checkpoint cũ sẽ không bị tái sử dụng nhầm.
    """
    image_fields = (
        "image_path",
        "primaryImage",
        "image",
        "images",
        "thumbnail",
        "thumbnailUrl",
        "imageUrl",
        "image_url",
        "gallery",
        "media",
    )

    payload = {
        field: product.get(field)
        for field in image_fields
        if product.get(field) not in (None, "", [], {})
    }

    if not payload:
        return ""

    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        default=str,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def get_target_signature(products: Sequence[Dict[str, Any]]) -> str:
    """
    Chữ ký checkpoint gồm ID sản phẩm và dấu vân tay ảnh.
    """
    digest = hashlib.sha256()

    for product in sorted(products, key=get_product_id):
        product_id = get_product_id(product)
        image_fingerprint = get_image_reference_fingerprint(product)

        digest.update(product_id.encode("utf-8"))
        digest.update(b"\t")
        digest.update(image_fingerprint.encode("utf-8"))
        digest.update(b"\n")

    return digest.hexdigest()

def checkpoint_files_exist() -> bool:
    return any(
        os.path.exists(path)
        for path in (PARTIAL_EMB_PATH, PARTIAL_META_PATH, PROGRESS_PATH)
    )


def clear_checkpoint() -> None:
    paths = [
        PARTIAL_EMB_PATH,
        PARTIAL_META_PATH,
        PROGRESS_PATH,
        f"{PARTIAL_EMB_PATH}.tmp",
        f"{PARTIAL_META_PATH}.tmp",
        f"{PROGRESS_PATH}.tmp",
    ]

    removed = False
    for path in paths:
        if os.path.exists(path):
            os.remove(path)
            removed = True

    if removed:
        print("Đã xóa checkpoint tạm.")


def save_checkpoint(
    embeddings: Sequence[np.ndarray],
    valid_products: Sequence[Dict[str, Any]],
    target_products: Sequence[Dict[str, Any]],
    target_signature: Optional[str] = None,
) -> None:
    if embeddings:
        partial_embeddings = np.vstack(embeddings).astype("float32")
    else:
        partial_embeddings = np.empty((0, EMBEDDING_DIM), dtype="float32")

    processed_id_list = [get_product_id(p) for p in valid_products]

    save_npy_atomic(PARTIAL_EMB_PATH, partial_embeddings)
    # Chỉ lưu ID thay vì ghi lại toàn bộ metadata sau mỗi 100 ảnh.
    save_json_atomic(PARTIAL_META_PATH, processed_id_list)

    progress = {
        "version": CHECKPOINT_VERSION,
        "source": "mongodb",
        "database": MONGODB_DB,
        "collection": MONGODB_PRODUCTS_COLLECTION,
        "model_name": CLIP_MODEL_NAME,
        "model_pretrained": CLIP_PRETRAINED,
        "embedding_dim": EMBEDDING_DIM,
        "target_signature": target_signature or get_target_signature(target_products),
        "target_count": len(target_products),
        "processed_count": len(valid_products),
    }
    save_json_atomic(PROGRESS_PATH, progress)

    print(
        f"\n[CHECKPOINT] Đã lưu {len(valid_products)}/"
        f"{len(target_products)} sản phẩm hợp lệ."
    )


def load_checkpoint(
    target_products: Sequence[Dict[str, Any]],
    target_signature: Optional[str] = None,
) -> Tuple[List[np.ndarray], List[Dict[str, Any]], Set[str]]:
    required = [PARTIAL_EMB_PATH, PARTIAL_META_PATH, PROGRESS_PATH]

    if not all(os.path.exists(path) for path in required):
        if checkpoint_files_exist():
            print("Checkpoint không đầy đủ. Sẽ xóa và tạo lại.")
            clear_checkpoint()
        return [], [], set()

    try:
        with open(PROGRESS_PATH, "r", encoding="utf-8") as file:
            progress = json.load(file)

        compatible = (
            progress.get("version") == CHECKPOINT_VERSION
            and progress.get("source") == "mongodb"
            and progress.get("database") == MONGODB_DB
            and progress.get("collection") == MONGODB_PRODUCTS_COLLECTION
            and progress.get("model_name") == CLIP_MODEL_NAME
            and progress.get("model_pretrained") == CLIP_PRETRAINED
            and progress.get("embedding_dim") == EMBEDDING_DIM
            and progress.get("target_signature")
            == (target_signature or get_target_signature(target_products))
        )

        if not compatible:
            print("Checkpoint cũ không khớp dữ liệu MongoDB hiện tại.")
            clear_checkpoint()
            return [], [], set()

        partial_embeddings = np.load(PARTIAL_EMB_PATH, allow_pickle=False)
        with open(PARTIAL_META_PATH, "r", encoding="utf-8") as file:
            partial_id_list = json.load(file)

        if not isinstance(partial_id_list, list):
            raise ValueError("products_partial.json phải là danh sách ID.")

        partial_id_list = [normalize_identity(item) for item in partial_id_list]

        if partial_embeddings.ndim == 1:
            partial_embeddings = partial_embeddings.reshape(-1, EMBEDDING_DIM)

        if (
            partial_embeddings.ndim != 2
            or partial_embeddings.shape[1] != EMBEDDING_DIM
            or partial_embeddings.shape[0] != len(partial_id_list)
        ):
            raise ValueError("Số lượng/kích thước checkpoint không hợp lệ.")

        target_by_id = {
            get_product_id(product): product for product in target_products
        }
        processed_ids = set(partial_id_list)

        if (
            "" in processed_ids
            or len(processed_ids) != len(partial_id_list)
            or not processed_ids.issubset(target_by_id.keys())
        ):
            raise ValueError("Checkpoint chứa ID không thuộc tập cần build.")

        partial_products = [target_by_id[item] for item in partial_id_list]
        embedding_list = [row.copy() for row in partial_embeddings]

        print(
            f"[RESUME] Đã có {len(partial_products)}/"
            f"{len(target_products)} sản phẩm trong checkpoint."
        )
        print("[RESUME] Chương trình sẽ chạy tiếp phần còn lại.")

        return embedding_list, partial_products, processed_ids

    except Exception as exc:
        print(f"Không thể đọc checkpoint: {exc}")
        clear_checkpoint()
        return [], [], set()


# ==========================================================
# ĐỌC SẢN PHẨM TỪ MONGODB
# ==========================================================
def _is_retryable_mongodb_error(exc: Exception) -> bool:
    if isinstance(
        exc,
        (
            AutoReconnect,
            ConnectionFailure,
            NetworkTimeout,
            ServerSelectionTimeoutError,
        ),
    ):
        return True

    message = str(exc).lower()
    retryable_messages = (
        "operation cancelled",
        "operation canceled",
        "connection reset",
        "connection closed",
        "network timeout",
        "timed out",
        "server selection timeout",
        "not primary",
        "node is recovering",
    )

    return isinstance(exc, PyMongoError) and any(
        phrase in message for phrase in retryable_messages
    )


def _run_mongodb_with_retry(operation, operation_name: str):
    last_error: Optional[Exception] = None

    for attempt in range(1, MONGODB_FETCH_MAX_RETRIES + 1):
        try:
            return operation()

        except KeyboardInterrupt:
            raise

        except Exception as exc:
            last_error = exc

            should_retry = (
                attempt < MONGODB_FETCH_MAX_RETRIES
                and _is_retryable_mongodb_error(exc)
            )

            if not should_retry:
                raise

            print(
                f"\nMongoDB tạm thời gián đoạn khi {operation_name}: "
                f"{type(exc).__name__}: {exc}"
            )
            print(
                f"Thử lại lần {attempt + 1}/"
                f"{MONGODB_FETCH_MAX_RETRIES} sau "
                f"{MONGODB_FETCH_RETRY_SECONDS} giây..."
            )
            time.sleep(MONGODB_FETCH_RETRY_SECONDS)

    if last_error is not None:
        raise last_error

    raise RuntimeError(
        f"Không thể hoàn thành thao tác MongoDB: {operation_name}"
    )


def load_products_from_mongodb() -> List[Dict[str, Any]]:
    """
    Đọc MongoDB theo từng trang dựa trên _id.

    Không giữ một cursor cho toàn bộ collection, nhờ vậy giảm lỗi
    "operation cancelled". Nếu một batch lỗi, chương trình thử lại batch đó.
    """
    projection = {
        "_id": 1,
        "productKey": 1,
        "id": 1,
        "productId": 1,
        "product_id": 1,
        "sku": 1,
        "slug": 1,
        "name": 1,
        "title": 1,
        "brand": 1,
        "primaryImage": 1,
        "images": 1,
        "image": 1,
        "image_path": 1,
        "thumbnail": 1,
        "thumbnailUrl": 1,
        "imageUrl": 1,
        "image_url": 1,
        "gallery": 1,
        "media": 1,
        "url": 1,
        "sourceUrl": 1,
    }

    client = MongoClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=MONGODB_SOCKET_TIMEOUT_MS,
        retryReads=True,
        maxPoolSize=10,
        appname="ecommerce-build-image-index",
    )

    try:
        _run_mongodb_with_retry(
            lambda: client.admin.command("ping"),
            "kiểm tra kết nối",
        )

        collection = client[MONGODB_DB][MONGODB_PRODUCTS_COLLECTION]

        total_documents = _run_mongodb_with_retry(
            lambda: collection.count_documents({}),
            "đếm document",
        )

        print(
            f"Đã kết nối MongoDB: "
            f"{MONGODB_DB}.{MONGODB_PRODUCTS_COLLECTION}"
        )
        print(f"MongoDB đang có {total_documents} document sản phẩm.")
        print(
            f"Đang tải theo batch {MONGODB_FETCH_BATCH_SIZE}; "
            f"tối đa {MONGODB_FETCH_MAX_RETRIES} lần thử mỗi batch."
        )

        products: List[Dict[str, Any]] = []
        last_raw_id: Any = None

        while True:
            query: Dict[str, Any] = {}

            if last_raw_id is not None:
                query = {"_id": {"$gt": last_raw_id}}

            def fetch_page() -> List[Dict[str, Any]]:
                cursor = (
                    collection.find(query, projection)
                    .sort("_id", 1)
                    .limit(MONGODB_FETCH_BATCH_SIZE)
                    .batch_size(MONGODB_FETCH_BATCH_SIZE)
                )

                try:
                    return list(cursor)
                finally:
                    cursor.close()

            batch = _run_mongodb_with_retry(
                fetch_page,
                f"tải batch sau _id={last_raw_id}",
            )

            if not batch:
                break

            # Giữ ObjectId gốc để truy vấn trang kế tiếp.
            next_last_raw_id = batch[-1].get("_id")

            if next_last_raw_id is None:
                raise ValueError(
                    "Document cuối batch không có _id; "
                    "không thể phân trang an toàn."
                )

            for product in batch:
                if "_id" in product:
                    product["_id"] = str(product["_id"])

                products.append(product)

            last_raw_id = next_last_raw_id

            print(
                f"\rĐang tải MongoDB: "
                f"{len(products)}/{total_documents}",
                end="",
                flush=True,
            )

            if len(batch) < MONGODB_FETCH_BATCH_SIZE:
                break

        print()
        print(f"Đã tải {len(products)} sản phẩm từ MongoDB.")

        if len(products) != total_documents:
            print(
                "Cảnh báo: số document tải được khác số đã đếm: "
                f"{len(products)} != {total_documents}. "
                "Collection có thể đã thay đổi trong lúc build."
            )

        if products:
            print(
                "Các field của sản phẩm đầu tiên: "
                + ", ".join(sorted(products[0].keys()))
            )

        return products

    except KeyboardInterrupt:
        raise

    except Exception as exc:
        print("\nLỗi khi tải MongoDB:")
        print(f"- Loại lỗi: {type(exc).__name__}")
        print(f"- Nội dung: {repr(exc)}")
        raise

    finally:
        client.close()

def deduplicate_products(
    products: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    unique: Dict[str, Dict[str, Any]] = {}
    missing_id = 0

    for product in products:
        product_id = get_product_id(product)
        if not product_id:
            missing_id += 1
            continue
        if product_id not in unique:
            unique[product_id] = product

    if missing_id:
        print(f"Bỏ qua {missing_id} sản phẩm không có khóa nhận diện.")

    duplicated = len(products) - missing_id - len(unique)
    if duplicated:
        print(f"Đã loại {duplicated} sản phẩm trùng khóa nhận diện.")

    return list(unique.values())


# ==========================================================
# TÌM/TẢI ẢNH SẢN PHẨM
# ==========================================================
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
_LOCAL_IMAGE_LOOKUP: Optional[Dict[str, str]] = None
_HTTP_SESSION: Optional[requests.Session] = None


def get_http_session() -> requests.Session:
    global _HTTP_SESSION

    if _HTTP_SESSION is None:
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/134.0.0.0 Safari/537.36"
                ),
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,"
                "image/*,*/*;q=0.8",
            }
        )
        _HTTP_SESSION = session

    return _HTTP_SESSION


def build_local_image_lookup() -> Dict[str, str]:
    global _LOCAL_IMAGE_LOOKUP

    if _LOCAL_IMAGE_LOOKUP is not None:
        return _LOCAL_IMAGE_LOOKUP

    lookup: Dict[str, str] = {}
    if os.path.isdir(DATA_ROOT):
        print(f"Đang lập danh sách ảnh local trong: {DATA_ROOT}")
        for root, _, files in os.walk(DATA_ROOT):
            for filename in files:
                extension = os.path.splitext(filename)[1].lower()
                if extension in IMAGE_EXTENSIONS:
                    lookup.setdefault(
                        filename.lower(), os.path.join(root, filename)
                    )

    _LOCAL_IMAGE_LOOKUP = lookup
    print(f"Tìm thấy {len(lookup)} tên ảnh local khác nhau.")
    return lookup


def is_url(value: str) -> bool:
    value = value.strip().lower()
    return value.startswith("http://") or value.startswith("https://")


def normalize_image_reference(value: Any) -> str:
    if value is None:
        return ""

    reference = str(value).strip().replace("\\", "/")
    if reference.startswith("//"):
        reference = "https:" + reference
    return reference


def flatten_image_value(value: Any) -> Iterable[str]:
    if value is None:
        return

    if isinstance(value, str):
        normalized = normalize_image_reference(value)
        if normalized:
            yield normalized
        return

    if isinstance(value, (list, tuple)):
        for item in value:
            yield from flatten_image_value(item)
        return

    if isinstance(value, dict):
        priority_keys = (
            "url",
            "src",
            "path",
            "image",
            "imageUrl",
            "image_url",
            "original",
            "large",
            "medium",
            "small",
            "thumbnail",
        )
        for key in priority_keys:
            if key in value:
                yield from flatten_image_value(value.get(key))
        return


def iter_product_image_candidates(product: Dict[str, Any]) -> Iterable[str]:
    fields = (
        "image_path",
        "primaryImage",
        "image",
        "images",
        "thumbnail",
        "thumbnailUrl",
        "imageUrl",
        "image_url",
        "gallery",
        "media",
    )

    seen: Set[str] = set()
    for field in fields:
        for candidate in flatten_image_value(product.get(field)):
            if candidate not in seen:
                seen.add(candidate)
                yield candidate


def download_image(url: str) -> Optional[str]:
    url = normalize_image_reference(url)
    if not is_url(url):
        return None

    filename = hashlib.sha256(url.encode("utf-8")).hexdigest() + ".jpg"
    save_path = os.path.join(IMAGE_CACHE_DIR, filename)
    temp_path = save_path + ".part"

    # Tái sử dụng cache của các bản build cũ từng đặt tên bằng MD5.
    old_hash = hashlib.md5(url.encode("utf-8")).hexdigest()
    for extension in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
        old_cache_path = os.path.join(IMAGE_CACHE_DIR, old_hash + extension)
        if os.path.isfile(old_cache_path):
            return old_cache_path

    if os.path.exists(save_path):
        try:
            with Image.open(save_path) as image:
                image.verify()
            return save_path
        except Exception:
            try:
                os.remove(save_path)
            except OSError:
                pass

    try:
        response = get_http_session().get(url, timeout=(10, 30))
        response.raise_for_status()

        with Image.open(BytesIO(response.content)) as image:
            image = image.convert("RGB")
            image.save(temp_path, format="JPEG", quality=90, optimize=True)

        os.replace(temp_path, save_path)

        if _LOCAL_IMAGE_LOOKUP is not None:
            _LOCAL_IMAGE_LOOKUP[os.path.basename(save_path).lower()] = save_path

        return save_path

    except KeyboardInterrupt:
        raise
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        return None


def find_local_image(reference: str) -> Optional[str]:
    reference = normalize_image_reference(reference)
    if not reference or is_url(reference):
        return None

    candidate_paths = []

    if os.path.isabs(reference):
        candidate_paths.append(reference)
    else:
        cleaned = reference.lstrip("/")
        candidate_paths.extend(
            [
                os.path.join(BASE_DIR, cleaned),
                os.path.join(DATA_ROOT, cleaned),
                os.path.join(DATA_DIR, cleaned),
            ]
        )

    for path in candidate_paths:
        normalized_path = os.path.abspath(path)
        if os.path.isfile(normalized_path):
            return normalized_path

    basename = os.path.basename(reference).lower()
    if not basename:
        return None

    return build_local_image_lookup().get(basename)


def get_product_image_path(product: Dict[str, Any]) -> Optional[str]:
    for candidate in iter_product_image_candidates(product):
        local_path = find_local_image(candidate)
        if local_path:
            return local_path

        if is_url(candidate):
            downloaded_path = download_image(candidate)
            if downloaded_path:
                return downloaded_path

    return None


def get_first_image_reference(product: Dict[str, Any]) -> str:
    return next(iter_product_image_candidates(product), "")


# ==========================================================
# LOAD VÀ ĐỐI CHIẾU INDEX CŨ
# ==========================================================
def load_existing_data():
    empty_embeddings = np.empty((0, EMBEDDING_DIM), dtype="float32")

    existing = [
        os.path.exists(INDEX_PATH),
        os.path.exists(EMB_PATH),
        os.path.exists(META_PATH),
    ]

    if not any(existing):
        return None, empty_embeddings, []

    if not all(existing):
        print("Dữ liệu index cũ không đầy đủ. Sẽ xây lại từ dữ liệu MongoDB.")
        return None, empty_embeddings, []

    print("Phát hiện dữ liệu cũ → đang nạp index hiện có...")

    try:
        old_index = faiss.read_index(INDEX_PATH)
        old_embeddings = np.load(EMB_PATH, allow_pickle=False)

        if old_embeddings.ndim == 1:
            old_embeddings = old_embeddings.reshape(-1, EMBEDDING_DIM)

        with open(META_PATH, "r", encoding="utf-8") as file:
            old_products = json.load(file)

        valid = (
            old_embeddings.ndim == 2
            and old_embeddings.shape[1] == EMBEDDING_DIM
            and old_index.d == EMBEDDING_DIM
            and old_index.ntotal == old_embeddings.shape[0]
            and old_index.ntotal == len(old_products)
        )

        if not valid:
            print("FAISS/embeddings/products cũ không khớp. Sẽ xây lại.")
            return None, empty_embeddings, []

        print(f"Index cũ có {len(old_products)} sản phẩm.")
        return old_index, old_embeddings.astype("float32"), old_products

    except Exception as exc:
        print(f"Không thể đọc index cũ: {exc}")
        return None, empty_embeddings, []


def reconcile_existing_with_mongodb(
    old_index,
    old_embeddings: np.ndarray,
    old_products: Sequence[Dict[str, Any]],
    mongodb_products: Sequence[Dict[str, Any]],
):
    """
    Chỉ giữ embedding cũ nếu sản phẩm đó vẫn tồn tại trong MongoDB.
    Metadata được thay bằng document MongoDB mới nhất.
    """
    empty_embeddings = np.empty((0, EMBEDDING_DIM), dtype="float32")

    if old_embeddings.shape[0] == 0 or not old_products:
        return None, empty_embeddings, [], set(), False

    alias_to_mongodb_product: Dict[str, Dict[str, Any]] = {}
    for product in mongodb_products:
        for alias in get_product_aliases(product):
            alias_to_mongodb_product.setdefault(alias, product)

    kept_indices: List[int] = []
    kept_products: List[Dict[str, Any]] = []
    reused_ids: Set[str] = set()

    for row_index, old_product in enumerate(old_products):
        matched_product: Optional[Dict[str, Any]] = None

        for alias in get_product_aliases(old_product):
            matched_product = alias_to_mongodb_product.get(alias)
            if matched_product is not None:
                break

        if matched_product is None:
            continue

        old_image_fingerprint = get_image_reference_fingerprint(old_product)
        new_image_fingerprint = get_image_reference_fingerprint(
            matched_product
        )

        if (
            not old_image_fingerprint
            or old_image_fingerprint != new_image_fingerprint
        ):
            continue

        mongodb_id = get_product_id(matched_product)
        if not mongodb_id or mongodb_id in reused_ids:
            continue

        kept_indices.append(row_index)
        kept_products.append(matched_product)
        reused_ids.add(mongodb_id)

    if kept_indices:
        all_rows_reused_in_order = (
            len(kept_indices) == len(old_products)
            and kept_indices == list(range(len(old_products)))
        )

        if all_rows_reused_in_order and old_index is not None:
            reconciled_embeddings = old_embeddings
            reconciled_index = old_index
        else:
            reconciled_embeddings = old_embeddings[
                np.asarray(kept_indices, dtype=np.int64)
            ].astype("float32", copy=False)
            reconciled_index = create_l2_index(reconciled_embeddings)
    else:
        reconciled_embeddings = empty_embeddings
        reconciled_index = None

    dropped_count = len(old_products) - len(kept_products)
    changed = dropped_count > 0

    print(f"Tái sử dụng được {len(kept_products)} embedding cũ.")
    if dropped_count:
        print(
            f"Đã loại {dropped_count} mục index cũ không khớp "
            "collection MongoDB hiện tại."
        )

    return (
        reconciled_index,
        reconciled_embeddings,
        kept_products,
        reused_ids,
        changed,
    )


# ==========================================================
# TRÍCH XUẤT EMBEDDING
# ==========================================================
def extract_embeddings(
    products: Sequence[Dict[str, Any]],
) -> Tuple[
    Optional[np.ndarray],
    Optional[List[Dict[str, Any]]],
    List[Dict[str, Any]],
]:
    if model is None or preprocess is None:
        print("Lỗi: Mô hình CLIP không sẵn sàng.")
        return None, None, []

    target_signature = get_target_signature(products)
    embeddings, valid_products, processed_ids = load_checkpoint(
        products, target_signature
    )
    failures: List[Dict[str, Any]] = []
    total = len(products)
    saved_since_last_checkpoint = 0

    # Tạo lookup một lần, tránh os.walk lại cho từng sản phẩm.
    build_local_image_lookup()

    print(f"Bắt đầu trích xuất embeddings cho {total} sản phẩm...")

    try:
        for position, product in enumerate(products, start=1):
            product_id = get_product_id(product)

            if product_id in processed_ids:
                continue

            try:
                image_path = get_product_image_path(product)
                if not image_path or not os.path.isfile(image_path):
                    failures.append(
                        {
                            "id": product_id,
                            "name": product.get("name") or product.get("title"),
                            "image": get_first_image_reference(product),
                            "reason": "Không tìm thấy hoặc không tải được ảnh",
                        }
                    )
                    if len(failures) <= 20:
                        print(
                            f"\n[{position}/{total}] Không có ảnh hợp lệ: "
                            f"{product_id}"
                        )
                    continue

                with Image.open(image_path) as image:
                    image = image.convert("RGB")
                    image_tensor = preprocess(image).unsqueeze(0).to(DEVICE)

                with torch.no_grad():
                    embedding = model.encode_image(image_tensor)
                    embedding = embedding / embedding.norm(
                        dim=-1, keepdim=True
                    ).clamp_min(1e-12)

                embedding_array = (
                    embedding.detach()
                    .cpu()
                    .numpy()
                    .reshape(-1)
                    .astype("float32")
                )

                if embedding_array.shape[0] != EMBEDDING_DIM:
                    raise ValueError(
                        "Embedding sai kích thước: "
                        f"{embedding_array.shape[0]} != {EMBEDDING_DIM}"
                    )

                # Không ghi đường dẫn tuyệt đối Windows vào metadata MongoDB.
                embeddings.append(embedding_array)
                valid_products.append(product)
                processed_ids.add(product_id)
                saved_since_last_checkpoint += 1

                if len(valid_products) % 10 == 0 or position == total:
                    print(
                        f"[{position}/{total}] Đã xử lý thành công "
                        f"{len(valid_products)}/{total} sản phẩm.",
                        end="\r",
                    )

                if saved_since_last_checkpoint >= SAVE_EVERY:
                    save_checkpoint(
                        embeddings, valid_products, products, target_signature
                    )
                    saved_since_last_checkpoint = 0

            except KeyboardInterrupt:
                raise
            except Exception as exc:
                failures.append(
                    {
                        "id": product_id,
                        "name": product.get("name") or product.get("title"),
                        "image": get_first_image_reference(product),
                        "reason": str(exc),
                    }
                )
                if len(failures) <= 20:
                    print(
                        f"\n[{position}/{total}] Lỗi sản phẩm "
                        f"{product_id}: {exc}"
                    )

    except KeyboardInterrupt:
        print("\n\nPhát hiện Ctrl+C. Đang lưu tiến trình...")
        save_checkpoint(
            embeddings, valid_products, products, target_signature
        )
        save_json_atomic(FAILED_PRODUCTS_PATH, failures)
        print("Đã lưu checkpoint. Chạy lại build_index.py để tiếp tục.")
        raise

    save_json_atomic(FAILED_PRODUCTS_PATH, failures)

    if not embeddings:
        return None, None, failures

    # Giữ checkpoint cho tới khi 3 file cuối được lưu thành công.
    save_checkpoint(
        embeddings, valid_products, products, target_signature
    )

    final_embeddings = np.vstack(embeddings).astype("float32")
    return final_embeddings, valid_products, failures


# ==========================================================
# XÂY/CẬP NHẬT FAISS
# ==========================================================
def build_or_update_index(
    new_embeddings: np.ndarray,
    new_products: Sequence[Dict[str, Any]],
    old_index,
    old_embeddings: np.ndarray,
    old_products: Sequence[Dict[str, Any]],
):
    if old_index is None or old_embeddings.shape[0] == 0:
        print("Tạo FAISS index mới (IndexFlatL2)...")
        index = create_l2_index(new_embeddings)
        return index, new_embeddings.astype("float32"), list(new_products)

    print(f"Cập nhật FAISS index cũ, thêm {new_embeddings.shape[0]} mục...")

    old_index.add(new_embeddings.astype("float32"))
    combined_embeddings = np.vstack(
        [old_embeddings, new_embeddings]
    ).astype("float32")
    combined_products = list(old_products) + list(new_products)

    return old_index, combined_embeddings, combined_products


# ==========================================================
# LƯU KẾT QUẢ CUỐI
# ==========================================================
def save_all(index, embeddings: np.ndarray, products) -> None:
    index = index_to_cpu(index)

    if index is None:
        raise ValueError("FAISS index chưa được tạo.")

    if (
        index.ntotal != embeddings.shape[0]
        or index.ntotal != len(products)
        or embeddings.shape[1] != EMBEDDING_DIM
    ):
        raise ValueError(
            "Không thể lưu vì FAISS/embeddings/products không khớp: "
            f"FAISS={index.ntotal}, embeddings={embeddings.shape}, "
            f"products={len(products)}"
        )

    temp_index_path = f"{INDEX_PATH}.tmp"
    temp_emb_path = f"{EMB_PATH}.tmp"
    temp_meta_path = f"{META_PATH}.tmp"

    faiss.write_index(index, temp_index_path)
    with open(temp_emb_path, "wb") as file:
        np.save(file, embeddings.astype("float32"))
    with open(temp_meta_path, "w", encoding="utf-8") as file:
        json.dump(products, file, ensure_ascii=False, indent=2, default=str)

    os.replace(temp_index_path, INDEX_PATH)
    os.replace(temp_emb_path, EMB_PATH)
    os.replace(temp_meta_path, META_PATH)

    print("\nĐã lưu thành công:")
    print(f"- FAISS index: {INDEX_PATH}")
    print(f"- Embeddings: {EMB_PATH}")
    print(f"- Metadata: {META_PATH}")
    print(f"- Tổng vectors: {index.ntotal}")


# ==========================================================
# MAIN
# ==========================================================
def main() -> None:
    if model is None or preprocess is None:
        print("Lỗi: Dừng vì không thể tải mô hình CLIP.")
        return

    print("-" * 60)
    print("Đang tải dữ liệu sản phẩm từ MongoDB...")

    raw_products = load_products_from_mongodb()
    all_products = deduplicate_products(raw_products)

    if not all_products:
        print("Lỗi: MongoDB không có sản phẩm hợp lệ.")
        return

    print(f"Tổng sản phẩm MongoDB sau lọc trùng: {len(all_products)}")

    if FORCE_REBUILD_INDEX:
        print(
            "FORCE_REBUILD_INDEX=true: bỏ qua index cuối hiện có "
            "và xây lại từ MongoDB."
        )
        loaded_old_index = None
        old_embeddings = np.empty((0, EMBEDDING_DIM), dtype="float32")
        old_products: List[Dict[str, Any]] = []
    else:
        loaded_old_index, old_embeddings, old_products = load_existing_data()

    (
        old_index,
        old_embeddings,
        old_products,
        reused_ids,
        existing_changed,
    ) = reconcile_existing_with_mongodb(
        loaded_old_index,
        old_embeddings,
        old_products,
        all_products,
    )

    products_to_process = [
        product
        for product in all_products
        if get_product_id(product) not in reused_ids
    ]

    print(f"Sản phẩm có thể tái sử dụng embedding: {len(old_products)}")
    print(f"Sản phẩm cần trích xuất mới: {len(products_to_process)}")

    if not products_to_process:
        if existing_changed:
            print("Index cũ đã được làm sạch theo MongoDB. Đang lưu lại...")
            save_all(old_index, old_embeddings, old_products)
        else:
            print("Không có sản phẩm mới. Index hiện tại đã đồng bộ MongoDB.")

        if checkpoint_files_exist():
            clear_checkpoint()
        return

    new_embeddings, valid_products, failures = extract_embeddings(
        products_to_process
    )

    if new_embeddings is None or not valid_products:
        print("Không trích xuất được embedding mới nào.")
        if failures:
            print(
                f"Có {len(failures)} sản phẩm lỗi. Xem: "
                f"{FAILED_PRODUCTS_PATH}"
            )
        return

    index, all_embeddings, all_metadata = build_or_update_index(
        new_embeddings,
        valid_products,
        old_index,
        old_embeddings,
        old_products,
    )

    save_all(index, all_embeddings, all_metadata)
    clear_checkpoint()

    print("-" * 60)
    print("Hoàn tất xây dựng index từ MongoDB!")
    print(f"Tổng sản phẩm MongoDB: {len(all_products)}")
    print(f"Tổng sản phẩm có embedding: {len(all_metadata)}")
    print(f"Tổng sản phẩm lỗi ảnh trong lượt này: {len(failures)}")

    if failures:
        print(f"Danh sách lỗi được lưu tại: {FAILED_PRODUCTS_PATH}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã dừng chương trình an toàn. Checkpoint đã được giữ lại.")
    except Exception as exc:
        print(f"\nBuild index gặp lỗi: {type(exc).__name__}: {exc}")

        if checkpoint_files_exist():
            print(
                "Checkpoint embedding hiện có vẫn được giữ "
                "để lần sau chạy tiếp."
            )
        else:
            print(
                "Lỗi xảy ra trước bước tạo embedding nên chưa có "
                "checkpoint mới. Phần tải MongoDB sẽ tự thử lại theo batch."
            )
