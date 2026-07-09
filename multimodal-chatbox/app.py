from datetime import datetime, timedelta, timezone
from functools import wraps
from email.message import EmailMessage
from html import escape
from threading import Lock
from time import monotonic

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from bson import ObjectId

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*args, **kwargs):
        return False

import hashlib
import json
import os
import re
import secrets
import smtplib
import ssl
import unicodedata
import uuid

import faiss
import jwt
import numpy as np

# Gemini SDK mới (cài bằng: pip install -U google-genai)
try:
    from google import genai
except ImportError:
    genai = None


# ----------------------------
# YOLO
# ----------------------------
try:
    from ultralytics import YOLO
    print("Đã tải mô-đun YOLO.")
except ImportError:
    print("Lỗi: Không thể import ultralytics. Cài bằng: pip install ultralytics")

    class MockYOLO:
        def __init__(self, model_path):
            self.names = {}

        def predict(self, source, conf=0.25, iou=0.7, classes=None, verbose=False):
            return []

    YOLO = MockYOLO


# ----------------------------
# Flask cấu hình + đường dẫn dự án
# ----------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

DEFAULT_FRONTEND_DIST = os.path.abspath(
    os.path.join(BASE_DIR, "..", "cellphones-clone", "dist")
)
FRONTEND_DIST = os.path.abspath(
    os.getenv("FRONTEND_DIST", DEFAULT_FRONTEND_DIST)
)

app = Flask(__name__)

# Cho phép React/Vite gọi API Flask từ cổng 5173.
# Hỗ trợ cả CORS_ORIGINS (nhiều URL) và CORS_ORIGIN (một URL).
cors_origin_value = (
    os.getenv("CORS_ORIGINS")
    or os.getenv("CORS_ORIGIN")
    or "http://localhost:5173,http://127.0.0.1:5173"
)
cors_origins = [
    item.strip()
    for item in cors_origin_value.split(",")
    if item.strip()
]

CORS(
    app,
    resources={r"/*": {"origins": cors_origins}},
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "OPTIONS"],
)

app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "data", "products")
app.config["MAX_CONTENT_LENGTH"] = int(
    os.getenv("MAX_UPLOAD_MB", "5")
) * 1024 * 1024
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


# ----------------------------
# MongoDB: sản phẩm + người dùng
# ----------------------------
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB = os.getenv("MONGODB_DB", "cosarii").strip()
MONGODB_PRODUCTS_COLLECTION = os.getenv(
    "MONGODB_PRODUCTS_COLLECTION",
    "cellphones_products",
).strip()
MONGODB_USERS_COLLECTION = (
    os.getenv("MONGODB_USERS_COLLECTION")
    or os.getenv("USERS_COLLECTION")
    or "users"
).strip()
MONGODB_OTP_COLLECTION = (
    os.getenv("MONGODB_OTP_COLLECTION")
    or os.getenv("AUTH_OTP_COLLECTION")
    or "registration_otps"
).strip()

mongo_client = None
mongo_db = None
users_collection = None
registration_otps_collection = None
mongo_error = ""


def init_mongodb():
    global mongo_client, mongo_db, users_collection, registration_otps_collection, mongo_error

    if not MONGODB_URI:
        mongo_error = "Chưa khai báo MONGODB_URI trong file .env."
        print(f"Lỗi MongoDB: {mongo_error}")
        return

    try:
        mongo_client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
        )
        mongo_client.admin.command("ping")

        mongo_db = mongo_client[MONGODB_DB]
        users_collection = mongo_db[MONGODB_USERS_COLLECTION]
        registration_otps_collection = mongo_db[MONGODB_OTP_COLLECTION]

        index_definitions = [
            (
                users_collection,
                [("email", ASCENDING)],
                {"unique": True, "name": "unique_user_email"},
            ),
            (
                users_collection,
                [("phone", ASCENDING)],
                {
                    "unique": True,
                    "name": "unique_user_phone",
                    "partialFilterExpression": {"phone": {"$type": "string"}},
                },
            ),
            (
                registration_otps_collection,
                [("email", ASCENDING)],
                {"unique": True, "name": "unique_pending_email"},
            ),
            (
                registration_otps_collection,
                [("expires_at", ASCENDING)],
                {"expireAfterSeconds": 0, "name": "delete_expired_registration_otp"},
            ),
        ]

        for collection, keys, options in index_definitions:
            try:
                collection.create_index(keys, **options)
            except PyMongoError as index_error:
                print(f"Cảnh báo không thể tạo index {options.get('name')}: {index_error}")

        mongo_error = ""
        print(
            "Đã kết nối MongoDB cho tài khoản/OTP: "
            f"{MONGODB_DB}.{MONGODB_USERS_COLLECTION} và "
            f"{MONGODB_DB}.{MONGODB_OTP_COLLECTION}"
        )
    except Exception as exc:
        mongo_error = str(exc)
        print(f"Lỗi kết nối MongoDB: {exc}")
        mongo_client = None
        mongo_db = None
        users_collection = None
        registration_otps_collection = None


init_mongodb()


# ----------------------------
# JWT đăng nhập
# ----------------------------
JWT_SECRET_KEY = (
    os.getenv("JWT_SECRET_KEY")
    or os.getenv("JWT_SECRET")
    or "dev-only-change-this-jwt-secret"
).strip()


def parse_jwt_expiry_hours():
    explicit_hours = os.getenv("JWT_EXPIRES_HOURS", "").strip()
    if explicit_hours:
        return max(1, int(explicit_hours))

    expires_in = os.getenv("JWT_EXPIRES_IN", "7d").strip().lower()
    match = re.fullmatch(r"(\d+)\s*([hd]?)", expires_in)
    if not match:
        return 168

    amount = int(match.group(1))
    unit = match.group(2)
    return max(1, amount * 24 if unit == "d" else amount)


JWT_EXPIRES_HOURS = parse_jwt_expiry_hours()
JWT_ALGORITHM = "HS256"

if JWT_SECRET_KEY == "dev-only-change-this-jwt-secret":
    print("Cảnh báo: Hãy đặt JWT_SECRET_KEY riêng trong .env trước khi deploy.")


def normalize_email(value):
    return str(value or "").strip().lower()


def serialize_user(user_document):
    if not user_document:
        return None

    created_at = user_document.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.astimezone(timezone.utc).isoformat()

    full_name = str(user_document.get("full_name", "")).strip()
    customer_type = str(user_document.get("customer_type", "normal")).strip()

    return {
        "id": str(user_document.get("_id", "")),
        "full_name": full_name,
        "fullName": full_name,
        "email": str(user_document.get("email", "")).strip(),
        "phone": str(user_document.get("phone", "")).strip(),
        "birthday": str(user_document.get("birthday", "")).strip(),
        "customer_type": customer_type,
        "customerType": customer_type,
        "email_verified": bool(user_document.get("email_verified", False)),
        "role": str(user_document.get("role", "customer")),
        "created_at": created_at,
    }


def create_access_token(user_document):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_document["_id"]),
        "email": user_document["email"],
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def read_bearer_token():
    authorization = request.headers.get("Authorization", "").strip()
    if not authorization.lower().startswith("bearer "):
        return ""
    return authorization.split(" ", 1)[1].strip()


def get_authenticated_user():
    """Trả về (user_document, error_message)."""
    token = read_bearer_token()
    if not token:
        return None, None

    if users_collection is None:
        return None, "MongoDB người dùng chưa kết nối."

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = str(payload.get("sub", ""))
        if not ObjectId.is_valid(user_id):
            return None, "Token đăng nhập không hợp lệ."

        user_document = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user_document:
            return None, "Tài khoản không còn tồn tại."
        if user_document.get("is_active", True) is False:
            return None, "Tài khoản đã bị khóa."

        return user_document, None
    except jwt.ExpiredSignatureError:
        return None, "Phiên đăng nhập đã hết hạn."
    except jwt.InvalidTokenError:
        return None, "Token đăng nhập không hợp lệ."
    except Exception as exc:
        print(f"Lỗi xác thực token: {exc}")
        return None, "Không thể xác thực phiên đăng nhập."


def login_required(view_function):
    @wraps(view_function)
    def wrapped(*args, **kwargs):
        user_document, auth_error = get_authenticated_user()
        if auth_error or not user_document:
            return jsonify({"error": auth_error or "Bạn chưa đăng nhập."}), 401
        return view_function(user_document, *args, **kwargs)

    return wrapped


# =========================
# GEMINI CONFIG - GOOGLE GENAI SDK
# =========================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
client = None
MODEL_MAIN = None
MODEL_TRANSLATION = None


class GeminiModelAdapter:
    """Giữ cách gọi generate_content() cũ để không phải sửa toàn bộ dự án."""

    def __init__(self, gemini_client, model_name):
        self.gemini_client = gemini_client
        self.model_name = model_name

    def generate_content(self, contents, generation_config=None):
        config = generation_config or None
        return self.gemini_client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config,
        )


try:
    if genai is None:
        print("Lỗi: Chưa cài google-genai. Chạy: pip install -U google-genai")
    elif not GEMINI_API_KEY:
        print("Lỗi: Chưa nhập GEMINI_API_KEY trong file .env.")
    else:
        client = genai.Client(api_key=GEMINI_API_KEY)
        MODEL_MAIN = GeminiModelAdapter(client, GEMINI_MODEL)
        MODEL_TRANSLATION = GeminiModelAdapter(client, GEMINI_MODEL)
        print(f"Đã khởi tạo Gemini với model: {GEMINI_MODEL}")
except Exception as exc:
    print("Lỗi khởi tạo Gemini:", exc)
    client = None
    MODEL_MAIN = None
    MODEL_TRANSLATION = None


def ask_gemini(prompt):
    if not MODEL_MAIN:
        return "Hiện AI chưa được cấu hình."

    try:
        response = MODEL_MAIN.generate_content(
            prompt,
            generation_config={
                "max_output_tokens": 180,
                "temperature": 0.7,
            },
        )
        reply = response.text or ""
        reply = reply.replace("\n", "<br>")
        reply = reply.replace("•", "<br>•")
        reply = reply.replace("* ", "<br>• ")
        reply = reply.replace("###", "<br><b>")
        reply = reply.replace("---", "<hr>")
        return reply
    except Exception as exc:
        print("Gemini Error:", exc)
        return "Hiện AI đang bận, vui lòng thử lại sau."


# ----------------------------
# Catalog cục bộ + FAISS + mô hình
# ----------------------------
# MongoDB chỉ dùng cho tài khoản/OTP khi Flask đang chạy.
# Dữ liệu sản phẩm được đọc từ index/products.json, không quét collection MongoDB.
FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True)

# products.json chứa metadata đầy đủ theo đúng thứ tự từng vector FAISS.
PRODUCTS_METADATA_PATH = os.path.join(FAISS_DIR, "products.json")
# Giữ đường dẫn product_ids.json để tương thích, nhưng runtime không cần dùng file này.
FAISS_PRODUCT_IDS_PATH = os.path.join(FAISS_DIR, "product_ids.json")
FAISS_INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMBEDDINGS_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

from data.faq_flow import faq_flows
from clip_core import get_clip_embedding, get_clip_text_embedding

products = []
product_ids = []
product_by_id = {}
product_embeddings = None
faiss_index = None
faiss_product_order_ids = []
faiss_position_by_product_id = {}
yolo_model = None
catalog_loaded_at = None

# Tìm kiếm văn bản đa phương thức: text embedding truy vấn trực tiếp
# FAISS index được build từ ảnh sản phẩm MongoDB.
TEXT_EMBEDDING_SEARCH_ENABLED = os.getenv(
    "TEXT_EMBEDDING_SEARCH_ENABLED", "true"
).strip().lower() in {"1", "true", "yes", "on"}
TEXT_FAISS_CANDIDATES = max(20, int(os.getenv("TEXT_FAISS_CANDIDATES", "300")))
TEXT_FAISS_MIN_SIMILARITY = float(os.getenv("TEXT_FAISS_MIN_SIMILARITY", "0.18"))
TEXT_SEMANTIC_WEIGHT = float(os.getenv("TEXT_SEMANTIC_WEIGHT", "0.72"))
TEXT_KEYWORD_WEIGHT = float(os.getenv("TEXT_KEYWORD_WEIGHT", "0.28"))


