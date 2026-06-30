import os
import json
import hashlib
import numpy as np
from PIL import Image
import torch
import open_clip  # Đã chuyển sang OpenCLIP
import faiss
import clip_core

# ===============================
# Cấu hình đường dẫn & tham số
# ===============================
EMBEDDING_DIM = 512
SAVE_EVERY = 100  # Cứ xử lý thành công 100 sản phẩm thì lưu checkpoint
CHECKPOINT_VERSION = 1

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "products")

FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True)

# Các file kết quả hoàn chỉnh
INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMB_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
META_PATH = os.path.join(FAISS_DIR, "products.json")

# Các file checkpoint dùng khi quá trình bị dừng giữa chừng
PARTIAL_EMB_PATH = os.path.join(FAISS_DIR, "embeddings_partial.npy")
PARTIAL_META_PATH = os.path.join(FAISS_DIR, "products_partial.json")
PROGRESS_PATH = os.path.join(FAISS_DIR, "progress.json")

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Thiết bị đang dùng: {DEVICE}")

# ===============================
# Nạp mô hình CLIP (OpenCLIP)
# ===============================
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
except Exception as e:
    print(
        "Lỗi tải mô hình OpenCLIP. "
        f"Đảm bảo đã cài đặt 'open_clip_torch': {e}"
    )
    model = None
    preprocess = None


# ===============================
# Hàm tiện ích
# ===============================
def get_product_id(product):
    """Chuẩn hóa ID để so sánh và lưu tiến trình."""
    return str(product.get("id", "")).strip()


def save_json_atomic(path, data):
    """Lưu JSON qua file tạm để hạn chế làm hỏng file khi bị dừng."""
    temp_path = f"{path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    os.replace(temp_path, path)


def save_npy_atomic(path, array):
    """Lưu NumPy qua file tạm rồi thay thế file chính."""
    temp_path = f"{path}.tmp"
    with open(temp_path, "wb") as f:
        np.save(f, array)
    os.replace(temp_path, path)


def get_target_signature(products):
    """Tạo chữ ký cho tập sản phẩm đang cần xử lý."""
    product_ids = sorted(get_product_id(p) for p in products)
    raw = "\n".join(product_ids).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def checkpoint_files_exist():
    return any(
        os.path.exists(path)
        for path in (PARTIAL_EMB_PATH, PARTIAL_META_PATH, PROGRESS_PATH)
    )


def clear_checkpoint():
    """Xóa checkpoint sau khi đã tạo đủ file kết quả cuối cùng."""
    checkpoint_paths = [
        PARTIAL_EMB_PATH,
        PARTIAL_META_PATH,
        PROGRESS_PATH,
        f"{PARTIAL_EMB_PATH}.tmp",
        f"{PARTIAL_META_PATH}.tmp",
        f"{PROGRESS_PATH}.tmp",
    ]

    removed = False
    for path in checkpoint_paths:
        if os.path.exists(path):
            os.remove(path)
            removed = True

    if removed:
        print("Đã xóa các file checkpoint tạm.")


def save_checkpoint(embeddings, valid_products, target_products):
    """Lưu embeddings và metadata đã xử lý để lần sau chạy tiếp."""
    if embeddings:
        partial_embeddings = np.vstack(embeddings).astype("float32")
    else:
        partial_embeddings = np.empty((0, EMBEDDING_DIM), dtype="float32")

    save_npy_atomic(PARTIAL_EMB_PATH, partial_embeddings)
    save_json_atomic(PARTIAL_META_PATH, valid_products)

    progress = {
        "version": CHECKPOINT_VERSION,
        "model_name": CLIP_MODEL_NAME,
        "model_pretrained": CLIP_PRETRAINED,
        "embedding_dim": EMBEDDING_DIM,
        "target_signature": get_target_signature(target_products),
        "target_count": len(target_products),
        "processed_count": len(valid_products),
        "processed_ids": [get_product_id(p) for p in valid_products],
    }
    save_json_atomic(PROGRESS_PATH, progress)

    print(
        f"\n[CHECKPOINT] Đã lưu {len(valid_products)}/"
        f"{len(target_products)} sản phẩm hợp lệ."
    )


