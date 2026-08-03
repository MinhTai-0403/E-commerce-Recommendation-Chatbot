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

# Gemini SDK hiện tại của dự án. Có thể chuyển sang google.genai sau.
import google.generativeai as genai


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
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), encoding="utf-8-sig")
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True, encoding="utf-8-sig")

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
products_collection = None
users_collection = None
registration_otps_collection = None
mongo_error = ""


def init_mongodb():
    global mongo_client, mongo_db, products_collection, users_collection, registration_otps_collection, mongo_error

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
        products_collection = mongo_db[MONGODB_PRODUCTS_COLLECTION]
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
            "Đã kết nối MongoDB: "
            f"{MONGODB_DB}.{MONGODB_PRODUCTS_COLLECTION}, "
            f"{MONGODB_DB}.{MONGODB_USERS_COLLECTION} và "
            f"{MONGODB_DB}.{MONGODB_OTP_COLLECTION}"
        )
    except Exception as exc:
        mongo_error = str(exc)
        print(f"Lỗi kết nối MongoDB: {exc}")
        mongo_client = None
        mongo_db = None
        products_collection = None
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
# GEMINI CONFIG - SDK CŨ
# =========================
GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("key")
    or ""
).strip()
client = None
MODEL_MAIN = None
MODEL_TRANSLATION = None

try:
    if not GEMINI_API_KEY:
        print("Lỗi: Chưa nhập API key Gemini.")
    else:
        genai.configure(api_key=GEMINI_API_KEY)
        GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
        MODEL_MAIN = genai.GenerativeModel(GEMINI_MODEL)
        MODEL_TRANSLATION = genai.GenerativeModel(GEMINI_MODEL)
        client = True
        print(f"Đã khởi tạo Gemini với model: {GEMINI_MODEL}")
except Exception as exc:
    print("Lỗi khởi tạo Gemini:", exc)
    client = None


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
# Dữ liệu MongoDB + FAISS + mô hình
# ----------------------------
FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True)

# products.json chỉ được dùng như metadata thứ tự ID cũ của FAISS nếu có.
# Nội dung sản phẩm thực tế luôn được đọc từ MongoDB.
LEGACY_PRODUCTS_METADATA_PATH = os.path.join(FAISS_DIR, "products.json")
FAISS_PRODUCT_IDS_PATH = os.path.join(FAISS_DIR, "product_ids.json")
FAISS_INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMBEDDINGS_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

from data.faq_flow import faq_flows
from clip_core import get_clip_embedding

products = []
product_ids = []
product_by_id = {}
product_embeddings = None
faiss_index = None
faiss_product_order_ids = []
yolo_model = None
product_refresh_lock = Lock()
last_product_refresh = 0.0
PRODUCT_CACHE_SECONDS = max(0, int(os.getenv("PRODUCT_CACHE_SECONDS", "30")))

# 0 = tải toàn bộ document trong collection. Có thể đặt số dương trong .env
# nếu máy không đủ RAM, ví dụ CHATBOT_PRODUCT_LIMIT=20000.
CHATBOT_PRODUCT_LIMIT = max(0, int(os.getenv("CHATBOT_PRODUCT_LIMIT", "0")))