# Các trường được dùng để tìm theo tên, hãng, danh mục, trainingLabels,
# nhãn phụ, thông số và mã sản phẩm.
CHATBOT_PRODUCT_PROJECTION = {
    "productKey": 1,
    "_id": 1,
    "id": 1,
    "productId": 1,
    "product_id": 1,
    "sku": 1,
    "slug": 1,
    "name": 1,
    "title": 1,
    "product_name": 1,
    "brand": 1,
    "manufacturer": 1,
    "category": 1,
    "category_name": 1,
    "categories": 1,
    "trainingLabels": 1,
    "training_labels": 1,
    "labels": 1,
    "tags": 1,
    "keywords": 1,
    "description": 1,
    "price": 1,
    "currentPrice": 1,
    "originalPrice": 1,
    "specs": 1,
    "specifications": 1,
    "colors": 1,
    "variants": 1,
    "image_path": 1,
    "image": 1,
    "image_url": 1,
    "primaryImage": 1,
    "images": 1,
    "url": 1,
    "sourceUrls": 1,
}


def _flatten_search_values(value):
    """Chuyển chuỗi/list/dict lồng nhau thành danh sách chuỗi để tìm kiếm."""
    if value is None:
        return []

    if isinstance(value, dict):
        flattened = []
        for key, item in value.items():
            # Giữ cả tên thuộc tính và giá trị, hữu ích với specs/trainingLabels dạng dict.
            flattened.extend(_flatten_search_values(key))
            flattened.extend(_flatten_search_values(item))
        return flattened

    if isinstance(value, (list, tuple, set)):
        flattened = []
        for item in value:
            flattened.extend(_flatten_search_values(item))
        return flattened

    text_value = str(value).strip()
    return [text_value] if text_value else []


def _unique_strings(values):
    unique_values = []
    seen = set()

    for value in values:
        text_value = str(value or "").strip()
        normalized = text_value.casefold()
        if text_value and normalized not in seen:
            seen.add(normalized)
            unique_values.append(text_value)

    return unique_values


def _display_text(value):
    """Lấy chuỗi hiển thị hợp lý từ dữ liệu MongoDB có cấu trúc khác nhau."""
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        for key in ("name", "title", "label", "value", "text"):
            if value.get(key):
                return str(value[key]).strip()

    values = _flatten_search_values(value)
    return values[0] if values else ""


def _normalize_search_text(value):
    """
    Chuẩn hóa tìm kiếm:
    - viết thường
    - bỏ dấu tiếng Việt
    - chuẩn hóa ký tự đ
    - bỏ dấu câu thừa
    """
    raw_text = " ".join(_flatten_search_values(value))
    raw_text = raw_text.casefold().replace("đ", "d")
    raw_text = unicodedata.normalize("NFD", raw_text)
    raw_text = "".join(
        character
        for character in raw_text
        if unicodedata.category(character) != "Mn"
    )
    raw_text = re.sub(r"[^a-z0-9]+", " ", raw_text)
    return re.sub(r"\s+", " ", raw_text).strip()


def _normalize_specs(specs, specifications):
    """Gộp specs dạng dict và specifications dạng list/dict."""
    normalized_specs = {}

    def add_spec(key, value):
        key_text = str(key or "").strip()
        value_parts = _flatten_search_values(value)
        value_text = " ".join(value_parts).strip()
        if key_text and value_text:
            normalized_specs[key_text] = value_text

    def consume(source):
        if isinstance(source, dict):
            for key, value in source.items():
                add_spec(key, value)
            return

        if not isinstance(source, list):
            return

        for item in source:
            if isinstance(item, dict):
                key = (
                    item.get("name")
                    or item.get("label")
                    or item.get("key")
                    or item.get("title")
                )
                value = (
                    item.get("value")
                    or item.get("content")
                    or item.get("text")
                    or item.get("values")
                )
                if key and value is not None:
                    add_spec(key, value)
                else:
                    for nested_key, nested_value in item.items():
                        add_spec(nested_key, nested_value)
            elif item is not None:
                add_spec("Thông số", item)

    consume(specs)
    consume(specifications)
    return normalized_specs


def _build_product_search_fields(product):
    categories = product.get("categories", [])
    labels = product.get("trainingLabels", [])
    identifiers = [
        product.get("productKey"),
        product.get("_id"),
        product.get("id"),
        product.get("productId"),
        product.get("product_id"),
        product.get("sku"),
        product.get("slug"),
        product.get("url"),
        product.get("sourceUrls"),
    ]

    fields = {
        "name": _normalize_search_text(product.get("name")),
        "brand": _normalize_search_text(
            [product.get("brand"), product.get("manufacturer")]
        ),
        "category": _normalize_search_text(
            [product.get("category"), categories]
        ),
        "labels": _normalize_search_text(labels),
        "identifiers": _normalize_search_text(identifiers),
        "specs": _normalize_search_text(
            [product.get("specs"), product.get("specifications")]
        ),
        "description": _normalize_search_text(product.get("description")),
        "extras": _normalize_search_text(
            [product.get("colors"), product.get("variants"), product.get("keywords")]
        ),
    }
    fields["all"] = " ".join(
        value for key, value in fields.items() if key != "all" and value
    )
    fields["all"] = re.sub(r"\s+", " ", fields["all"]).strip()
    return fields


def normalize_product_document(document):
    product = dict(document or {})
    # Phải cùng thứ tự khóa với get_product_id() trong build_index.py
    # để vị trí FAISS luôn ánh xạ đúng document MongoDB.
    product_id = (
        product.get("productKey")
        or product.get("_id")
        or product.get("id")
        or product.get("productId")
        or product.get("product_id")
        or product.get("sku")
        or product.get("slug")
        or product.get("url")
        or product.get("name")
        or product.get("title")
    )

    product["id"] = str(product_id or "")
    if "_id" in product:
        product["_id"] = str(product["_id"])

    label_values = []
    for field_name in (
        "trainingLabels",
        "training_labels",
        "labels",
        "tags",
        "keywords",
    ):
        label_values.extend(_flatten_search_values(product.get(field_name)))
    product["trainingLabels"] = _unique_strings(label_values)

    name = (
        _display_text(product.get("name"))
        or _display_text(product.get("title"))
        or _display_text(product.get("product_name"))
        or _display_text(product.get("sku"))
        or (
            product["trainingLabels"][0]
            if product["trainingLabels"]
            else "Không có tên"
        )
    )
    product["name"] = name

    product["brand"] = (
        _display_text(product.get("brand"))
        or _display_text(product.get("manufacturer"))
    )

    categories = _unique_strings(
        _flatten_search_values(product.get("categories"))
    )
    direct_category = (
        _display_text(product.get("category"))
        or _display_text(product.get("category_name"))
    )
    if direct_category:
        categories = _unique_strings([direct_category, *categories])

    product["categories"] = categories
    product["category"] = (
        direct_category
        or (categories[0] if categories else "")
        or (
            product["trainingLabels"][0]
            if product["trainingLabels"]
            else ""
        )
    )

    product["description"] = _display_text(product.get("description"))
    product["price"] = _mongo_price_to_number(
        product.get("price", product.get("currentPrice", 0))
    )
    product["specs"] = _normalize_specs(
        product.get("specs"),
        product.get("specifications"),
    )

    images = product.get("images") if isinstance(product.get("images"), list) else []
    product["image_path"] = str(
        product.get("image_path")
        or product.get("primaryImage")
        or product.get("image")
        or product.get("image_url")
        or (images[0] if images else "")
        or ""
    )

    product["_search_fields"] = _build_product_search_fields(product)
    product["_search_text"] = product["_search_fields"]["all"]
    return product


def _mongo_price_to_number(value):
    if isinstance(value, (int, float, np.integer, np.floating)):
        return int(value)
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    return int(digits) if digits else 0


def load_products_from_index_metadata():
    """
    Đọc catalog sản phẩm trực tiếp từ index/products.json.

    Thứ tự phần tử trong products.json phải trùng tuyệt đối với:
    - embeddings.npy
    - faiss_index.index

    Hàm này không truy vấn collection sản phẩm MongoDB.
    """
    global products, product_ids, product_by_id
    global faiss_product_order_ids, faiss_position_by_product_id
    global catalog_loaded_at

    if not os.path.isfile(PRODUCTS_METADATA_PATH):
        raise FileNotFoundError(
            f"Không tìm thấy metadata sản phẩm: {PRODUCTS_METADATA_PATH}. "
            "Hãy chạy build_index.py trước."
        )

    with open(PRODUCTS_METADATA_PATH, "r", encoding="utf-8") as file:
        raw_products = json.load(file)

    if not isinstance(raw_products, list):
        raise ValueError("index/products.json phải là một danh sách sản phẩm.")

    normalized_products = []
    seen_ids = set()

    for position, document in enumerate(raw_products):
        if not isinstance(document, dict):
            raise ValueError(
                f"Metadata tại vị trí {position} không phải object JSON."
            )

        product = normalize_product_document(document)
        product_id = str(product.get("id") or "").strip()

        if not product_id:
            raise ValueError(
                f"Sản phẩm metadata tại vị trí {position} không có ID hợp lệ."
            )
        if product_id in seen_ids:
            raise ValueError(
                f"ID sản phẩm bị trùng trong products.json: {product_id}"
            )

        seen_ids.add(product_id)
        normalized_products.append(product)

    products = normalized_products
    product_ids = [str(product["id"]) for product in products]
    product_by_id = {
        str(product["id"]): product
        for product in products
    }
    faiss_product_order_ids = list(product_ids)
    faiss_position_by_product_id = {
        product_id: position
        for position, product_id in enumerate(product_ids)
    }
    catalog_loaded_at = datetime.now(timezone.utc)

    print(
        f"Đã tải {len(products)} sản phẩm từ metadata cục bộ: "
        f"{PRODUCTS_METADATA_PATH}"
    )
    return products


def load_local_search_assets():
    """
    Nạp đồng bộ products.json, embeddings.npy và FAISS index từ ổ đĩa.
    Không đọc collection sản phẩm MongoDB.
    """
    global product_embeddings, faiss_index

    local_products = load_products_from_index_metadata()

    embeddings = np.load(EMBEDDINGS_PATH, allow_pickle=False)
    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)
    if embeddings.ndim != 2:
        raise ValueError(
            f"embeddings.npy phải có 2 chiều, hiện tại: {embeddings.shape}"
        )

    index = faiss.read_index(FAISS_INDEX_PATH)

    if index.ntotal != embeddings.shape[0]:
        raise ValueError(
            "FAISS index và embeddings.npy không khớp: "
            f"FAISS={index.ntotal}, embeddings={embeddings.shape[0]}"
        )
    if index.ntotal != len(local_products):
        raise ValueError(
            "FAISS index và products.json không khớp: "
            f"FAISS={index.ntotal}, products={len(local_products)}"
        )
    if index.d != embeddings.shape[1]:
        raise ValueError(
            "Số chiều FAISS và embeddings.npy không khớp: "
            f"FAISS={index.d}, embeddings={embeddings.shape[1]}"
        )

    product_embeddings = embeddings.astype("float32", copy=False)
    faiss_index = index

    print(
        "Đã tải bộ tìm kiếm cục bộ thành công: "
        f"{faiss_index.ntotal} vector, {faiss_index.d} chiều."
    )
    return local_products


try:
    load_local_search_assets()
except FileNotFoundError as exc:
    print(f"Chưa có đủ file tìm kiếm cục bộ: {exc}")
    print("Hãy chạy build_index.py để tạo products.json, embeddings.npy và FAISS index.")
    products = []
    product_ids = []
    product_by_id = {}
    faiss_product_order_ids = []
    faiss_position_by_product_id = {}
    faiss_index = None
    product_embeddings = None
except Exception as exc:
    print(f"Lỗi khi tải bộ tìm kiếm cục bộ: {exc}")
    products = []
    product_ids = []
    product_by_id = {}
    faiss_product_order_ids = []
    faiss_position_by_product_id = {}
    faiss_index = None
    product_embeddings = None

try:
    if os.path.exists(MODEL_PATH):
        yolo_model = YOLO(MODEL_PATH)
        print(f"Đã tải mô hình YOLO từ: {MODEL_PATH}")
    else:
        print(f"Không tìm thấy file model YOLO tại: {MODEL_PATH}")
except Exception as exc:
    print(f"Lỗi tải YOLO model: {exc}")


# ----------------------------
# Ngôn ngữ & Dịch thuật
# ----------------------------
def detect_language(text):
    if not client:
        return "vi"

    try:
        prompt = f"Ngôn ngữ của văn bản sau là gì? Chỉ trả lời vi/en/fr: {text}"
        response = MODEL_TRANSLATION.generate_content(prompt)

        lang = response.text.strip().lower()
        return lang if len(lang) == 2 else "vi"

    except Exception:
        return "vi"