def load_checkpoint(target_products):
    """Đọc checkpoint và xác nhận nó phù hợp với lần build hiện tại."""
    required_paths = [PARTIAL_EMB_PATH, PARTIAL_META_PATH, PROGRESS_PATH]

    if not all(os.path.exists(path) for path in required_paths):
        if checkpoint_files_exist():
            print("Checkpoint không đầy đủ hoặc bị lỗi. Sẽ tạo lại checkpoint mới.")
            clear_checkpoint()
        return [], [], set()

    try:
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            progress = json.load(f)

        expected_signature = get_target_signature(target_products)
        checkpoint_is_compatible = (
            progress.get("version") == CHECKPOINT_VERSION
            and progress.get("model_name") == CLIP_MODEL_NAME
            and progress.get("model_pretrained") == CLIP_PRETRAINED
            and progress.get("embedding_dim") == EMBEDDING_DIM
            and progress.get("target_signature") == expected_signature
        )

        if not checkpoint_is_compatible:
            print(
                "Checkpoint cũ không khớp với dữ liệu hoặc mô hình hiện tại. "
                "Sẽ xử lý lại tập sản phẩm cần build."
            )
            clear_checkpoint()
            return [], [], set()

        partial_embeddings = np.load(PARTIAL_EMB_PATH, allow_pickle=False)
        with open(PARTIAL_META_PATH, "r", encoding="utf-8") as f:
            partial_products = json.load(f)

        if partial_embeddings.ndim == 1:
            partial_embeddings = partial_embeddings.reshape(-1, EMBEDDING_DIM)

        if partial_embeddings.ndim != 2:
            raise ValueError("embeddings_partial.npy không phải mảng 2 chiều.")

        if partial_embeddings.shape[1] != EMBEDDING_DIM:
            raise ValueError(
                "Kích thước embedding trong checkpoint không khớp "
                f"({partial_embeddings.shape[1]} != {EMBEDDING_DIM})."
            )

        if partial_embeddings.shape[0] != len(partial_products):
            raise ValueError(
                "Số embedding checkpoint không khớp số sản phẩm checkpoint."
            )

        target_ids = {get_product_id(p) for p in target_products}
        processed_ids = {get_product_id(p) for p in partial_products}

        if "" in processed_ids or not processed_ids.issubset(target_ids):
            raise ValueError("Checkpoint chứa ID không thuộc tập sản phẩm hiện tại.")

        embedding_list = [row.copy() for row in partial_embeddings]

        print(
            f"[RESUME] Tìm thấy {len(partial_products)}/"
            f"{len(target_products)} sản phẩm đã xử lý."
        )
        print("[RESUME] Chương trình sẽ bỏ qua các sản phẩm này và chạy tiếp.")

        return embedding_list, partial_products, processed_ids

    except Exception as e:
        print(f"Không thể đọc checkpoint: {e}")
        print("Sẽ xóa checkpoint lỗi và xử lý lại tập sản phẩm cần build.")
        clear_checkpoint()
        return [], [], set()


# ===============================
# Đọc tất cả meta.json
# ===============================
def load_all_products(data_dir):
    products = []
    for root, _, files in os.walk(data_dir):
        for file in files:
            if file == "meta.json":
                meta_path = os.path.join(root, file)
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta_data = json.load(f)

                    if isinstance(meta_data, dict):
                        meta_data = [meta_data]

                    for item in meta_data:
                        img_path = os.path.abspath(
                            os.path.join(root, item.get("image", ""))
                        )

                        if not os.path.exists(img_path):
                            existing_image_path = item.get("image_path")
                            if existing_image_path and os.path.exists(existing_image_path):
                                img_path = existing_image_path
                            else:
                                continue

                        item["image_path"] = img_path
                        products.append(item)

                except Exception as e:
                    print(f"Lỗi đọc {meta_path}: {e}")

    return products


# ===============================
# Lọc trùng ID
# ===============================
def deduplicate(products):
    unique = {}
    for product in products:
        product_id = get_product_id(product)
        if product_id and product_id not in unique:
            unique[product_id] = product
    return list(unique.values())


