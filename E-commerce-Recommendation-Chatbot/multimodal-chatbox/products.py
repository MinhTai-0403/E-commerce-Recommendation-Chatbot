import os
import json

# 📁 Thư mục gốc chứa các meta.json
BASE_DIR = os.path.join("data", "products")
# 📦 File JSON tổng hợp
OUTPUT_FILE = os.path.join("data", "products.json")


def collect_meta_jsons(base_dir):
    """Duyệt toàn bộ thư mục con và thu thập dữ liệu từ tất cả meta.json"""
    all_data = []
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file == "meta.json":
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            all_data.extend(data)
                        elif isinstance(data, dict):
                            all_data.append(data)
                    print(f" Đã đọc: {file_path}")
                except Exception as e:
                    print(f" Lỗi đọc {file_path}: {e}")
    return all_data


def save_combined_json(data, output_path):
    """Ghi dữ liệu đã gộp ra file"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n🎯 Đã gộp {len(data)} sản phẩm vào: {output_path}")


def main():
    if os.path.exists(OUTPUT_FILE):
        # Nếu file products.json đã có sẵn → chỉ đọc & in ra thông tin
        print(f" File {OUTPUT_FILE} đã tồn tại. Đang đọc dữ liệu...\n")
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f" Đọc thành công: {len(data)} sản phẩm trong products.json")
        except Exception as e:
            print(f" Lỗi khi đọc {OUTPUT_FILE}: {e}")
    else:
        # Nếu chưa có file → tạo mới bằng cách gộp tất cả meta.json
        print(f" Không tìm thấy {OUTPUT_FILE}. Đang tạo mới...\n")
        combined_data = collect_meta_jsons(BASE_DIR)
        save_combined_json(combined_data, OUTPUT_FILE)


if __name__ == "__main__":
    main()