def translate_text(text, target_lang="en"):
    if not client or target_lang == "vi":
        return text

    try:
        prompt = f"Dịch sang {target_lang}: {text}"
        response = MODEL_TRANSLATION.generate_content(prompt)

        return response.text.strip()

    except Exception:
        return text


# ----------------------------
# HTML sản phẩm
# ----------------------------
def _safe_text(value):
    return escape(str(value or ""), quote=True)


def _price_to_number(value):
    if isinstance(value, (int, float, np.integer, np.floating)):
        return int(value)

    digits = re.sub(r"[^0-9]", "", str(value or ""))
    return int(digits) if digits else 0


def generate_product_cards(product_list, response_text_vi=None, target_lang="vi"):
    if response_text_vi is None:
        response_text_vi = (
            "Không tìm thấy sản phẩm phù hợp."
            if not product_list
            else f"Tìm thấy {len(product_list)} sản phẩm được đề xuất:"
        )

    response_text = (
        translate_text(response_text_vi, target_lang)
        if target_lang != "vi" and target_lang is not None
        else response_text_vi
    )

    html = f"<p style='margin-bottom:10px;'>{_safe_text(response_text)}</p>"

    if not product_list:
        return html

    html += "<div class='product-list' style='display:flex;flex-wrap:wrap;gap:15px;'>"

    for product in product_list:
        name = str(product.get("name") or product.get("title") or "Không có tên")
        price = _price_to_number(product.get("price", 0))
        brand = str(product.get("brand") or "")
        category = str(product.get("category") or "")
        image_path = str(
            product.get("image_path")
            or product.get("image")
            or product.get("image_url")
            or ""
        )

        image_url = "/static/no-image.png"

        if image_path:
            image_path = image_path.replace("\\\\", "/").replace("\\", "/")
            lower_image_path = image_path.lower()

            if image_path.startswith("http://") or image_path.startswith("https://"):
                image_url = image_path
            elif "data/products/" in lower_image_path:
                relative_path = re.split(
                    r"data/products/",
                    image_path,
                    flags=re.IGNORECASE,
                )[-1]
                image_url = f"/data/products/{relative_path}"
            elif "static/" in lower_image_path:
                relative_path = re.split(
                    r"static/",
                    image_path,
                    flags=re.IGNORECASE,
                )[-1]
                image_url = f"/static/{relative_path}"
            else:
                image_url = f"/data/products/{image_path.lstrip('/')}"

        product_text = (
            f"{name} {brand} {category} {product.get('description', '')}"
        ).lower()

        suggestions = []

        if "laptop" in product_text:
            suggestions = [
                "Phù hợp học tập / văn phòng / gaming",
                "Nên xem RAM, CPU, SSD",
                "Phù hợp nếu bạn cần hiệu năng ổn định",
            ]
        elif "tai nghe" in product_text or "earphone" in product_text:
            suggestions = [
                "Phù hợp nghe nhạc / gaming / học online",
                "Nên xem pin và chống ồn",
                "Phù hợp nếu bạn thích sự tiện lợi",
            ]
        elif "tablet" in product_text or "máy tính bảng" in product_text:
            suggestions = [
                "Phù hợp học tập và giải trí",
                "Nên xem màn hình và pin",
                "Phù hợp nếu bạn cần thiết bị gọn nhẹ",
            ]
        elif "smartwatch" in product_text or "đồng hồ" in product_text:
            suggestions = [
                "Phù hợp theo dõi sức khỏe",
                "Nên xem pin và cảm biến",
                "Phù hợp nếu bạn hay vận động",
            ]

        suggestion_html = ""
        if suggestions:
            suggestion_html = (
                "<ul style='text-align:left;font-size:13px;margin-top:8px;"
                "padding-left:18px;color:#444;'>"
                + "".join(f"<li>{_safe_text(item)}</li>" for item in suggestions)
                + "</ul>"
            )

        safe_name = _safe_text(name)
        safe_brand = _safe_text(brand)
        safe_category = _safe_text(category)
        safe_image_url = _safe_text(image_url)

        html += f"""
        <div class='product-card'
             style='width:240px;border:1px solid #ccc;padding:12px;
                    border-radius:12px;text-align:center;
                    box-shadow:0 0 6px rgba(0,0,0,0.15);background:white;'>

            <img src="{safe_image_url}"
                 alt="{safe_name}"
                 style="width:160px;height:160px;object-fit:contain;margin-bottom:10px;"
                 onerror="this.onerror=null;this.src='/static/no-image.png'">

            <h4 style="font-size:16px;margin:8px 0;color:#111;">
                {safe_name}
            </h4>

            <p style="color:red;font-weight:bold;font-size:17px;margin:5px 0;">
                {price:,}đ
            </p>

            <p style="font-size:14px;margin:5px 0;">
                <b>{safe_brand}</b> - {safe_category}
            </p>

            {suggestion_html}
        </div>
        """

    html += "</div>"
    return html


# ----------------------------
# Tìm kiếm sản phẩm tổng quát
# ----------------------------
# Không còn giới hạn vào một danh sách danh mục cố định.
# Người dùng có thể tìm theo:
# - tên sản phẩm / model / SKU
# - hãng (brand/manufacturer)
# - category/categories
# - trainingLabels, labels, tags, keywords
# - thông số kỹ thuật và mô tả

SEARCH_FIELD_WEIGHTS = {
    "name": 14,
    "brand": 16,
    "labels": 15,
    "category": 11,
    "identifiers": 12,
    "specs": 6,
    "extras": 5,
    "description": 3,
}

SEARCH_STOPWORDS = {
    "tim", "kiem", "giup", "cho", "toi", "minh", "muon", "mua", "can",
    "xem", "san", "pham", "cac", "mot", "vai", "loai", "hang", "thuong",
    "hieu", "theo", "co", "nao", "phu", "hop", "voi", "cua", "ban", "nhe",
    "a", "la", "ve", "trong", "tren", "duoi", "shop", "cua", "hang",
    "danh", "muc", "category", "catalog", "mongodb", "database",
}

# Mỗi khóa là cách người dùng thường nhập; giá trị là các cách dữ liệu
# MongoDB có thể ghi cùng một ý nghĩa.
QUERY_ALIAS_GROUPS = {
    "khong day": ["khong day", "wireless", "bluetooth", "true wireless", "tws"],
    "co day": ["co day", "wired", "jack 3 5", "3 5mm"],
    "chong on": ["chong on", "noise cancelling", "noise cancellation", "anc"],
    "choi game": ["choi game", "gaming", "game"],
    "gia re": ["gia re", "gia tot", "tiet kiem", "budget", "pho thong"],
    "pin lau": ["pin lau", "thoi luong pin", "dung luong pin", "battery"],
    "hoc tap": ["hoc tap", "student", "hoc sinh", "sinh vien", "education"],
    "van phong": ["van phong", "office", "business"],
    "do hoa": ["do hoa", "graphic", "graphics", "designer", "design"],
    "dien thoai": ["dien thoai", "smartphone", "phone", "iphone", "galaxy"],
    "may tinh de ban": ["may tinh de ban", "desktop", "desktop pc", "pc"],
    "pc": ["pc", "desktop", "desktop pc", "may tinh de ban"],
    "may tinh xach tay": ["may tinh xach tay", "laptop", "notebook"],
    "laptop": ["laptop", "notebook", "may tinh xach tay"],
    "tai nghe": ["tai nghe", "earphone", "headphone", "headset", "earbuds"],
    "may tinh bang": ["may tinh bang", "tablet", "ipad"],
    "dong ho thong minh": ["dong ho thong minh", "smartwatch", "watch"],
    "op lung": ["op lung", "case", "cover", "bao da"],
    "op": ["op", "op lung", "case", "cover", "bao da"],
    "sac du phong": ["sac du phong", "power bank", "powerbank"],
    "cap sac": ["cap sac", "charging cable", "cable"],
    "quat": ["quat", "fan", "electric fan"],
}

PHONE_DEVICE_QUERY_TERMS = (
    "dien thoai",
    "smartphone",
    "mobile phone",
    "iphone",
    "galaxy",
)

PHONE_DEVICE_CONTEXT_TERMS = (
    "danh muc dien thoai",
    "muc dien thoai",
    "category dien thoai",
)

PHONE_DEVICE_PRIMARY_CATEGORIES = (
    "dien thoai",
)

PHONE_DEVICE_USED_CATEGORY_TERMS = (
    "iphone cu",
    "dien thoai cu",
    "samsung cu",
    "galaxy cu",
    "xiaomi cu",
    "oppo cu",
    "realme cu",
    "vivo cu",
)

NON_PHONE_CATEGORY_CONCEPTS = {
    "may tinh xach tay",
    "laptop",
    "tai nghe",
    "may tinh bang",
    "dong ho thong minh",
    "op lung",
    "op",
    "sac du phong",
    "cap sac",
}

NON_PHONE_QUERY_TERMS = (
    "phu kien",
    "op lung",
    "op",
    "bao da",
    "case",
    "cover",
    "dan man hinh",
    "dan dien thoai",
    "dan kinh",
    "mieng dan",
    "cuong luc",
    "kinh cuong luc",
    "applecare",
    "bao hanh",
    "sua chua",
    "sac",
    "charger",
    "cable",
    "power bank",
    "pin du phong",
    "tai nghe",
    "earphone",
    "headphone",
    "airpods",
    "dong ho",
    "watch",
    "smartwatch",
    "tablet",
    "ipad",
    "tab",
    "laptop",
    "camera",
    "may anh",
    "man hinh",
    "tivi",
)

NON_PHONE_PRODUCT_TERMS = (
    "phu kien",
    "op lung",
    "bao da",
    "case",
    "cover",
    "dan man hinh",
    "dan dien thoai",
    "dan kinh",
    "mieng dan",
    "cuong luc",
    "kinh cuong luc",
    "applecare",
    "bao hanh",
    "sua chua",
    "sac",
    "charger",
    "cable",
    "power bank",
    "pin du phong",
    "tai nghe",
    "earphone",
    "headphone",
    "airpods",
    "dong ho",
    "watch",
    "smartwatch",
    "tablet",
    "ipad",
    "camera",
    "may anh",
    "lens",
    "gia do",
    "kinh",
)


def _contains_search_term(text, term):
    text = str(text or "")
    term = _normalize_search_text(term)
    if not text or not term:
        return False

    # Với từ rất ngắn như "op", "5g", "m2", dùng ranh giới từ để
    # tránh khớp nhầm "op" trong "oppo".
    if " " not in term and len(term) <= 3:
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None

    return term in text


def _contains_query_phrase(text, phrase):
    return _contains_search_term(text, phrase)


def _remove_query_phrase(text, phrase):
    pattern = rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])"
    return re.sub(pattern, " ", text)


def _normalize_user_query(user_message):
    query = _normalize_search_text(user_message)

    # Viết tắt phổ biến.
    query = re.sub(
        r"\bip\s*(\d{1,2})(?:\s*(pro|max|plus|mini))?\b",
        lambda match: "iphone "
        + match.group(1)
        + (f" {match.group(2)}" if match.group(2) else ""),
        query,
    )
    query = re.sub(r"\bss\b", "samsung", query)
    query = re.sub(r"\bair\s*pod(s)?\b", "airpods", query)
    return re.sub(r"\s+", " ", query).strip()


def _parse_search_query(user_message):
    normalized_query = _normalize_user_query(user_message)
    remaining_query = normalized_query
    concepts = []

    # Ưu tiên cụm dài trước để tránh "op" lấy mất "op lung".
    for trigger in sorted(QUERY_ALIAS_GROUPS, key=len, reverse=True):
        if _contains_query_phrase(remaining_query, trigger):
            concepts.append({
                "trigger": trigger,
                "aliases": QUERY_ALIAS_GROUPS[trigger],
            })
            remaining_query = _remove_query_phrase(remaining_query, trigger)

    raw_tokens = re.findall(r"[a-z0-9]+", remaining_query)
    tokens = []
    for token in raw_tokens:
        if token in SEARCH_STOPWORDS:
            continue
        if token not in tokens:
            tokens.append(token)

    meaningful_parts = [concept["trigger"] for concept in concepts] + tokens
    meaningful_phrase = " ".join(meaningful_parts).strip()

    return {
        "normalized_query": normalized_query,
        "meaningful_phrase": meaningful_phrase,
        "concepts": concepts,
        "tokens": tokens,
    }


def _has_any_search_term(text, terms):
    return any(_contains_search_term(text, term) for term in terms)


