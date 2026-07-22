from datetime import datetime, timedelta, timezone
from functools import wraps
from email.message import EmailMessage
from html import escape
from threading import Lock
from time import monotonic
from urllib.parse import unquote, urlparse

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
import difflib
import gzip
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

from catalog_store import CatalogSearchStore
from product_details import html_to_text, runtime_product_document
import product_advisor

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
GEMINI_API_KEY = os.getenv("MODEL_KEY", "").strip()

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
PRODUCTS_CATALOG_PATH = os.path.join(FAISS_DIR, "catalog.jsonl.gz")
PRODUCTS_CATALOG_SEARCH_PATH = os.path.join(
    FAISS_DIR,
    "catalog_search.sqlite3",
)
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
catalog_search_store = None

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
    "highlights": 1,
    "articleText": 1,
    "articleSections": 1,
    "meta": 1,
    "shortNotice": 1,
    "statusLabel": 1,
    "stockNote": 1,
    "categoryTrail": 1,
    "reviewSummary": 1,
    "faqs": 1,
    "promotions": 1,
    "privileges": 1,
    "policies": 1,
    "paymentOffers": 1,
    "priceBenefits": 1,
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
    if re.search(r"<[a-zA-Z][^>]*>", text_value):
        text_value = html_to_text(text_value)
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
            existing = normalized_specs.get(key_text)
            if not existing:
                normalized_specs[key_text] = value_text
            elif value_text not in existing:
                normalized_specs[key_text] = f"{existing} | {value_text}"

    def consume(source, group_name=""):
        if isinstance(source, dict):
            nested_group = str(
                source.get("groupName")
                or source.get("group")
                or group_name
                or ""
            ).strip()

            rows = source.get("rows")
            if isinstance(rows, list):
                consume(rows, nested_group)
                return

            label = (
                source.get("label")
                or source.get("name")
                or source.get("key")
            )
            value = next(
                (
                    source.get(value_key)
                    for value_key in ("value", "content", "text", "values")
                    if source.get(value_key) is not None
                ),
                None,
            )
            if label and value is not None:
                label_text = str(label).strip()
                spec_key = (
                    f"{nested_group} - {label_text}"
                    if nested_group
                    else label_text
                )
                add_spec(spec_key, value)
                return

            for key, value in source.items():
                if key in {
                    "id", "groupName", "group", "label", "name", "key",
                    "labelUrl", "url",
                }:
                    continue
                if isinstance(value, (dict, list, tuple)):
                    consume(value, nested_group or str(key))
                else:
                    spec_key = (
                        f"{nested_group} - {key}"
                        if nested_group
                        else key
                    )
                    add_spec(spec_key, value)
            return

        if not isinstance(source, list):
            return

        for item in source:
            if isinstance(item, (dict, list, tuple)):
                consume(item, group_name)
            elif item is not None:
                add_spec(group_name or "Thông số", item)

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
        "specs": _normalize_search_text(product.get("specs")),
        "description": _normalize_search_text(product.get("description")),
        "details": _normalize_search_text(
            [
                product.get("highlights"),
                product.get("articleText"),
                product.get("articleSections"),
                product.get("shortNotice"),
                product.get("stockNote"),
                product.get("statusLabel"),
                product.get("reviewSummary"),
                product.get("meta"),
                product.get("faqs"),
            ]
        ),
        "extras": _normalize_search_text(
            [
                product.get("colors"),
                product.get("variants"),
                product.get("keywords"),
                product.get("promotions"),
                product.get("priceBenefits"),
            ]
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

    category_trail_names = []
    category_trail = product.get("categoryTrail")
    if isinstance(category_trail, list):
        category_trail_names = [
            _display_text(item)
            for item in category_trail
            if _display_text(item)
        ]

    categories = _unique_strings(
        [
            *category_trail_names,
            *_flatten_search_values(product.get("categories")),
        ]
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

    meta = product.get("meta") if isinstance(product.get("meta"), dict) else {}
    product["description"] = (
        _display_text(product.get("description"))
        or _display_text(meta.get("description"))
        or _display_text(product.get("shortNotice"))
    )
    product["highlights"] = _unique_strings(
        _flatten_search_values(product.get("highlights"))
    )
    product["statusLabel"] = _display_text(product.get("statusLabel"))
    product["stockNote"] = _display_text(product.get("stockNote"))
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


def _read_product_json(path):
    if str(path).casefold().endswith(".jsonl.gz"):
        def iter_json_lines():
            with gzip.open(path, "rt", encoding="utf-8") as file:
                for line_number, line in enumerate(file, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    document = json.loads(line)
                    if not isinstance(document, dict):
                        raise ValueError(
                            f"Dòng {line_number} trong catalog không phải object JSON."
                        )
                    yield runtime_product_document(document)

        return iter_json_lines()

    opener = gzip.open if str(path).casefold().endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError(f"Catalog phải là một danh sách sản phẩm: {path}")
    return data


def _normalize_product_list(raw_products, source_name):
    normalized_products = []
    seen_ids = set()

    for position, document in enumerate(raw_products):
        if not isinstance(document, dict):
            raise ValueError(
                f"Metadata tại vị trí {position} trong {source_name} không phải object JSON."
            )

        product = normalize_product_document(document)
        product_id = str(product.get("id") or "").strip()
        if not product_id:
            raise ValueError(
                f"Sản phẩm tại vị trí {position} trong {source_name} không có ID hợp lệ."
            )
        if product_id in seen_ids:
            raise ValueError(f"ID sản phẩm bị trùng trong {source_name}: {product_id}")

        seen_ids.add(product_id)
        normalized_products.append(product)

    return normalized_products


def load_products_from_index_metadata():
    """
    Load the FAISS-aligned metadata and the complete MongoDB catalog.

    products.json remains strictly aligned with FAISS. catalog.jsonl.gz may
    contain products without a usable image and is used for text retrieval.
    """
    global products, product_ids, product_by_id
    global faiss_product_order_ids, faiss_position_by_product_id
    global catalog_loaded_at, catalog_search_store

    if not os.path.isfile(PRODUCTS_METADATA_PATH):
        raise FileNotFoundError(
            f"Không tìm thấy metadata sản phẩm: {PRODUCTS_METADATA_PATH}. "
            "Hãy chạy build_index.py trước."
        )

    raw_faiss_products = _read_product_json(PRODUCTS_METADATA_PATH)
    normalized_faiss_products = _normalize_product_list(
        raw_faiss_products,
        "products.json",
    )

    if catalog_search_store is not None:
        catalog_search_store.close()
        catalog_search_store = None

    catalog_total = len(normalized_faiss_products)
    if os.path.isfile(PRODUCTS_CATALOG_SEARCH_PATH):
        catalog_search_store = CatalogSearchStore(PRODUCTS_CATALOG_SEARCH_PATH)
        normalized_catalog = list(normalized_faiss_products)
        catalog_source = PRODUCTS_CATALOG_SEARCH_PATH
        catalog_total = catalog_search_store.product_count
    elif os.path.isfile(PRODUCTS_CATALOG_PATH):
        raw_catalog = _read_product_json(PRODUCTS_CATALOG_PATH)
        normalized_catalog = _normalize_product_list(
            raw_catalog,
            "catalog.jsonl.gz",
        )
        catalog_source = PRODUCTS_CATALOG_PATH
        catalog_total = len(normalized_catalog)
    else:
        normalized_catalog = list(normalized_faiss_products)
        catalog_source = PRODUCTS_METADATA_PATH
        print(
            "Chưa có catalog.jsonl.gz; đang dùng tạm metadata FAISS. "
            "Chạy build_index.py --metadata-only để lấy detailBlob."
        )

    product_by_id = {
        str(product["id"]): product
        for product in normalized_catalog
    }

    # Keep every FAISS row resolvable even if a catalog sync was interrupted.
    for product in normalized_faiss_products:
        product_by_id.setdefault(str(product["id"]), product)

    products = list(product_by_id.values())
    product_ids = [str(product["id"]) for product in products]
    faiss_product_order_ids = [
        str(product["id"])
        for product in normalized_faiss_products
    ]
    faiss_position_by_product_id = {
        product_id: position
        for position, product_id in enumerate(faiss_product_order_ids)
    }
    catalog_loaded_at = datetime.now(timezone.utc)

    print(
        f"Đã mở catalog {catalog_total} sản phẩm từ: {catalog_source}"
    )
    print(
        f"Metadata nạp trong RAM/ánh xạ FAISS: "
        f"{len(normalized_faiss_products)} sản phẩm."
    )
    return normalized_faiss_products


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


SKIP_STARTUP_ASSETS = os.getenv(
    "CORE_SKIP_STARTUP_ASSETS", "false"
).strip().lower() in {"1", "true", "yes", "on"}


def _clear_local_search_assets():
    global products, product_ids, product_by_id
    global faiss_product_order_ids, faiss_position_by_product_id
    global faiss_index, product_embeddings, catalog_search_store

    if catalog_search_store is not None:
        catalog_search_store.close()
        catalog_search_store = None

    products = []
    product_ids = []
    product_by_id = {}
    faiss_product_order_ids = []
    faiss_position_by_product_id = {}
    faiss_index = None
    product_embeddings = None


def initialize_startup_assets():
    global yolo_model

    try:
        load_local_search_assets()
    except FileNotFoundError as exc:
        print(f"Chưa có đủ file tìm kiếm cục bộ: {exc}")
        print("Hãy chạy build_index.py để tạo products.json, embeddings.npy và FAISS index.")
        _clear_local_search_assets()
    except Exception as exc:
        print(f"Lỗi khi tải bộ tìm kiếm cục bộ: {exc}")
        _clear_local_search_assets()

    try:
        if os.path.exists(MODEL_PATH):
            yolo_model = YOLO(MODEL_PATH)
            print(f"Đã tải mô hình YOLO từ: {MODEL_PATH}")
        else:
            print(f"Không tìm thấy file model YOLO tại: {MODEL_PATH}")
    except Exception as exc:
        print(f"Lỗi tải YOLO model: {exc}")


if SKIP_STARTUP_ASSETS:
    _clear_local_search_assets()
    print("Đã bỏ qua nạp catalog/FAISS/YOLO theo CORE_SKIP_STARTUP_ASSETS.")
else:
    initialize_startup_assets()


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


def _strip_html_route_value(value):
    clean = unquote(str(value or "").strip())
    clean = re.sub(r"^/+|/+$", "", clean)
    return re.sub(r"\.html?$", "", clean, flags=re.IGNORECASE)


def _slugify_route_value(value):
    text = str(value or "").strip().lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(
        char for char in text
        if unicodedata.category(char) != "Mn"
    )
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "san-pham"


def _route_slug_from_url(value):
    raw_value = str(value or "").strip()
    if not raw_value:
        return ""

    try:
        parsed_path = urlparse(raw_value).path
    except Exception:
        parsed_path = raw_value

    segment = parsed_path.split("/")[-1]
    return _strip_html_route_value(segment)


def _product_detail_slug(product):
    for key in ("slug", "sku"):
        value = str(product.get(key) or "").strip()
        if not value:
            continue
        if "://" in value:
            value = _route_slug_from_url(value)
        else:
            value = _strip_html_route_value(value)
        if value:
            return value

    for key in ("url", "sourceUrl", "inputUrl"):
        value = _route_slug_from_url(product.get(key))
        if value:
            return value

    source_urls = product.get("sourceUrls")
    if isinstance(source_urls, (list, tuple)):
        for item in source_urls:
            value = _route_slug_from_url(item)
            if value:
                return value
    else:
        value = _route_slug_from_url(source_urls)
        if value:
            return value

    return _slugify_route_value(
        product.get("name")
        or product.get("title")
        or product.get("id")
        or product.get("_id")
    )


def _product_has_database_identity(product):
    identity_keys = (
        "_id", "mongoId", "productKey", "id", "productId", "product_id",
        "sku", "slug", "url", "sourceUrl", "inputUrl",
    )
    if any(str(product.get(key) or "").strip() for key in identity_keys):
        return True

    source_urls = product.get("sourceUrls")
    if isinstance(source_urls, (list, tuple)):
        return any(str(item or "").strip() for item in source_urls)

    return bool(str(source_urls or "").strip())


def _product_requires_contact(product, price):
    if price <= 0:
        return True
    if not _product_has_database_identity(product):
        return True

    status_text = _normalize_search_text([
        product.get("statusLabel"),
        product.get("stockNote"),
        product.get("availability"),
    ])
    contact_status_terms = (
        "lien he", "het hang", "tam het", "ngung kinh doanh",
        "ngung ban", "sap ve hang", "chua co hang",
    )
    return any(
        _contains_search_term(status_text, term)
        for term in contact_status_terms
    )


def _product_cart_payload(
    product,
    product_id,
    detail_slug,
    detail_href,
    name,
    brand,
    image_url,
    price,
):
    def text_value(value):
        return str(value or "").strip()

    current_price = (
        _price_to_number(product.get("currentPrice"))
        or _price_to_number(product.get("price"))
        or price
    )
    original_price = _price_to_number(
        product.get("originalPrice")
        or product.get("original_price")
    )

    payload = {
        "id": text_value(product_id or detail_slug),
        "productId": text_value(
            product.get("productId")
            or product.get("product_id")
            or product_id
            or detail_slug
        ),
        "mongoId": text_value(product.get("mongoId") or product.get("_id")),
        "sku": text_value(product.get("sku") or detail_slug),
        "slug": text_value(detail_slug),
        "name": text_value(name),
        "brand": text_value(product.get("brandName") or brand),
        "category": text_value(product.get("category")),
        "image": text_value(image_url),
        "thumbnail": text_value(image_url),
        "url": text_value(detail_href),
        "price": current_price,
        "currentPrice": current_price,
        "originalPrice": original_price,
    }

    return {
        key: value
        for key, value in payload.items()
        if value not in (None, "", [], {})
    }


def _html_data_json(value):
    return _safe_text(
        json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    )


def generate_product_cards(
    product_list,
    response_text_vi=None,
    target_lang="vi",
    product_advice=None,
):
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

    advice_by_id = {
        str(item.get("product_id") or (item.get("product") or {}).get("id") or ""): item
        for item in list(product_advice or [])
        if item.get("product_id") or (item.get("product") or {}).get("id")
    }

    html += "<div class='product-list' style='display:flex;flex-wrap:wrap;gap:15px;'>"

    for product in product_list:
        product_id = str(
            product.get("id")
            or product.get("_id")
            or product.get("sku")
            or product.get("slug")
            or ""
        )
        advice_item = advice_by_id.get(product_id)
        name = str(product.get("name") or product.get("title") or "Không có tên")
        price = (
            _price_to_number(product.get("price"))
            or _price_to_number(product.get("currentPrice"))
            or _price_to_number(product.get("salePrice"))
            or _price_to_number(product.get("finalPrice"))
        )
        brand = str(product.get("brand") or "")
        category = str(product.get("category") or "")
        status_label = str(product.get("statusLabel") or product.get("stockNote") or "")
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
        for highlight in _unique_strings(
            _flatten_search_values(product.get("highlights"))
        )[:4]:
            highlight_text = html_to_text(highlight)
            if len(highlight_text) > 160:
                highlight_text = f"{highlight_text[:157].rstrip()}..."
            if highlight_text:
                suggestions.append(highlight_text)

        if advice_item:
            suggestions = []
        elif suggestions:
            pass
        elif "laptop" in product_text:
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

        advice_html = ""
        if advice_item:
            reasons = list(advice_item.get("reasons") or [])[:3]
            key_specs = list(advice_item.get("key_specs") or [])[:4]
            cautions = list(advice_item.get("cautions") or [])[:2]

            reasons_html = ""
            if reasons:
                reasons_html = (
                    "<div class='product-advice-reasons'>"
                    "<div class='product-advice-title'>Vì sao phù hợp</div>"
                    "<ul>"
                    + "".join(f"<li>{_safe_text(reason)}</li>" for reason in reasons)
                    + "</ul></div>"
                )

            specs_html = ""
            if key_specs:
                specs_html = (
                    "<div class='product-advice-specs'>"
                    "<div class='product-advice-title'>Thông số chính</div>"
                    + "".join(
                        "<div class='product-advice-spec-row'>"
                        f"<span>{_safe_text(spec.get('label'))}</span>"
                        f"<strong>{_safe_text(spec.get('value'))}</strong>"
                        "</div>"
                        for spec in key_specs
                    )
                    + "</div>"
                )

            caution_html = ""
            if cautions:
                caution_html = (
                    "<div class='product-advice-caution'>"
                    "<b>Lưu ý:</b> "
                    + " ".join(_safe_text(caution) for caution in cautions)
                    + "</div>"
                )

            advice_html = (
                "<div class='product-advice'>"
                "<div class='product-advice-badge'>Tư vấn theo nhu cầu</div>"
                f"{reasons_html}{specs_html}{caution_html}"
                "</div>"
            )

        safe_name = _safe_text(name)
        safe_brand = _safe_text(brand)
        safe_category = _safe_text(category)
        safe_image_url = _safe_text(image_url)
        safe_status = _safe_text(status_label)
        price_text = f"{price:,}đ" if price > 0 else (status_label or "Liên hệ")
        safe_price_text = _safe_text(price_text)
        status_html = (
            f"<p style='font-size:13px;margin:4px 0;color:#555;'>{safe_status}</p>"
            if status_label and status_label != price_text
            else ""
        )
        detail_slug = _product_detail_slug(product)
        detail_href = f"/{detail_slug}.html"
        safe_detail_href = _safe_text(detail_href)
        safe_cart_payload = _html_data_json(
            _product_cart_payload(
                product=product,
                product_id=product_id,
                detail_slug=detail_slug,
                detail_href=detail_href,
                name=name,
                brand=brand,
                image_url=image_url,
                price=price,
            )
        )
        requires_contact = _product_requires_contact(product, price)
        can_open_detail = _product_has_database_identity(product) and bool(detail_slug)
        contact_note_html = (
            "<p class='chatbot-product-contact-note'>"
            "S&#7843;n ph&#7849;m n&#224;y c&#7847;n li&#234;n h&#7879; shop &#273;&#7875; "
            "ki&#7875;m tra gi&#225; v&#224; t&#236;nh tr&#7841;ng h&#224;ng."
            "</p>"
            if requires_contact
            else ""
        )
        if requires_contact:
            detail_action_html = (
                "<a class='chatbot-product-action chatbot-product-detail-action' "
                f"href=\"{safe_detail_href}\" "
                f"data-chatbot-detail-path=\"{safe_detail_href}\" "
                f"aria-label=\"Xem chi ti&#7871;t {safe_name}\">"
                "Xem chi ti&#7871;t"
                "</a>"
                if can_open_detail
                else ""
            )
            product_actions_html = (
                "<div class='chatbot-product-actions contact-only'>"
                f"{detail_action_html}"
                "<a class='chatbot-product-action chatbot-product-contact-action' "
                "href=\"/lien-he\" "
                "data-chatbot-contact-path=\"/lien-he\" "
                f"aria-label=\"Li&#234;n h&#7879; t&#432; v&#7845;n {safe_name}\">"
                "Li&#234;n h&#7879; t&#432; v&#7845;n"
                "</a>"
                "</div>"
            )
        else:
            product_actions_html = (
                "<div class='chatbot-product-actions'>"
                "<a class='chatbot-product-action chatbot-product-detail-action' "
                f"href=\"{safe_detail_href}\" "
                f"data-chatbot-detail-path=\"{safe_detail_href}\" "
                f"aria-label=\"Xem chi ti&#7871;t {safe_name}\">"
                "Xem chi ti&#7871;t"
                "</a>"
                "<a class='chatbot-product-action chatbot-product-checkout-action' "
                "href=\"/checkout\" "
                "data-chatbot-checkout-path=\"/checkout\" "
                f"data-chatbot-cart-product='{safe_cart_payload}' "
                f"aria-label=\"Mua h&#224;ng {safe_name}\">"
                "Mua h&#224;ng"
                "</a>"
                "</div>"
            )

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
                {safe_price_text}
            </p>

            <p style="font-size:14px;margin:5px 0;">
                <b>{safe_brand}</b> - {safe_category}
            </p>

            {status_html}

            {suggestion_html}

            {advice_html}

            {contact_note_html}

            {product_actions_html}
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
    "details": 5,
    "description": 3,
}

SEARCH_STOPWORDS = {
    "tim", "kiem", "giup", "cho", "toi", "minh", "muon", "mua", "can",
    "goi", "y", "tu", "van", "chon", "nen", "tot",
    "xem", "san", "pham", "cac", "mot", "vai", "loai", "hang", "thuong",
    "hieu", "theo", "co", "nao", "phu", "hop", "voi", "cua", "ban", "nhe",
    "a", "la", "ve", "trong", "tren", "duoi", "shop", "cua", "hang",
    "xin", "chao", "hello", "hi", "hey", "halo", "alo",
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
    "extra battery",
    "battery kit",
    "replacement battery",
    "pin thay the",
    "bo pin",
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
    "extra battery",
    "battery kit",
    "replacement battery",
    "pin thay the",
    "bo pin",
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

    if " " in term:
        # Dùng ranh giới từ để tránh "ban la" khớp nhầm "ban lam viec".
        # Riêng dòng Galaxy S/A/M/Z thường viết liền model như "galaxy s26".
        prefix_terms = {"galaxy s", "galaxy a", "galaxy m", "galaxy z"}
        if term in prefix_terms and re.search(rf"(?<![a-z0-9]){re.escape(term)}", text):
            return True
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None

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

    # Chuẩn hóa cách nói đời thường trước khi tách concept để cả keyword và
    # CLIP text query cùng hiểu một tiêu chí duy nhất.
    query = re.sub(
        r"\b(?:pin\s+trau|pin\s+khoe|pin\s+tot|thoi\s+luong\s+pin\s+tot)\b",
        "pin lau",
        query,
    )

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


def _strip_price_terms_for_retrieval(text):
    price_unit = r"(?:trieu|tr|m|nghin|k|vnd|d)"
    number = r"\d+(?:[\.,]\d+)?"
    text = re.sub(
        rf"\b(?:tu\s+)?{number}\s*{price_unit}?\s*"
        rf"(?:den|toi|-)\s*{number}\s*{price_unit}?\b",
        " ",
        text,
    )
    text = re.sub(
        rf"\b(?:duoi|tren|nho hon|lon hon|khong qua|toi da|toi thieu|"
        rf"khoang|tam|ngan sach|gia)\s*{number}\s*{price_unit}?\b",
        " ",
        text,
    )
    text = re.sub(
        rf"\b{number}\s*(?:trieu|tr|nghin|vnd)\b",
        " ",
        text,
    )
    return re.sub(r"\s+", " ", text).strip()


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

    remaining_query = _strip_price_terms_for_retrieval(remaining_query)
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


MODEL_VARIANT_TERMS = {
    "pro", "max", "plus", "ultra", "mini", "air", "lite", "se", "fe",
    "fold", "flip",
}

MODEL_VALUE_UNITS = (
    "trieu", "tr", "nghin", "k", "m", "vnd", "d",
    "gb", "tb", "inch", "in", "hz", "w", "mah", "wh",
    "mm", "cm", "m2", "mp", "g", "thiet bi", "cong", "camera",
    "loa", "sim", "mau", "che do", "cap do", "loi", "nhan",
    "trong mot", "trong 1",
)


def _known_brand_phrases():
    """Trả về cả tên hãng chuẩn và các tên dòng rộng của hãng."""
    phrases = []
    brand_groups = globals().get("KNOWN_BRAND_ALIASES", {})
    for canonical, aliases in brand_groups.items():
        phrases.append(canonical)
        phrases.extend(aliases)
    return _unique_strings(
        _normalize_search_text(phrase)
        for phrase in phrases
        if _normalize_search_text(phrase)
    )


def _matched_brand_phrases(normalized_query):
    return [
        phrase
        for phrase in _known_brand_phrases()
        if _contains_search_term(normalized_query, phrase)
    ]


def _query_model_tokens(parsed_query):
    """Lấy token model như 15, S24, M2; bỏ số giá và số thông số."""
    normalized = parsed_query.get("normalized_query", "")
    model_tokens = []

    for token in re.findall(r"[a-z]*\d+[a-z0-9]*|\d+[a-z]+|\d+", normalized):
        if re.fullmatch(r"\d+", token):
            if int(token) >= 100000:
                continue
            unit_pattern = "|".join(re.escape(unit) for unit in MODEL_VALUE_UNITS)
            if re.search(
                rf"\b{re.escape(token)}\s*(?:{unit_pattern})\b",
                normalized,
            ):
                continue
        elif re.fullmatch(
            r"\d+(?:trieu|tr|nghin|vnd|gb|tb|inch|in|hz|w|mah|wh|mm|cm|m2|mp|k|m|g|d)",
            token,
        ):
            continue
        elif token in {"4g", "5g"}:
            continue

        if token not in model_tokens:
            model_tokens.append(token)

    return model_tokens


def _identity_query_terms(parsed_query):
    model_tokens = set(_query_model_tokens(parsed_query))
    matched_brand_tokens = {
        token
        for phrase in _matched_brand_phrases(parsed_query.get("normalized_query", ""))
        for token in re.findall(r"[a-z0-9]+", phrase)
    }
    variant_tokens = {
        token
        for token in parsed_query.get("tokens", [])
        if token in MODEL_VARIANT_TERMS
    }

    if model_tokens:
        ordered = []
        for token in parsed_query.get("tokens", []):
            if token in model_tokens or token in matched_brand_tokens or token in variant_tokens:
                if token not in ordered:
                    ordered.append(token)
        return ordered or list(model_tokens)

    return [
        token
        for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS
    ]


def _product_identity_match_score(product, parsed_query):
    """Điểm khớp tên/model độc lập với độ tương đồng ảnh CLIP."""
    normalized_query = parsed_query.get("normalized_query", "")
    if not normalized_query:
        return 0.0

    identifier_values = [
        product.get("productKey"), product.get("id"), product.get("_id"),
        product.get("productId"), product.get("product_id"), product.get("sku"),
        product.get("slug"), product.get("url"),
    ]
    name_values = [
        product.get("name"), product.get("title"), product.get("product_name"),
    ]
    normalized_identifiers = []
    for value in identifier_values:
        normalized_value = _normalize_search_text(value)
        if not normalized_value:
            continue
        if normalized_query == normalized_value:
            return 4.0
        normalized_identifiers.append(normalized_value)

    normalized_names = []
    for value in name_values:
        normalized_value = _normalize_search_text(value)
        if not normalized_value:
            continue
        if normalized_query == normalized_value:
            return 3.5
        normalized_names.append(normalized_value)

    identity_terms = _identity_query_terms(parsed_query)
    model_tokens = _query_model_tokens(parsed_query)
    has_variant_term = any(term in MODEL_VARIANT_TERMS for term in identity_terms)
    identity_text = " ".join([*normalized_names, *normalized_identifiers])

    if model_tokens:
        if all(_contains_search_term(identity_text, term) for term in identity_terms):
            return 2.5
        return 0.0

    identity_phrase = " ".join(identity_terms).strip()
    if len(identity_terms) >= 2 and identity_phrase:
        if any(_contains_search_term(text, identity_phrase) for text in normalized_names):
            return 2.25 if has_variant_term else 2.0

    return 0.0


def _query_has_explicit_model_signal(parsed_query):
    if _query_model_tokens(parsed_query):
        return True

    tokens = parsed_query.get("tokens", [])
    has_variant_term = any(token in MODEL_VARIANT_TERMS for token in tokens)
    if not has_variant_term:
        return False

    normalized = parsed_query.get("normalized_query", "")
    has_brand = bool(_matched_brand_phrases(normalized))
    has_product_group = bool(
        detect_clarify_guide_key(normalized, parsed_query, None)
    )
    return has_brand or has_product_group


def is_specific_model_query(user_message=None, parsed_query=None, matched_products=None):
    parsed_query = parsed_query or _parse_search_query(user_message)
    if _query_has_explicit_model_signal(parsed_query):
        return True

    return any(
        _product_identity_match_score(product, parsed_query) >= 2.0
        for product in list(matched_products or [])[:30]
    )


def _prioritize_specific_model_ranked(ranked_items, parsed_query, product_index):
    """Giữ đúng các biến thể model và ưu tiên biến thể có giá."""
    decorated = []
    for original_position, item in enumerate(ranked_items):
        product = item[product_index]
        identity_score = _product_identity_match_score(product, parsed_query)
        decorated.append((identity_score, original_position, item))

    has_strong_identity = any(score >= 2.0 for score, _, _ in decorated)
    if not _query_has_explicit_model_signal(parsed_query) and not has_strong_identity:
        return ranked_items

    exact_items = [entry for entry in decorated if entry[0] > 0]
    exact_items.sort(
        key=lambda entry: (
            -entry[0],
            0 if _price_to_number(entry[2][product_index].get("price", 0)) > 0 else 1,
            entry[1],
        )
    )
    return [item for _, _, item in exact_items]


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

    # Tên/model/SKU cụ thể phải thắng độ khớp category hoặc metadata chung.
    score += _product_identity_match_score(product, parsed_query) * 100.0

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

    scored_products = _prioritize_specific_model_ranked(
        scored_products,
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


def generate_unrecognized_message_reply(user_name=""):
    customer_name = _clean_chat_user_name(user_name)
    prefix = f"{_safe_text(customer_name)}, " if customer_name else ""
    return (
        f"{prefix}<strong>xin lỗi</strong>, mình chưa hiểu rõ ý bạn muốn hỏi. "
        "Bạn vui lòng nhập lại tên sản phẩm hoặc nhu cầu cụ thể hơn nhé.<br>"
        "<small>Ví dụ: laptop học tập dưới 15 triệu, tai nghe không dây, "
        "đồng hồ Garmin pin lâu.</small>"
    )


def is_unrecognized_non_product_message(user_message, product_list=None):
    """
    Chặn các câu không phải lời chào/xã giao và cũng không có tín hiệu sản phẩm.
    Route /chat đã xử lý social trước khi gọi hàm này.
    """
    normalized = _normalize_user_query(user_message)
    if not normalized:
        return False

    parsed_query = _parse_search_query(user_message)
    if not parsed_query.get("concepts") and not parsed_query.get("tokens"):
        return True

    product_intent_terms = (
        PRODUCT_REQUEST_TERMS
        + NON_PHONE_QUERY_TERMS
        + NON_PHONE_PRODUCT_TERMS
        + tuple(QUERY_ALIAS_GROUPS.keys())
    )
    if any(_contains_search_term(normalized, term) for term in product_intent_terms):
        return False

    keyword_matches, _ = search_products(
        user_message,
        product_list if product_list is not None else products,
        limit=1,
    )
    if keyword_matches:
        return False

    if _classify_product_intent_with_gemini(user_message):
        return False

    return True


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




def _looks_like_plain_normalized_text(text):
    text = str(text or "").strip()
    if not text:
        return True
    return not any(ord(character) > 127 for character in text) and text.casefold() == text


def _best_result_category_display_name(display_text, parsed_query, matched_products=None):
    matched_products = list(matched_products or [])
    if not matched_products:
        return ""

    categories, _ = _extract_top_result_context(matched_products, max_items=6)
    if not categories:
        return ""

    normalized_query = parsed_query.get("normalized_query", "")
    meaningful = parsed_query.get("meaningful_phrase", "")
    normalized_display = _normalize_search_text(display_text)
    query_text = " ".join(
        part for part in [normalized_query, meaningful, normalized_display]
        if part
    )

    best_category = ""
    best_score = 0.0
    for category in categories:
        normalized_category = _normalize_search_text(category)
        if not normalized_category:
            continue

        score = max(
            difflib.SequenceMatcher(None, normalized_query, normalized_category).ratio(),
            difflib.SequenceMatcher(None, meaningful, normalized_category).ratio(),
            difflib.SequenceMatcher(None, normalized_display, normalized_category).ratio(),
        )

        if score > best_score:
            best_category = str(category).strip()
            best_score = score

    if best_category and best_score >= 0.82:
        return best_category
    return ""


def get_product_query_display_name(user_message, parsed_query=None, matched_products=None):
    """Lấy tên nhu cầu ngắn để hiển thị, có dấu và không copy nguyên câu người dùng."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    removable_phrases = sorted(SEARCH_STOPWORDS, key=len, reverse=True)
    cleaned = f" {normalized} "
    for phrase in removable_phrases:
        if not phrase or (len(phrase) <= 1 and phrase != "y"):
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
        ("loa bluetooth", "loa Bluetooth"),
        ("loa thanh", "loa thanh"),
        ("dong ho thong minh", "đồng hồ thông minh"),
        ("dong ho", "đồng hồ"),
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
        ("balo", "balo"),
        ("tui xach", "túi xách"),
        ("ban phim", "bàn phím"),
        ("chuot", "chuột"),
        ("the nho", "thẻ nhớ"),
        ("thiet bi mang", "thiết bị mạng"),
        ("may chieu", "máy chiếu"),
        ("tv box", "TV Box"),
        ("ban ui", "bàn ủi"),
        ("ban la", "bàn là"),
        ("may xay sinh to", "máy xay sinh tố"),
        ("bep dien", "bếp điện"),
        ("can suc khoe", "cân sức khỏe"),
        ("may do huyet ap", "máy đo huyết áp"),
        ("khong day", "không dây"),
        ("co day", "có dây"),
        ("chong on", "chống ồn"),
        ("choi game", "chơi game"),
        ("pin lau", "pin lâu"),
        ("gia re", "giá rẻ"),
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
    display = " ".join(output_words[:8]).strip() or str(user_message).strip()

    category_display = _best_result_category_display_name(
        display,
        parsed_query,
        matched_products=matched_products,
    )
    if category_display:
        return category_display

    return display


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
    "hang cu", "may cu", "cu", "cu dep", "cu tray xuoc", "da kich hoat", "thu cu", "doi moi", "thu cu doi moi",
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
            fields.get("description", ""), fields.get("details", ""),
            fields.get("identifiers", ""),
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
        residual_criteria = _query_residual_criteria_tokens(
            user_message,
            parsed_query,
            guide_key=guide_key,
        )
        if (
            _has_detail_signal(user_message, parsed_query)
            or residual_criteria
            or re.search(r"\d", normalized)
        ):
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
)

CLARIFY_WEAK_WORDS = {
    "tu", "van", "giup", "chon", "mua", "hang", "tot", "nen", "can", "goi", "y"
}

_BROAD_IDENTITY_PHRASES_CACHE = None


def _has_detail_signal(user_message, parsed_query=None):
    """Kiểm tra câu có thông tin bổ sung như giá, hãng, thông số, nhu cầu dùng."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    if re.search(r"\b\d+(?:\s*(trieu|nghin|k|m|gb|tb|inch|hz|w|mah))?\b", normalized):
        return True

    return any(_contains_search_term(normalized, term) for term in CLARIFY_DETAIL_TERMS)


def _query_residual_criteria_tokens(user_message, parsed_query=None, guide_key=""):
    """Phần còn lại sau khi bỏ từ đệm, tên nhóm và hãng/dòng rộng."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")
    ignored_tokens = set(CLARIFY_WEAK_WORDS)

    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key) or {}
    for trigger in guide.get("triggers", []):
        normalized_trigger = _normalize_search_text(trigger)
        if normalized_trigger and _contains_search_term(normalized, normalized_trigger):
            ignored_tokens.update(re.findall(r"[a-z0-9]+", normalized_trigger))

    for brand_phrase in _matched_brand_phrases(normalized):
        ignored_tokens.update(re.findall(r"[a-z0-9]+", brand_phrase))

    return [
        token
        for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS and token not in ignored_tokens
    ]


def _query_matches_exact_product_identity(user_message, parsed_query=None, matched_products=None):
    global _BROAD_IDENTITY_PHRASES_CACHE

    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")

    if _BROAD_IDENTITY_PHRASES_CACHE is None:
        broad_phrases = set(_known_brand_phrases())
        for guide in PRODUCT_CLARIFY_GUIDES.values():
            broad_phrases.update(
                _normalize_search_text(trigger)
                for trigger in guide.get("triggers", [])
            )
        _BROAD_IDENTITY_PHRASES_CACHE = broad_phrases

    if normalized in _BROAD_IDENTITY_PHRASES_CACHE:
        return False

    return any(
        _product_identity_match_score(product, parsed_query) >= 3.5
        for product in list(matched_products or [])[:30]
    )


def _is_intent_only_query(user_message, parsed_query=None):
    """Câu chỉ nói ý định mua/tư vấn nhưng chưa có tên sản phẩm cụ thể."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    normalized = parsed_query.get("normalized_query", "")
    if not normalized:
        return True

    if normalized in CLARIFY_INTENT_ONLY_PATTERNS:
        return True

    concepts = parsed_query.get("concepts") or []
    tokens = [
        token for token in parsed_query.get("tokens", [])
        if token not in SEARCH_STOPWORDS
    ]
    if not concepts and not tokens:
        return True

    # Ví dụ: "tư vấn giúp", "mua hàng", "cần mua" nhưng không có danh mục/model.
    if not concepts and tokens and all(token in CLARIFY_WEAK_WORDS for token in tokens):
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
        "questions": ["Bạn muốn laptop hãng nào như Lenovo, ASUS, Acer, Dell hay HP?", "Bạn dùng laptop để học tập, văn phòng, đồ họa hay gaming?", "Tầm giá khoảng bao nhiêu?", "Cần RAM/SSD bao nhiêu?"],
        "chips": ["Lenovo", "ASUS", "Acer", "Dell", "Học tập", "Văn phòng", "Gaming", "Đồ họa", "RAM 16GB", "SSD 512GB"],
        "example": "laptop học tập dưới 15 triệu RAM 16GB",
    },
    "audio": {
        "title": "Âm thanh",
        "triggers": ["am thanh", "tai nghe", "headphone", "earphone", "earbuds", "airpods", "loa", "speaker", "soundbar"],
        "questions": ["Bạn cần tai nghe, loa hay soundbar?", "Muốn có dây hay không dây?", "Có cần chống ồn, bass mạnh hoặc pin lâu không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Tai nghe", "Loa", "Soundbar", "Không dây", "Có dây", "Chống ồn", "Bass mạnh", "Pin lâu"],
        "example": "tai nghe không dây chống ồn dưới 2 triệu",
    },
    "headphones": {
        "title": "Tai nghe",
        "triggers": ["tai nghe", "headphone", "earphone", "earbuds", "airpods", "headset"],
        "questions": ["Bạn muốn tai nghe có dây hay không dây?", "Dùng để nghe nhạc, học online, làm việc hay chơi game?", "Có cần chống ồn, mic tốt, bass mạnh hoặc pin lâu không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Không dây", "Có dây", "Chống ồn", "Gaming", "Bass mạnh", "Pin lâu", "AirPods", "Sony"],
        "example": "tai nghe không dây chống ồn dưới 2 triệu",
    },
    "speaker": {
        "title": "Loa",
        "triggers": ["loa bluetooth", "loa", "speaker", "portable speaker"],
        "questions": ["Bạn cần loa bluetooth, loa vi tính hay loa karaoke?", "Dùng trong phòng, ngoài trời hay mang đi du lịch?", "Ưu tiên bass mạnh, chống nước, pin lâu hay công suất lớn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Bluetooth", "Karaoke", "Ngoài trời", "Bass mạnh", "Chống nước", "Pin lâu", "JBL", "Harman Kardon"],
        "example": "loa bluetooth chống nước dưới 2 triệu",
    },
    "soundbar": {
        "title": "Soundbar",
        "triggers": ["soundbar", "loa thanh", "loa soundbar"],
        "questions": ["Bạn dùng soundbar cho tivi bao nhiêu inch hoặc phòng rộng khoảng bao nhiêu?", "Có cần subwoofer, Dolby Atmos hay kết nối Bluetooth/HDMI ARC không?", "Ưu tiên nghe nhạc, xem phim hay karaoke?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Subwoofer", "Dolby Atmos", "Bluetooth", "HDMI ARC", "Xem phim", "Karaoke", "Samsung", "LG"],
        "example": "soundbar có subwoofer dưới 5 triệu",
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

    "robot_vacuum": {
        "title": "Robot hút bụi",
        "triggers": ["robot hut bui", "may hut bui robot", "robot vacuum"],
        "questions": ["Bạn dùng robot hút bụi cho nhà khoảng bao nhiêu m²?", "Có cần lau nhà, tự giặt giẻ, tự đổ rác hoặc tránh vật cản không?", "Ưu tiên lực hút mạnh, pin lâu, bản đồ thông minh hay độ ồn thấp?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Có lau nhà", "Tự đổ rác", "Tự giặt giẻ", "Lực hút mạnh", "Bản đồ thông minh", "Nhà nhiều tầng", "Roborock", "Dreame"],
        "example": "robot hút bụi có lau nhà dưới 8 triệu",
    },
    "handheld_vacuum": {
        "title": "Máy hút bụi cầm tay",
        "triggers": ["may hut bui cam tay", "hut bui cam tay", "handheld vacuum", "cordless vacuum"],
        "questions": ["Bạn dùng máy hút bụi cầm tay cho nhà, xe hơi hay sofa/nệm?", "Cần máy không dây, lực hút mạnh hoặc pin lâu không?", "Có cần nhiều đầu hút, lọc HEPA hoặc dễ vệ sinh không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Không dây", "Cho xe hơi", "Cho sofa", "Lực hút mạnh", "Pin lâu", "Lọc HEPA", "Nhẹ", "Tineco"],
        "example": "máy hút bụi cầm tay không dây dưới 3 triệu",
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
    "backpack": {
        "title": "Balo / Túi xách",
        "triggers": ["balo laptop", "balo", "backpack", "tui xach", "cap laptop"],
        "questions": ["Bạn cần balo/túi cho laptop bao nhiêu inch hay dùng hằng ngày?", "Có cần chống nước, chống sốc hoặc nhiều ngăn không?", "Ưu tiên gọn nhẹ, thời trang hay dung tích lớn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Laptop 14 inch", "Laptop 15.6 inch", "Chống nước", "Chống sốc", "Nhiều ngăn", "Gọn nhẹ", "Du lịch", "Giá tốt"],
        "example": "balo laptop chống nước dưới 1 triệu",
    },
    "laptop_sleeve": {
        "title": "Túi chống sốc laptop",
        "triggers": ["tui chong soc", "tui laptop", "bao laptop", "sleeve laptop", "laptop sleeve"],
        "questions": ["Bạn cần túi chống sốc cho laptop bao nhiêu inch?", "Muốn dạng mỏng, có quai xách hay nhiều ngăn?", "Có cần chống nước hoặc lớp đệm dày không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["13 inch", "14 inch", "15.6 inch", "Chống nước", "Đệm dày", "Có quai", "Mỏng nhẹ", "Giá tốt"],
        "example": "túi chống sốc laptop 14 inch chống nước",
    },
    "keyboard": {
        "title": "Bàn phím",
        "triggers": ["ban phim co", "ban phim bluetooth", "ban phim khong day", "ban phim", "keyboard", "mechanical keyboard"],
        "questions": ["Bạn cần bàn phím văn phòng, gaming hay cơ?", "Muốn có dây, không dây hay Bluetooth?", "Ưu tiên layout fullsize/TKL, switch nào, có đèn RGB không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Bàn phím cơ", "Không dây", "Bluetooth", "Gaming", "Văn phòng", "TKL", "RGB", "Giá tốt"],
        "example": "bàn phím cơ không dây dưới 2 triệu",
    },
    "mouse": {
        "title": "Chuột",
        "triggers": ["chuot gaming", "chuot bluetooth", "chuot khong day", "chuot", "mouse", "gaming mouse"],
        "questions": ["Bạn cần chuột văn phòng hay gaming?", "Muốn có dây, không dây hay Bluetooth?", "Ưu tiên nhẹ, pin lâu, DPI cao hay form cầm thoải mái?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Không dây", "Bluetooth", "Gaming", "Văn phòng", "DPI cao", "Nhẹ", "Pin lâu", "Logitech"],
        "example": "chuột không dây pin lâu dưới 1 triệu",
    },
    "memory_usb": {
        "title": "Thẻ nhớ / USB",
        "triggers": ["the nho", "usb", "usb 3.0", "usb type c", "memory card", "sd card", "microsd"],
        "questions": ["Bạn cần thẻ nhớ hay USB?", "Dung lượng mong muốn là bao nhiêu GB?", "Cần tốc độ cao để quay 4K, lưu tài liệu hay dùng cho camera/điện thoại?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["USB", "Thẻ nhớ", "64GB", "128GB", "256GB", "Type-C", "Tốc độ cao", "Camera"],
        "example": "thẻ nhớ 128GB cho camera tốc độ cao",
    },
    "gaming_gear": {
        "title": "Gaming Gear / Playstation",
        "triggers": ["gaming gear", "playstation", "ps5", "tay cam", "tay cam choi game", "controller"],
        "questions": ["Bạn cần tay cầm, phụ kiện console hay gear chơi game nào?", "Dùng cho PC, PlayStation, điện thoại hay Nintendo?", "Có cần không dây, rung phản hồi hoặc độ trễ thấp không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["PS5", "Tay cầm", "Không dây", "PC", "Điện thoại", "Độ trễ thấp", "RGB", "Giá tốt"],
        "example": "tay cầm chơi game không dây cho PC dưới 1 triệu",
    },
    "sim_card": {
        "title": "Sim 4G / 5G",
        "triggers": ["sim 4g", "sim 5g", "sim data", "esim", "sim so", "sim"],
        "questions": ["Bạn cần sim nghe gọi, data hay eSIM?", "Muốn gói dung lượng/thời hạn bao lâu?", "Ưu tiên nhà mạng nào hoặc vùng sử dụng ở đâu?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Data", "Nghe gọi", "eSIM", "4G", "5G", "Viettel", "Vinaphone", "Mobifone"],
        "example": "sim data 4G dùng 1 tháng giá rẻ",
    },
    "network_device": {
        "title": "Thiết bị mạng",
        "triggers": ["thiet bi mang", "bo phat wifi", "router wifi", "wifi mesh", "mesh wifi", "router", "modem", "repeater", "bo kich song wifi"],
        "questions": ["Bạn cần router, mesh WiFi, modem hay bộ kích sóng?", "Diện tích nhà/phòng khoảng bao nhiêu m²?", "Cần WiFi 6, nhiều băng tần, chịu tải nhiều thiết bị hay xuyên tường tốt không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Router", "Mesh WiFi", "WiFi 6", "Kích sóng", "Nhà nhiều tầng", "Nhiều thiết bị", "TP-Link", "Giá tốt"],
        "example": "router WiFi 6 cho nhà 2 tầng dưới 2 triệu",
    },
    "gimbal": {
        "title": "Gimbal",
        "triggers": ["gimbal", "tay cam chong rung", "chong rung dien thoai"],
        "questions": ["Bạn cần gimbal cho điện thoại, máy ảnh hay camera hành trình?", "Ưu tiên chống rung tốt, nhỏ gọn hay pin lâu?", "Có cần tracking, tripod hoặc điều khiển từ xa không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cho điện thoại", "Cho máy ảnh", "Nhỏ gọn", "Pin lâu", "Tracking", "Tripod", "DJI", "Giá tốt"],
        "example": "gimbal điện thoại nhỏ gọn dưới 2 triệu",
    },
    "flycam": {
        "title": "Flycam",
        "triggers": ["flycam", "drone", "may bay camera"],
        "questions": ["Bạn cần flycam để quay du lịch, học bay hay làm nội dung?", "Ưu tiên camera 4K, chống rung, bay lâu hay nhỏ gọn?", "Có cần cảm biến tránh vật cản hoặc combo nhiều pin không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["4K", "Nhỏ gọn", "Bay lâu", "Tránh vật cản", "Combo nhiều pin", "DJI", "Du lịch", "Giá tốt"],
        "example": "flycam 4K nhỏ gọn dưới 10 triệu",
    },
    "hub_adapter": {
        "title": "Hub chuyển đổi",
        "triggers": ["hub chuyen doi", "hub type c", "usb hub", "type c hub", "adapter chuyen doi", "dock chuyen doi"],
        "questions": ["Bạn cần hub cho laptop, tablet hay điện thoại?", "Cần cổng HDMI, USB-A, LAN, SD card hay sạc PD?", "Muốn hỗ trợ 4K, nhiều cổng hay nhỏ gọn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Type-C", "HDMI", "USB-A", "LAN", "SD card", "Sạc PD", "4K", "MacBook"],
        "example": "hub Type-C có HDMI và sạc PD cho MacBook",
    },
    "projector": {
        "title": "Máy chiếu",
        "triggers": ["may chieu", "projector", "mini projector"],
        "questions": ["Bạn dùng máy chiếu cho phòng họp, học tập hay xem phim?", "Cần độ phân giải HD, Full HD hay 4K?", "Có cần Android TV, loa tích hợp, WiFi/Bluetooth hoặc nhỏ gọn không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Mini", "Full HD", "4K", "Android TV", "WiFi", "Bluetooth", "Xem phim", "Văn phòng"],
        "example": "máy chiếu mini Full HD dưới 5 triệu",
    },
    "tv_box": {
        "title": "TV Box",
        "triggers": ["android tv box", "tivi box", "tv box", "mi box", "google tv box"],
        "questions": ["Bạn dùng TV Box cho tivi thường hay smart TV cần nâng cấp?", "Cần Android TV/Google TV, 4K, điều khiển giọng nói hay nhiều app?", "Ưu tiên RAM/bộ nhớ bao nhiêu hoặc thương hiệu nào?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Google TV", "Android TV", "4K", "Điều khiển giọng nói", "Netflix", "YouTube", "Xiaomi", "Giá tốt"],
        "example": "TV Box 4K Google TV dưới 2 triệu",
    },
    "heater": {
        "title": "Máy sưởi / Quạt sưởi",
        "triggers": ["may suoi", "quat suoi", "may suoi quat suoi", "heater", "space heater"],
        "questions": ["Bạn dùng máy sưởi cho phòng khoảng bao nhiêu m²?", "Muốn quạt sưởi, sưởi gốm hay sưởi dầu?", "Có cần chống quá nhiệt, hẹn giờ, ít ồn hoặc tiết kiệm điện không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Quạt sưởi", "Sưởi gốm", "Sưởi dầu", "Phòng nhỏ", "Hẹn giờ", "Ít ồn", "An toàn", "Giá tốt"],
        "example": "quạt sưởi cho phòng nhỏ dưới 1 triệu",
    },
    "iron": {
        "title": "Bàn ủi",
        "triggers": ["ban ui hoi nuoc", "ban ui", "ban la", "iron", "steam iron"],
        "questions": ["Bạn cần bàn ủi khô, hơi nước hay bàn ủi đứng?", "Ưu tiên công suất mạnh, chống dính, phun hơi mạnh hay nhỏ gọn?", "Dùng hằng ngày, đi du lịch hay cho gia đình?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Hơi nước", "Bàn ủi đứng", "Chống dính", "Phun hơi mạnh", "Nhỏ gọn", "Du lịch", "Gia đình", "Giá tốt"],
        "example": "bàn ủi hơi nước dưới 1 triệu",
    },
    "electric_kettle": {
        "title": "Ấm siêu tốc",
        "triggers": ["am sieu toc", "binh dun sieu toc", "binh dun", "electric kettle", "kettle"],
        "questions": ["Bạn cần ấm siêu tốc dung tích bao nhiêu lít?", "Muốn vỏ inox, thủy tinh hay nhựa an toàn?", "Có cần giữ nhiệt, tự ngắt, điều chỉnh nhiệt độ không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["1.5L", "1.8L", "Inox", "Thủy tinh", "Giữ nhiệt", "Tự ngắt", "Điều chỉnh nhiệt", "Giá tốt"],
        "example": "ấm siêu tốc inox 1.8 lít dưới 500 nghìn",
    },
    "blender": {
        "title": "Máy xay sinh tố",
        "triggers": ["may xay sinh to", "may xay da nang", "may xay", "blender"],
        "questions": ["Bạn cần máy xay sinh tố cá nhân, gia đình hay đa năng?", "Muốn xay đá, xay hạt, cối thủy tinh hay cối nhựa?", "Ưu tiên công suất mạnh, dễ vệ sinh hay nhỏ gọn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cá nhân", "Gia đình", "Đa năng", "Xay đá", "Cối thủy tinh", "Công suất mạnh", "Dễ vệ sinh", "Giá tốt"],
        "example": "máy xay sinh tố cối thủy tinh dưới 1 triệu",
    },
    "juicer": {
        "title": "Máy ép trái cây",
        "triggers": ["may ep trai cay", "may ep cham", "may ep", "juicer", "slow juicer"],
        "questions": ["Bạn muốn máy ép nhanh hay máy ép chậm?", "Dùng cho cá nhân hay gia đình?", "Ưu tiên ép kiệt bã, dễ vệ sinh, ít ồn hay công suất mạnh?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Ép chậm", "Ép nhanh", "Gia đình", "Ít ồn", "Dễ vệ sinh", "Ép kiệt bã", "Nhỏ gọn", "Giá tốt"],
        "example": "máy ép chậm dễ vệ sinh dưới 3 triệu",
    },
    "nut_milk_maker": {
        "title": "Máy làm sữa hạt",
        "triggers": ["may lam sua hat", "sua hat", "nut milk maker"],
        "questions": ["Bạn cần máy làm sữa hạt dung tích bao nhiêu lít?", "Có cần tự vệ sinh, hẹn giờ, nấu cháo/soup hoặc xay mịn không?", "Dùng cho cá nhân hay gia đình?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["1.2L", "1.75L", "Tự vệ sinh", "Hẹn giờ", "Xay mịn", "Nấu cháo", "Gia đình", "Giá tốt"],
        "example": "máy làm sữa hạt tự vệ sinh dưới 3 triệu",
    },
    "electric_stove": {
        "title": "Bếp điện",
        "triggers": ["bep dien tu", "bep hong ngoai", "bep dien", "induction cooker", "electric stove"],
        "questions": ["Bạn cần bếp từ, bếp hồng ngoại hay bếp điện đơn?", "Dùng cho gia đình, phòng trọ hay nấu lẩu?", "Có cần nhiều mức nhiệt, hẹn giờ, khóa an toàn hoặc kèm nồi không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Bếp từ", "Hồng ngoại", "Bếp đơn", "Hẹn giờ", "Khóa an toàn", "Kèm nồi", "Phòng trọ", "Giá tốt"],
        "example": "bếp điện từ đơn dưới 1 triệu",
    },
    "pressure_cooker": {
        "title": "Nồi áp suất",
        "triggers": ["noi ap suat", "pressure cooker"],
        "questions": ["Bạn cần nồi áp suất dung tích bao nhiêu lít?", "Dùng cho gia đình mấy người?", "Có cần nhiều chế độ nấu, chống dính, hẹn giờ hoặc dễ vệ sinh không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["5L", "6L", "Điện tử", "Nhiều chế độ", "Hẹn giờ", "Chống dính", "Gia đình", "Giá tốt"],
        "example": "nồi áp suất điện 5 lít dưới 2 triệu",
    },
    "slow_cooker": {
        "title": "Nồi nấu chậm",
        "triggers": ["noi nau cham", "slow cooker"],
        "questions": ["Bạn cần nồi nấu chậm dung tích bao nhiêu lít?", "Dùng nấu cháo, hầm xương, chưng yến hay nấu ăn dặm?", "Có cần hẹn giờ, giữ ấm hoặc lòng nồi sứ không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Nấu cháo", "Hầm", "Ăn dặm", "Chưng yến", "Hẹn giờ", "Giữ ấm", "Lòng sứ", "Giá tốt"],
        "example": "nồi nấu chậm nấu cháo cho bé dưới 1 triệu",
    },
    "hotpot_cooker": {
        "title": "Nồi lẩu điện",
        "triggers": ["noi lau dien", "noi lau", "electric hotpot", "hotpot cooker"],
        "questions": ["Bạn cần nồi lẩu dung tích bao nhiêu lít?", "Dùng cho mấy người?", "Có cần chống dính, nhiều mức nhiệt, kèm xửng hấp hoặc dễ vệ sinh không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["2-3 người", "4-6 người", "Chống dính", "Nhiều mức nhiệt", "Kèm xửng hấp", "Dễ vệ sinh", "Giá tốt"],
        "example": "nồi lẩu điện chống dính dưới 1 triệu",
    },
    "health_scale": {
        "title": "Cân sức khỏe",
        "triggers": ["can suc khoe", "can dien tu", "smart scale", "body scale"],
        "questions": ["Bạn cần cân sức khỏe cơ bản hay cân thông minh?", "Có cần đo mỡ, cơ, BMI hoặc kết nối app không?", "Dùng cho cá nhân hay cả gia đình?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cân thông minh", "Đo mỡ", "BMI", "Kết nối app", "Gia đình", "Pin lâu", "Xiaomi", "Giá tốt"],
        "example": "cân sức khỏe thông minh kết nối app dưới 1 triệu",
    },
    "water_flosser": {
        "title": "Máy tăm nước",
        "triggers": ["may tam nuoc", "tam nuoc", "water flosser"],
        "questions": ["Bạn cần máy tăm nước cầm tay hay để bàn?", "Ưu tiên pin lâu, nhiều chế độ, bình nước lớn hay chống nước?", "Dùng cho niềng răng, nướu nhạy cảm hay gia đình?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Cầm tay", "Để bàn", "Niềng răng", "Pin lâu", "Nhiều chế độ", "Bình lớn", "Chống nước", "Giá tốt"],
        "example": "máy tăm nước cầm tay cho niềng răng dưới 1 triệu",
    },
    "nose_trimmer": {
        "title": "Máy tỉa lông mũi",
        "triggers": ["may tia long mui", "tia long mui", "nose trimmer"],
        "questions": ["Bạn cần máy tỉa lông mũi nhỏ gọn hay đa năng?", "Có cần chống nước, pin sạc hoặc đầu thay thế không?", "Dùng cá nhân hay mang đi du lịch?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Nhỏ gọn", "Đa năng", "Chống nước", "Pin sạc", "Du lịch", "Đầu thay thế", "Giá tốt"],
        "example": "máy tỉa lông mũi chống nước dưới 500 nghìn",
    },
    "hair_removal": {
        "title": "Máy triệt lông",
        "triggers": ["may triet long", "triet long", "ipl hair removal", "hair removal"],
        "questions": ["Bạn cần máy triệt lông cho vùng nào?", "Muốn công nghệ IPL, nhiều mức năng lượng hay đầu triệt riêng?", "Ưu tiên dùng tại nhà, an toàn cho da nhạy cảm hay nhanh gọn?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["IPL", "Da nhạy cảm", "Dùng tại nhà", "Nhiều mức năng lượng", "Toàn thân", "Vùng mặt", "Philips", "Giá tốt"],
        "example": "máy triệt lông IPL dùng tại nhà dưới 4 triệu",
    },
    "blood_pressure_monitor": {
        "title": "Máy đo huyết áp",
        "triggers": ["may do huyet ap", "do huyet ap", "blood pressure monitor"],
        "questions": ["Bạn cần máy đo huyết áp bắp tay hay cổ tay?", "Dùng cho cá nhân hay người lớn tuổi trong gia đình?", "Có cần bộ nhớ nhiều người dùng, cảnh báo nhịp tim hoặc màn hình lớn không?", "Tầm giá khoảng bao nhiêu?"],
        "chips": ["Bắp tay", "Cổ tay", "Người lớn tuổi", "Màn hình lớn", "Bộ nhớ", "Cảnh báo nhịp tim", "Omron", "Giá tốt"],
        "example": "máy đo huyết áp bắp tay màn hình lớn dưới 1 triệu",
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
CATEGORY_FALLBACK_BLOCKED_GUIDE_KEYS = BROAD_GUIDE_KEYS | {"tradein", "used"}
GUIDE_PRIORITY = {
    "phone": 120,
    "tablet": 120,
    "laptop": 120,
    "microphone": 120,
    "audio": 115,
    "headphones": 130,
    "speaker": 130,
    "soundbar": 130,
    "smartwatch": 120,
    "camera": 120,
    "tv": 120,
    "pc": 120,
    "monitor": 120,
    "printer": 120,
    # Nhóm sản phẩm con: ưu tiên cao hơn nhóm lớn để "máy hút bụi" không rơi vào "Đồ gia dụng",
    # "tủ lạnh" không rơi vào "Điện máy", "củ sạc" không rơi vào "Phụ kiện".
    "robot_vacuum": 130,
    "handheld_vacuum": 130,
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
    "backpack": 130,
    "laptop_sleeve": 130,
    "keyboard": 130,
    "mouse": 130,
    "memory_usb": 130,
    "gaming_gear": 130,
    "sim_card": 130,
    "network_device": 130,
    "gimbal": 130,
    "flycam": 130,
    "hub_adapter": 130,
    "projector": 130,
    "tv_box": 130,
    "heater": 130,
    "iron": 130,
    "electric_kettle": 130,
    "blender": 130,
    "juicer": 130,
    "nut_milk_maker": 130,
    "electric_stove": 130,
    "pressure_cooker": 130,
    "slow_cooker": 130,
    "hotpot_cooker": 130,
    "health_scale": 130,
    "water_flosser": 130,
    "nose_trimmer": 130,
    "hair_removal": 130,
    "blood_pressure_monitor": 130,
    "beauty": 75,
    "home_appliance": 70,
    "electric_appliance": 70,
    "accessory": 65,
    "tradein": 80,
    "used": 75,
    "promotion": 60,
    "tech_news": 50,
}


def _best_guide_key_from_text(text, allow_broad=True):
    """Tìm đúng từng sản phẩm/nhóm nhỏ từ text, không gộp menu lớn."""
    normalized_text = _normalize_search_text(text)
    best_key = ""
    best_score = (-1, -1, -1)

    for key, guide in PRODUCT_CLARIFY_GUIDES.items():
        if not allow_broad and key in CATEGORY_FALLBACK_BLOCKED_GUIDE_KEYS:
            continue

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

    smartphone_brand_terms = ("samsung", "xiaomi", "oppo", "realme", "vivo")
    if any(
        _contains_search_term(normalized, brand)
        for brand in smartphone_brand_terms
    ):
        return "phone"

    # Fallback rất nhẹ: chỉ dùng matched_products khi câu người dùng không có
    # trigger sản phẩm nào, ví dụ "loại này dưới 5 triệu".
    category_text = _normalize_search_text([
        product.get("category")
        for product in list(matched_products or [])[:8]
    ])
    return _best_guide_key_from_text(category_text, allow_broad=False)


# Bộ lọc loại sản phẩm chi tiết, tách riêng từng mục menu.
# Nếu người dùng hỏi tivi thì chỉ tivi; hỏi điện máy thì chỉ tủ lạnh/máy lạnh/máy giặt...;
# hỏi mic thu âm thì không trả tai nghe/loa; hỏi tablet thì không trả ốp iPad.
PRODUCT_GROUP_MATCH_TERMS = {
    "phone": {
        "include": ["dien thoai", "smartphone", "mobile phone", "iphone", "samsung galaxy", "galaxy z", "galaxy s", "galaxy a", "galaxy m"],
        "exclude": ["tablet", "ipad", "may tinh bang", "op lung", "case", "cover", "bao da", "dan man hinh", "cuong luc", "kinh cuong luc", "cap sac", "cu sac", "charger", "cable", "pin du phong", "sac du phong", "extra battery", "battery kit", "replacement battery", "pin thay the", "bo pin", "phu kien"],
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
    "headphones": {
        "include": ["tai nghe", "headphone", "earphone", "earbuds", "airpods", "headset"],
        "exclude": ["loa", "speaker", "soundbar", "mic thu am", "micro thu am", "microphone"],
    },
    "speaker": {
        "include": ["loa bluetooth", "loa", "speaker", "portable speaker"],
        "exclude": ["tai nghe", "headphone", "earphone", "soundbar", "loa thanh", "mic thu am", "microphone"],
    },
    "soundbar": {
        "include": ["soundbar", "loa thanh", "loa soundbar"],
        "exclude": ["tai nghe", "headphone", "earphone", "loa bluetooth", "portable speaker", "mic thu am", "microphone"],
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

    "robot_vacuum": {
        "include": ["robot hut bui", "may hut bui robot", "robot vacuum"],
        "exclude": ["may hut bui cam tay", "handheld vacuum", "phu kien", "bo loc thay the"],
    },
    "handheld_vacuum": {
        "include": ["may hut bui cam tay", "hut bui cam tay", "handheld vacuum", "cordless vacuum"],
        "exclude": ["robot hut bui", "may hut bui robot", "phu kien", "bo loc thay the"],
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
        "exclude": ["bot giat", "phu kien", "tui giat", "ke xep chong", "ke may giat", "chan de may giat"],
    },
    "dryer": {
        "include": ["may say quan ao", "may say", "dryer", "clothes dryer"],
        "exclude": ["may say toc", "hair dryer", "phu kien", "ke xep chong"],
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
    "backpack": {
        "include": ["balo", "backpack", "tui xach", "cap laptop"],
        "exclude": ["op lung", "cap sac", "cu sac", "pin du phong", "tui chong soc"],
    },
    "laptop_sleeve": {
        "include": ["tui chong soc", "tui laptop", "bao laptop", "sleeve laptop", "laptop sleeve"],
        "exclude": ["balo", "backpack"],
    },
    "keyboard": {
        "include": ["ban phim", "keyboard", "mechanical keyboard"],
        "exclude": ["chuot", "mouse", "ke tay", "palm rest", "op lung", "cap sac", "cu sac", "tablet", "may tinh bang", "ipad", "matepad", "galaxy tab", "kem ban phim"],
    },
    "mouse": {
        "include": ["chuot", "mouse", "gaming mouse"],
        "exclude": ["ban phim", "keyboard", "op lung", "cap sac"],
    },
    "memory_usb": {
        "include": ["the nho", "usb", "memory card", "sd card", "microsd"],
        "exclude": ["cap sac", "hub", "adapter"],
    },
    "gaming_gear": {
        "include": ["gaming gear", "playstation", "ps5", "tay cam", "tay cam choi game", "controller"],
        "exclude": ["ban phim", "chuot", "keyboard", "mouse"],
    },
    "sim_card": {
        "include": ["sim 4g", "sim 5g", "sim data", "esim", "sim so", "sim"],
        "exclude": ["khay sim", "dien thoai"],
    },
    "network_device": {
        "include": ["thiet bi mang", "bo phat wifi", "router wifi", "wifi mesh", "mesh wifi", "router", "modem", "repeater", "bo kich song wifi"],
        "exclude": ["camera wifi", "may in wifi", "tv box"],
    },
    "gimbal": {
        "include": ["gimbal", "tay cam chong rung", "chong rung dien thoai"],
        "exclude": ["tay cam choi game", "controller"],
    },
    "flycam": {
        "include": ["flycam", "drone", "may bay camera"],
        "exclude": ["camera hanh trinh", "camera wifi"],
    },
    "hub_adapter": {
        "include": ["hub chuyen doi", "hub type c", "usb hub", "type c hub", "adapter chuyen doi", "dock chuyen doi"],
        "exclude": ["cu sac", "wall charger", "sac nhanh"],
    },
    "projector": {
        "include": ["may chieu", "projector", "mini projector"],
        "exclude": ["man hinh", "monitor", "tivi", "tv"],
    },
    "tv_box": {
        "include": ["android tv box", "tivi box", "tv box", "mi box", "google tv box"],
        "exclude": ["tivi", "smart tv", "smart tivi", "man hinh", "monitor"],
    },
    "heater": {
        "include": ["may suoi", "quat suoi", "may suoi quat suoi", "heater", "space heater"],
        "exclude": ["quat dien", "quat mini", "fan laptop", "fan cpu"],
    },
    "iron": {
        "include": ["ban ui", "ban la", "iron", "steam iron"],
        "exclude": ["may tao kieu toc", "curling iron"],
    },
    "electric_kettle": {
        "include": ["am sieu toc", "binh dun sieu toc", "binh dun", "electric kettle", "kettle"],
        "exclude": ["binh nuoc", "may loc nuoc"],
    },
    "blender": {
        "include": ["may xay sinh to", "may xay da nang", "may xay", "blender"],
        "exclude": ["may ep", "may lam sua hat"],
    },
    "juicer": {
        "include": ["may ep trai cay", "may ep cham", "may ep", "juicer", "slow juicer"],
        "exclude": ["may xay", "may lam sua hat"],
    },
    "nut_milk_maker": {
        "include": ["may lam sua hat", "sua hat", "nut milk maker"],
        "exclude": ["may xay", "may ep"],
    },
    "electric_stove": {
        "include": ["bep dien tu", "bep hong ngoai", "bep dien", "induction cooker", "electric stove"],
        "exclude": ["noi com", "noi lau"],
    },
    "pressure_cooker": {
        "include": ["noi ap suat", "pressure cooker"],
        "exclude": ["noi com", "noi lau", "noi chien"],
    },
    "slow_cooker": {
        "include": ["noi nau cham", "slow cooker"],
        "exclude": ["noi com", "noi ap suat", "noi lau"],
    },
    "hotpot_cooker": {
        "include": ["noi lau dien", "noi lau", "electric hotpot", "hotpot cooker"],
        "exclude": ["noi com", "noi ap suat", "noi chien"],
    },
    "health_scale": {
        "include": ["can suc khoe", "can dien tu", "smart scale", "body scale"],
        "exclude": ["can nha bep"],
    },
    "water_flosser": {
        "include": ["may tam nuoc", "tam nuoc", "water flosser"],
        "exclude": ["binh nuoc", "may loc nuoc"],
    },
    "nose_trimmer": {
        "include": ["may tia long mui", "tia long mui", "nose trimmer"],
        "exclude": ["tong do", "may cao rau", "may triet long"],
    },
    "hair_removal": {
        "include": ["may triet long", "triet long", "ipl hair removal", "hair removal"],
        "exclude": ["may tia long mui", "tong do", "may cao rau"],
    },
    "blood_pressure_monitor": {
        "include": ["may do huyet ap", "do huyet ap", "blood pressure monitor"],
        "exclude": ["dong ho", "smartwatch"],
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

    if guide_key == "phone":
        return _product_is_phone_device(product)

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


def _is_plain_guide_query(parsed_query, guide_key):
    """Câu chỉ còn đúng tên sản phẩm/category sau khi bỏ từ ý định như 'tư vấn', 'mua'."""
    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key) or {}
    normalized = parsed_query.get("normalized_query", "")
    meaningful = _normalize_search_text(parsed_query.get("meaningful_phrase", ""))
    candidates = {normalized, meaningful}
    candidates.discard("")

    for trigger in guide.get("triggers", []):
        normalized_trigger = _normalize_search_text(trigger)
        if normalized_trigger and normalized_trigger in candidates:
            return True

    if re.search(r"\d", normalized):
        return False

    return False


def is_broad_product_query(user_message, parsed_query=None, matched_products=None):
    """Câu chỉ nêu tên sản phẩm/mục lớn nhưng chưa có tiêu chí lọc cụ thể."""
    parsed_query = parsed_query or _parse_search_query(user_message)

    guide_key = detect_clarify_guide_key(user_message, parsed_query, matched_products)
    direct_guide_key = _best_guide_key_from_text(
        parsed_query.get("normalized_query", "")
    )
    has_broad_brand = bool(
        _matched_brand_phrases(parsed_query.get("normalized_query", ""))
    )
    if not guide_key and not has_broad_brand:
        return False

    if guide_key and _is_plain_guide_query(parsed_query, guide_key):
        return True

    # Loại sản phẩm + hãng đã là một bộ lọc có nghĩa. Ví dụ "Lenovo" rồi
    # "laptop" phải trả kết quả cho laptop Lenovo, không hỏi lại lần nữa.
    # Một hãng đứng riêng như "Samsung" vẫn được hỏi rõ loại sản phẩm.
    if direct_guide_key and has_broad_brand:
        return False

    normalized = parsed_query.get("normalized_query", "")
    if re.search(r"\d", normalized):
        return False

    if _has_detail_signal(user_message, parsed_query):
        return False

    residual_tokens = _query_residual_criteria_tokens(
        user_message,
        parsed_query,
        guide_key=guide_key,
    )
    # Chỉ hỏi lại khi câu còn đúng tên nhóm/hãng/dòng rộng. Bất kỳ từ mô tả
    # nào còn lại (pin trâu, có bút, mỏng nhẹ, màu đen...) đều là tiêu chí.
    return not residual_tokens and (bool(guide_key) or has_broad_brand)


def get_clarification_suggestions(
    user_message,
    parsed_query=None,
    matched_products=None,
):
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    guide_key = detect_clarify_guide_key(
        user_message,
        parsed_query,
        matched_products,
    )
    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key)
    if guide:
        return _unique_strings(guide.get("chips", []))[:10]

    categories, brands = _extract_top_result_context(
        matched_products,
        max_items=6,
    )
    return _unique_strings([*brands[:4], *categories[:4]])[:8]


BRAND_DISPLAY_NAMES = {
    "apple": "Apple",
    "samsung": "Samsung",
    "xiaomi": "Xiaomi",
    "oppo": "OPPO",
    "realme": "realme",
    "vivo": "vivo",
    "asus": "ASUS",
    "acer": "Acer",
    "hp": "HP",
    "dell": "Dell",
    "lenovo": "Lenovo",
    "msi": "MSI",
    "lg": "LG",
    "sony": "Sony",
    "jbl": "JBL",
    "logitech": "Logitech",
    "anker": "Anker",
    "baseus": "Baseus",
    "havit": "Havit",
    "philips": "Philips",
    "panasonic": "Panasonic",
    "garmin": "Garmin",
}

BRAND_ALIAS_DISPLAY_NAMES = {
    "iphone": "iPhone",
    "ipad": "iPad",
    "macbook": "MacBook",
    "airpods": "AirPods",
}


def _clarification_brand_fields(value):
    """Lấy hãng/dòng hãng theo dạng hiển thị, không phụ thuộc thứ tự người nhập."""
    normalized = _normalize_user_query(value)
    fields = []

    for canonical, aliases in KNOWN_BRAND_ALIASES.items():
        candidates = _unique_strings([canonical, *aliases])
        matched_aliases = [
            phrase for phrase in candidates
            if _contains_search_term(normalized, phrase)
        ]
        if not matched_aliases:
            continue

        preferred_alias = next(
            (
                phrase for phrase in matched_aliases
                if phrase in BRAND_ALIAS_DISPLAY_NAMES
            ),
            "",
        )
        display = BRAND_ALIAS_DISPLAY_NAMES.get(
            preferred_alias,
            BRAND_DISPLAY_NAMES.get(canonical, str(canonical).title()),
        )
        fields.append((canonical, display))

    return fields


def _standalone_clarification_brand_fields(value):
    """Trả hãng khi toàn bộ fragment chỉ là một tên hãng/dòng hãng."""
    normalized = _normalize_user_query(value)
    if not normalized:
        return []

    standalone_fields = []
    for canonical, display in _clarification_brand_fields(value):
        aliases = _unique_strings([
            canonical,
            *KNOWN_BRAND_ALIASES.get(canonical, []),
        ])
        if normalized in {
            _normalize_user_query(alias)
            for alias in aliases
            if _normalize_user_query(alias)
        }:
            standalone_fields.append((canonical, display))
    return standalone_fields


def _clarification_product_display_name(guide_key):
    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key) or {}
    triggers = guide.get("triggers", [])
    if not triggers:
        return ""

    trigger = str(triggers[0]).strip()
    return get_product_query_display_name(
        trigger,
        parsed_query=_parse_search_query(trigger),
    )


def _lower_query_fragment(value):
    text = str(value or "").strip()
    if not text:
        return ""

    first_token = text.split(maxsplit=1)[0]
    if first_token.isupper() or any(character.isdigit() for character in first_token):
        return text
    return text[:1].lower() + text[1:]


def _format_query_price(value):
    number = int(value or 0)
    if number <= 0:
        return ""
    if number % 1_000_000 == 0:
        return f"{number // 1_000_000} triệu"
    if number >= 1_000_000:
        amount = f"{number / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{amount.replace('.', ',')} triệu"
    if number % 1_000 == 0:
        return f"{number // 1_000} nghìn"
    return f"{number} đồng"


def _clarification_price_field(value):
    constraints = parse_price_constraints(value)
    price_min = constraints.get("price_min")
    price_max = constraints.get("price_max")

    if price_min is not None and price_max is not None:
        return (
            f"từ {_format_query_price(price_min)} "
            f"đến {_format_query_price(price_max)}"
        )
    if price_max is not None:
        return f"dưới {_format_query_price(price_max)}"
    if price_min is not None:
        return f"trên {_format_query_price(price_min)}"
    return ""


def build_canonical_clarification_query(
    user_message,
    selected_label="",
    parsed_query=None,
    matched_products=None,
):
    """Ghép truy vấn theo thứ tự: sản phẩm, hãng, nhu cầu/thông số, giá."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    base_guide_key = detect_clarify_guide_key(
        user_message,
        parsed_query,
        matched_products,
    )
    selected_guide_key = _best_guide_key_from_text(selected_label)
    guide_key = selected_guide_key or base_guide_key

    product_name = _clarification_product_display_name(guide_key)
    if not product_name:
        categories, _ = _extract_top_result_context(matched_products, max_items=1)
        product_name = categories[0] if categories else get_product_query_display_name(
            user_message,
            parsed_query,
            matched_products,
        )

    source_text = " ".join(
        part for part in [str(user_message or ""), str(selected_label or "")]
        if part.strip()
    )
    normalized_source = _normalize_user_query(source_text)

    selected_brand_fields = _clarification_brand_fields(selected_label)
    detected_brand_fields = selected_brand_fields
    if not detected_brand_fields:
        batch_brand_fields = []
        message_fragments = [
            fragment.strip()
            for fragment in str(user_message or "").splitlines()
            if fragment.strip()
        ]
        for fragment in message_fragments:
            fragment_brands = _clarification_brand_fields(fragment)
            if fragment_brands:
                batch_brand_fields.append(fragment_brands)

        # Trong batch nhiều tin, fragment có hãng xuất hiện sau cùng là lựa
        # chọn mới nhất. Nếu một fragment chứa nhiều hãng để so sánh thì vẫn
        # giữ đủ các hãng trong chính fragment đó.
        detected_brand_fields = (
            batch_brand_fields[-1]
            if len(message_fragments) > 1 and batch_brand_fields
            else _clarification_brand_fields(source_text)
        )

    brand_fields = []
    seen_brands = set()
    for canonical, display in detected_brand_fields:
        if canonical in seen_brands:
            continue
        seen_brands.add(canonical)
        brand_fields.append(display)

    candidate_labels = []
    for candidate_guide_key in _unique_strings([base_guide_key, guide_key]):
        guide = PRODUCT_CLARIFY_GUIDES.get(candidate_guide_key) or {}
        candidate_labels.extend(guide.get("chips", []))
    if selected_label:
        candidate_labels.append(selected_label)

    criteria = []
    seen_criteria = set()
    normalized_selected = _normalize_user_query(selected_label)
    for label in _unique_strings(candidate_labels):
        normalized_label = _normalize_user_query(label)
        if not normalized_label:
            continue
        if _clarification_brand_fields(label):
            continue
        if _best_guide_key_from_text(label) == guide_key:
            continue
        if not (
            _contains_search_term(normalized_source, normalized_label)
            or normalized_label == normalized_selected
        ):
            continue

        key = _normalize_search_text(label)
        if key in seen_criteria:
            continue
        seen_criteria.add(key)
        criteria.append(_lower_query_fragment(label))

    price_field = _clarification_price_field(source_text)
    fields = [product_name, *brand_fields, *criteria, price_field]
    return " ".join(str(field).strip() for field in fields if str(field).strip())


def canonicalize_batched_product_query(user_message, matched_products=None):
    """Sắp lại batch nhiều tin theo sản phẩm, hãng, tiêu chí và giá."""
    fragments = [
        " ".join(str(fragment or "").split())
        for fragment in str(user_message or "").splitlines()
        if str(fragment or "").strip()
    ]
    if len(fragments) <= 1:
        return fragments[0] if fragments else ""

    fallback = " ".join(fragments)
    parsed_query = _parse_search_query(fallback)
    canonical = build_canonical_clarification_query(
        "\n".join(fragments),
        parsed_query=parsed_query,
        matched_products=matched_products,
    )
    if not canonical:
        return fallback

    canonical_parsed = _parse_search_query(canonical)
    original_concepts = {
        concept.get("trigger")
        for concept in parsed_query.get("concepts", [])
        if concept.get("trigger")
    }
    canonical_concepts = {
        concept.get("trigger")
        for concept in canonical_parsed.get("concepts", [])
        if concept.get("trigger")
    }
    original_tokens = set(parsed_query.get("tokens", []))
    canonical_tokens = set(canonical_parsed.get("tokens", []))

    batch_brand_fields = [
        fragment_brands
        for fragment in fragments
        if (fragment_brands := _clarification_brand_fields(fragment))
    ]
    latest_batch_brands = batch_brand_fields[-1] if batch_brand_fields else []
    if latest_batch_brands:
        selected_brands = {
            canonical for canonical, _ in latest_batch_brands
        }
        for brand_canonical, _ in _clarification_brand_fields(fallback):
            if brand_canonical in selected_brands:
                continue
            for alias in _unique_strings([
                brand_canonical,
                *KNOWN_BRAND_ALIASES.get(brand_canonical, []),
            ]):
                original_tokens.difference_update(
                    re.findall(r"[a-z0-9]+", _normalize_search_text(alias))
                )

    # Không làm mất tiêu chí tự do mà guide chưa biết, chẳng hạn một mô tả
    # rất riêng của người dùng. Khi đó chỉ nối batch và để parser gốc xử lý.
    if not original_concepts.issubset(canonical_concepts):
        return fallback
    if not original_tokens.issubset(canonical_tokens):
        return fallback

    original_price = parse_price_constraints(fallback)
    canonical_price = parse_price_constraints(canonical)
    for key in ("price_min", "price_max"):
        if original_price.get(key) != canonical_price.get(key):
            return fallback

    return canonical


def get_clarification_suggestion_actions(
    user_message,
    parsed_query=None,
    matched_products=None,
):
    labels = get_clarification_suggestions(
        user_message,
        parsed_query=parsed_query,
        matched_products=matched_products,
    )
    actions = []
    for label in labels:
        if not _normalize_search_text(label):
            continue
        message = build_canonical_clarification_query(
            user_message,
            selected_label=label,
            parsed_query=parsed_query,
            matched_products=matched_products,
        )
        actions.append({"label": str(label), "message": message})
    return actions


def build_clarifying_suggestion_box(
    user_message,
    user_name="",
    parsed_query=None,
    matched_products=None,
    include_chips=True,
):
    """Trả về cùng một HTML khung đẹp cho mọi sản phẩm/mục riêng trong catalog."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    guide_key = detect_clarify_guide_key(user_message, parsed_query, matched_products)
    guide = PRODUCT_CLARIFY_GUIDES.get(guide_key)

    query_name = get_product_query_display_name(user_message, parsed_query)
    customer_name = _clean_chat_user_name(user_name)
    prefix = f"{_safe_text(customer_name)}, " if customer_name else ""
    chips = get_clarification_suggestions(
        user_message,
        parsed_query=parsed_query,
        matched_products=matched_products,
    )

    if not guide:
        questions = [
            "Bạn muốn tầm giá khoảng bao nhiêu?",
            "Bạn ưu tiên hãng, thông số hay nhu cầu sử dụng nào?",
            "Bạn cần sản phẩm mới, hàng cũ hay phụ kiện đi kèm?",
        ]
        title = query_name or "Sản phẩm cần tìm"
        example_text = f"{query_name} dưới 10 triệu dùng bền"
    else:
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

    if include_chips and chips:
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

    if _query_matches_exact_product_identity(
        user_message,
        parsed_query,
        matched_products,
    ):
        return False

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


def is_product_advisory_query(
    user_message,
    parsed_query=None,
    matched_products=None,
    specific_model=None,
):
    """Tách luồng tư vấn khỏi hỏi thêm tiêu chí và tìm đúng model."""
    parsed_query = parsed_query or _parse_search_query(user_message)
    matched_products = list(matched_products or [])
    if specific_model is None:
        specific_model = is_specific_model_query(
            user_message=user_message,
            parsed_query=parsed_query,
            matched_products=matched_products,
        )

    guide_key = detect_clarify_guide_key(
        user_message,
        parsed_query,
        matched_products,
    )
    residual_criteria = _query_residual_criteria_tokens(
        user_message,
        parsed_query,
        guide_key=guide_key,
    )
    has_criteria = bool(
        _has_detail_signal(user_message, parsed_query)
        or residual_criteria
    )
    return product_advisor.should_use_advisor(
        user_message,
        specific_model=bool(specific_model),
        has_criteria=has_criteria,
    )


def prepare_product_advice(
    product_list,
    user_message,
    price_constraints=None,
    limit=5,
    allow_variants=False,
):
    return product_advisor.build_product_advice(
        list(product_list or []),
        user_message,
        price_constraints=price_constraints,
        limit=limit,
        allow_variants=allow_variants,
    )


def serialize_product_advice(advice_items):
    return product_advisor.serialize_product_advice(advice_items)


def generate_advice_unavailable_reply(user_message, user_name=""):
    query_name = get_product_query_display_name(user_message)
    customer_name = _clean_chat_user_name(user_name)
    prefix = f"{_safe_text(customer_name)}, " if customer_name else ""
    return (
        "<div class='product-advice-unavailable'>"
        f"<p>{prefix}mình tìm thấy sản phẩm liên quan đến "
        f"<b>{_safe_text(query_name)}</b>, nhưng các bản ghi này chưa có đủ "
        "giá, hình ảnh và thông số để tư vấn đáng tin cậy.</p>"
        "<p>Mình sẽ không dùng sản phẩm thiếu dữ liệu làm kết quả tư vấn. "
        "Bạn có thể bổ sung hãng, ngân sách hoặc thông số ưu tiên để mình lọc lại.</p>"
        "</div>"
    )


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

    base_products = [item["product"] for item in scored_results]
    hydrated = _hydrate_catalog_products_by_id(
        [product.get("id") for product in base_products]
    )
    return [
        hydrated.get(str(product.get("id", "")), product)
        for product in base_products
    ], None


CLIP_TEXT_TRANSLATIONS = {
    "dien thoai": "smartphone mobile phone",
    "may tinh de ban": "desktop computer pc tower",
    "pc": "desktop computer pc tower",
    "may tinh xach tay": "laptop notebook computer",
    "may tinh": "computer laptop",
    "tai nghe": "headphones earphones earbuds headset",
    "loa": "speaker bluetooth speaker portable speaker",
    "soundbar": "soundbar home theater speaker",
    "may tinh bang": "tablet ipad",
    "dong ho thong minh": "smartwatch wearable watch",
    "dong ho": "watch smartwatch",
    "op lung": "phone case cover",
    "sac du phong": "power bank portable charger",
    "cap sac": "charging cable",
    "cu sac": "wall charger power adapter",
    "balo": "backpack laptop bag",
    "ban phim": "keyboard mechanical keyboard",
    "chuot": "mouse wireless mouse gaming mouse",
    "hub chuyen doi": "usb c hub adapter docking station",
    "thiet bi mang": "network device wifi router mesh router",
    "may chieu": "projector mini projector",
    "tv box": "android tv box streaming media player",
    "quat": "electric fan appliance",
    "quat suoi": "space heater fan heater appliance",
    "ban ui": "steam iron clothes iron appliance",
    "am sieu toc": "electric kettle appliance",
    "may xay sinh to": "blender appliance",
    "may ep trai cay": "juicer appliance",
    "may lam sua hat": "nut milk maker appliance",
    "bep dien": "electric stove induction cooker appliance",
    "can suc khoe": "smart body scale health scale",
    "may tam nuoc": "water flosser oral irrigator",
    "may do huyet ap": "blood pressure monitor",
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
    "robot hut bui": "robot vacuum cleaner",
    "may hut bui cam tay": "handheld cordless vacuum cleaner",
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


def _fts_phrase(value):
    normalized = _normalize_search_text(value)
    tokens = re.findall(r"[a-z0-9]+", normalized)
    if not tokens:
        return ""
    return f'"{" ".join(tokens)}"'


def _catalog_fts_queries(parsed_query):
    strict_parts = []
    relaxed_terms = []

    for concept in parsed_query.get("concepts", []):
        aliases = []
        for alias in concept.get("aliases", []):
            phrase = _fts_phrase(alias)
            if phrase and phrase not in aliases:
                aliases.append(phrase)
            for token in re.findall(r"[a-z0-9]+", _normalize_search_text(alias)):
                token_phrase = _fts_phrase(token)
                if token_phrase and token_phrase not in relaxed_terms:
                    relaxed_terms.append(token_phrase)
        if aliases:
            strict_parts.append(f"({' OR '.join(aliases)})")

    for token in parsed_query.get("tokens", []):
        phrase = _fts_phrase(token)
        if not phrase:
            continue
        strict_parts.append(phrase)
        if phrase not in relaxed_terms:
            relaxed_terms.append(phrase)

    queries = []
    if strict_parts:
        queries.append(" AND ".join(strict_parts))
    if relaxed_terms:
        relaxed_query = " OR ".join(relaxed_terms)
        if relaxed_query not in queries:
            queries.append(relaxed_query)
    return queries


def search_products_detailed_catalog(
    user_message,
    parsed_query=None,
    limit=200,
):
    if catalog_search_store is None:
        return []

    parsed_query = parsed_query or _parse_search_query(user_message)
    fetch_limit = max(100, min(1000, int(limit) * 5))

    for fts_query in _catalog_fts_queries(parsed_query):
        try:
            documents = catalog_search_store.search(
                fts_query,
                limit=fetch_limit,
            )
        except Exception as exc:
            print(f"Cảnh báo tìm kiếm catalog SQLite: {exc}")
            return []

        candidates = [
            normalize_product_document(document)
            for document in documents
            if isinstance(document, dict)
        ]
        matched, _ = search_products(
            user_message,
            candidates,
            limit=limit,
        )
        if matched:
            return matched

    return []


def _hydrate_catalog_products_by_id(product_id_values):
    if catalog_search_store is None:
        return {}
    try:
        documents = catalog_search_store.get_by_ids(product_id_values)
    except Exception as exc:
        print(f"Cảnh báo đọc chi tiết catalog SQLite: {exc}")
        return {}

    hydrated = {}
    for lookup_id, document in documents.items():
        if not isinstance(document, dict):
            continue
        hydrated[str(lookup_id)] = normalize_product_document(document)
    return hydrated


def search_products_text_embedding(user_message, product_list=None, limit=20):
    """
    Hybrid retrieval nhưng embedding là bắt buộc khi FAISS hoạt động:
    1. CLIP text embedding truy vấn 40k image embeddings trong FAISS.
    2. Bổ sung candidate khớp tên/thông số từ metadata cục bộ.
    3. Mọi candidate cuối cùng đều được chấm semantic similarity với embedding ảnh.
    """
    source_products = product_list if product_list is not None else products
    parsed_query = _parse_search_query(user_message)

    def keyword_fallback():
        catalog_products = search_products_detailed_catalog(
            user_message,
            parsed_query=parsed_query,
            limit=limit,
        )
        if catalog_products or catalog_search_store is not None:
            return catalog_products
        keyword_products, _ = search_products(
            user_message,
            source_products,
            limit=limit,
        )
        return keyword_products

    if not TEXT_EMBEDDING_SEARCH_ENABLED:
        keyword_products = keyword_fallback()
        return keyword_products, parsed_query, {
            "mode": "keyword_only_disabled",
            "clip_query": None,
            "error": None,
        }

    if faiss_index is None or product_embeddings is None:
        keyword_products = keyword_fallback()
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_no_faiss",
            "clip_query": None,
            "error": "FAISS/embeddings chưa sẵn sàng",
        }

    clip_query = build_clip_text_query(user_message)
    try:
        query_embedding = get_clip_text_embedding(clip_query)
    except Exception as exc:
        keyword_products = keyword_fallback()
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_clip_error",
            "clip_query": clip_query,
            "error": str(exc),
        }

    query_embedding, validation_error = _validate_query_embedding(query_embedding)
    if validation_error:
        keyword_products = keyword_fallback()
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
        keyword_products = keyword_fallback()
        return keyword_products, parsed_query, {
            "mode": "keyword_fallback_faiss_error",
            "clip_query": clip_query,
            "error": semantic_error,
        }

    semantic_product_ids = [
        str(hit["product"].get("id", ""))
        for hit in semantic_hits
        if hit.get("product")
    ]
    hydrated_semantic_products = _hydrate_catalog_products_by_id(
        semantic_product_ids
    )

    candidate_by_id = {}
    known_similarity = {}
    for hit in semantic_hits:
        base_product = hit["product"]
        product_id = str(base_product.get("id", ""))
        if not product_id:
            continue
        product = hydrated_semantic_products.get(product_id, base_product)
        candidate_by_id[product_id] = product
        known_similarity[product_id] = float(hit["similarity"])

    if catalog_search_store is not None:
        keyword_candidates = search_products_detailed_catalog(
            user_message,
            parsed_query=parsed_query,
            limit=max(limit * 5, 100),
        )
    else:
        keyword_candidates, _ = search_products(
            user_message,
            source_products,
            limit=max(limit * 5, 50),
        )
    for product in keyword_candidates:
        product_id = str(product.get("id", ""))
        if product_id:
            candidate_by_id[product_id] = product

    if catalog_search_store is None and _query_requests_phone_device(parsed_query):
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

        identity_score = _product_identity_match_score(product, parsed_query)
        combined_score = identity_score + (
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
    ranked = _prioritize_specific_model_ranked(
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


