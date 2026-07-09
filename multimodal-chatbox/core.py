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

UPLOAD_FOLDER = os.path.join(BASE_DIR, "data", "products")
MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "5")) * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


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
    scored_products = filter_ranked_items_by_query_group(
        scored_products,
        user_message,
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
        scored_products = filter_ranked_items_by_query_group(
            scored_products,
            user_message,
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
    """
    Không khóa chatbot vào danh sách sản phẩm cố định.

    Bản cũ chỉ cho tìm khi câu có từ như iphone/laptop/camera..., nên các sản phẩm
    thật trong MongoDB như "mic thu âm", "máy hút bụi", "máy hút ẩm" bị rơi sang
    nhánh chat thường. Sau khi social/FAQ đã được xử lý trước, mọi câu còn lại có
    token tìm kiếm hợp lệ đều được phép đi qua luồng catalog/embedding.
    """
    normalized = _normalize_user_query(user_message)
    if not normalized:
        return False

    if any(_contains_search_term(normalized, term) for term in PRODUCT_REQUEST_TERMS):
        return True

    parsed_query = _parse_search_query(user_message)
    if parsed_query.get("concepts") or parsed_query.get("tokens"):
        return True

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




def get_product_query_display_name(user_message, parsed_query=None):
    """Lấy tên nhu cầu ngắn để hiển thị, có dấu và không copy nguyên câu người dùng."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    removable_phrases = sorted(SEARCH_STOPWORDS, key=len, reverse=True)
    cleaned = f" {normalized} "
    for phrase in removable_phrases:
        if not phrase or len(phrase) <= 1:
            continue
        cleaned = re.sub(
            rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])",
            " ",
            cleaned,
        )

    # Bỏ bớt cụm giá khỏi tên nhu cầu để câu trả lời không bị thô,
    # nhưng vẫn giữ hãng/model sản phẩm.
    cleaned = re.sub(
        r"\b(duoi|tren|tu|den|khoang|tam|gia|ngan sach|tam gia)\s*\d+(?:[\s,.]*(?:trieu|tr|nghin|k|vnd|d))?\b",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"\b\d+(?:[\s,.]*(?:trieu|tr|nghin|k|vnd|d))\b", " ", cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        cleaned = parsed_query.get("meaningful_phrase") or normalized or str(user_message).strip()

    # Ghép lại một số cụm sản phẩm phổ biến theo dạng có dấu.
    phrase_replacements = [
        ("dien thoai", "điện thoại"),
        ("may tinh bang", "máy tính bảng"),
        ("may tinh xach tay", "laptop"),
        ("mic thu am", "mic thu âm"),
        ("micro thu am", "micro thu âm"),
        ("may hut bui", "máy hút bụi"),
        ("robot hut bui", "robot hút bụi"),
        ("may hut am", "máy hút ẩm"),
        ("may loc khong khi", "máy lọc không khí"),
        ("may pha ca phe", "máy pha cà phê"),
        ("camera an ninh", "camera an ninh"),
        ("camera wifi", "camera WiFi"),
        ("tai nghe", "tai nghe"),
        ("dong ho thong minh", "đồng hồ thông minh"),
        ("op lung", "ốp lưng"),
        ("cap sac", "cáp sạc"),
        ("cu sac", "củ sạc"),
        ("sac du phong", "sạc dự phòng"),
        ("pin du phong", "pin dự phòng"),
        ("may loc nuoc", "máy lọc nước"),
        ("may lanh", "máy lạnh"),
        ("dieu hoa", "điều hòa"),
        ("may giat", "máy giặt"),
        ("may say quan ao", "máy sấy quần áo"),
        ("may rua chen", "máy rửa chén"),
        ("may rua bat", "máy rửa bát"),
        ("binh nong lanh", "bình nóng lạnh"),
        ("tu lanh", "tủ lạnh"),
        ("may say toc", "máy sấy tóc"),
        ("may cao rau", "máy cạo râu"),
        ("ban chai dien", "bàn chải điện"),
        ("may rua mat", "máy rửa mặt"),
        ("may massage", "máy massage"),
        ("may tao kieu toc", "máy tạo kiểu tóc"),
        ("tong do", "tông đơ"),
        ("noi chien khong dau", "nồi chiên không dầu"),
        ("noi chien", "nồi chiên"),
        ("noi com dien", "nồi cơm điện"),
        ("noi com", "nồi cơm"),
        ("man hinh", "màn hình"),
        ("may in", "máy in"),
        ("tivi", "tivi"),
    ]
    display = f" {cleaned} "
    for source, replacement in sorted(phrase_replacements, key=lambda item: len(item[0]), reverse=True):
        display = re.sub(
            rf"(?<![a-z0-9]){re.escape(source)}(?![a-z0-9])",
            replacement,
            display,
        )
    display = re.sub(r"\s+", " ", display).strip()

    replacements = {
        "iphone": "iPhone",
        "ipad": "iPad",
        "macbook": "MacBook",
        "samsung": "Samsung",
        "xiaomi": "Xiaomi",
        "oppo": "OPPO",
        "realme": "realme",
        "vivo": "vivo",
        "airpods": "AirPods",
        "wifi": "WiFi",
        "pc": "PC",
        "ram": "RAM",
        "ssd": "SSD",
    }
    output_words = [replacements.get(word.casefold(), word) for word in display.split()]
    return " ".join(output_words[:8]).strip() or str(user_message).strip()


def parse_price_constraints(user_message):
    """
    Trích điều kiện giá từ câu người dùng.
    Ví dụ: dưới 10 triệu -> price_max=10_000_000; trên 5 triệu -> price_min=5_000_000.
    """
    normalized = _normalize_user_query(user_message)
    constraints = {"price_min": None, "price_max": None}

    def to_vnd(number_text, unit_text):
        number = float(str(number_text).replace(",", "."))
        unit = str(unit_text or "").strip()
        if unit in {"trieu", "tr", "m"}:
            return int(number * 1_000_000)
        if unit in {"nghin", "k"}:
            return int(number * 1_000)
        # Nếu người dùng ghi "dưới 10" trong ngữ cảnh giá, thường hiểu là 10 triệu.
        if number <= 200:
            return int(number * 1_000_000)
        return int(number)

    # khoảng 5-10 triệu / từ 5 đến 10 triệu
    range_patterns = [
        r"(?:tu|khoang)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k)?\s*(?:den|toi|-)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k)?",
        r"(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k)?\s*(?:den|toi|-)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k)",
    ]
    for pattern in range_patterns:
        match = re.search(pattern, normalized)
        if match:
            first, first_unit, second, second_unit = match.groups()
            shared_unit = second_unit or first_unit
            constraints["price_min"] = to_vnd(first, first_unit or shared_unit)
            constraints["price_max"] = to_vnd(second, second_unit or shared_unit)
            return constraints

    max_patterns = [
        r"(?:duoi|nho hon|khong qua|toi da|tam gia duoi|gia duoi|ngan sach duoi)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k|vnd|d)?",
        r"(?:<=|<)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k|vnd|d)?",
    ]
    for pattern in max_patterns:
        match = re.search(pattern, normalized)
        if match:
            constraints["price_max"] = to_vnd(match.group(1), match.group(2))
            break

    min_patterns = [
        r"(?:tren|lon hon|toi thieu|tu)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k|vnd|d)?",
        r"(?:>=|>)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|nghin|k|vnd|d)?",
    ]
    for pattern in min_patterns:
        match = re.search(pattern, normalized)
        if match:
            constraints["price_min"] = to_vnd(match.group(1), match.group(2))
            break

    return constraints


def product_matches_price_constraints(product, constraints):
    price = _price_to_number(product.get("price", 0))
    if price <= 0:
        return False
    price_min = constraints.get("price_min")
    price_max = constraints.get("price_max")
    if price_min is not None and price < price_min:
        return False
    if price_max is not None and price > price_max:
        return False
    return True


def filter_ranked_items_by_price_constraints(ranked_items, user_message, product_index):
    constraints = parse_price_constraints(user_message)
    if constraints.get("price_min") is None and constraints.get("price_max") is None:
        return ranked_items, constraints

    filtered = [
        item for item in ranked_items
        if product_matches_price_constraints(item[product_index], constraints)
    ]
    # Không trả sản phẩm vượt ngân sách. Nếu không còn kết quả, để rỗng để nhánh not_found xử lý.
    return filtered, constraints


# ----------------------------
# Kiểm tra yêu cầu người dùng sau khi search
# ----------------------------
# Tầng này chạy SAU keyword/FAISS để chặn các sản phẩm gần nghĩa nhưng sai yêu cầu.
# Áp dụng cho toàn bộ catalog: nhóm sản phẩm, hãng, giá, tình trạng máy và đặc điểm quan trọng.
KNOWN_BRAND_ALIASES = {
    "apple": ["apple", "iphone", "ipad", "macbook", "airpods"],
    "samsung": ["samsung", "galaxy"],
    "xiaomi": ["xiaomi", "redmi", "poco"],
    "oppo": ["oppo"],
    "realme": ["realme"],
    "vivo": ["vivo"],
    "asus": ["asus", "rog", "tuf"],
    "acer": ["acer"],
    "hp": ["hp"],
    "dell": ["dell"],
    "lenovo": ["lenovo", "thinkpad", "ideapad", "legion"],
    "msi": ["msi"],
    "lg": ["lg"],
    "sony": ["sony"],
    "jbl": ["jbl"],
    "logitech": ["logitech", "logi"],
    "anker": ["anker"],
    "baseus": ["baseus"],
    "havit": ["havit"],
    "philips": ["philips"],
    "panasonic": ["panasonic"],
    "garmin": ["garmin"],
}

USED_PRODUCT_TERMS = (
    "hang cu", "may cu", "cu dep", "cu tray xuoc", "cu xau", "da kich hoat",
    "thu cu", "doi moi", "thu cu doi moi", "active online", "99",
)

NEW_PRODUCT_REQUEST_TERMS = (
    "may moi", "hang moi", "new", "nguyen seal", "chinh hang moi",
)

USED_PRODUCT_REQUEST_TERMS = (
    "hang cu", "may cu", "cu dep", "cu tray xuoc", "da kich hoat", "thu cu", "doi moi", "thu cu doi moi",
)

# Các đặc điểm mà embedding ảnh thường kéo sai, nên phải kiểm tra bằng metadata/tên/thông số.
FEATURE_REQUIREMENT_RULES = [
    {
        "triggers": ["man hinh gap", "dien thoai gap", "gap", "fold", "flip", "z fold", "z flip"],
        "required_any": ["man hinh gap", "gap", "fold", "flip", "z fold", "z flip", "galaxy z"],
    },
    {
        "triggers": ["5g"],
        "required_any": ["5g"],
    },
    {
        "triggers": ["wifi", "wi fi"],
        "required_any": ["wifi", "wi fi", "wireless"],
    },
    {
        "triggers": ["khong day", "bluetooth", "wireless"],
        "required_any": ["khong day", "bluetooth", "wireless", "tws"],
    },
    {
        "triggers": ["co day", "wired"],
        "required_any": ["co day", "wired", "jack", "3 5mm"],
    },
    {
        "triggers": ["chong on", "anc", "noise cancelling"],
        "required_any": ["chong on", "anc", "noise cancelling", "noise cancellation"],
    },
    {
        "triggers": ["cam tay", "cầm tay"],
        "required_any": ["cam tay", "handheld"],
    },
    {
        "triggers": ["robot"],
        "required_any": ["robot"],
    },
    {
        "triggers": ["ngoai troi"],
        "required_any": ["ngoai troi", "outdoor", "ip65", "ip66", "ip67"],
    },
    {
        "triggers": ["trong nha"],
        "required_any": ["trong nha", "indoor"],
    },
    {
        "triggers": ["gaming", "choi game"],
        "required_any": ["gaming", "game", "rtx", "gtx", "rog", "tuf", "legion", "nitro", "loq", "victus"],
    },
    {
        "triggers": ["do hoa", "thiet ke", "designer"],
        "required_any": ["do hoa", "graphics", "rtx", "gtx", "creator", "studio"],
    },
    {
        "triggers": ["type c", "typec", "usb c"],
        "required_any": ["type c", "typec", "usb c", "usb c"],
    },
    {
        "triggers": ["inverter"],
        "required_any": ["inverter"],
    },
]


def _product_full_requirement_text(product):
    """Text kiểm tra điều kiện: dùng nhiều trường hơn group filter để không bỏ sót specs."""
    fields = product.get("_search_fields") or _build_product_search_fields(product)
    return " ".join(
        part for part in [
            fields.get("name", ""), fields.get("brand", ""), fields.get("category", ""),
            fields.get("labels", ""), fields.get("specs", ""), fields.get("extras", ""),
            fields.get("description", ""), fields.get("identifiers", ""),
        ] if part
    )


def _query_requested_brands(parsed_query):
    normalized = parsed_query.get("normalized_query", "")
    requested = []
    for canonical, aliases in KNOWN_BRAND_ALIASES.items():
        if any(_contains_search_term(normalized, alias) for alias in aliases):
            requested.append(canonical)
    return requested


def _product_matches_brand(product, brand_key):
    product_text = _product_full_requirement_text(product)
    aliases = KNOWN_BRAND_ALIASES.get(brand_key, [brand_key])
    return any(_contains_search_term(product_text, alias) for alias in aliases)


def _query_requests_used_condition(parsed_query):
    normalized = parsed_query.get("normalized_query", "")
    return any(_contains_search_term(normalized, term) for term in USED_PRODUCT_REQUEST_TERMS)


def _query_requests_new_condition(parsed_query):
    normalized = parsed_query.get("normalized_query", "")
    return any(_contains_search_term(normalized, term) for term in NEW_PRODUCT_REQUEST_TERMS)


def _product_looks_used(product):
    product_text = _product_full_requirement_text(product)
    return any(_contains_search_term(product_text, term) for term in USED_PRODUCT_TERMS)


def _query_feature_rules(parsed_query):
    normalized = parsed_query.get("normalized_query", "")
    matched_rules = []
    for rule in FEATURE_REQUIREMENT_RULES:
        if any(_contains_search_term(normalized, trigger) for trigger in rule.get("triggers", [])):
            matched_rules.append(rule)
    return matched_rules


def _parse_numeric_spec_requirements(parsed_query):
    """Bắt các yêu cầu rõ như RAM 16GB, SSD 512GB, màn hình 27 inch, 144Hz, sạc 65W."""
    normalized = parsed_query.get("normalized_query", "")
    requirements = []
    patterns = [
        ("ram", r"\bram\s*(\d+)\s*gb\b", ["ram {n}gb", "{n}gb ram", "ram {n} gb"]),
        ("ssd", r"\bssd\s*(\d+)\s*(gb|tb)\b", ["ssd {n}{u}", "{n}{u} ssd", "ssd {n} {u}"]),
        ("storage", r"\b(\d+)\s*(gb|tb)\b", ["{n}{u}", "{n} {u}"]),
        ("screen", r"\b(\d{2})\s*(inch|in|\")\b", ["{n} inch", "{n}inch", "{n} in"]),
        ("hz", r"\b(\d{2,3})\s*hz\b", ["{n}hz", "{n} hz"]),
        ("watt", r"\b(\d{2,3})\s*w\b", ["{n}w", "{n} w"]),
    ]
    for _, pattern, templates in patterns:
        for match in re.finditer(pattern, normalized):
            n = match.group(1)
            u = match.group(2) if len(match.groups()) >= 2 else ""
            if not n:
                continue
            terms = [_normalize_search_text(t.format(n=n, u=u)) for t in templates]
            requirements.append(terms)
    return requirements


def _important_model_tokens(parsed_query):
    """Token model/đời máy có số phải xuất hiện, tránh iPhone 17 ra iPhone 16 hoặc Find X9 ra món khác."""
    normalized = parsed_query.get("normalized_query", "")
    tokens = []
    for token in re.findall(r"[a-z]*\d+[a-z0-9]*|\d+[a-z]+", normalized):
        if token in {"5g", "4g"}:
            tokens.append(token)
        elif re.fullmatch(r"\d+", token):
            # bỏ số có vẻ là giá, số lượng tiền đã xử lý bằng price parser
            if int(token) <= 200:
                tokens.append(token)
        else:
            tokens.append(token)
    # không bắt token số nếu nằm sát đơn vị giá phổ biến
    filtered = []
    for token in tokens:
        if re.search(rf"\b{re.escape(token)}\s*(trieu|tr|m|nghin|k|vnd|d)\b", normalized):
            continue
        if token not in filtered:
            filtered.append(token)
    return filtered




# Yêu cầu đặc biệt: "điện thoại màn hình gập".
# Không được để embedding ảnh kéo sang điện thoại thường hoặc đồng hồ.
FOLDING_PHONE_QUERY_TERMS = (
    "man hinh gap", "dien thoai gap", "smartphone gap", "foldable", "fold", "flip", "z fold", "z flip"
)
FOLDING_PHONE_PRODUCT_TERMS = (
    "man hinh gap", "foldable", "fold", "flip", "z fold", "z flip", "galaxy z",
    "find n", "mix fold", "magic v", "razr", "x flip", "v flip"
)


def _query_requires_folding_phone(parsed_query):
    normalized = parsed_query.get("normalized_query", "")
    return any(_contains_search_term(normalized, term) for term in FOLDING_PHONE_QUERY_TERMS)


def _product_is_folding_phone(product):
    product_text = _product_full_requirement_text(product)
    if not _product_is_phone_device(product) and not product_matches_query_group(product, "phone"):
        return False
    return any(_contains_search_term(product_text, term) for term in FOLDING_PHONE_PRODUCT_TERMS)

def product_satisfies_user_requirements(product, user_message, parsed_query=None, price_constraints=None):
    """Validator tổng quát: sản phẩm phải đúng nhóm, hãng, giá, tình trạng và đặc điểm người dùng nói."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    price_constraints = price_constraints or parse_price_constraints(user_message)
    product_text = _product_full_requirement_text(product)

    # Nếu user yêu cầu màn hình gập, bắt buộc sản phẩm phải là điện thoại gập thật.
    # Ví dụ: Samsung Galaxy Z Flip/Fold, OPPO Find N, Motorola Razr...
    # Loại bỏ điện thoại thường, smartwatch, phụ kiện dù embedding trả về gần.
    if _query_requires_folding_phone(parsed_query):
        if not _product_is_folding_phone(product):
            return False

    guide_key = detect_clarify_guide_key(user_message, parsed_query, None)
    if guide_key and not product_matches_query_group(product, guide_key):
        return False

    if (price_constraints.get("price_min") is not None or price_constraints.get("price_max") is not None):
        if not product_matches_price_constraints(product, price_constraints):
            return False

    requested_brands = _query_requested_brands(parsed_query)
    if requested_brands and not any(_product_matches_brand(product, brand) for brand in requested_brands):
        return False

    # Mặc định ưu tiên hàng mới: nếu user không nói hàng cũ/thu cũ, không trả Hàng cũ khi có query chi tiết.
    # Điều này tránh laptop/điện thoại thường bị kéo sang Hàng cũ bởi embedding.
    if _query_requests_new_condition(parsed_query):
        if _product_looks_used(product):
            return False
    elif not _query_requests_used_condition(parsed_query):
        normalized = parsed_query.get("normalized_query", "")
        # Chỉ áp dụng khi câu có tiêu chí cụ thể hoặc model, không áp dụng câu quá rộng vì đã hỏi lại trước đó.
        if _has_detail_signal(user_message, parsed_query) or re.search(r"\d", normalized):
            if _product_looks_used(product):
                return False

    for rule in _query_feature_rules(parsed_query):
        required_any = rule.get("required_any", [])
        if required_any and not any(_contains_search_term(product_text, term) for term in required_any):
            return False

    for accepted_terms in _parse_numeric_spec_requirements(parsed_query):
        if accepted_terms and not any(_contains_search_term(product_text, term) for term in accepted_terms):
            return False

    for token in _important_model_tokens(parsed_query):
        if not _contains_search_term(product_text, token):
            return False

    return True


def filter_ranked_items_by_user_requirements(ranked_items, user_message, parsed_query, product_index, price_constraints=None):
    """Lọc cuối cùng. Không fallback sang kết quả sai; rỗng thì để not_found/hỏi lại xử lý."""
    price_constraints = price_constraints or parse_price_constraints(user_message)
    return [
        item for item in ranked_items
        if product_satisfies_user_requirements(
            item[product_index],
            user_message,
            parsed_query=parsed_query,
            price_constraints=price_constraints,
        )
    ]


# ----------------------------
# Hỏi lại khi câu hỏi chưa đủ rõ
# ----------------------------
CLARIFY_INTENT_ONLY_PATTERNS = (
    "tu van",
    "tu van giup toi",
    "tu van cho toi",
    "giup toi chon",
    "giup minh chon",
    "mua san pham",
    "tim san pham",
    "goi y san pham",
    "co gi tot",
    "co gi tot khong",
    "nen mua gi",
    "nen chon gi",
    "san pham nao tot",
    "mua gi tot",
)

CLARIFY_DETAIL_TERMS = (
    # giá tiền
    "gia", "tam gia", "ngan sach", "duoi", "tren", "khoang", "trieu", "nghin", "vnd", "d",
    # nhu cầu sử dụng
    "hoc tap", "van phong", "gaming", "choi game", "do hoa", "livestream", "stream", "podcast",
    "karaoke", "ngoai troi", "trong nha", "du lich", "the thao", "lam viec", "giai tri",
    # thông số/đặc điểm
    "ram", "ssd", "gb", "tb", "inch", "hz", "mah", "w", "5g", "wifi", "bluetooth",
    "khong day", "co day", "chong on", "pin lau", "cam tay", "robot", "mini", "pro", "max", "plus",
    # hãng phổ biến, không giới hạn catalog; chỉ dùng làm tín hiệu rằng câu đã rõ hơn
    "apple", "samsung", "xiaomi", "oppo", "realme", "vivo", "asus", "acer", "hp", "dell", "lenovo",
    "msi", "lg", "sony", "anker", "logitech", "jbl", "havit", "baseus", "philips", "panasonic",
)


def _has_detail_signal(user_message, parsed_query=None):
    """Kiểm tra câu có thông tin bổ sung như giá, hãng, thông số, nhu cầu dùng."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    if re.search(r"\b\d+(?:\s*(trieu|nghin|k|m|gb|tb|inch|hz|w|mah))?\b", normalized):
        return True

    return any(_contains_search_term(normalized, term) for term in CLARIFY_DETAIL_TERMS)


def _is_intent_only_query(user_message, parsed_query=None):
    """Câu chỉ nói ý định mua/tư vấn nhưng chưa có tên sản phẩm cụ thể."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")
    if not normalized:
        return True

    if normalized in CLARIFY_INTENT_ONLY_PATTERNS:
        return True

    tokens = [
        token for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS
    ]
    if not parsed_query.get("concepts") and not tokens:
        return True

    # Ví dụ: "tư vấn giúp", "mua hàng", "cần mua" nhưng không có danh mục/model.
    weak_words = {
        "tu", "van", "giup", "chon", "mua", "hang", "tot", "nen", "can", "goi", "y"
    }
    if tokens and all(token in weak_words for token in tokens):
        return True

    return False


def _extract_top_result_context(product_list, max_items=5):
    """Lấy tên danh mục/hãng thật từ kết quả hiện có để hỏi lại tự nhiên hơn."""
    categories = []
    brands = []
    for product in list(product_list or [])[:max(0, int(max_items))]:
        category = str(product.get("category") or "").strip()
        brand = str(product.get("brand") or "").strip()
        if category and category.casefold() not in {item.casefold() for item in categories}:
            categories.append(category)
        if brand and brand.casefold() not in {item.casefold() for item in brands}:
            brands.append(brand)
    return categories, brands


# Khung hỏi lại theo từng nhóm sản phẩm lớn trong menu/catalog.
# Không giới hạn dữ liệu tìm kiếm: phần này chỉ dùng để hỏi thêm tiêu chí khi câu của người dùng còn quá rộng.
PRODUCT_CLARIFY_GUIDES = {
    # Tách đúng từng mục trong menu, không gộp chung như "Điện thoại / Tablet" nữa.
    # Các guide này chỉ dùng để hỏi lại khi câu quá rộng; khi user nói rõ tiêu chí,
    # validator bên dưới sẽ lọc sản phẩm đúng loại + giá + hãng + đặc điểm.
    "phone": {
        "title": "Điện thoại",
        "triggers": ["dien thoai", "smartphone", "mobile phone", "iphone", "galaxy s", "galaxy z", "galaxy a", "galaxy m"],
        "questions": ["Bạn muốn điện thoại hãng nào?", "Tầm giá khoảng bao nhiêu?", "Ưu tiên pin, RAM, camera, màn hình hay chơi game?", "Bạn cần máy mới hay hàng cũ?"],
        "chips": ["iPhone", "Samsung", "Xiaomi", "OPPO", "Pin lâu", "Camera đẹp", "RAM cao", "Giá tốt"],
        "example": "điện thoại OPPO dưới 10 triệu pin lâu",
    },
    "tablet": {
        "title": "Tablet",
        "triggers": ["tablet", "may tinh bang", "ipad", "galaxy tab", "tab"],
        "questions": ["Bạn muốn tablet/iPad hãng nào?", "Màn hình khoảng bao nhiêu inch?", "Dung lượng RAM/bộ nhớ mong muốn là bao nhiêu?", "Bạn dùng để học tập, giải trí, vẽ hay làm việc?"],
        "chips": ["iPad", "Samsung Tab", "Xiaomi Pad", "Học tập", "Giải trí", "Có bút", "4G/5G", "Pin lâu"],
        "example": "iPad dưới 12 triệu dùng học tập có bút",
    },
    "laptop": {
        "title": "Laptop",
        "triggers": ["laptop", "may tinh xach tay", "notebook", "macbook", "ultrabook"],
        "questions": ["Bạn dùng laptop để học tập, văn phòng, đồ họa hay gaming?", "Tầm giá khoảng bao nhiêu?", "Cần RAM/SSD bao nhiêu?", "Ưu tiên mỏng nhẹ, pin lâu hay hiệu năng mạnh?"],
        "chips": ["Học tập", "Văn phòng", "Gaming", "Đồ họa", "RAM 16GB", "SSD 512GB", "Mỏng nhẹ", "Pin lâu"],
        "example": "laptop học tập dưới 15 triệu RAM 16GB",
    },
    "audio": {
        "title": "Âm thanh",
        "triggers": ["am thanh", "tai nghe", "headphone", "earphone", "earbuds", "airpods", "loa", "speaker", "soundbar"],
        "questions": ["Bạn cần tai nghe, loa hay soundbar?", "Muốn có dây hay không dây?", "Có cần chống ồn, bass mạnh hoặc pin lâu không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Tai nghe", "Loa", "Soundbar", "Không dây", "Có dây", "Chống ồn", "Bass mạnh", "Pin lâu"],
        "example": "tai nghe không dây chống ồn dưới 2 triệu",
    },
    "microphone": {
        "title": "Mic thu âm",
        "triggers": ["mic thu am", "micro thu am", "microphone", "micro", "mic", "micro karaoke", "mic karaoke"],
        "questions": ["Bạn dùng mic để livestream, podcast, học online hay karaoke?", "Muốn mic có dây hay không dây?", "Cần cổng USB, Type-C, jack 3.5mm hay bluetooth?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Livestream", "Podcast", "Karaoke", "Không dây", "Có dây", "USB", "Type-C", "Chống ồn"],
        "example": "mic thu âm không dây để livestream dưới 2 triệu",
    },
    "smartwatch": {
        "title": "Đồng hồ",
        "triggers": ["dong ho thong minh", "smartwatch", "dong ho", "watch", "apple watch", "garmin"],
        "questions": ["Bạn muốn đồng hồ hãng nào?", "Ưu tiên pin lâu, nghe gọi, GPS hay theo dõi sức khỏe?", "Bạn dùng với iPhone hay Android?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Apple Watch", "Garmin", "Samsung", "Pin lâu", "Nghe gọi", "GPS", "Chống nước", "Sức khỏe"],
        "example": "đồng hồ Garmin pin lâu dưới 5 triệu",
    },
    "camera": {
        "title": "Camera",
        "triggers": ["camera an ninh", "camera wifi", "camera ip", "camera", "webcam", "may anh", "camera hanh trinh"],
        "questions": ["Bạn cần camera trong nhà hay ngoài trời?", "Có cần WiFi, đàm thoại hai chiều hoặc xoay 360 độ không?", "Bạn muốn lưu thẻ nhớ hay cloud?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Camera WiFi", "Trong nhà", "Ngoài trời", "Xoay 360°", "Đàm thoại 2 chiều", "Thẻ nhớ", "Webcam", "Giá tốt"],
        "example": "camera WiFi trong nhà xoay 360 dưới 1 triệu",
    },

    "vacuum_cleaner": {
        "title": "Máy hút bụi",
        "triggers": ["may hut bui", "hut bui", "vacuum", "vacuum cleaner", "robot hut bui", "may hut bui robot", "may hut bui cam tay"],
        "questions": ["Bạn muốn máy hút bụi cầm tay, robot hay dạng cây?", "Dùng cho phòng nhỏ, nhà lớn, xe hơi hay sofa/nệm?", "Ưu tiên lực hút, pin, độ ồn hay dễ vệ sinh?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cầm tay", "Robot", "Dạng cây", "Lực hút mạnh", "Pin lâu", "Ít ồn", "Cho xe hơi", "Giá tốt"],
        "example": "máy hút bụi cầm tay dưới 3 triệu lực hút mạnh",
    },
    "dehumidifier": {
        "title": "Máy hút ẩm",
        "triggers": ["may hut am", "hut am", "dehumidifier", "may khu am"],
        "questions": ["Bạn dùng máy hút ẩm cho phòng bao nhiêu m²?", "Cần dung tích bình nước hoặc công suất hút ẩm khoảng bao nhiêu?", "Có cần lọc không khí, hẹn giờ hoặc độ ồn thấp không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Phòng nhỏ", "Phòng lớn", "Ít ồn", "Hẹn giờ", "Lọc không khí", "Dung tích lớn", "Tiết kiệm điện", "Giá tốt"],
        "example": "máy hút ẩm cho phòng 25m2 dưới 5 triệu ít ồn",
    },
    "fan": {
        "title": "Quạt",
        "triggers": ["quat may", "quat dien", "quat mini", "quat cam tay", "quat", "electric fan", "fan"],
        "questions": ["Bạn muốn quạt cây, quạt bàn, quạt mini hay quạt cầm tay?", "Dùng cho phòng nhỏ, phòng lớn hay mang đi?", "Ưu tiên pin sạc, gió mạnh, ít ồn hay điều khiển từ xa?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Quạt cây", "Quạt bàn", "Quạt mini", "Cầm tay", "Pin sạc", "Gió mạnh", "Ít ồn", "Giá tốt"],
        "example": "quạt mini pin sạc dưới 500 nghìn",
    },
    "air_fryer": {
        "title": "Nồi chiên không dầu",
        "triggers": ["noi chien khong dau", "noi chien", "air fryer"],
        "questions": ["Bạn cần nồi chiên dung tích bao nhiêu lít?", "Dùng cho mấy người trong gia đình?", "Có cần cửa kính, nhiều chế độ nấu hoặc dễ vệ sinh không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["3-5 lít", "6-8 lít", "Cửa kính", "Dễ vệ sinh", "Nhiều chế độ", "Gia đình", "Tiết kiệm điện", "Giá tốt"],
        "example": "nồi chiên không dầu 6 lít dưới 2 triệu",
    },
    "rice_cooker": {
        "title": "Nồi cơm điện",
        "triggers": ["noi com dien", "noi com", "rice cooker"],
        "questions": ["Bạn cần nồi cơm dung tích bao nhiêu lít?", "Dùng cho mấy người?", "Muốn nồi cơ, nồi điện tử hay cao tần?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["1.8 lít", "Điện tử", "Cao tần", "Chống dính", "Giữ ấm", "Gia đình", "Tiết kiệm điện", "Giá tốt"],
        "example": "nồi cơm điện 1.8 lít dưới 1 triệu",
    },
    "water_purifier": {
        "title": "Máy lọc nước",
        "triggers": ["may loc nuoc", "loc nuoc", "water purifier", "ro purifier"],
        "questions": ["Bạn cần máy lọc nước để bàn, treo tường hay tủ đứng?", "Gia đình có khoảng bao nhiêu người sử dụng?", "Cần nóng lạnh, RO, UV hoặc nhiều lõi lọc không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["RO", "Nóng lạnh", "Tủ đứng", "Để bàn", "Nhiều lõi", "Gia đình", "Tiết kiệm điện", "Giá tốt"],
        "example": "máy lọc nước RO nóng lạnh dưới 7 triệu",
    },
    "air_purifier": {
        "title": "Máy lọc không khí",
        "triggers": ["may loc khong khi", "loc khong khi", "air purifier", "purifier"],
        "questions": ["Bạn dùng máy lọc không khí cho phòng bao nhiêu m²?", "Có cần lọc bụi mịn PM2.5, khử mùi hoặc diệt khuẩn không?", "Ưu tiên độ ồn thấp, cảm biến thông minh hay tiết kiệm điện?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["PM2.5", "Khử mùi", "Ít ồn", "Cảm biến", "Phòng nhỏ", "Phòng lớn", "Tiết kiệm điện", "Giá tốt"],
        "example": "máy lọc không khí cho phòng 30m2 dưới 4 triệu",
    },
    "coffee_machine": {
        "title": "Máy pha cà phê",
        "triggers": ["may pha ca phe", "pha ca phe", "coffee machine", "coffee maker"],
        "questions": ["Bạn muốn máy pha cà phê tự động, bán tự động hay capsule?", "Dùng cá nhân, gia đình hay văn phòng/quán nhỏ?", "Có cần xay hạt, đánh sữa hoặc áp suất cao không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Tự động", "Bán tự động", "Capsule", "Xay hạt", "Đánh sữa", "Văn phòng", "Gia đình", "Giá tốt"],
        "example": "máy pha cà phê tự động dưới 8 triệu",
    },
    "fridge": {
        "title": "Tủ lạnh",
        "triggers": ["tu lanh", "fridge", "refrigerator", "mini fridge"],
        "questions": ["Bạn cần tủ lạnh dung tích khoảng bao nhiêu lít?", "Dùng cho mấy người?", "Muốn tủ mini, ngăn đá trên/dưới hay side-by-side?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Mini", "200-300L", "Inverter", "Ngăn đá dưới", "Side-by-side", "LG", "Samsung", "Giá tốt"],
        "example": "tủ lạnh inverter 300 lít dưới 10 triệu",
    },
    "air_conditioner": {
        "title": "Máy lạnh / Điều hòa",
        "triggers": ["may lanh", "dieu hoa", "air conditioner", "ac", "may dieu hoa"],
        "questions": ["Bạn dùng máy lạnh cho phòng bao nhiêu m²?", "Cần công suất 1HP, 1.5HP hay 2HP?", "Có cần inverter, tiết kiệm điện hoặc lọc không khí không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["1HP", "1.5HP", "2HP", "Inverter", "Tiết kiệm điện", "Lọc không khí", "Phòng 20m²", "Giá tốt"],
        "example": "máy lạnh inverter cho phòng 20m2 dưới 8 triệu",
    },
    "washing_machine": {
        "title": "Máy giặt",
        "triggers": ["may giat", "washing machine", "washer"],
        "questions": ["Bạn cần máy giặt khối lượng bao nhiêu kg?", "Dùng cho mấy người?", "Muốn cửa trên, cửa trước hay giặt sấy?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["8kg", "10kg", "Cửa trước", "Cửa trên", "Inverter", "Giặt sấy", "LG", "Samsung"],
        "example": "máy giặt cửa trước 10kg dưới 9 triệu",
    },
    "dryer": {
        "title": "Máy sấy quần áo",
        "triggers": ["may say quan ao", "may say", "dryer", "clothes dryer"],
        "questions": ["Bạn cần máy sấy khối lượng bao nhiêu kg?", "Muốn sấy thông hơi, ngưng tụ hay bơm nhiệt?", "Có cần tiết kiệm điện hoặc chống nhăn không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["8kg", "9kg", "Bơm nhiệt", "Ngưng tụ", "Chống nhăn", "Tiết kiệm điện", "LG", "Samsung"],
        "example": "máy sấy quần áo 9kg bơm nhiệt dưới 15 triệu",
    },
    "dishwasher": {
        "title": "Máy rửa chén",
        "triggers": ["may rua chen", "may rua bat", "dishwasher"],
        "questions": ["Bạn cần máy rửa chén để bàn hay âm/tủ độc lập?", "Gia đình có khoảng bao nhiêu người?", "Cần rửa được bao nhiêu bộ chén và có sấy khô không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Để bàn", "Độc lập", "Âm tủ", "Sấy khô", "Ít ồn", "Gia đình", "Tiết kiệm nước", "Giá tốt"],
        "example": "máy rửa chén để bàn dưới 8 triệu",
    },
    "water_heater": {
        "title": "Bình nóng lạnh",
        "triggers": ["binh nong lanh", "may nuoc nong", "water heater"],
        "questions": ["Bạn cần bình nóng lạnh trực tiếp hay gián tiếp?", "Dung tích hoặc công suất mong muốn là bao nhiêu?", "Có cần chống giật, bơm trợ lực hoặc tiết kiệm điện không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Trực tiếp", "Gián tiếp", "15L", "30L", "Chống giật", "Bơm trợ lực", "Tiết kiệm điện", "Giá tốt"],
        "example": "bình nóng lạnh 30L chống giật dưới 3 triệu",
    },
    "hair_dryer": {
        "title": "Máy sấy tóc",
        "triggers": ["may say toc", "hair dryer", "dryer toc"],
        "questions": ["Bạn cần máy sấy tóc công suất khoảng bao nhiêu?", "Dùng cá nhân, gia đình hay salon?", "Ưu tiên nhỏ gọn, ion âm, sấy nhanh hay ít ồn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Nhỏ gọn", "Ion âm", "Sấy nhanh", "Ít ồn", "Gấp gọn", "Salon", "Du lịch", "Giá tốt"],
        "example": "máy sấy tóc ion âm dưới 1 triệu",
    },
    "shaver": {
        "title": "Máy cạo râu",
        "triggers": ["may cao rau", "shaver", "electric shaver"],
        "questions": ["Bạn muốn máy cạo râu khô, ướt hay dùng được cả hai?", "Có cần chống nước, pin lâu hoặc đầu cạo linh hoạt không?", "Dùng cá nhân hay mang đi du lịch?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Chống nước", "Pin lâu", "Cạo ướt/khô", "Du lịch", "Đầu linh hoạt", "Philips", "Panasonic", "Giá tốt"],
        "example": "máy cạo râu chống nước dưới 1 triệu",
    },
    "electric_toothbrush": {
        "title": "Bàn chải điện",
        "triggers": ["ban chai dien", "electric toothbrush", "toothbrush"],
        "questions": ["Bạn cần bàn chải điện cho người lớn hay trẻ em?", "Ưu tiên pin lâu, nhiều chế độ hay cảm biến lực?", "Có cần đầu thay dễ mua không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Người lớn", "Trẻ em", "Pin lâu", "Nhiều chế độ", "Cảm biến lực", "Chống nước", "Đầu thay", "Giá tốt"],
        "example": "bàn chải điện pin lâu dưới 800 nghìn",
    },
    "face_cleanser": {
        "title": "Máy rửa mặt",
        "triggers": ["may rua mat", "face cleanser", "facial cleanser"],
        "questions": ["Bạn cần máy rửa mặt cho loại da nào?", "Ưu tiên rung nhẹ, chống nước hay pin lâu?", "Muốn dùng hằng ngày hay làm sạch sâu?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Da nhạy cảm", "Rung nhẹ", "Chống nước", "Pin lâu", "Làm sạch sâu", "Nhỏ gọn", "Giá tốt"],
        "example": "máy rửa mặt cho da nhạy cảm dưới 1 triệu",
    },
    "massager": {
        "title": "Máy massage",
        "triggers": ["may massage", "massage", "massager"],
        "questions": ["Bạn cần massage cổ vai gáy, mắt, chân hay toàn thân?", "Ưu tiên pin sạc, nhiệt nóng, nhiều chế độ hay nhỏ gọn?", "Dùng cá nhân hay cho gia đình?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cổ vai gáy", "Mắt", "Chân", "Nhiệt nóng", "Pin sạc", "Nhỏ gọn", "Gia đình", "Giá tốt"],
        "example": "máy massage cổ vai gáy dưới 2 triệu",
    },
    "hair_styler": {
        "title": "Máy tạo kiểu tóc",
        "triggers": ["may tao kieu toc", "may uon toc", "may duoi toc", "hair styler", "hair straightener", "curling iron"],
        "questions": ["Bạn cần máy uốn, duỗi hay tạo kiểu đa năng?", "Ưu tiên điều chỉnh nhiệt, bảo vệ tóc hay làm nóng nhanh?", "Dùng cá nhân hay salon?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Uốn tóc", "Duỗi tóc", "Đa năng", "Làm nóng nhanh", "Chỉnh nhiệt", "Bảo vệ tóc", "Salon", "Giá tốt"],
        "example": "máy uốn tóc chỉnh nhiệt dưới 1 triệu",
    },
    "trimmer": {
        "title": "Tông đơ",
        "triggers": ["tong do", "tong do cat toc", "hair clipper", "clipper"],
        "questions": ["Bạn cần tông đơ cho người lớn, trẻ em hay salon?", "Ưu tiên pin lâu, lưỡi sắc, ít ồn hay chống nước?", "Có cần nhiều cữ lược không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Pin lâu", "Ít ồn", "Chống nước", "Nhiều cữ lược", "Trẻ em", "Salon", "Gia đình", "Giá tốt"],
        "example": "tông đơ pin lâu ít ồn dưới 700 nghìn",
    },
    "phone_case": {
        "title": "Ốp lưng",
        "triggers": ["op lung", "op", "case", "cover", "bao da"],
        "questions": ["Bạn cần ốp cho model máy nào?", "Muốn ốp trong, chống sốc, da hay mỏng nhẹ?", "Có cần MagSafe hoặc bảo vệ camera không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["iPhone", "Samsung", "Trong suốt", "Chống sốc", "MagSafe", "Mỏng nhẹ", "Bao da", "Giá tốt"],
        "example": "ốp lưng iPhone 15 MagSafe chống sốc",
    },
    "wall_charger": {
        "title": "Củ sạc",
        "triggers": ["cu sac", "sac nhanh", "charger", "adapter", "wall charger"],
        "questions": ["Bạn cần củ sạc cho thiết bị nào?", "Cần công suất bao nhiêu W?", "Muốn 1 cổng hay nhiều cổng, USB-C hay USB-A?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["20W", "30W", "65W", "USB-C", "Nhiều cổng", "GaN", "iPhone", "Laptop"],
        "example": "củ sạc Type-C 65W cho laptop",
    },
    "charging_cable": {
        "title": "Cáp sạc",
        "triggers": ["cap sac", "cap type c", "cap lightning", "charging cable", "cable", "day sac"],
        "questions": ["Bạn cần cáp cho thiết bị nào?", "Cần đầu Lightning, Type-C hay USB-A?", "Muốn hỗ trợ sạc nhanh bao nhiêu W và dài bao nhiêu mét?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Type-C", "Lightning", "USB-A", "60W", "100W", "1m", "2m", "Bền"],
        "example": "cáp sạc Type-C 100W dài 2m",
    },
    "power_bank": {
        "title": "Sạc dự phòng",
        "triggers": ["sac du phong", "pin du phong", "power bank", "powerbank"],
        "questions": ["Bạn cần dung lượng bao nhiêu mAh?", "Có cần sạc nhanh, không dây hoặc nhiều cổng không?", "Dùng cho điện thoại, tablet hay laptop?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["10000mAh", "20000mAh", "Sạc nhanh", "Không dây", "Type-C", "Nhiều cổng", "Nhỏ gọn", "Giá tốt"],
        "example": "sạc dự phòng 20000mAh sạc nhanh dưới 1 triệu",
    },
    "screen_protector": {
        "title": "Dán màn hình / Kính cường lực",
        "triggers": ["dan man hinh", "mieng dan", "cuong luc", "kinh cuong luc", "screen protector"],
        "questions": ["Bạn cần dán màn hình cho model máy nào?", "Muốn kính cường lực, dán PPF hay chống nhìn trộm?", "Có cần chống vân tay hoặc bảo vệ camera không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["iPhone", "Samsung", "Kính cường lực", "PPF", "Chống nhìn trộm", "Chống vân tay", "Camera", "Giá tốt"],
        "example": "kính cường lực iPhone 15 chống nhìn trộm",
    },
    "stand_holder": {
        "title": "Giá đỡ / Đế sạc",
        "triggers": ["gia do", "de sac", "stand", "holder", "dock", "charging dock"],
        "questions": ["Bạn cần giá đỡ/đế sạc cho thiết bị nào?", "Dùng để bàn, trên xe hay livestream?", "Có cần xoay chỉnh, sạc không dây hoặc MagSafe không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Để bàn", "Trên xe", "Livestream", "MagSafe", "Sạc không dây", "Xoay chỉnh", "iPhone", "Giá tốt"],
        "example": "giá đỡ điện thoại MagSafe để bàn",
    },
    "stylus": {
        "title": "Bút cảm ứng",
        "triggers": ["but cam ung", "stylus", "pencil", "apple pencil", "s pen"],
        "questions": ["Bạn cần bút cho iPad, Samsung Tab hay thiết bị nào?", "Có cần chống tì tay, sạc nam châm hoặc độ trễ thấp không?", "Dùng để ghi chú, học tập hay vẽ?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["iPad", "Samsung Tab", "Ghi chú", "Vẽ", "Chống tì tay", "Sạc nam châm", "Độ trễ thấp", "Giá tốt"],
        "example": "bút cảm ứng cho iPad dùng học tập",
    },
    "home_appliance": {
        "title": "Đồ gia dụng",
        "triggers": ["do gia dung", "gia dung", "may hut bui", "hut bui", "may hut am", "hut am", "quat", "noi chien", "noi com", "may loc nuoc", "may loc khong khi", "may pha ca phe"],
        "questions": ["Bạn cần loại đồ gia dụng nào?", "Dùng cho phòng nhỏ, phòng lớn hay cả gia đình?", "Ưu tiên công suất, dung tích, độ ồn hay tiết kiệm điện?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Máy hút bụi", "Máy hút ẩm", "Quạt", "Nồi chiên", "Nồi cơm", "Máy lọc nước", "Máy lọc không khí", "Tiết kiệm điện"],
        "example": "máy hút bụi cầm tay dưới 3 triệu",
    },
    "beauty": {
        "title": "Làm đẹp",
        "triggers": ["lam dep", "may say toc", "may cao rau", "ban chai dien", "may rua mat", "may massage", "may tao kieu toc", "tong do"],
        "questions": ["Bạn cần thiết bị làm đẹp loại nào?", "Dùng cá nhân hay cho salon/gia đình?", "Ưu tiên nhỏ gọn, pin sạc, chống nước hay công suất mạnh?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Máy sấy tóc", "Máy cạo râu", "Bàn chải điện", "Máy rửa mặt", "Massage", "Chống nước", "Pin sạc", "Nhỏ gọn"],
        "example": "máy sấy tóc nhỏ gọn dưới 1 triệu",
    },
    "accessory": {
        "title": "Phụ kiện",
        "triggers": ["phu kien", "op lung", "op", "case", "cover", "bao da", "sac", "cu sac", "cap", "cap sac", "pin du phong", "sac du phong", "dan man hinh", "cuong luc", "kinh cuong luc", "gia do", "de sac"],
        "questions": ["Bạn cần phụ kiện cho thiết bị nào?", "Muốn ốp, sạc, cáp, pin dự phòng hay dán màn hình?", "Cần chuẩn sạc/công suất nào?", "Tầm giá mong muốn là bao nhiêu?"],
        "chips": ["Ốp lưng", "Cáp sạc", "Củ sạc", "Pin dự phòng", "Dán màn hình", "Type-C", "iPhone", "Samsung"],
        "example": "cáp sạc Type-C 60W cho Samsung",
    },
    "pc": {
        "title": "PC",
        "triggers": ["may tinh de ban", "desktop pc", "desktop", "pc", "mini pc", "case pc"],
        "questions": ["Bạn cần PC văn phòng, gaming hay đồ họa?", "Tầm giá khoảng bao nhiêu?", "Cần CPU/GPU/RAM/SSD như thế nào?", "Bạn muốn máy bộ hay tự build?"],
        "chips": ["PC gaming", "Văn phòng", "Đồ họa", "Intel", "AMD", "RTX", "RAM 16GB", "SSD 512GB"],
        "example": "PC gaming dưới 20 triệu RTX RAM 16GB",
    },
    "monitor": {
        "title": "Màn hình",
        "triggers": ["man hinh may tinh", "man hinh pc", "monitor", "man hinh"],
        "questions": ["Bạn muốn màn hình bao nhiêu inch?", "Dùng văn phòng, thiết kế hay gaming?", "Cần độ phân giải/tần số quét bao nhiêu?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["24 inch", "27 inch", "2K", "4K", "144Hz", "Gaming", "Thiết kế", "Văn phòng"],
        "example": "màn hình 27 inch 144Hz dưới 5 triệu",
    },
    "printer": {
        "title": "Máy in",
        "triggers": ["may in", "printer", "may scan", "scan", "may photocopy"],
        "questions": ["Bạn cần máy in màu hay trắng đen?", "In tại nhà, văn phòng hay cửa hàng?", "Có cần WiFi, in hai mặt hoặc scan/copy không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["In màu", "Trắng đen", "WiFi", "In hai mặt", "Scan", "Văn phòng", "Gia đình", "Tiết kiệm mực"],
        "example": "máy in WiFi cho văn phòng dưới 4 triệu",
    },
    "tv": {
        "title": "Tivi",
        "triggers": ["smart tivi", "smart tv", "tivi", "tv", "television"],
        "questions": ["Bạn muốn tivi bao nhiêu inch?", "Dùng cho phòng ngủ, phòng khách hay phòng họp?", "Ưu tiên 4K, Google TV, âm thanh hay thương hiệu nào?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["43 inch", "55 inch", "65 inch", "4K", "Google TV", "LG", "Samsung", "Sony"],
        "example": "tivi 55 inch 4K dưới 10 triệu",
    },
    "electric_appliance": {
        "title": "Điện máy",
        "triggers": ["dien may", "tu lanh", "may lanh", "dieu hoa", "may giat", "may say", "may rua chen", "may rua bat", "binh nong lanh"],
        "questions": ["Bạn cần thiết bị điện máy nào?", "Dùng cho diện tích/phòng hoặc số người khoảng bao nhiêu?", "Ưu tiên inverter, tiết kiệm điện, dung tích hay công suất?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Tủ lạnh", "Máy lạnh", "Máy giặt", "Máy sấy", "Máy rửa chén", "Inverter", "Tiết kiệm điện", "LG"],
        "example": "máy lạnh inverter cho phòng 20m2 dưới 8 triệu",
    },
    "tradein": {
        "title": "Thu cũ đổi mới",
        "triggers": ["thu cu doi moi", "thu cu", "doi moi", "len doi", "trade in", "tradein"],
        "questions": ["Bạn muốn thu cũ đổi mới thiết bị nào?", "Máy cũ của bạn là model gì và tình trạng ra sao?", "Bạn muốn đổi sang sản phẩm nào?", "Bạn cần ước tính bù thêm khoảng bao nhiêu?"],
        "chips": ["Thu cũ iPhone", "Thu cũ laptop", "Lên đời", "Máy còn đẹp", "Còn bảo hành", "Đổi iPhone", "Đổi laptop"],
        "example": "thu cũ iPhone 13 đổi iPhone 15",
    },
    "used": {
        "title": "Hàng cũ",
        "triggers": ["hang cu", "may cu", "cu dep", "cu tray xuoc", "da kich hoat", "active online"],
        "questions": ["Bạn muốn mua hàng cũ loại sản phẩm nào?", "Tình trạng mong muốn là máy đẹp, trầy xước nhẹ hay còn bảo hành?", "Dung lượng/thông số cần là gì?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["iPhone cũ", "Laptop cũ", "Máy đẹp", "Còn bảo hành", "Giá tốt", "Dung lượng cao", "Đã kích hoạt"],
        "example": "iPhone cũ dưới 8 triệu còn bảo hành",
    },
    "promotion": {
        "title": "Khuyến mãi",
        "triggers": ["khuyen mai", "giam gia", "sale", "uu dai", "voucher", "deal"],
        "questions": ["Bạn muốn xem khuyến mãi cho nhóm sản phẩm nào?", "Bạn quan tâm tầm giá khoảng bao nhiêu?", "Bạn ưu tiên giảm giá trực tiếp, voucher hay trả góp?"],
        "chips": ["Điện thoại", "Laptop", "Tai nghe", "Tivi", "Voucher", "Trả góp", "Giá sốc"],
        "example": "khuyến mãi laptop dưới 15 triệu",
    },
    "tech_news": {
        "title": "Tin công nghệ",
        "triggers": ["tin cong nghe", "tin tuc cong nghe", "cong nghe", "review", "danh gia"],
        "questions": ["Bạn muốn xem tin/review về sản phẩm nào?", "Bạn quan tâm so sánh, đánh giá hay mẹo sử dụng?", "Bạn muốn thông tin về hãng hoặc dòng sản phẩm nào?"],
        "chips": ["Review điện thoại", "So sánh laptop", "Mẹo sử dụng", "Tin Apple", "Tin Samsung", "Đánh giá camera"],
        "example": "review điện thoại màn hình gập mới nhất",
    },
}

# Một số trigger là nhóm rộng, khi đi cùng trigger cụ thể thì trigger cụ thể phải thắng.
BROAD_GUIDE_KEYS = {"home_appliance", "electric_appliance", "accessory", "beauty", "promotion", "tech_news"}
GUIDE_PRIORITY = {
    "phone": 120,
    "tablet": 120,
    "laptop": 120,
    "microphone": 120,
    "audio": 115,
    "smartwatch": 120,
    "camera": 120,
    "tv": 120,
    "pc": 120,
    "monitor": 120,
    "printer": 120,
    # Nhóm sản phẩm con: ưu tiên cao hơn nhóm lớn để "máy hút bụi" không rơi vào "Đồ gia dụng",
    # "tủ lạnh" không rơi vào "Điện máy", "củ sạc" không rơi vào "Phụ kiện".
    "vacuum_cleaner": 130,
    "dehumidifier": 130,
    "fan": 130,
    "air_fryer": 130,
    "rice_cooker": 130,
    "water_purifier": 130,
    "air_purifier": 130,
    "coffee_machine": 130,
    "fridge": 130,
    "air_conditioner": 130,
    "washing_machine": 130,
    "dryer": 130,
    "dishwasher": 130,
    "water_heater": 130,
    "hair_dryer": 130,
    "shaver": 130,
    "electric_toothbrush": 130,
    "face_cleanser": 130,
    "massager": 130,
    "hair_styler": 130,
    "trimmer": 130,
    "phone_case": 130,
    "wall_charger": 130,
    "charging_cable": 130,
    "power_bank": 130,
    "screen_protector": 130,
    "stand_holder": 130,
    "stylus": 130,
    "beauty": 75,
    "home_appliance": 70,
    "electric_appliance": 70,
    "accessory": 65,
    "tradein": 80,
    "used": 75,
    "promotion": 60,
    "tech_news": 50,
}


def _best_guide_key_from_text(text):
    """Tìm đúng từng sản phẩm/nhóm nhỏ từ text, không gộp menu lớn."""
    normalized_text = _normalize_search_text(text)
    best_key = ""
    best_score = (-1, -1, -1)

    for key, guide in PRODUCT_CLARIFY_GUIDES.items():
        for trigger in guide.get("triggers", []):
            normalized_trigger = _normalize_search_text(trigger)
            if not normalized_trigger:
                continue
            if not _contains_search_term(normalized_text, normalized_trigger):
                continue

            # Ưu tiên trigger dài + nhóm cụ thể. Ví dụ "tivi" phải ra Tivi,
            # không bị "điện máy" kéo sang; "tablet" không bị gộp vào điện thoại.
            score = (
                len(normalized_trigger),
                GUIDE_PRIORITY.get(key, 0),
                0 if key in BROAD_GUIDE_KEYS else 1,
            )
            if score > best_score:
                best_key = key
                best_score = score

    return best_key


def detect_clarify_guide_key(user_message, parsed_query=None, matched_products=None):
    """
    Nhận diện đúng khung hỏi lại theo từng sản phẩm riêng.

    Ưu tiên tuyệt đối câu người dùng nhập. Không dùng category của kết quả
    FAISS để kéo sai nhóm. Ví dụ: nhập "laptop" luôn là Laptop, không phải
    Hàng cũ; nhập "tivi" là Tivi, không phải Điện máy.
    """
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    direct_key = _best_guide_key_from_text(normalized)
    if direct_key:
        return direct_key

    # Fallback rất nhẹ: chỉ dùng matched_products khi câu người dùng không có
    # trigger sản phẩm nào, ví dụ "loại này dưới 5 triệu".
    category_text = _normalize_search_text([
        product.get("category")
        for product in list(matched_products or [])[:8]
    ])
    return _best_guide_key_from_text(category_text)


# Bộ lọc loại sản phẩm chi tiết, tách riêng từng mục menu.
# Nếu người dùng hỏi tivi thì chỉ tivi; hỏi điện máy thì chỉ tủ lạnh/máy lạnh/máy giặt...;
# hỏi mic thu âm thì không trả tai nghe/loa; hỏi tablet thì không trả ốp iPad.
PRODUCT_GROUP_MATCH_TERMS = {
    "phone": {
        "include": ["dien thoai", "smartphone", "mobile phone", "iphone", "samsung galaxy", "galaxy z", "galaxy s", "galaxy a", "galaxy m"],
        "exclude": ["tablet", "ipad", "may tinh bang", "op lung", "case", "cover", "bao da", "dan man hinh", "cuong luc", "kinh cuong luc", "cap sac", "cu sac", "charger", "cable", "pin du phong", "sac du phong", "phu kien"],
    },
    "tablet": {
        "include": ["tablet", "may tinh bang", "ipad", "galaxy tab", "tab"],
        "exclude": ["op lung", "case", "cover", "bao da", "dan man hinh", "cuong luc", "kinh cuong luc", "but cam ung", "pencil", "phu kien"],
    },
    "laptop": {
        "include": ["laptop", "may tinh xach tay", "notebook", "macbook", "ultrabook"],
        "exclude": ["tui chong soc", "balo", "chuot", "ban phim", "keyboard", "mouse", "ke laptop", "de laptop", "sac laptop", "phu kien"],
    },
    "audio": {
        "include": ["am thanh", "tai nghe", "headphone", "earphone", "earbuds", "airpods", "loa", "speaker", "soundbar"],
        "exclude": ["mic thu am", "micro thu am", "microphone", "micro karaoke", "mic karaoke", "op lung", "case", "dan man hinh"],
    },
    "microphone": {
        "include": ["mic thu am", "micro thu am", "microphone", "micro", "mic", "micro karaoke", "mic karaoke"],
        "exclude": ["tai nghe", "headphone", "earphone", "loa", "speaker", "soundbar", "op lung", "case"],
    },
    "smartwatch": {
        "include": ["dong ho", "dong ho thong minh", "smartwatch", "watch", "apple watch", "garmin"],
        "exclude": ["day dong ho", "day deo", "mieng dan", "kinh cuong luc", "op lung", "case", "sac", "cap"],
    },
    "camera": {
        "include": ["camera", "camera an ninh", "camera wifi", "camera ip", "webcam", "may anh", "camera hanh trinh"],
        "exclude": ["op lung", "case", "the nho", "chan de", "gia do", "cap", "sac"],
    },

    "vacuum_cleaner": {
        "include": ["may hut bui", "hut bui", "vacuum", "vacuum cleaner", "robot hut bui", "may hut bui robot", "may hut bui cam tay"],
        "exclude": ["phu kien", "linh kien", "tui", "bo loc thay the"],
    },
    "dehumidifier": {
        "include": ["may hut am", "hut am", "dehumidifier", "may khu am"],
        "exclude": ["may hut bui", "loc khong khi", "phu kien"],
    },
    "fan": {
        "include": ["quat", "quat may", "quat dien", "quat mini", "quat cam tay", "electric fan", "fan"],
        "exclude": ["quat tan nhiet", "fan laptop", "fan cpu", "phu kien"],
    },
    "air_fryer": {
        "include": ["noi chien", "noi chien khong dau", "air fryer"],
        "exclude": ["phu kien", "khay", "giay nen"],
    },
    "rice_cooker": {
        "include": ["noi com", "noi com dien", "rice cooker"],
        "exclude": ["phu kien", "long noi"],
    },
    "water_purifier": {
        "include": ["may loc nuoc", "loc nuoc", "water purifier", "ro purifier"],
        "exclude": ["loi loc", "phu kien", "binh nuoc"],
    },
    "air_purifier": {
        "include": ["may loc khong khi", "loc khong khi", "air purifier"],
        "exclude": ["may hut am", "loi loc", "phu kien"],
    },
    "coffee_machine": {
        "include": ["may pha ca phe", "pha ca phe", "coffee machine", "coffee maker"],
        "exclude": ["phu kien", "vien nen", "tamper"],
    },
    "fridge": {
        "include": ["tu lanh", "fridge", "refrigerator", "mini fridge"],
        "exclude": ["phu kien", "remote", "ke tu"],
    },
    "air_conditioner": {
        "include": ["may lanh", "dieu hoa", "air conditioner", "may dieu hoa"],
        "exclude": ["remote", "dieu khien", "phu kien", "ong dong"],
    },
    "washing_machine": {
        "include": ["may giat", "washing machine", "washer"],
        "exclude": ["bot giat", "phu kien", "tui giat"],
    },
    "dryer": {
        "include": ["may say quan ao", "may say", "dryer", "clothes dryer"],
        "exclude": ["may say toc", "hair dryer", "phu kien"],
    },
    "dishwasher": {
        "include": ["may rua chen", "may rua bat", "dishwasher"],
        "exclude": ["vien rua chen", "phu kien"],
    },
    "water_heater": {
        "include": ["binh nong lanh", "may nuoc nong", "water heater"],
        "exclude": ["phu kien", "voi sen"],
    },
    "hair_dryer": {
        "include": ["may say toc", "hair dryer"],
        "exclude": ["may say quan ao", "dryer quan ao"],
    },
    "shaver": {
        "include": ["may cao rau", "shaver", "electric shaver"],
        "exclude": ["tong do", "phu kien", "luoi dao thay"],
    },
    "electric_toothbrush": {
        "include": ["ban chai dien", "electric toothbrush", "toothbrush"],
        "exclude": ["dau ban chai", "phu kien"],
    },
    "face_cleanser": {
        "include": ["may rua mat", "face cleanser", "facial cleanser"],
        "exclude": ["sua rua mat", "my pham"],
    },
    "massager": {
        "include": ["may massage", "massage", "massager"],
        "exclude": ["ghe massage"],
    },
    "hair_styler": {
        "include": ["may tao kieu toc", "may uon toc", "may duoi toc", "hair styler", "hair straightener", "curling iron"],
        "exclude": ["may say toc"],
    },
    "trimmer": {
        "include": ["tong do", "tong do cat toc", "hair clipper", "clipper"],
        "exclude": ["may cao rau"],
    },
    "phone_case": {
        "include": ["op lung", "op", "case", "cover", "bao da"],
        "exclude": [],
    },
    "wall_charger": {
        "include": ["cu sac", "sac nhanh", "charger", "adapter", "wall charger"],
        "exclude": ["cap sac", "cable", "sac du phong", "pin du phong"],
    },
    "charging_cable": {
        "include": ["cap sac", "cap type c", "cap lightning", "charging cable", "cable", "day sac"],
        "exclude": ["cu sac", "adapter", "sac du phong", "pin du phong"],
    },
    "power_bank": {
        "include": ["sac du phong", "pin du phong", "power bank", "powerbank"],
        "exclude": ["cu sac", "cap sac", "cable"],
    },
    "screen_protector": {
        "include": ["dan man hinh", "mieng dan", "cuong luc", "kinh cuong luc", "screen protector"],
        "exclude": ["man hinh may tinh", "monitor"],
    },
    "stand_holder": {
        "include": ["gia do", "de sac", "stand", "holder", "dock", "charging dock"],
        "exclude": ["man hinh", "monitor"],
    },
    "stylus": {
        "include": ["but cam ung", "stylus", "pencil", "apple pencil", "s pen"],
        "exclude": ["phu kien chung"],
    },
    "home_appliance": {
        "include": ["do gia dung", "gia dung", "may hut bui", "hut bui", "may hut am", "hut am", "quat", "noi chien", "noi com", "may loc nuoc", "may loc khong khi", "may pha ca phe"],
        "exclude": ["lam dep", "may say toc", "may cao rau", "ban chai dien", "phu kien", "linh kien", "cap", "sac"],
    },
    "beauty": {
        "include": ["lam dep", "may say toc", "may cao rau", "ban chai dien", "may rua mat", "may massage", "may tao kieu toc", "tong do"],
        "exclude": ["may hut bui", "may hut am", "noi chien", "noi com", "tu lanh", "may giat"],
    },
    "accessory": {
        "include": ["phu kien", "op lung", "op", "case", "cover", "bao da", "sac", "cu sac", "cap", "cap sac", "pin du phong", "sac du phong", "dan man hinh", "cuong luc", "kinh cuong luc", "gia do", "de sac", "but cam ung", "pencil"],
        "exclude": [],
    },
    "pc": {
        "include": ["pc", "may tinh de ban", "desktop", "desktop pc", "mini pc", "case pc"],
        "exclude": ["dien thoai", "iphone", "tablet", "ipad", "man hinh", "monitor", "chuot", "ban phim", "keyboard", "mouse"],
    },
    "monitor": {
        "include": ["man hinh", "monitor", "man hinh may tinh", "man hinh pc"],
        "exclude": ["dan man hinh", "mieng dan", "cuong luc", "kinh cuong luc", "dien thoai", "iphone", "tablet", "ipad"],
    },
    "printer": {
        "include": ["may in", "printer", "may scan", "may photocopy"],
        "exclude": ["muc in", "hop muc", "giay in", "phu kien", "cap"],
    },
    "tv": {
        "include": ["tivi", "tv", "television", "smart tv", "smart tivi"],
        "exclude": ["remote", "dieu khien", "gia treo", "day cap", "phu kien", "man hinh may tinh", "monitor"],
    },
    "electric_appliance": {
        "include": ["dien may", "tu lanh", "may lanh", "dieu hoa", "may giat", "may say", "may rua chen", "may rua bat", "binh nong lanh"],
        "exclude": ["tivi", "tv", "remote", "day cap", "gia treo", "phu kien"],
    },
    "tradein": {
        "include": ["thu cu", "doi moi", "thu cu doi moi", "len doi", "trade in", "tradein"],
        "exclude": [],
    },
    "used": {
        "include": ["hang cu", "may cu", "cu dep", "cu tray xuoc", "da kich hoat", "active online"],
        "exclude": [],
    },
    "promotion": {
        "include": ["khuyen mai", "giam gia", "sale", "uu dai", "voucher", "deal"],
        "exclude": [],
    },
    "tech_news": {
        "include": ["tin cong nghe", "tin tuc", "review", "danh gia", "so sanh"],
        "exclude": [],
    },
}


def _product_type_text(product):
    """Chỉ dùng trường thể hiện loại sản phẩm để tránh lẫn kết quả vì mô tả quá rộng."""
    search_fields = product.get("_search_fields") or _build_product_search_fields(product)
    return " ".join(
        part for part in [
            search_fields.get("name", ""),
            search_fields.get("category", ""),
            search_fields.get("labels", ""),
            search_fields.get("brand", ""),
        ] if part
    )


def product_matches_query_group(product, guide_key):
    """Kiểm tra sản phẩm có thuộc đúng mục người dùng đang hỏi không."""
    if not guide_key or guide_key not in PRODUCT_GROUP_MATCH_TERMS:
        return True

    # Khuyến mãi/tin công nghệ là mục nội dung, không nên dùng để ép lọc sản phẩm.
    if guide_key in {"promotion", "tech_news"}:
        return True

    rules = PRODUCT_GROUP_MATCH_TERMS[guide_key]
    product_text = _product_type_text(product)
    if not product_text:
        return False

    if guide_key not in {"used", "tradein"}:
        for term in rules.get("exclude", []):
            if _contains_search_term(product_text, term):
                return False

    return any(_contains_search_term(product_text, term) for term in rules.get("include", []))


def filter_ranked_items_by_query_group(ranked_items, user_message, parsed_query, product_index):
    """Lọc kết quả theo đúng mục riêng: phone/tablet/tivi/điện máy/mic/..."""
    guide_key = detect_clarify_guide_key(user_message, parsed_query, None)
    if not guide_key:
        return ranked_items

    filtered = [
        item for item in ranked_items
        if product_matches_query_group(item[product_index], guide_key)
    ]
    return filtered


def is_broad_product_query(user_message, parsed_query=None, matched_products=None):
    """Câu chỉ nêu tên sản phẩm/mục lớn nhưng chưa có tiêu chí lọc cụ thể."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    if _has_detail_signal(user_message, parsed_query):
        return False

    guide_key = detect_clarify_guide_key(user_message, parsed_query, matched_products)
    if not guide_key:
        return False

    normalized = parsed_query.get("normalized_query", "")
    meaningful_tokens = [
        token for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS
    ]
    concept_count = len(parsed_query.get("concepts", []))

    if re.search(r"\d", normalized):
        return False
    return (len(meaningful_tokens) + concept_count) <= 3


def build_clarifying_suggestion_box(user_message, user_name="", parsed_query=None, matched_products=None):
    """Trả về cùng một HTML khung đẹp cho mọi sản phẩm/mục riêng trong catalog."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    guide_key = detect_clarify_guide_key(user_message, parsed_query, matched_products)
    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key)

    query_name = get_product_query_display_name(user_message, parsed_query)
    customer_name = _clean_chat_user_name(user_name)
    prefix = f"{_safe_text(customer_name)}, " if customer_name else ""

    if not guide:
        categories, brands = _extract_top_result_context(matched_products, max_items=6)
        chips = _unique_strings([*brands[:4], *categories[:4]])[:8]
        questions = [
            "Bạn muốn tầm giá khoảng bao nhiêu?",
            "Bạn ưu tiên hãng, thông số hay nhu cầu sử dụng nào?",
            "Bạn cần sản phẩm mới, hàng cũ hay phụ kiện đi kèm?",
        ]
        title = query_name or "Sản phẩm cần tìm"
        example_text = f"{query_name} dưới 10 triệu dùng bền"
    else:
        chips = guide.get("chips", [])
        questions = guide.get("questions", [])
        title = guide.get("title") or query_name or "Sản phẩm cần tìm"
        example_text = guide.get("example") or f"{title} dưới 10 triệu"

    html = (
        f"<div class='clarify-box' style='border:1px solid #ffd1d8;background:linear-gradient(180deg,#fff7f8 0%,#fff 100%);"
        f"border-radius:16px;padding:14px 14px 13px 14px;margin:6px 0 4px 0;"
        f"box-shadow:0 6px 18px rgba(215,0,24,0.08);'>"
        f"<p style='margin:0 0 9px 0;line-height:1.45;'>{prefix}mình cần thêm một vài thông tin để lọc đúng <b>{_safe_text(title)}</b> cho bạn nhé.</p>"
        f"<div style='font-weight:700;margin-bottom:8px;color:#d70018;'>Bạn có thể cho mình biết:</div>"
        f"<ul style='margin:0 0 10px 18px;padding:0;line-height:1.45;'>"
    )
    html += "".join(f"<li>{_safe_text(question)}</li>" for question in questions[:4])
    html += "</ul>"

    if chips:
        html += "<div style='display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;'>"
        html += "".join(
            "<span style='display:inline-block;border:1px solid #f3a7b2;"
            "background:#fff;border-radius:999px;padding:6px 10px;font-size:13px;"
            "box-shadow:0 2px 7px rgba(0,0,0,0.035);'>"
            f"{_safe_text(chip)}</span>"
            for chip in chips[:10]
        )
        html += "</div>"

    html += (
        "<p style='margin:11px 0 0 0;color:#555;font-size:13px;line-height:1.4;'>"
        f"Ví dụ: “{_safe_text(example_text)}”."
        "</p></div>"
    )
    return html

def should_ask_clarifying_question(user_message, parsed_query=None, matched_products=None):
    """
    Áp dụng cho toàn bộ sản phẩm trong catalog:
    - Không dựa vào danh sách cố định như iPhone/laptop/camera.
    - Hỏi lại khi người dùng chỉ nói ý định chung, hoặc kết quả quá rộng mà chưa có giá/hãng/thông số/nhu cầu.
    - Câu có tên sản phẩm/danh mục rõ như "mic thu âm", "máy hút bụi" vẫn được trả sản phẩm bình thường.
    """
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")
    matched_products = list(matched_products or [])

    if _is_intent_only_query(user_message, parsed_query):
        return True

    # Nếu người dùng chỉ nhập một nhóm sản phẩm lớn như "điện thoại",
    # "mic thu âm", "máy hút bụi", "phụ kiện"..., hỏi lại bằng khung gợi ý
    # thay vì trả một danh sách quá rộng. Áp dụng cho toàn bộ nhóm sản phẩm.
    if is_broad_product_query(user_message, parsed_query, matched_products):
        return True

    if _has_detail_signal(user_message, parsed_query):
        return False

    tokens = [
        token for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS
    ]

    # Một token rất ngắn/thường không đủ rõ, trừ khi nó là model/tên riêng có số.
    if len(tokens) == 1 and len(tokens[0]) <= 2 and not re.search(r"\d", normalized):
        return True

    # Nếu không có kết quả nào mà câu rất ngắn, hỏi lại để tránh trả lời "không có" quá sớm.
    if not matched_products and len(tokens) <= 1 and not parsed_query.get("concepts"):
        return True

    # Nếu kết quả trả về quá rộng nhiều danh mục khác nhau và câu hỏi không có detail, hỏi lại.
    if matched_products and len(tokens) <= 1:
        categories, _ = _extract_top_result_context(matched_products, max_items=8)
        if len(categories) >= 3:
            return True

    return False


def generate_clarifying_question(user_message, user_name="", parsed_query=None, matched_products=None):
    """Tạo câu hỏi lại dùng được cho mọi loại sản phẩm trong database."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    query_name = get_product_query_display_name(user_message, parsed_query)
    categories, brands = _extract_top_result_context(matched_products, max_items=6)

    customer_name = _clean_chat_user_name(user_name)
    prefix = f"{customer_name}, " if customer_name else ""

    # Nếu có Gemini thì tạo câu hỏi dựa trên query + danh mục thật, nhưng không bịa sản phẩm.
    if MODEL_MAIN:
        context = {
            "yeu_cau": query_name,
            "danh_muc_goi_y_tu_catalog": categories[:4],
            "hang_goi_y_tu_catalog": brands[:4],
        }
        prompt = f"""
Bạn là Mochi, trợ lý mua sắm thân thiện.
Thông tin người dùng nhập chưa đủ rõ để lọc đúng sản phẩm trong catalog.
Dữ liệu ngữ cảnh có thật: {json.dumps(context, ensure_ascii=False)}
Tên người dùng: {customer_name or 'khách chưa đăng nhập'}

Hãy viết đúng 1 câu hỏi lại bằng tiếng Việt, tự nhiên và ngắn gọn.
Quy tắc:
- Áp dụng cho mọi loại sản phẩm, không chỉ điện thoại/laptop.
- Hỏi thêm 2-3 tiêu chí phù hợp như tầm giá, hãng, nhu cầu sử dụng, thông số, kiểu dáng hoặc môi trường sử dụng.
- Không bịa tên sản phẩm, giá, khuyến mãi hoặc tồn kho.
- Không nhắc MongoDB, database, embedding, FAISS, code hoặc API.
- Không dùng Markdown và không tạo thẻ HTML.
"""
        try:
            response = MODEL_MAIN.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": 120,
                    "temperature": 0.65,
                },
            )
            reply = str(response.text or "").strip()
            if reply:
                return _safe_text(reply).replace("\n", "<br>")
        except Exception as exc:
            print(f"Lỗi tạo câu hỏi làm rõ: {exc}")

    if categories:
        category_text = ", ".join(categories[:3])
        return (
            f"{prefix}bạn muốn tìm {query_name} theo tiêu chí nào: "
            f"tầm giá, hãng, nhu cầu sử dụng hay thông số cụ thể? "
            f"Mình đang thấy một vài nhóm liên quan như {category_text}."
        )

    return (
        f"{prefix}bạn cho mình thêm một chút thông tin về sản phẩm cần tìm nhé: "
        "loại sản phẩm, tầm giá, hãng hoặc nhu cầu sử dụng cụ thể là gì?"
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
    "mic thu am": "microphone recording mic condenser microphone",
    "micro": "microphone recording mic",
    "may hut bui": "vacuum cleaner",
    "may hut am": "dehumidifier appliance",
    "may loc khong khi": "air purifier appliance",
    "camera an ninh": "security camera surveillance camera",
    "camera": "camera security camera",
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
    ranked = filter_ranked_items_by_query_group(
        ranked,
        user_message,
        parsed_query,
        product_index=3,
    )
    ranked, price_constraints = filter_ranked_items_by_price_constraints(
        ranked,
        user_message,
        product_index=3,
    )
    ranked = filter_ranked_items_by_user_requirements(
        ranked,
        user_message,
        parsed_query,
        product_index=3,
        price_constraints=price_constraints,
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


