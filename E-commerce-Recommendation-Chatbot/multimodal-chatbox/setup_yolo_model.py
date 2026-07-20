import os
import shutil
from ultralytics import YOLO

# -------------------------------
# Cấu hình đường dẫn
# -------------------------------
ROOT_DIR = os.path.dirname(os.path.dirname(__file__))  # thư mục gốc: MULTIMODAL-CHATBOX
MODELS_DIR = os.path.join(ROOT_DIR, "models")
DATASET_DIR = os.path.join(ROOT_DIR, "datasets")
BEST_MODEL_PATH = os.path.join(ROOT_DIR, "best.pt")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATASET_DIR, exist_ok=True)

# -------------------------------
# Tải YOLOv8 pretrained model
# -------------------------------
def download_pretrained_model():
    print(" Đang tải YOLOv8 pretrained model (yolov8n.pt)...")
    model = YOLO("yolov8n.pt")  # tải model từ Ultralytics
    pretrained_path = os.path.join(MODELS_DIR, "yolov8n.pt")

    if not os.path.exists(pretrained_path):
        shutil.copy("yolov8n.pt", pretrained_path)

    shutil.copy(pretrained_path, BEST_MODEL_PATH)
    print(f" Đã tạo mô hình mặc định: {BEST_MODEL_PATH}")

# -------------------------------
# Tạo dataset mẫu nếu chưa có
# -------------------------------
def create_sample_dataset():
    yaml_path = os.path.join(DATASET_DIR, "data.yaml")
    if os.path.exists(yaml_path):
        print(f" Dataset đã tồn tại: {yaml_path}")
        return yaml_path

    print(" Đang tạo dataset mẫu cho YOLO...")

    os.makedirs(os.path.join(DATASET_DIR, "images", "train"), exist_ok=True)
    os.makedirs(os.path.join(DATASET_DIR, "images", "val"), exist_ok=True)

    yaml_content = """train: datasets/images/train
val: datasets/images/val

nc: 4
names: ["laptop", "tablet", "earphone", "smartwatch"]
"""
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)

    print(f" Đã tạo file data.yaml: {yaml_path}")
    print(" Hãy thêm ảnh huấn luyện vào datasets/images/train và val trước khi train.")
    return yaml_path


# -------------------------------
# 🏋️ Huấn luyện YOLO nếu có dataset
# -------------------------------
def train_custom_model(yaml_path):
    print("🏋️ Bắt đầu huấn luyện YOLOv8 với dataset của bạn...")
    model = YOLO(os.path.join(MODELS_DIR, "yolov8n.pt"))
    model.train(
        data=yaml_path,
        epochs=50,
        imgsz=640,
        batch=8,
        name="custom_train",
        project=os.path.join(ROOT_DIR, "runs"),
    )

    trained_best = os.path.join(ROOT_DIR, "runs", "detect", "custom_train", "weights", "best.pt")
    if os.path.exists(trained_best):
        shutil.copy(trained_best, BEST_MODEL_PATH)
        print(f" Đã huấn luyện và sao chép model: {BEST_MODEL_PATH}")
    else:
        print(" Không tìm thấy file best.pt sau khi train.")


# -------------------------------
# Main setup
# -------------------------------
def main():
    print("\n===  CÀI ĐẶT YOLO MODEL CHO MULTIMODAL-CHATBOX ===\n")

    # 1️ Nếu đã có best.pt → bỏ qua
    if os.path.exists(BEST_MODEL_PATH):
        print(f" Đã có mô hình: {BEST_MODEL_PATH}")
        return

    # 2️ Nếu có dataset → train custom
    yaml_path = os.path.join(DATASET_DIR, "data.yaml")
    if os.path.exists(yaml_path):
        print(" Phát hiện dataset, tiến hành huấn luyện custom model...")
        train_custom_model(yaml_path)
    else:
        # 3️ Nếu không có dataset → dùng pretrained model
        print(" Không có dataset → dùng YOLO pretrained model.")
        download_pretrained_model()

    print("\n Hoàn tất thiết lập YOLO model!")


if __name__ == "__main__":
    main()