def _product_primary_category_text(product):
    direct_category = product.get("category")
    if direct_category:
        return _normalize_search_text(direct_category)

    categories = product.get("categories")
    if isinstance(categories, (list, tuple)) and categories:
        return _normalize_search_text(categories[0])

    return ""


def _product_is_phone_device(product):
    search_fields = product.get("_search_fields") or _build_product_search_fields(product)
    primary_category = _product_primary_category_text(product)
    category_text = search_fields.get("category", "")
    name_text = search_fields.get("name", "")
    product_type_text = " ".join(
        part for part in (primary_category, category_text, name_text) if part
    )

    if _has_any_search_term(product_type_text, NON_PHONE_PRODUCT_TERMS):
        return False

    if _has_any_search_term(primary_category, PHONE_DEVICE_PRIMARY_CATEGORIES):
        return True

    if (
        _contains_search_term(primary_category, "hang cu")
        and _has_any_search_term(category_text, PHONE_DEVICE_USED_CATEGORY_TERMS)
    ):
        return True

    if re.search(r"^(apple\s+)?iphone(\s|$)", name_text):
        return True

    if re.search(r"^(samsung\s+)?galaxy\s+(s|z|a|m|note)\w*", name_text):
        return True

    return False


def _query_mentions_cable(normalized_query):
    query_without_quality = _remove_query_phrase(normalized_query, "cao cap")
    return _contains_search_term(query_without_quality, "cap")


def _query_requests_phone_device(parsed_query):
    normalized_query = parsed_query.get("normalized_query", "")
    concept_triggers = {
        str(concept.get("trigger", ""))
        for concept in parsed_query.get("concepts", [])
    }

    if concept_triggers.intersection(NON_PHONE_CATEGORY_CONCEPTS):
        return False

    if _has_any_search_term(normalized_query, NON_PHONE_QUERY_TERMS):
        return False

    if _query_mentions_cable(normalized_query):
        return False

    if _has_any_search_term(normalized_query, PHONE_DEVICE_CONTEXT_TERMS):
        return True

    if "dien thoai" in concept_triggers:
        return True

    return _has_any_search_term(normalized_query, PHONE_DEVICE_QUERY_TERMS)


def _query_requires_primary_phone_category(parsed_query):
    normalized_query = parsed_query.get("normalized_query", "")
    return _has_any_search_term(normalized_query, PHONE_DEVICE_CONTEXT_TERMS)


def _filter_scored_products_for_query(scored_items, parsed_query, product_index):
    if not _query_requests_phone_device(parsed_query):
        return scored_items

    if _query_requires_primary_phone_category(parsed_query):
        return [
            item
            for item in scored_items
            if _has_any_search_term(
                _product_primary_category_text(item[product_index]),
                PHONE_DEVICE_PRIMARY_CATEGORIES,
            )
        ]

    return [
        item
        for item in scored_items
        if _product_is_phone_device(item[product_index])
    ]


def _best_weight_for_term(search_fields, term):
    best_weight = 0

    for field_name, weight in SEARCH_FIELD_WEIGHTS.items():
        if _contains_search_term(search_fields.get(field_name, ""), term):
            best_weight = max(best_weight, weight)

    return best_weight


def _score_product_for_query(product, parsed_query, allow_partial=False):
    search_fields = product.get("_search_fields") or _build_product_search_fields(product)
    all_text = search_fields.get("all", "")

    if not all_text:
        return None

    score = 0.0

    # Mỗi concept là một nhóm từ đồng nghĩa. Chỉ cần một alias khớp,
    # nhưng tất cả concept người dùng yêu cầu đều phải xuất hiện.
    for concept in parsed_query["concepts"]:
        concept_score = 0
        for alias in concept["aliases"]:
            concept_score = max(
                concept_score,
                _best_weight_for_term(search_fields, alias),
            )

        if concept_score <= 0:
            return None

        score += concept_score * 1.8

    matched_token_scores = []
    for token in parsed_query["tokens"]:
        token_score = _best_weight_for_term(search_fields, token)
        if token_score > 0:
            matched_token_scores.append(token_score)

    token_count = len(parsed_query["tokens"])
    matched_count = len(matched_token_scores)

    if token_count:
        if allow_partial:
            required_count = max(1, (token_count * 2 + 2) // 3)
        else:
            required_count = token_count

        if matched_count < required_count:
            return None

        score += sum(matched_token_scores)

    if not parsed_query["concepts"] and not parsed_query["tokens"]:
        return None

    phrase = parsed_query["meaningful_phrase"]
    if phrase:
        if _contains_search_term(search_fields.get("name", ""), phrase):
            score += 35
        elif _contains_search_term(search_fields.get("brand", ""), phrase):
            score += 32
        elif _contains_search_term(search_fields.get("labels", ""), phrase):
            score += 30
        elif _contains_search_term(search_fields.get("category", ""), phrase):
            score += 24
        elif _contains_search_term(all_text, phrase):
            score += 12

    # Ưu tiên kết quả có thông tin hiển thị đầy đủ.
    if product.get("image_path"):
        score += 1.0
    if product.get("price", 0) > 0:
        score += 0.5
    if product.get("name") and product.get("name") != "Không có tên":
        score += 0.5

    return score


def search_products(user_message, product_list=None, limit=20):
    """
    Tìm và xếp hạng trên toàn bộ dữ liệu đã chuẩn hóa.
    Trả về (danh_sách_sản_phẩm, thông_tin_truy_vấn).
    """
    source_products = product_list if product_list is not None else products
    parsed_query = _parse_search_query(user_message)

    def collect(allow_partial):
        scored = []
        seen_ids = set()

        for product in source_products:
            score = _score_product_for_query(
                product,
                parsed_query,
                allow_partial=allow_partial,
            )
            if score is None:
                continue

            product_id = str(product.get("id", ""))
            if product_id and product_id in seen_ids:
                continue
            if product_id:
                seen_ids.add(product_id)

            scored.append((score, product))

        scored.sort(
            key=lambda item: (
                -item[0],
                str(item[1].get("name", "")).casefold(),
                str(item[1].get("id", "")),
            )
        )
        return scored

    scored_products = _filter_scored_products_for_query(
        collect(allow_partial=False),
        parsed_query,
        product_index=1,
    )

    # Nếu không có kết quả chính xác, thử khớp mềm 2/3 số token.
    if not scored_products and len(parsed_query["tokens"]) >= 2:
        scored_products = _filter_scored_products_for_query(
            collect(allow_partial=True),
            parsed_query,
            product_index=1,
        )

    if limit is None:
        selected = [product for _, product in scored_products]
    else:
        selected = [
            product
            for _, product in scored_products[:max(0, int(limit))]
        ]

    return selected, parsed_query


def _product_to_searchable_text(product):
    fields = product.get("_search_fields")
    if not fields:
        fields = _build_product_search_fields(product)
        product["_search_fields"] = fields
        product["_search_text"] = fields["all"]
    return fields["all"]


def filter_products(
    category=None,
    price_max=None,
    price_min=None,
    specs_to_find=None,
    search_terms=None,
    ram=None,
    screen=None,
):
    """Giữ API cũ nhưng dùng bộ tìm kiếm mới cho search_terms."""
    results = list(products)
    specs_to_find = dict(specs_to_find or {})

    if ram:
        specs_to_find["ram"] = ram
    if screen:
        specs_to_find["screen"] = screen

    if category:
        category_normalized = _normalize_search_text(category)
        results = [
            product
            for product in results
            if _contains_search_term(
                (product.get("_search_fields") or {}).get("category", ""),
                category_normalized,
            )
        ]

    if price_max is not None:
        results = [
            product
            for product in results
            if 0 < product.get("price", 0) <= price_max
        ]

    if price_min is not None:
        results = [
            product
            for product in results
            if product.get("price", 0) >= price_min
        ]

    if specs_to_find:
        requested_specs_text = _normalize_search_text(specs_to_find)
        results = [
            product
            for product in results
            if all(
                _contains_search_term(
                    (product.get("_search_fields") or {}).get("specs", ""),
                    token,
                )
                for token in requested_specs_text.split()
            )
        ]

    if search_terms:
        query_text = " ".join(str(term) for term in search_terms if term)
        results, _ = search_products(query_text, results, limit=None)

    has_filters = any(
        [
            category,
            price_max is not None,
            price_min is not None,
            specs_to_find,
            search_terms,
        ]
    )
    return results if has_filters else []



# ----------------------------
# Hội thoại tự nhiên
# ----------------------------
VIETNAM_TIMEZONE = timezone(timedelta(hours=7))


def _clean_chat_user_name(value):
    """Tên hiển thị ngắn, ưu tiên tên lấy từ tài khoản đã xác thực."""
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    return cleaned[:80]


def get_vietnam_day_period(now=None):
    """Trả về buổi trong ngày theo múi giờ Việt Nam."""
    current_time = now or datetime.now(VIETNAM_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=VIETNAM_TIMEZONE)
    else:
        current_time = current_time.astimezone(VIETNAM_TIMEZONE)

    hour = current_time.hour
    if 5 <= hour < 11:
        return "buổi sáng", current_time
    if 11 <= hour < 14:
        return "buổi trưa", current_time
    if 14 <= hour < 18:
        return "buổi chiều", current_time
    return "buổi tối", current_time


GREETING_PATTERN = (
    r"(xin chao|chao|hello|hi|hey|halo|alo|"
    r"chao buoi sang|chao buoi trua|chao buoi chieu|chao buoi toi)"
    r"( ban| mochi| chatbot| shop| moi nguoi)?"
)


def is_greeting_message(user_message):
    """Chỉ nhận diện lời chào độc lập, không chặn câu có kèm yêu cầu mua hàng."""
    normalized = _normalize_user_query(user_message)
    return re.fullmatch(GREETING_PATTERN, normalized) is not None


def _fallback_greeting_response(user_name="", day_period="buổi sáng", seed_text=""):
    """Câu chào dự phòng khi Gemini chưa cấu hình hoặc đang lỗi."""
    safe_name = _safe_text(_clean_chat_user_name(user_name))
    named_user = f" <strong>{safe_name}</strong>" if safe_name else ""

    templates = {
        "buổi sáng": [
            f"Chào buổi sáng{named_user} 👋 Mình là Mochi. Bạn đang muốn tìm sản phẩm nào cho ngày mới?",
            f"Xin chào{named_user}, chúc bạn buổi sáng vui vẻ ☀️ Mochi có thể giúp bạn tìm sản phẩm gì hôm nay?",
        ],
        "buổi trưa": [
            f"Chào buổi trưa{named_user} 👋 Mình là Mochi. Bạn muốn mình hỗ trợ tìm sản phẩm nào?",
            f"Xin chào{named_user}, chúc bạn buổi trưa thật dễ chịu 😊 Hôm nay bạn đang quan tâm sản phẩm gì?",
        ],
        "buổi chiều": [
            f"Chào buổi chiều{named_user} 👋 Mochi sẵn sàng giúp bạn tìm sản phẩm phù hợp.",
            f"Xin chào{named_user}, chúc bạn một buổi chiều vui vẻ 😊 Bạn đang muốn tham khảo sản phẩm nào?",
        ],
        "buổi tối": [
            f"Chào buổi tối{named_user} 👋 Mình là Mochi. Bạn muốn tìm sản phẩm nào tối nay?",
            f"Xin chào{named_user}, chúc bạn buổi tối vui vẻ 🌙 Mochi có thể tư vấn sản phẩm gì cho bạn?",
        ],
    }

    choices = templates.get(day_period, templates["buổi sáng"])
    digest = hashlib.sha256(
        f"{seed_text}|{user_name}|{day_period}".encode("utf-8")
    ).hexdigest()
    return choices[int(digest, 16) % len(choices)]


def generate_natural_greeting_response(user_message, user_name=""):
    """
    Function riêng xử lý lời chào.
    Gemini tạo câu trả lời tự nhiên dựa trên tên đăng nhập và thời gian Việt Nam;
    nếu Gemini lỗi thì dùng câu chào dự phòng theo buổi trong ngày.
    """
    if not is_greeting_message(user_message):
        return None

    day_period, current_time = get_vietnam_day_period()
    customer_name = _clean_chat_user_name(user_name)

    if MODEL_MAIN:
        prompt = f"""
Bạn là Mochi, trợ lý mua sắm thân thiện của một cửa hàng công nghệ.

Người dùng vừa chào: {user_message}
Tên người dùng: {customer_name or 'khách chưa đăng nhập'}
Thời gian hiện tại tại Việt Nam: {current_time.strftime('%H:%M')}, {day_period}

Hãy trả lời lời chào thật tự nhiên và ấm áp.
Quy tắc:
- Viết bằng tiếng Việt, tối đa 2 câu.
- Xưng là "Mochi" hoặc "mình".
- Gọi tên người dùng tối đa một lần nếu có tên.
- Chào phù hợp với buổi trong ngày.
- Kết thúc bằng một câu hỏi ngắn xem người dùng muốn tìm sản phẩm nào.
- Không dùng Markdown, không tạo thẻ HTML, không nhắc đến AI, code, database hoặc API.
"""
        try:
            response = MODEL_MAIN.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": 100,
                    "temperature": 0.85,
                },
            )
            reply = str(response.text or "").strip()
            if reply:
                return _safe_text(reply).replace("\n", "<br>")
        except Exception as exc:
            print(f"Lỗi tạo lời chào tự nhiên: {exc}")

    return _fallback_greeting_response(
        user_name=user_name,
        day_period=day_period,
        seed_text=user_message,
    )