# Các trường được dùng để tìm theo tên, hãng, danh mục, trainingLabels,
# nhãn phụ, thông số và mã sản phẩm.
CHATBOT_PRODUCT_PROJECTION = {
    "id": 1,
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
        product.get("id"),
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
    product_id = (
        product.get("id")
        or product.get("product_id")
        or product.get("sku")
        or product.get("_id")
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


def load_faiss_product_order_ids():
    paths = [FAISS_PRODUCT_IDS_PATH, LEGACY_PRODUCTS_METADATA_PATH]

    for path in paths:
        if not os.path.isfile(path):
            continue

        try:
            with open(path, "r", encoding="utf-8") as file:
                data = json.load(file)

            ids = []
            for item in data if isinstance(data, list) else []:
                if isinstance(item, dict):
                    item_id = item.get("id") or item.get("product_id") or item.get("_id")
                else:
                    item_id = item
                if item_id is not None:
                    ids.append(str(item_id))

            if ids:
                print(f"Đã đọc {len(ids)} ID ánh xạ FAISS từ {path}")
                return ids
        except Exception as exc:
            print(f"Không thể đọc metadata FAISS {path}: {exc}")

    return []


def refresh_products_from_mongodb(force=False):
    global products, product_ids, product_by_id, last_product_refresh

    if products_collection is None:
        return products

    with product_refresh_lock:
        now = monotonic()
        if (
            not force
            and products
            and PRODUCT_CACHE_SECONDS > 0
            and now - last_product_refresh < PRODUCT_CACHE_SECONDS
        ):
            return products

        try:
            # Đọc toàn bộ collection thay vì chỉ lấy document có trường "name".
            # Document dùng title/product_name/brand/trainingLabels vẫn được tìm thấy.
            total_documents = products_collection.estimated_document_count()
            cursor = products_collection.find({}, CHATBOT_PRODUCT_PROJECTION)

            if CHATBOT_PRODUCT_LIMIT:
                cursor = cursor.limit(CHATBOT_PRODUCT_LIMIT)

            documents = list(cursor)
            normalized_products = [
                normalize_product_document(document)
                for document in documents
            ]
            normalized_products = [
                product
                for product in normalized_products
                if product.get("id") and product.get("_search_text")
            ]

            mapped_products = {
                str(product["id"]): product
                for product in normalized_products
            }

            if faiss_product_order_ids:
                ordered_products = [
                    mapped_products[product_id]
                    for product_id in faiss_product_order_ids
                    if product_id in mapped_products
                ]
                ordered_id_set = {str(product["id"]) for product in ordered_products}
                extra_products = sorted(
                    (
                        product
                        for product in normalized_products
                        if str(product["id"]) not in ordered_id_set
                    ),
                    key=lambda product: str(product.get("id", "")),
                )
                normalized_products = ordered_products + extra_products
            else:
                normalized_products.sort(key=lambda product: str(product.get("id", "")))

            products = normalized_products
            product_ids = [str(product["id"]) for product in products]
            product_by_id = {
                str(product["id"]): product
                for product in products
            }
            last_product_refresh = now

            limit_note = (
                f", giới hạn bởi CHATBOT_PRODUCT_LIMIT={CHATBOT_PRODUCT_LIMIT}"
                if CHATBOT_PRODUCT_LIMIT
                else ""
            )
            print(
                f"Đã tải {len(products)}/{total_documents} document có dữ liệu tìm kiếm "
                f"từ MongoDB {MONGODB_DB}.{MONGODB_PRODUCTS_COLLECTION}"
                f"{limit_note}"
            )
            return products
        except PyMongoError as exc:
            print(f"Lỗi đọc sản phẩm từ MongoDB: {exc}")
            return products


faiss_product_order_ids = load_faiss_product_order_ids()

try:
    product_embeddings = np.load(EMBEDDINGS_PATH)
    faiss_index = faiss.read_index(FAISS_INDEX_PATH)

    if faiss_index.ntotal != product_embeddings.shape[0]:
        print("Lỗi: Kích thước FAISS index và embeddings.npy không khớp.")
        faiss_index = None
        product_embeddings = None
    elif faiss_product_order_ids and faiss_index.ntotal != len(faiss_product_order_ids):
        print(
            "Lỗi: Số ID ánh xạ sản phẩm không khớp FAISS index. "
            "Hãy chạy lại build_index.py và lưu product_ids.json."
        )
        faiss_index = None
        product_embeddings = None
    else:
        print(f"Đã tải FAISS index với {faiss_index.ntotal} vector.")
except FileNotFoundError as exc:
    print(f"Chưa có FAISS hoặc embeddings: {exc}")
    print("Chat văn bản vẫn hoạt động; tìm bằng ảnh cần chạy build_index.py.")
except Exception as exc:
    print(f"Lỗi khi load FAISS hoặc Embeddings: {exc}")
    faiss_index = None
    product_embeddings = None

refresh_products_from_mongodb(force=True)

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
    "mongodb", "database",
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
    "may tinh xach tay": ["may tinh xach tay", "laptop", "notebook"],
    "laptop": ["laptop", "notebook", "may tinh xach tay"],
    "tai nghe": ["tai nghe", "earphone", "headphone", "headset", "earbuds"],
    "may tinh bang": ["may tinh bang", "tablet", "ipad"],
    "dong ho thong minh": ["dong ho thong minh", "smartwatch", "watch"],
    "op lung": ["op lung", "case", "cover", "bao da"],
    "op": ["op", "op lung", "case", "cover", "bao da"],
    "sac du phong": ["sac du phong", "power bank", "powerbank"],
    "cap sac": ["cap sac", "charging cable", "cable"],
}


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

    scored_products = collect(allow_partial=False)

    # Nếu không có kết quả chính xác, thử khớp mềm 2/3 số token.
    if not scored_products and len(parsed_query["tokens"]) >= 2:
        scored_products = collect(allow_partial=True)

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
    if faiss_index is None:
        return [], "FAISS index chưa được tải thành công."

    refresh_products_from_mongodb()

    if not faiss_product_order_ids and faiss_index.ntotal != len(products):
        return [], (
            "Không thể ánh xạ FAISS với sản phẩm MongoDB. "
            "Hãy chạy lại build_index.py và tạo product_ids.json."
        )

    search_k = min(max(1, int(k)), faiss_index.ntotal)
    _, indexes = faiss_index.search(query_embedding.reshape(1, -1), search_k)

    results = []
    seen_ids = set()

    for index in indexes[0]:
        index = int(index)
        if index < 0:
            continue

        product = None
        if faiss_product_order_ids:
            if index >= len(faiss_product_order_ids):
                continue
            product_id = str(faiss_product_order_ids[index])
            product = product_by_id.get(product_id)
        elif index < len(products):
            product = products[index]

        if not product:
            continue

        product_id = str(product.get("id", ""))
        if product_id and product_id not in seen_ids:
            seen_ids.add(product_id)
            results.append(product)

    return results, None


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
        "access_token": token,
        "accessToken": token,
        "user": serialized,
        "data": {
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
    refresh_products_from_mongodb()
    return jsonify({
        "status": "ok",
        "mongodb": products_collection is not None and users_collection is not None,
        "mongodb_error": mongo_error or None,
        "database": MONGODB_DB,
        "products_collection": MONGODB_PRODUCTS_COLLECTION,
        "users_collection": MONGODB_USERS_COLLECTION,
        "otp_collection": MONGODB_OTP_COLLECTION,
        "otp_email_configured": bool(SMTP_HOST and SMTP_FROM_EMAIL),
        "otp_debug": OTP_DEBUG,
        "chatbot": client is not None,
        "faiss": faiss_index is not None,
        "products": len(products),
    })


@app.route("/api/products/reload", methods=["POST"])
def reload_products():
    refreshed_products = refresh_products_from_mongodb(force=True)
    return jsonify({
        "message": "Đã tải lại sản phẩm từ MongoDB.",
        "products": len(refreshed_products),
    })


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
    user_name = str(user_document.get("full_name", "")).strip() if user_document else ""

    print("ĐÃ VÀO ROUTE /chat")
    print("TÀI KHOẢN:", user_name or "Khách")
    print("TIN NHẮN:", user_message)

    if not user_message:
        return jsonify({"reply": "Vui lòng nhập tin nhắn."}), 400

    current_products = refresh_products_from_mongodb()
    if not current_products:
        return jsonify({
            "reply": "Hiện chưa tải được sản phẩm từ MongoDB. Hãy kiểm tra kết nối database."
        }), 503

    faq_reply = get_faq_response(user_message.lower())
    if faq_reply:
        return jsonify({"reply": faq_reply})

    # Tìm trực tiếp trên tên, model, SKU, hãng, category, trainingLabels,
    # labels/tags/keywords, thông số và mô tả. Không bắt buộc người dùng
    # phải nhập một danh mục cố định như "điện thoại" hoặc "tai nghe".
    matched_products, parsed_query = search_products(
        user_message,
        current_products,
        limit=20,
    )

    print("TRUY VẤN CHUẨN HÓA:", parsed_query["normalized_query"])
    print(
        "CONCEPT:",
        [concept["trigger"] for concept in parsed_query["concepts"]],
    )
    print("TOKEN:", parsed_query["tokens"])
    print("SỐ KẾT QUẢ:", len(matched_products))

    if not matched_products:
        suggestion_reply = get_suggestion_questions(user_message)
        if suggestion_reply:
            return jsonify({
                "reply": (
                    "Mình chưa thấy kết quả khớp trực tiếp.<br>"
                    + suggestion_reply.replace("\n", "<br>")
                )
            })

        safe_query = _safe_text(user_message)
        return jsonify({
            "reply": (
                f"Không tìm thấy sản phẩm phù hợp cho “{safe_query}”. "
                "Bạn có thể tìm theo tên/model, hãng, SKU, danh mục hoặc "
                "các nhãn trong trainingLabels."
            )
        })

    intro = (
        "🛒 Đây là các sản phẩm phù hợp theo tên, hãng, danh mục "
        "hoặc nhãn trainingLabels:"
    )
    if user_name:
        intro = (
            f"🛒 {user_name}, đây là các sản phẩm phù hợp theo tên, hãng, "
            "danh mục hoặc nhãn trainingLabels:"
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

    current_products = refresh_products_from_mongodb()
    if not current_products:
        return jsonify({
            "reply": "Hiện chưa tải được sản phẩm từ MongoDB. Hãy kiểm tra kết nối database."
        }), 503

    file = request.files.get("file")
    user_message = request.form.get(
        "message",
        "Tìm giúp tôi sản phẩm tương tự như ảnh",
    )
    user_name = str(user_document.get("full_name", "")).strip() if user_document else ""

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
    # FAISS/MongoDB đều có thể được trả về, bao gồm phụ kiện và các nhóm
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
Chỉ được chọn sản phẩm trong danh sách MongoDB dưới đây.
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