# ===============================
# Trích xuất embedding có checkpoint/resume
# ===============================
def extract_embeddings(products):
    if model is None or preprocess is None:
        print("Lỗi: Mô hình CLIP không sẵn sàng.")
        return None, None

    embeddings, valid_products, processed_ids = load_checkpoint(products)
    total = len(products)
    saved_since_last_checkpoint = 0

    print(f"Bắt đầu trích xuất embeddings cho {total} ảnh...")

    try:
        for i, product in enumerate(products, start=1):
            product_id = get_product_id(product)

            # Sản phẩm đã có trong checkpoint thì không xử lý lại.
            if product_id in processed_ids:
                continue

            try:
                img_path = product.get("image_path", "")
                if not os.path.exists(img_path):
                    print(
                        f"[{i}/{total}] File ảnh không tồn tại: "
                        f"{img_path}. Bỏ qua."
                    )
                    continue

                with Image.open(img_path) as image:
                    image = image.convert("RGB")
                    image_tensor = preprocess(image).unsqueeze(0).to(DEVICE)

                with torch.no_grad():
                    embedding = model.encode_image(image_tensor)
                    embedding = embedding / embedding.norm(dim=-1, keepdim=True)

                embedding_array = (
                    embedding.detach()
                    .cpu()
                    .numpy()
                    .reshape(-1)
                    .astype("float32")
                )

                if embedding_array.shape[0] != EMBEDDING_DIM:
                    raise ValueError(
                        "Kích thước embedding thực tế không khớp: "
                        f"{embedding_array.shape[0]} != {EMBEDDING_DIM}"
                    )

                embeddings.append(embedding_array)
                valid_products.append(product)
                processed_ids.add(product_id)
                saved_since_last_checkpoint += 1

                if len(valid_products) % 10 == 0 or i == total:
                    print(
                        f"[{i}/{total}] Đã xử lý thành công "
                        f"{len(valid_products)}/{total} sản phẩm.",
                        end="\r",
                    )

                if saved_since_last_checkpoint >= SAVE_EVERY:
                    save_checkpoint(embeddings, valid_products, products)
                    saved_since_last_checkpoint = 0

            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(
                    f"\n[{i}/{total}] Lỗi trích xuất sản phẩm "
                    f"{product_id}: {e}. Bỏ qua."
                )

    except KeyboardInterrupt:
        print("\n\nPhát hiện Ctrl+C. Đang lưu tiến trình trước khi thoát...")
        save_checkpoint(embeddings, valid_products, products)
        print("Đã lưu checkpoint. Chạy lại build_index.py để tiếp tục.")
        raise

    if not embeddings:
        return None, None

    # Lưu checkpoint lần cuối trước khi tạo file kết quả hoàn chỉnh.
    # Nếu bước lưu FAISS sau đó gặp lỗi thì vẫn có thể chạy tiếp mà không encode lại.
    save_checkpoint(embeddings, valid_products, products)

    final_embeddings = np.vstack(embeddings).astype("float32")
    return final_embeddings, valid_products


# ===============================
# Cập nhật dữ liệu cũ
# ===============================
def load_existing_data():
    old_products = []
    old_emb = np.empty((0, EMBEDDING_DIM), dtype="float32")
    old_index = None

    if (
        os.path.exists(INDEX_PATH)
        and os.path.exists(EMB_PATH)
        and os.path.exists(META_PATH)
    ):
        print("Phát hiện dữ liệu cũ → đang nạp index hiện có...")
        try:
            old_index = faiss.read_index(INDEX_PATH)
            old_emb = np.load(EMB_PATH, allow_pickle=False)

            if old_emb.ndim == 1:
                old_emb = old_emb.reshape(-1, EMBEDDING_DIM)

            with open(META_PATH, "r", encoding="utf-8") as f:
                old_products = json.load(f)

            print(f"Có {len(old_products)} sản phẩm đã lưu trước đó.")

            if (
                old_emb.ndim != 2
                or old_emb.shape[1] != EMBEDDING_DIM
                or old_index.ntotal != old_emb.shape[0]
                or old_index.ntotal != len(old_products)
            ):
                print(
                    "CẢNH BÁO: FAISS/Embeddings/Metadata không khớp. "
                    "Sẽ xây dựng lại từ đầu."
                )
                return None, np.empty((0, EMBEDDING_DIM), dtype="float32"), []

            return old_index, old_emb.astype("float32"), old_products

        except Exception as e:
            print(
                "Lỗi nạp dữ liệu FAISS/Embeddings cũ, "
                f"xây dựng lại từ đầu: {e}"
            )
            return None, np.empty((0, EMBEDDING_DIM), dtype="float32"), []

    return old_index, old_emb, old_products


# ===============================
# Xây FAISS Index (IndexFlatL2)
# ===============================
def build_or_update_index(
    new_embeddings,
    new_products,
    old_index,
    old_emb,
    old_products,
):
    if (
        old_index is not None
        and faiss.get_num_gpus() > 0
        and isinstance(old_index, faiss.GpuIndex)
    ):
        old_index = faiss.index_gpu_to_cpu(old_index)

    if old_index is None:
        print("Tạo FAISS index mới (IndexFlatL2)...")
        dimension = new_embeddings.shape[1]
        index = faiss.IndexFlatL2(dimension)

        if torch.cuda.is_available() and faiss.get_num_gpus() > 0:
            index = faiss.index_cpu_to_all_gpus(index)
            print("FAISS GPU khả dụng: Đã chuyển index sang GPU.")

        index.add(new_embeddings)
        return index, new_embeddings, new_products

    print(f"Cập nhật FAISS index cũ (thêm {new_embeddings.shape[0]} mục)...")

    if torch.cuda.is_available() and faiss.get_num_gpus() > 0:
        index = faiss.index_cpu_to_all_gpus(old_index)
        print("FAISS GPU khả dụng: Đã chuyển index cũ sang GPU để cập nhật.")
    else:
        index = old_index

    index.add(new_embeddings)

    combined_embeddings = np.vstack([old_emb, new_embeddings]).astype("float32")
    combined_products = old_products + new_products
    return index, combined_embeddings, combined_products