def get_natural_social_response(user_message, user_name=""):
    """
    Xử lý các câu xã giao độc lập. Lời chào được chuyển sang function
    generate_natural_greeting_response() để có thể dùng tên và thời gian.
    """
    greeting_reply = generate_natural_greeting_response(user_message, user_name)
    if greeting_reply:
        return greeting_reply

    normalized = _normalize_user_query(user_message)
    safe_name = _safe_text(_clean_chat_user_name(user_name))
    named_user = f" <strong>{safe_name}</strong>" if safe_name else ""

    thanks_pattern = (
        r"(cam on|cam on ban|cam on mochi|thanks|thank you|"
        r"ok cam on|oke cam on)( nhe| nha| rat nhieu)?"
    )
    if re.fullmatch(thanks_pattern, normalized):
        return (
            f"Không có gì{named_user} 😊<br>"
            "Khi cần tìm hoặc so sánh sản phẩm, bạn cứ nhắn cho mình nhé."
        )

    goodbye_pattern = (
        r"(tam biet|bye|goodbye|hen gap lai|chao nhe|chao tam biet)"
        r"( ban| mochi)?"
    )
    if re.fullmatch(goodbye_pattern, normalized):
        return (
            f"Tạm biệt{named_user} 👋 "
            "Chúc bạn một ngày vui vẻ và hẹn gặp lại!"
        )

    identity_pattern = r"(ban la ai|mochi la ai|chatbot nay la gi)"
    if re.fullmatch(identity_pattern, normalized):
        return (
            "Mình là <strong>Mochi</strong>, trợ lý mua sắm AI. "
            "Mình có thể giúp bạn tìm sản phẩm bằng văn bản hoặc hình ảnh."
        )

    help_pattern = (
        r"(ban lam duoc gi|mochi lam duoc gi|chatbot lam duoc gi|"
        r"giup toi voi|huong dan toi)"
    )
    if re.fullmatch(help_pattern, normalized):
        return (
            "Mình có thể giúp bạn tìm sản phẩm theo tên, hãng, danh mục, "
            "tầm giá hoặc thông số. Bạn cũng có thể kéo thả ảnh vào khung chat "
            "để tìm sản phẩm tương tự."
        )

    return None


PRODUCT_REQUEST_TERMS = (
    "san pham", "tim", "kiem", "mua", "gia", "bao nhieu", "tu van",
    "laptop", "may tinh", "may tinh de ban", "pc", "desktop",
    "dien thoai", "iphone", "samsung", "xiaomi",
    "tai nghe", "headphone", "earphone", "tablet", "may tinh bang",
    "dong ho", "smartwatch", "op lung", "sac", "cap", "pin",
    "ram", "ssd", "cpu", "gpu", "rtx", "intel", "amd",
    "quat", "quat may", "quat dien", "quat mini", "quat cam tay",
    "do gia dung", "gia dung", "tu lanh", "may lanh", "dieu hoa",
    "may giat", "may say", "noi chien", "noi com", "may loc nuoc",
)


def _classify_product_intent_with_gemini(user_message):
    """Nhận diện cả tên sản phẩm chưa có trong danh mục, ví dụ: 'tủ lạnh'."""
    if not MODEL_MAIN:
        return False

    prompt = f"""
Phân loại tin nhắn sau cho chatbot cửa hàng:
Tin nhắn: {user_message}

Trả về duy nhất một từ:
- PRODUCT: người dùng đang nhắc đến, tìm, hỏi giá, muốn mua hoặc cần tư vấn một sản phẩm/danh mục/model cụ thể. Một tên sản phẩm đứng riêng cũng là PRODUCT.
- GENERAL: trò chuyện thông thường, hỏi kiến thức không liên quan đến mua sắm, cảm xúc hoặc xã giao.
"""
    try:
        response = MODEL_MAIN.generate_content(
            prompt,
            generation_config={
                "max_output_tokens": 8,
                "temperature": 0,
            },
        )
        label = str(response.text or "").strip().upper()
        return label.startswith("PRODUCT")
    except Exception as exc:
        print(f"Lỗi nhận diện ý định sản phẩm: {exc}")
        return False


def looks_like_product_request(user_message):
    normalized = _normalize_user_query(user_message)
    if any(
        _contains_search_term(normalized, term)
        for term in PRODUCT_REQUEST_TERMS
    ):
        return True

    # Gemini giúp nhận ra những sản phẩm không nằm trong danh sách từ khóa cứng.
    return _classify_product_intent_with_gemini(user_message)


def generate_natural_chat_reply(user_message, user_name=""):
    """
    Dùng Gemini cho hội thoại chung, nhưng không cho phép bịa tên,
    giá hoặc thông tin sản phẩm ngoài MongoDB.
    """
    if not MODEL_MAIN:
        return None

    customer_name = _clean_chat_user_name(user_name) or "khách chưa đăng nhập"
    day_period, current_time = get_vietnam_day_period()
    prompt = f"""
Bạn là Mochi, trợ lý mua sắm thân thiện của một cửa hàng công nghệ.

Tên người dùng: {customer_name}
Thời gian tại Việt Nam: {current_time.strftime('%H:%M')}, {day_period}
Tin nhắn: {user_message}

Quy tắc:
- Trả lời bằng tiếng Việt tự nhiên, thân thiện, tối đa 3 câu.
- Có thể gọi tên người dùng tối đa một lần nếu phù hợp.
- Không bịa tên sản phẩm, giá, khuyến mãi hoặc tồn kho.
- Nếu người dùng muốn mua sản phẩm nhưng chưa nói rõ nhu cầu, hãy hỏi đúng một câu làm rõ.
- Không nói về code, MongoDB, FAISS, API hoặc quy trình nội bộ.
- Không dùng Markdown và không tạo thẻ HTML.
"""

    try:
        response = MODEL_MAIN.generate_content(
            prompt,
            generation_config={
                "max_output_tokens": 160,
                "temperature": 0.65,
            },
        )
        reply = str(response.text or "").strip()
        if not reply:
            return None
        return _safe_text(reply).replace("\n", "<br>")
    except Exception as exc:
        print(f"Lỗi tạo câu trả lời hội thoại tự nhiên: {exc}")
        return None


def find_alternative_products(user_message, product_list=None, limit=3):
    """
    Tìm sản phẩm thay thế gần với yêu cầu nhưng không yêu cầu mọi token đều khớp.
    Hàm chỉ trả về sản phẩm có trong metadata index/products.json.
    """
    source_products = product_list if product_list is not None else products
    parsed_query = _parse_search_query(user_message)
    normalized_query = parsed_query["normalized_query"]
    scored_products = []
    seen_ids = set()

    for product in source_products:
        search_fields = product.get("_search_fields") or _build_product_search_fields(product)
        score = 0.0

        for concept in parsed_query["concepts"]:
            concept_score = max(
                (
                    _best_weight_for_term(search_fields, alias)
                    for alias in concept["aliases"]
                ),
                default=0,
            )
            if concept_score > 0:
                score += concept_score * 2.0

        for token in parsed_query["tokens"]:
            token_score = _best_weight_for_term(search_fields, token)
            if token_score > 0:
                score += token_score

        # Khi câu có cụm tên/model dài, ưu tiên sản phẩm chứa một phần cụm đó.
        name_text = search_fields.get("name", "")
        brand_text = search_fields.get("brand", "")
        category_text = search_fields.get("category", "")
        for query_token in normalized_query.split():
            if len(query_token) < 3 or query_token in SEARCH_STOPWORDS:
                continue
            if _contains_search_term(name_text, query_token):
                score += 8
            elif _contains_search_term(brand_text, query_token):
                score += 7
            elif _contains_search_term(category_text, query_token):
                score += 5

        if score <= 0:
            continue

        product_id = str(product.get("id", ""))
        if product_id and product_id in seen_ids:
            continue
        if product_id:
            seen_ids.add(product_id)

        if product.get("image_path"):
            score += 0.5
        if product.get("price", 0) > 0:
            score += 0.25

        scored_products.append((score, product))

    scored_products.sort(
        key=lambda item: (
            -item[0],
            str(item[1].get("name", "")).casefold(),
        )
    )
    return [product for _, product in scored_products[:max(0, int(limit))]]


def get_available_category_names(product_list=None, limit=5):
    """Lấy một số danh mục thật đang có để gợi ý khi không có sản phẩm liên quan."""
    source_products = product_list if product_list is not None else products
    category_counts = {}

    for product in source_products:
        category = str(product.get("category") or "").strip()
        if not category:
            continue
        key = category.casefold()
        if key not in category_counts:
            category_counts[key] = [category, 0]
        category_counts[key][1] += 1

    ordered = sorted(
        category_counts.values(),
        key=lambda item: (-item[1], item[0].casefold()),
    )
    return [category for category, _ in ordered[:max(0, int(limit))]]


def generate_product_not_found_reply(
    user_message,
    user_name="",
    alternative_products=None,
    available_categories=None,
):
    """
    Tạo câu báo không có sản phẩm tự nhiên. Gemini chỉ được nhắc đến sản phẩm
    thay thế và danh mục đã truyền vào từ MongoDB.
    """
    alternatives = list(alternative_products or [])
    categories = list(available_categories or [])
    customer_name = _clean_chat_user_name(user_name) or "khách chưa đăng nhập"

    simplified_alternatives = [
        {
            "name": product.get("name"),
            "brand": product.get("brand"),
            "category": product.get("category"),
            "price": product.get("price"),
        }
        for product in alternatives
    ]

    if MODEL_MAIN:
        prompt = f"""
Bạn là Mochi, trợ lý mua sắm thân thiện.

Tên người dùng: {customer_name}
Yêu cầu không tìm thấy trong danh mục: {user_message}
Sản phẩm thay thế có thật trong MongoDB: {json.dumps(simplified_alternatives, ensure_ascii=False)}
Các danh mục có thật trong cửa hàng: {json.dumps(categories, ensure_ascii=False)}

Hãy viết lời phản hồi bằng tiếng Việt tự nhiên, tối đa 3 câu.
Quy tắc bắt buộc:
- Nói rõ hiện chưa tìm thấy sản phẩm phù hợp trong danh mục cửa hàng; không khẳng định hết hàng.
- Nếu danh sách sản phẩm thay thế không rỗng, giới thiệu rằng bên dưới là một vài lựa chọn gần với nhu cầu.
- Nếu không có sản phẩm thay thế, gợi ý người dùng thử một trong các danh mục có thật hoặc cung cấp thêm hãng, tầm giá, thông số.
- Không bịa thêm bất kỳ tên sản phẩm, giá, danh mục hoặc khuyến mãi nào.
- Có thể gọi tên người dùng tối đa một lần.
- Không dùng Markdown, không tạo thẻ HTML và không nhắc MongoDB/API/code.
"""
        try:
            response = MODEL_MAIN.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": 150,
                    "temperature": 0.75,
                },
            )
            reply = str(response.text or "").strip()
            if reply:
                return reply
        except Exception as exc:
            print(f"Lỗi tạo phản hồi không tìm thấy sản phẩm: {exc}")

    name_prefix = f"{customer_name}, " if user_name else ""
    if alternatives:
        return (
            f"{name_prefix}mình chưa tìm thấy đúng sản phẩm “{user_message}” "
            "trong danh mục hiện tại. Bạn có thể tham khảo một vài lựa chọn gần với nhu cầu ở bên dưới nhé."
        )

    if categories:
        return (
            f"{name_prefix}mình chưa tìm thấy sản phẩm “{user_message}” trong danh mục hiện tại. "
            f"Bạn có thể thử tìm theo các nhóm như {', '.join(categories)} hoặc cho mình thêm hãng, tầm giá và thông số mong muốn."
        )

    return (
        f"{name_prefix}mình chưa tìm thấy sản phẩm “{user_message}” trong danh mục hiện tại. "
        "Bạn thử cung cấp thêm tên hãng, tầm giá hoặc thông số mong muốn nhé."
    )


