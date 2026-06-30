import os
import json
import random
import hashlib
import pytesseract
from PIL import Image
import re
# import requests # Đã loại bỏ
# from bs4 import BeautifulSoup # Đã loại bỏ
import time
import sys
# from fake_useragent import UserAgent # Đã loại bỏ

# ⚙️ Cấu hình Tesseract (đường dẫn Windows)
pytesseract.pytesseract.tesseract_cmd = r"C:/Program Files/Tesseract-OCR/tesseract.exe"

# 📁 Đường dẫn chính
ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data", "products")

CATEGORY_MAP = {
    "laptop": "Laptop",
    "smar twatch": "Smart Watch",
    "tablet": "Tablet",
    "earphone": "Earphone",
}

BRANDS = {
    "laptop": ["Dell", "Asus", "MSI", "Acer", "LOQ", "Mac"],
    "smar twatch": ["Apple", "Samsung", "Xiaomi", "Garmin", "Huawei"],
    "tablet": ["Samsung", "iPad", "Lenovo", "Xiaomi", "Huawei"],
    "earphone": ["Apple", "Samsung", "Sony", "Soundpeats"],
}

PRICE_RANGES = {
    "laptop": (10_000_000, 65_000_000),
    "smart watch": (600_000, 22_000_000),
    "tablet": (2_500_000, 30_000_000),
    "earphone": (180_000, 5_000_000),
}

# ==============================
# Nhận dạng thương hiệu & danh mục
# ==============================
def _normalize_key(s: str) -> str:
    return s.lower().replace(" ", "").replace("-", "") if s else ""


def detect_brand_from_name(product_id: str, category: str = ""):
    if not product_id:
        return None
    text = (product_id + " " + category).lower()
    for key, brand_list in BRANDS.items():
        for brand in brand_list:
            if brand.lower() in text:
                return brand
    return None


def detect_category(folder_path):
    name = folder_path.lower()
    for key, cat in CATEGORY_MAP.items():
        if key in name:
            return cat
    return "Sản Phẩm Khác"


def deterministic_price(category: str, product_id: str) -> int:
    key = _normalize_key(category)
    low, high = PRICE_RANGES.get(key, (1_000_000, 5_000_000))
    h = hashlib.md5(product_id.encode("utf-8")).hexdigest()
    h_int = int(h, 16)
    price = low + (h_int % (high - low + 1))
    return max(price, 180_000)  # đảm bảo giá tối thiểu 180k


# ==============================
# 🧾 OCR giá từ ảnh
# ==============================
def detect_price_from_image(image_path: str):
    try:
        if not image_path or not os.path.exists(image_path):
            return None
        img = Image.open(image_path).convert("L")
        img = img.point(lambda x: 0 if x < 150 else 255, "1")
        text = pytesseract.image_to_string(img, lang="vie+eng")
        matches = re.findall(r"\d[\d.,]{3,}", text)
        if not matches:
            return None
        candidates = []
        for m in matches:
            value = int(re.sub(r"[^\d]", "", m))
            if 180_000 <= value <= 200_000_000:
                candidates.append(value)
        return max(candidates) if candidates else None
    except Exception as e:
        print(f"⚠️ Lỗi OCR {image_path}: {e}")
    return None


# ==============================
# 🧩 Tạo meta.json
# ==============================
def build_meta_for_folder(folder_path):
    meta_file = os.path.join(folder_path, "meta.json")
    meta_data = []
    if os.path.exists(meta_file):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta_data = json.load(f)
        except Exception:
            print(f"⚠️ meta.json lỗi, tạo mới: {meta_file}")
            meta_data = []

    images = [f for f in os.listdir(folder_path) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    if not images:
        return

    existing_ids = {item["id"] for item in meta_data if "id" in item}
    category_guess = detect_category(folder_path)

    for img in images:
        product_id = os.path.splitext(img)[0]
        if product_id in existing_ids:
            continue

        brand_guess = detect_brand_from_name(product_id, category_guess) or "Unknown"
        product_name = product_id.replace("_", " ").title()
        price = detect_price_from_image(os.path.join(folder_path, img))
        if not price:
            price = deterministic_price(category_guess, product_id)

        meta_data.append({
            "id": product_id,
            "name": product_name,
            "brand": brand_guess,
            "category": category_guess,
            "price": price,
            "currency": "VND",
            "description": f"{product_name} chính hãng {brand_guess}",
            "specs": {},
            "image": img
        })
        print(f" {product_id}: {price:,} VND")

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta_data, f, ensure_ascii=False, indent=2)
    print(f" meta.json cập nhật: {meta_file}")


# ==============================
#  Sửa giá lỗi
# ==============================
def fix_meta_json_prices():
    print("\n Đang kiểm tra giá...")
    for root, _, files in os.walk(DATA_DIR):
        for file in files:
            if file != "meta.json":
                continue
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            updated = False
            for item in meta:
                price = int(item.get("price", 0))
                if price < 180_000 or price > 200_000_000:
                    new_price = detect_price_from_image(os.path.join(root, item.get("image", "")))
                    if not new_price:
                        new_price = deterministic_price(item.get("category", ""), item.get("id", ""))
                    item["price"] = new_price
                    updated = True
                    print(f"🛠️ {item['id']}: {price:,} → {new_price:,}")
            if updated:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)
    print("✅ Hoàn tất sửa giá!\n")


# ==============================
# 🚀 MAIN
# ==============================
def process_all_product_folders():
    if not os.path.isdir(DATA_DIR):
        print(f" Không tìm thấy thư mục: {DATA_DIR}")
        return
    for product_type in os.listdir(DATA_DIR):
        pdir = os.path.join(DATA_DIR, product_type)
        if not os.path.isdir(pdir):
            continue
        print(f"\n Danh mục: {product_type}")
        for folder in os.listdir(pdir):
            sub = os.path.join(pdir, folder)
            if os.path.isdir(sub):
                build_meta_for_folder(sub)
    print("\n Hoàn tất tạo meta.json!")


if __name__ == "__main__":
    args = sys.argv[1:] if len(sys.argv) > 1 else []

    if "--fix-price" in args:
        fix_meta_json_prices()
    else:
        # Chạy quy trình tạo meta.json và sửa giá
        process_all_product_folders()
        fix_meta_json_prices()