# ===============================
# Lưu kết quả hoàn chỉnh
# ===============================
def save_all(index, embeddings, products):
    if (
        faiss.get_num_gpus() > 0
        and isinstance(index, faiss.GpuIndex)
    ):
        index = faiss.index_gpu_to_cpu(index)

    if index.ntotal != embeddings.shape[0] or index.ntotal != len(products):
        raise ValueError(
            "Không thể lưu vì số lượng FAISS, embeddings và products không khớp: "
            f"{index.ntotal}, {embeddings.shape[0]}, {len(products)}"
        )

    temp_index_path = f"{INDEX_PATH}.tmp"
    temp_emb_path = f"{EMB_PATH}.tmp"
    temp_meta_path = f"{META_PATH}.tmp"

    # Tạo đủ file tạm trước. Nếu có lỗi, các file kết quả cũ vẫn được giữ nguyên.
    faiss.write_index(index, temp_index_path)
    with open(temp_emb_path, "wb") as f:
        np.save(f, embeddings.astype("float32"))
    with open(temp_meta_path, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2, default=str)

    # Chỉ thay thế file chính sau khi cả ba file tạm đã được tạo thành công.
    os.replace(temp_index_path, INDEX_PATH)
    os.replace(temp_emb_path, EMB_PATH)
    os.replace(temp_meta_path, META_PATH)

    print(f"\nĐã lưu index: {INDEX_PATH}")
    print(f"Đã lưu embeddings: {EMB_PATH}")
    print(f"Đã lưu metadata: {META_PATH}")
    print(f"Tổng số sản phẩm sau cập nhật: {len(products)}")


# ===============================
# MAIN
# ===============================
def main():
    if model is None or preprocess is None:
        print("Lỗi: Dừng quá trình do không thể tải mô hình CLIP.")
        return

    print("-" * 50)
    print("Đang tải dữ liệu sản phẩm từ thư mục...")

    all_products = load_all_products(DATA_DIR)
    all_products = deduplicate(all_products)

    if not all_products:
        print("Lỗi: Không tìm thấy sản phẩm hợp lệ trong data/products.")
        return

    old_index, old_emb, old_products = load_existing_data()

    old_ids = {get_product_id(p) for p in old_products}
    new_products_to_extract = [
        p for p in all_products if get_product_id(p) not in old_ids
    ]

    products_to_process = []

    old_data_is_broken = (
        len(old_products) != old_emb.shape[0]
        or (
            old_index is not None
            and old_index.ntotal != len(old_products)
        )
    )

    if old_data_is_broken:
        print(
            "Dữ liệu FAISS/Embeddings cũ bị hỏng hoặc không khớp. "
            "Xây dựng lại TOÀN BỘ index."
        )
        products_to_process = all_products
        old_index = None
        old_emb = np.empty((0, EMBEDDING_DIM), dtype="float32")
        old_products = []

    elif new_products_to_extract:
        products_to_process = new_products_to_extract
        print(
            f"Phát hiện {len(products_to_process)} sản phẩm mới "
            "cần trích xuất."
        )

    else:
        print("Không có sản phẩm mới. Index hiện tại đã đồng bộ.")
        if checkpoint_files_exist():
            print("Phát hiện checkpoint cũ không còn cần thiết.")
            clear_checkpoint()
        return

    new_embeddings, valid_products = extract_embeddings(products_to_process)

    if new_embeddings is None or new_embeddings.shape[0] == 0:
        print("Không có sản phẩm hợp lệ để thêm.")
        return

    index, emb_all, products_all = build_or_update_index(
        new_embeddings,
        valid_products,
        old_index,
        old_emb,
        old_products,
    )

    # Chỉ xóa checkpoint sau khi ba file cuối được lưu thành công.
    save_all(index, emb_all, products_all)
    clear_checkpoint()

    print("-" * 50)
    print("Hoàn tất xây dựng index!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã dừng chương trình an toàn. Checkpoint đã được giữ lại.")
    except Exception as e:
        print(f"\nBuild index gặp lỗi: {e}")
        print("Checkpoint vẫn được giữ lại để bạn có thể chạy tiếp.")