# ----------------------------
# FAQ
# ----------------------------
def get_faq_response(user_message):
    message_lower = user_message.lower().strip()

    if message_lower in faq_flows:
        flow = faq_flows[message_lower]
        intro = flow["intro"]
        suggestions = flow.get("suggestions", [])

        list_html = "<ul style='margin-top: 10px; margin-left: 20px;'>"
        list_html += "".join([f"<li>{s}</li>" for s in suggestions])
        list_html += "</ul>"

        conclusion = "<p>Cho mình biết rõ mục đích, mình sẽ hỗ trợ chi tiết nhé.</p>"

        return f"{intro}<br>{list_html}<br>{conclusion}"

    return None


# ----------------------------
# CLIP + FAISS
# ----------------------------
def find_similar_products_clip_faiss(query_embedding, k=5):
    scored_results, error = search_faiss_products_with_scores(query_embedding, k=k)
    if error:
        return [], error
    return [item["product"] for item in scored_results], None


CLIP_TEXT_TRANSLATIONS = {
    "dien thoai": "smartphone mobile phone",
    "may tinh de ban": "desktop computer pc tower",
    "pc": "desktop computer pc tower",
    "may tinh xach tay": "laptop notebook computer",
    "may tinh": "computer laptop",
    "tai nghe": "headphones earphones earbuds headset",
    "may tinh bang": "tablet ipad",
    "dong ho thong minh": "smartwatch wearable watch",
    "dong ho": "watch smartwatch",
    "op lung": "phone case cover",
    "sac du phong": "power bank portable charger",
    "cap sac": "charging cable",
    "cu sac": "wall charger power adapter",
    "quat": "electric fan appliance",
    "do gia dung": "home appliance",
    "khong day": "wireless bluetooth",
    "co day": "wired",
    "chong on": "noise cancelling ANC",
    "choi game": "gaming",
    "hoc tap": "student education study",
    "van phong": "office business productivity",
    "do hoa": "graphics design creator",
    "gia re": "budget affordable",
    "pin lau": "long battery life",
}


def build_clip_text_query(user_message):
    """Tạo prompt tiếng Anh ngắn giúp OpenAI CLIP hiểu truy vấn tiếng Việt."""
    original = " ".join(str(user_message or "").split()).strip()
    normalized = _normalize_user_query(original)
    expanded_terms = []

    for vietnamese_term, english_term in CLIP_TEXT_TRANSLATIONS.items():
        if _contains_search_term(normalized, vietnamese_term):
            expanded_terms.append(english_term)

    parsed_query = _parse_search_query(original)
    for concept in parsed_query["concepts"]:
        for alias in concept.get("aliases", []):
            alias_text = str(alias or "").strip()
            if alias_text and alias_text not in expanded_terms:
                expanded_terms.append(alias_text)

    for token in parsed_query["tokens"]:
        if token not in expanded_terms:
            expanded_terms.append(token)

    expanded = " ".join(expanded_terms).strip()
    if expanded:
        return f"a clear ecommerce product photo of {expanded}. User request: {original}"
    return f"a clear ecommerce product photo matching this request: {original}"


def _validate_query_embedding(query_embedding):
    if faiss_index is None:
        return None, "FAISS index chưa được tải thành công."

    vector = np.asarray(query_embedding, dtype="float32").reshape(-1)
    if vector.size != faiss_index.d:
        return None, (
            "Kích thước embedding truy vấn không khớp FAISS: "
            f"{vector.size} != {faiss_index.d}. "
            "Hãy dùng cùng model CLIP với build_index.py."
        )

    norm = float(np.linalg.norm(vector))
    if norm <= 0:
        return None, "Embedding truy vấn không hợp lệ."

    vector = vector / norm
    return vector.astype("float32"), None


def _product_from_faiss_position(position):
    position = int(position)
    if position < 0:
        return None

    if faiss_product_order_ids:
        if position >= len(faiss_product_order_ids):
            return None
        product_id = str(faiss_product_order_ids[position])
        return product_by_id.get(product_id)

    if position < len(products):
        return products[position]
    return None


def search_faiss_products_with_scores(query_embedding, k=5):
    """Trả về product, vị trí FAISS, L2 distance và cosine tương đương."""
    vector, error = _validate_query_embedding(query_embedding)
    if error:
        return [], error

    if not products:
        return [], "Metadata sản phẩm cục bộ chưa được tải."
    search_k = min(max(1, int(k)), faiss_index.ntotal)
    distances, indexes = faiss_index.search(vector.reshape(1, -1), search_k)

    results = []
    seen_ids = set()
    for distance, position in zip(distances[0], indexes[0]):
        product = _product_from_faiss_position(position)
        if not product:
            continue

        product_id = str(product.get("id", ""))
        if not product_id or product_id in seen_ids:
            continue
        seen_ids.add(product_id)

        # Với vector đã chuẩn hóa: L2^2 = 2 - 2*cosine.
        cosine_similarity = 1.0 - float(distance) / 2.0
        results.append({
            "product": product,
            "position": int(position),
            "distance": float(distance),
            "similarity": cosine_similarity,
        })

    return results, None


def _semantic_similarity_for_product(product_id, query_embedding, known_hits):
    product_id = str(product_id or "")
    if product_id in known_hits:
        return known_hits[product_id]

    position = faiss_position_by_product_id.get(product_id)
    if position is None and not faiss_product_order_ids:
        try:
            position = product_ids.index(product_id)
        except ValueError:
            return None

    if (
        position is None
        or product_embeddings is None
        or position < 0
        or position >= product_embeddings.shape[0]
    ):
        return None

    candidate = np.asarray(product_embeddings[position], dtype="float32").reshape(-1)
    candidate_norm = float(np.linalg.norm(candidate))
    if candidate_norm <= 0:
        return None
    candidate = candidate / candidate_norm
    return float(np.dot(query_embedding, candidate))


def search_products_text_embedding(user_message, product_list=None, limit=20):
    """
    Hybrid retrieval nhưng embedding là bắt buộc khi FAISS hoạt động:
    1. CLIP text embedding truy vấn 40k image embeddings trong FAISS.
    2. Bổ sung candidate khớp tên/thông số từ metadata cục bộ.
    3. Mọi candidate cuối cùng đều được chấm semantic similarity với embedding ảnh.
    """
    source_products = product_list if product_list is not None else products
    parsed_query = _parse_search_query(user_message)

    if not TEXT_EMBEDDING_SEARCH_ENABLED:
        keyword_products, _ = search_products(user_message, source_products, limit=limit)
        return keyword_products, parsed_query, {
            "mode": "keyword_only_disabled",
            "clip_query": None,
            "error": None,
        }

    if faiss_index is None or product_embeddings is None:
        keyword_products, _ = search_products(user_message, source_products, limit=limit)
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_no_faiss",
            "clip_query": None,
            "error": "FAISS/embeddings chưa sẵn sàng",
        }

    clip_query = build_clip_text_query(user_message)
    try:
        query_embedding = get_clip_text_embedding(clip_query)
    except Exception as exc:
        keyword_products, _ = search_products(user_message, source_products, limit=limit)
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_clip_error",
            "clip_query": clip_query,
            "error": str(exc),
        }

    query_embedding, validation_error = _validate_query_embedding(query_embedding)
    if validation_error:
        keyword_products, _ = search_products(user_message, source_products, limit=limit)
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_dimension_error",
            "clip_query": clip_query,
            "error": validation_error,
        }

    semantic_hits, semantic_error = search_faiss_products_with_scores(
        query_embedding,
        k=TEXT_FAISS_CANDIDATES,
    )
    if semantic_error:
        keyword_products, _ = search_products(user_message, source_products, limit=limit)
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_faiss_error",
            "clip_query": clip_query,
            "error": semantic_error,
        }

    candidate_by_id = {}
    known_similarity = {}
    for hit in semantic_hits:
        product = hit["product"]
        product_id = str(product.get("id", ""))
        if not product_id:
            continue
        candidate_by_id[product_id] = product
        known_similarity[product_id] = float(hit["similarity"])

    # Chỉ xếp hạng lại các ứng viên do FAISS trả về.
    # Không quét toàn bộ catalog sản phẩm trong mỗi request.
    semantic_candidate_products = [
        hit["product"]
        for hit in semantic_hits
        if hit.get("product")
    ]
    keyword_candidates, _ = search_products(
        user_message,
        source_products,
        limit=max(limit * 5, 50),
    )
    for product in keyword_candidates:
        product_id = str(product.get("id", ""))
        if product_id:
            candidate_by_id[product_id] = product

    if _query_requests_phone_device(parsed_query):
        keyword_limit = max((int(limit) if limit is not None else 20) * 8, 80)
        phone_keyword_candidates, _ = search_products(
            user_message,
            source_products,
            limit=keyword_limit,
        )
        for product in phone_keyword_candidates:
            product_id = str(product.get("id", ""))
            if product_id:
                candidate_by_id[product_id] = product

    ranked = []
    for product_id, product in candidate_by_id.items():
        semantic_similarity = _semantic_similarity_for_product(
            product_id,
            query_embedding,
            known_similarity,
        )
        if semantic_similarity is None:
            semantic_similarity = 0

        keyword_score = _score_product_for_query(
            product,
            parsed_query,
            allow_partial=True,
        )
        keyword_score = max(0.0, float(keyword_score or 0.0))
        keyword_normalized = min(keyword_score / 100.0, 1.0)

        # Keep exact metadata matches even when the photo itself cannot expose
        # specs such as RAM/SSD. Otherwise enforce a minimum semantic match.
        if (
            semantic_similarity < TEXT_FAISS_MIN_SIMILARITY
            and keyword_score <= 0
        ):
            continue

        combined_score = (
            TEXT_SEMANTIC_WEIGHT * semantic_similarity
            + TEXT_KEYWORD_WEIGHT * keyword_normalized
        )
        ranked.append((combined_score, semantic_similarity, keyword_score, product))

    ranked.sort(
        key=lambda item: (
            -item[0],
            -item[1],
            -item[2],
            str(item[3].get("name", "")).casefold(),
        )
    )
    ranked = _filter_scored_products_for_query(
        ranked,
        parsed_query,
        product_index=3,
    )

    selected = [item[3] for item in ranked[:max(0, int(limit))]]
    return selected, parsed_query, {
        "mode": "clip_text_faiss_hybrid",
        "clip_query": clip_query,
        "faiss_candidates": len(semantic_hits),
        "ranked_candidates": len(ranked),
        "error": None,
    }


def get_suggestion_questions(message):

    message = message.lower()

    # =========================
    # nếu user đã nói chi tiết
    # =========================
    detailed_keywords = [
        "giá",
        "triệu",
        "gaming",
        "văn phòng",
        "học tập",
        "ram",
        "ssd",
        "gb",
        "tb",
        "không dây",
        "có dây",
        "pin",
        "đồ họa",
        "intel",
        "amd",
        "rtx",
        "gtx"
    ]

    # nếu có từ khóa chi tiết -> KHÔNG hỏi lại
    if any(k in message for k in detailed_keywords):
        return None

    # =========================
    # hỏi gợi ý
    # =========================
    if "laptop" in message or "máy tính" in message:

        return """
💻 Bạn muốn tìm laptop theo tiêu chí nào?<br><br>

• Laptop dùng để học tập hay văn phòng?<br>
• Laptop gaming hay đồ họa?<br>
• RAM cần bao nhiêu GB?<br>
• Ổ cứng SSD dung lượng bao nhiêu?<br>
• Tầm giá bạn mong muốn là bao nhiêu?
"""

    if "tai nghe" in message or "earphone" in message:

        return """
🎧 Bạn muốn tìm tai nghe theo tiêu chí nào?<br><br>

• Tai nghe có dây hay không dây?<br>
• Dùng để nghe nhạc hay chơi game?<br>
• Có cần chống ồn không?<br>
• Ưu tiên pin lâu hay bass mạnh?<br>
• Tầm giá bạn mong muốn là bao nhiêu?
"""

    if "tablet" in message or "máy tính bảng" in message:

        return """
📱 Bạn muốn tìm máy tính bảng theo tiêu chí nào?<br><br>

• Dùng để học tập hay giải trí?<br>
• Cần màn hình bao nhiêu inch?<br>
• Có cần bút cảm ứng không?<br>
• Cần dung lượng bao nhiêu?<br>
• Tầm giá bạn mong muốn là bao nhiêu?
"""

    if "smartwatch" in message or "đồng hồ" in message:

        return """
⌚ Bạn muốn tìm đồng hồ thông minh theo tiêu chí nào?<br><br>

• Dùng để theo dõi sức khỏe hay tập luyện?<br>
• Có cần đo nhịp tim, SpO2 không?<br>
• Pin dùng được bao lâu?<br>
• Bạn dùng Android hay iPhone?<br>
• Tầm giá bạn mong muốn là bao nhiêu?
"""

    return None

# ----------------------------
# API đăng ký / đăng nhập MongoDB + OTP email
# ----------------------------
OTP_EXPIRES_MINUTES = max(1, int(os.getenv("OTP_EXPIRES_MINUTES", "10")))
OTP_MAX_ATTEMPTS = max(1, int(os.getenv("OTP_MAX_ATTEMPTS", "5")))
OTP_DEBUG = os.getenv("OTP_DEBUG", "true").strip().lower() in {"1", "true", "yes", "on"}

SMTP_USERNAME = (
    os.getenv("SMTP_USERNAME")
    or os.getenv("SMTP_USER")
    or ""
).strip()
SMTP_PASSWORD = (
    os.getenv("SMTP_PASSWORD")
    or os.getenv("SMTP_APP_PASSWORD")
    or ""
).strip()
SMTP_HOST = (
    os.getenv("SMTP_HOST")
    or ("smtp.gmail.com" if SMTP_USERNAME else "")
).strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_FROM_EMAIL = (
    os.getenv("SMTP_FROM_EMAIL")
    or os.getenv("MAIL_FROM")
    or SMTP_USERNAME
).strip()
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {
    "1", "true", "yes", "on"
}


def normalize_phone(value):
    return re.sub(r"\s+", "", str(value or "").strip())


def validate_registration_payload(payload):
    full_name = str(
        payload.get("full_name")
        or payload.get("fullName")
        or payload.get("name")
        or ""
    ).strip()
    birthday = str(payload.get("birthday") or "").strip()
    phone = normalize_phone(payload.get("phone"))
    email = normalize_email(payload.get("email"))
    password = str(payload.get("password") or "")
    customer_type = str(
        payload.get("customer_type")
        or payload.get("customerType")
        or "normal"
    ).strip().lower()

    if len(full_name) < 2:
        return None, "Họ tên phải có ít nhất 2 ký tự."
    if not birthday:
        return None, "Vui lòng chọn ngày sinh."
    try:
        birthday_date = datetime.strptime(birthday, "%Y-%m-%d").date()
        if birthday_date > datetime.now(timezone.utc).date():
            return None, "Ngày sinh không hợp lệ."
    except ValueError:
        return None, "Ngày sinh phải có định dạng YYYY-MM-DD."
    if not re.fullmatch(r"0\d{9}", phone):
        return None, "Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0."
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return None, "Email không hợp lệ."
    if len(password) < 6 or not re.search(r"\d", password):
        return None, "Mật khẩu phải có ít nhất 6 ký tự và ít nhất 1 chữ số."
    if customer_type not in {"normal", "student", "business"}:
        customer_type = "normal"

    return {
        "full_name": full_name,
        "birthday": birthday,
        "phone": phone,
        "email": email,
        "password_hash": generate_password_hash(password),
        "customer_type": customer_type,
    }, None


def otp_digest(email, otp):
    raw = f"{normalize_email(email)}|{otp}|{JWT_SECRET_KEY}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def send_registration_otp(email, full_name, otp):
    subject = "Mã OTP đăng ký tài khoản SMEMBER"
    body = (
        f"Xin chào {full_name},\n\n"
        f"Mã OTP đăng ký tài khoản SMEMBER của bạn là: {otp}\n"
        f"Mã có hiệu lực trong {OTP_EXPIRES_MINUTES} phút.\n\n"
        "Không chia sẻ mã này với người khác."
    )

    smtp_ready = bool(SMTP_HOST and SMTP_FROM_EMAIL)
    if smtp_ready:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = SMTP_FROM_EMAIL
        message["To"] = email
        message.set_content(body)

        try:
            if SMTP_USE_SSL or SMTP_PORT == 465:
                with smtplib.SMTP_SSL(
                    SMTP_HOST,
                    SMTP_PORT,
                    context=ssl.create_default_context(),
                    timeout=20,
                ) as server:
                    if SMTP_USERNAME:
                        server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(message)
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                    server.ehlo()
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                    if SMTP_USERNAME:
                        server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(message)
            return True, "email", None
        except Exception as exc:
            print(f"Lỗi gửi OTP qua SMTP: {exc}")
            if not OTP_DEBUG:
                return False, "email", "Không thể gửi OTP qua email lúc này."

    if OTP_DEBUG:
        print("=" * 60)
        print(f"OTP DEBUG cho {email}: {otp}")
        print("=" * 60)
        return True, "debug", None

    return False, "none", "Chưa cấu hình SMTP để gửi OTP."


def build_auth_response(user_document, message, status_code=200):
    token = create_access_token(user_document)
    serialized = serialize_user(user_document)
    return jsonify({
        "message": message,
        "token": token,
        "access_token": token,
        "accessToken": token,
        "user": serialized,
        "data": {
            "token": token,
            "accessToken": token,
            "user": serialized,
        },
    }), status_code


@app.route("/api/auth/register/request-otp", methods=["POST"])
def request_register_otp():
    if users_collection is None or registration_otps_collection is None:
        return jsonify({"error": mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    registration_data, validation_error = validate_registration_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    email = registration_data["email"]
    phone = registration_data["phone"]

    try:
        duplicate = users_collection.find_one({
            "$or": [{"email": email}, {"phone": phone}]
        })
        if duplicate:
            if duplicate.get("email") == email:
                return jsonify({"error": "Email này đã được đăng ký."}), 409
            return jsonify({"error": "Số điện thoại này đã được đăng ký."}), 409

        otp = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=OTP_EXPIRES_MINUTES)

        registration_otps_collection.update_one(
            {"email": email},
            {
                "$set": {
                    **registration_data,
                    "otp_hash": otp_digest(email, otp),
                    "attempts": 0,
                    "created_at": now,
                    "expires_at": expires_at,
                }
            },
            upsert=True,
        )

        sent, delivery, send_error = send_registration_otp(
            email,
            registration_data["full_name"],
            otp,
        )
        if not sent:
            registration_otps_collection.delete_one({"email": email})
            return jsonify({"error": send_error or "Không thể gửi OTP."}), 503

        response_data = {
            "otpExpiresMinutes": OTP_EXPIRES_MINUTES,
            "delivery": delivery,
            "email": email,
        }
        if OTP_DEBUG and delivery == "debug":
            response_data["devOtp"] = otp

        return jsonify({
            "message": "Mã OTP đã được gửi.",
            "data": response_data,
        })
    except PyMongoError as exc:
        print(f"Lỗi tạo OTP MongoDB: {exc}")
        return jsonify({"error": "Không thể tạo yêu cầu đăng ký lúc này."}), 500


@app.route("/api/auth/register/verify-otp", methods=["POST"])
def verify_register_otp():
    if users_collection is None or registration_otps_collection is None:
        return jsonify({"error": mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email"))
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))

    if not re.fullmatch(r"\d{6}", otp):
        return jsonify({"error": "Mã OTP cần gồm 6 chữ số."}), 400

    try:
        pending = registration_otps_collection.find_one({"email": email})
        if not pending:
            return jsonify({"error": "Không tìm thấy yêu cầu OTP hoặc mã đã hết hạn."}), 404

        expires_at = pending.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expires_at:
                registration_otps_collection.delete_one({"_id": pending["_id"]})
                return jsonify({"error": "Mã OTP đã hết hạn. Vui lòng gửi lại mã."}), 410

        attempts = int(pending.get("attempts", 0))
        if attempts >= OTP_MAX_ATTEMPTS:
            registration_otps_collection.delete_one({"_id": pending["_id"]})
            return jsonify({"error": "Bạn đã nhập sai OTP quá số lần cho phép."}), 429

        if not secrets.compare_digest(
            str(pending.get("otp_hash", "")),
            otp_digest(email, otp),
        ):
            registration_otps_collection.update_one(
                {"_id": pending["_id"]},
                {"$inc": {"attempts": 1}},
            )
            remaining = max(0, OTP_MAX_ATTEMPTS - attempts - 1)
            return jsonify({
                "error": f"Mã OTP không đúng. Bạn còn {remaining} lần thử."
            }), 400

        now = datetime.now(timezone.utc)
        user_document = {
            "full_name": pending["full_name"],
            "birthday": pending["birthday"],
            "phone": pending["phone"],
            "email": pending["email"],
            "password_hash": pending["password_hash"],
            "customer_type": pending.get("customer_type", "normal"),
            "email_verified": True,
            "role": "customer",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        result = users_collection.insert_one(user_document)
        user_document["_id"] = result.inserted_id
        registration_otps_collection.delete_one({"_id": pending["_id"]})
        return build_auth_response(
            user_document,
            "Đăng ký và xác thực email thành công.",
            201,
        )
    except DuplicateKeyError:
        registration_otps_collection.delete_one({"email": email})
        return jsonify({"error": "Email hoặc số điện thoại đã được đăng ký."}), 409
    except PyMongoError as exc:
        print(f"Lỗi xác thực OTP MongoDB: {exc}")
        return jsonify({"error": "Không thể hoàn tất đăng ký lúc này."}), 500


@app.route("/api/auth/register", methods=["POST"])
def register_user_without_otp():
    """Route tương thích cũ. Chỉ bật khi ALLOW_REGISTER_WITHOUT_OTP=true."""
    allow = os.getenv("ALLOW_REGISTER_WITHOUT_OTP", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }
    if not allow:
        return jsonify({
            "error": "Đăng ký trực tiếp đã tắt. Hãy dùng quy trình gửi và xác thực OTP."
        }), 403

    if users_collection is None:
        return jsonify({"error": mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    registration_data, validation_error = validate_registration_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    now = datetime.now(timezone.utc)
    user_document = {
        **registration_data,
        "email_verified": False,
        "role": "customer",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = users_collection.insert_one(user_document)
        user_document["_id"] = result.inserted_id
        return build_auth_response(user_document, "Đăng ký thành công.", 201)
    except DuplicateKeyError:
        return jsonify({"error": "Email hoặc số điện thoại đã được đăng ký."}), 409
    except PyMongoError as exc:
        print(f"Lỗi đăng ký MongoDB: {exc}")
        return jsonify({"error": "Không thể tạo tài khoản lúc này."}), 500


@app.route("/api/auth/login", methods=["POST"])
def login_user():
    if users_collection is None:
        return jsonify({"error": mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    identifier = str(
        payload.get("identifier")
        or payload.get("email")
        or payload.get("phone")
        or ""
    ).strip()
    password = str(payload.get("password") or "")

    if not identifier or not password:
        return jsonify({"error": "Vui lòng nhập email/số điện thoại và mật khẩu."}), 400

    normalized_identifier = identifier.lower() if "@" in identifier else normalize_phone(identifier)
    query = (
        {"email": normalized_identifier}
        if "@" in normalized_identifier
        else {"phone": normalized_identifier}
    )

    try:
        user_document = users_collection.find_one(query)
    except PyMongoError as exc:
        print(f"Lỗi đọc tài khoản MongoDB: {exc}")
        return jsonify({"error": "Không thể đăng nhập lúc này."}), 500

    if not user_document or not check_password_hash(
        str(user_document.get("password_hash", "")),
        password,
    ):
        return jsonify({"error": "Email/số điện thoại hoặc mật khẩu không đúng."}), 401

    if user_document.get("is_active", True) is False:
        return jsonify({"error": "Tài khoản đã bị khóa."}), 403

    users_collection.update_one(
        {"_id": user_document["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc)}},
    )
    return build_auth_response(user_document, "Đăng nhập thành công.")


@app.route("/api/auth/me", methods=["GET"])
@login_required
def get_current_user(user_document):
    return jsonify({"user": serialize_user(user_document)})


@app.route("/api/auth/logout", methods=["POST"])
def logout_user():
    # JWT stateless: frontend xóa accessToken/currentUser.
    return jsonify({"message": "Đăng xuất thành công."})


# ----------------------------
# Health + đồng bộ sản phẩm
# ----------------------------
@app.route("/api/health")
def health():
    metadata_mtime = None
    if os.path.isfile(PRODUCTS_METADATA_PATH):
        metadata_mtime = datetime.fromtimestamp(
            os.path.getmtime(PRODUCTS_METADATA_PATH),
            tz=timezone.utc,
        ).isoformat()

    return jsonify({
        "status": "ok",
        "product_source": "local_index_files",
        "mongodb_used_for_products": False,
        "mongodb_auth": users_collection is not None,
        "mongodb_error": mongo_error or None,
        "database": MONGODB_DB,
        "users_collection": MONGODB_USERS_COLLECTION,
        "otp_collection": MONGODB_OTP_COLLECTION,
        "otp_email_configured": bool(SMTP_HOST and SMTP_FROM_EMAIL),
        "otp_debug": OTP_DEBUG,
        "chatbot": client is not None,
        "faiss": faiss_index is not None,
        "faiss_vectors": int(faiss_index.ntotal) if faiss_index is not None else 0,
        "embedding_rows": (
            int(product_embeddings.shape[0])
            if product_embeddings is not None
            else 0
        ),
        "metadata_products": len(products),
        "metadata_path": PRODUCTS_METADATA_PATH,
        "metadata_modified_at": metadata_mtime,
        "catalog_loaded_at": (
            catalog_loaded_at.isoformat()
            if isinstance(catalog_loaded_at, datetime)
            else None
        ),
        "text_embedding_search": (
            TEXT_EMBEDDING_SEARCH_ENABLED
            and faiss_index is not None
            and product_embeddings is not None
            and bool(products)
        ),
    })


@app.route("/api/products/reload", methods=["POST"])
def reload_products():
    try:
        reloaded_products = load_local_search_assets()
        return jsonify({
            "message": (
                "Đã tải lại products.json, embeddings.npy "
                "và faiss_index.index từ ổ đĩa."
            ),
            "product_source": "local_index_files",
            "products": len(reloaded_products),
            "faiss_vectors": (
                int(faiss_index.ntotal)
                if faiss_index is not None
                else 0
            ),
        })
    except Exception as exc:
        print(f"Lỗi tải lại bộ tìm kiếm cục bộ: {exc}")
        return jsonify({
            "error": f"Không thể tải lại bộ tìm kiếm cục bộ: {exc}"
        }), 500


# ----------------------------
# Chat văn bản
# ----------------------------
@app.route("/chat", methods=["POST"])
def chat():
    user_document, auth_error = get_authenticated_user()
    if auth_error:
        return jsonify({"error": auth_error}), 401

    payload = request.get_json(silent=True) or {}
    user_message = str(payload.get("message", "")).strip()

    authenticated_name = (
        str(user_document.get("full_name", "")).strip()
        if user_document
        else ""
    )
    frontend_name = str(
        payload.get("user_name")
        or payload.get("userName")
        or ""
    ).strip()
    user_name = _clean_chat_user_name(authenticated_name or frontend_name)

    print("ĐÃ VÀO ROUTE /chat")
    print("TÀI KHOẢN:", user_name or "Khách")
    print("TIN NHẮN:", user_message)

    if not user_message:
        return jsonify({"reply": "Bạn hãy nhập nội dung cần hỏi nhé."}), 400

    # Chào hỏi, cảm ơn, tạm biệt... được trả lời ngay, không tìm sản phẩm.
    social_reply = get_natural_social_response(user_message, user_name)
    if social_reply:
        return jsonify({"reply": social_reply})

    # FAQ cũng không phụ thuộc vào MongoDB.
    faq_reply = get_faq_response(user_message.lower())
    if faq_reply:
        return jsonify({"reply": faq_reply})

    # Hội thoại chung được Gemini trả lời tự nhiên.
    # Chỉ truy vấn bộ embedding/FAISS cục bộ khi tin nhắn có ý định tìm sản phẩm.
    if not looks_like_product_request(user_message):
        natural_reply = generate_natural_chat_reply(user_message, user_name)
        if natural_reply:
            return jsonify({"reply": natural_reply})

        display_name = f" {_safe_text(user_name)}" if user_name else ""
        return jsonify({
            "reply": (
                f"Mình đang nghe đây{display_name} 😊 "
                "Bạn có thể cho mình biết sản phẩm hoặc nhu cầu cần tư vấn không?"
            )
        })

    current_products = products
    if not current_products or faiss_index is None or product_embeddings is None:
        return jsonify({
            "reply": (
                "Bộ tìm kiếm sản phẩm cục bộ chưa sẵn sàng. "
                "Hãy chạy build_index.py và kiểm tra thư mục index."
            )
        }), 503

    matched_products, parsed_query, retrieval_info = search_products_text_embedding(
        user_message,
        current_products,
        limit=20,
    )

    print("CHẾ ĐỘ TÌM KIẾM VĂN BẢN:", retrieval_info.get("mode"))
    print("CLIP TEXT QUERY:", retrieval_info.get("clip_query"))
    if retrieval_info.get("error"):
        print("CẢNH BÁO RETRIEVAL:", retrieval_info.get("error"))
    print("TRUY VẤN CHUẨN HÓA:", parsed_query["normalized_query"])
    print(
        "CONCEPT:",
        [concept["trigger"] for concept in parsed_query["concepts"]],
    )
    print("TOKEN:", parsed_query["tokens"])
    print("SỐ KẾT QUẢ:", len(matched_products))

    if not matched_products:
        alternative_products = find_alternative_products(
            user_message,
            current_products,
            limit=3,
        )
        available_categories = get_available_category_names(
            current_products,
            limit=5,
        )
        not_found_intro = generate_product_not_found_reply(
            user_message=user_message,
            user_name=user_name,
            alternative_products=alternative_products,
            available_categories=available_categories,
        )

        if alternative_products:
            return jsonify({
                "reply": generate_product_cards(
                    alternative_products,
                    response_text_vi=not_found_intro,
                )
            })

        return jsonify({
            "reply": _safe_text(not_found_intro).replace("\n", "<br>")
        })

    intro = f"🛒 Đây là các sản phẩm phù hợp với “{user_message}”:"
    if user_name:
        intro = (
            f"🛒 {user_name}, đây là các sản phẩm phù hợp với "
            f"“{user_message}”:"
        )

    return jsonify({
        "reply": generate_product_cards(
            matched_products[:5],
            response_text_vi=intro,
        )
    })


# ----------------------------
# Chat bằng ảnh
# ----------------------------
@app.route("/upload", methods=["POST"])
def upload():
    user_document, auth_error = get_authenticated_user()
    if auth_error:
        return jsonify({"error": auth_error}), 401

    current_products = products
    if not current_products or faiss_index is None or product_embeddings is None:
        return jsonify({
            "reply": (
                "Bộ tìm kiếm sản phẩm cục bộ chưa sẵn sàng. "
                "Hãy chạy build_index.py và kiểm tra thư mục index."
            )
        }), 503

    file = request.files.get("file")
    user_message = request.form.get(
        "message",
        "Tìm giúp tôi sản phẩm tương tự như ảnh",
    )
    authenticated_name = (
        str(user_document.get("full_name", "")).strip()
        if user_document
        else ""
    )
    frontend_name = str(request.form.get("user_name", "")).strip()
    user_name = _clean_chat_user_name(authenticated_name or frontend_name)

    if not file or not file.filename:
        return jsonify({"reply": "Không có file được tải lên."}), 400
    if not str(file.mimetype or "").startswith("image/"):
        return jsonify({"reply": "Vui lòng chọn một file ảnh hợp lệ."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(
        app.config["UPLOAD_FOLDER"],
        f"{uuid.uuid4().hex}_{filename}",
    )
    file.save(filepath)

    yolo_label = ""
    if yolo_model:
        try:
            results = yolo_model.predict(
                source=filepath,
                conf=0.25,
                iou=0.7,
                classes=None,
                verbose=False,
            )
            if results and len(results[0].boxes) > 0:
                best_box = results[0].boxes[0]
                class_id = int(best_box.cls.item())
                yolo_label = str(
                    yolo_model.names.get(class_id, "sản phẩm")
                ).lower()
        except Exception as exc:
            print(f"Lỗi khi chạy YOLO: {exc}")

    try:
        query_embedding = get_clip_embedding(filepath)
    except Exception as exc:
        print(f"Lỗi khi trích xuất embedding bằng CLIP: {exc}")
        return jsonify({
            "reply": "Lỗi xử lý ảnh: Không thể trích xuất đặc trưng bằng CLIP."
        }), 500

    recs, err_msg = find_similar_products_clip_faiss(query_embedding, k=5)
    if err_msg:
        html_reply = generate_product_cards(
            [],
            response_text_vi=err_msg,
            target_lang="vi",
        )
        return jsonify({"reply": html_reply}), 503

    # Không lọc theo danh sách danh mục cố định. Mọi sản phẩm có trong
    # FAISS/products.json đều có thể được trả về, bao gồm phụ kiện và các nhóm
    # được gán bằng trainingLabels.
    recs = [
        product
        for product in recs
        if product and product.get("id")
    ]
    if not recs:
        return jsonify({
            "reply": "Không tìm thấy sản phẩm tương tự trong dữ liệu cửa hàng."
        })

    if MODEL_MAIN:
        try:
            simplified_recs = [
                {
                    "id": product.get("id"),
                    "name": product.get("name"),
                    "price": product.get("price"),
                }
                for product in recs
            ]
            products_json = json.dumps(simplified_recs, ensure_ascii=False)
            customer_context = user_name or "khách chưa đăng nhập"

            prompt = f"""
Bạn là chuyên gia tư vấn sản phẩm thương mại điện tử.
Chỉ được chọn sản phẩm trong danh sách metadata cục bộ dưới đây.
Không được bịa thêm sản phẩm hoặc ID.

Người dùng: {customer_context}
Nhãn YOLO nếu có: {yolo_label or 'không xác định'}
Yêu cầu: {user_message}
Danh sách sản phẩm tìm từ CLIP + FAISS:
{products_json}

Trả về đúng JSON, không thêm nội dung ngoài JSON:
{{
  "reply_text": "một câu giới thiệu ngắn",
  "filtered_product_ids": ["id1", "id2"]
}}
"""

            response = MODEL_MAIN.generate_content(prompt)
            raw_text = (response.text or "").strip()
            clean_json = raw_text.replace("```json", "").replace("```", "").strip()
            gemini_result = json.loads(clean_json)
            filtered_ids = {
                str(item)
                for item in gemini_result.get("filtered_product_ids", [])
            }
            final_products = [
                product
                for product in recs
                if not filtered_ids or str(product.get("id")) in filtered_ids
            ]
            if not final_products:
                final_products = recs

            intro = "🛒 Dưới đây là các sản phẩm phù hợp mình tìm được từ ảnh bạn gửi:"
            if user_name:
                intro = f"🛒 {user_name}, đây là các sản phẩm phù hợp từ ảnh bạn gửi:"

            return jsonify({
                "reply": generate_product_cards(
                    final_products[:5],
                    response_text_vi=intro,
                    target_lang="vi",
                )
            })
        except Exception as exc:
            print(f"Lỗi khi gọi Gemini trong /upload: {exc}")

    intro = "📷 Mình đã nhận ảnh. Dưới đây là một số sản phẩm tương tự trong cửa hàng:"
    if user_name:
        intro = f"📷 {user_name}, mình đã nhận ảnh. Đây là các sản phẩm tương tự:"

    return jsonify({
        "reply": generate_product_cards(
            recs[:5],
            response_text_vi=intro,
            target_lang="vi",
        )
    })


@app.route("/data/products/<path:filename>")
def serve_product_image(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# ----------------------------
# Phục vụ giao diện React/Vite đã build
# ----------------------------
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    index_file = os.path.join(FRONTEND_DIST, "index.html")

    if not os.path.isfile(index_file):
        return jsonify({
            "error": "Chưa tìm thấy giao diện frontend đã build.",
            "frontend_dist": FRONTEND_DIST,
            "instruction": (
                "Mở terminal trong cellphones-clone, chạy npm install và "
                "npm run build, sau đó chạy lại app.py."
            ),
        }), 503

    requested_file = os.path.join(FRONTEND_DIST, path)
    if path and os.path.isfile(requested_file):
        return send_from_directory(FRONTEND_DIST, path)

    return send_from_directory(FRONTEND_DIST, "index.html")


# ----------------------------
# Run Flask
# ----------------------------
if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=True,
        use_reloader=False,
    )

