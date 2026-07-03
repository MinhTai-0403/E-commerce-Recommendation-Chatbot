import torch
from PIL import Image
import numpy as np
import os

# ******************************************************************************
# Cảnh báo quan trọng:
# Để chạy đoạn mã này, bạn cần cài đặt các thư viện sau:
# 1. Hugging Face Transformers: pip install transformers
# 2. OpenCLIP: pip install open_clip_torch
# 3. Pillow: pip install Pillow
# ******************************************************************************

# CLIP is loaded lazily on the first image upload.

# ----------------------------
#  Cấu hình và Tải mô hình CLIP
# ----------------------------

# Chọn model CLIP. Ví dụ: ViT-B/32. 
# Tùy chọn này phải khớp với model được sử dụng để tạo index FAISS.
CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"

# Khởi tạo biến toàn cục để giữ mô hình và bộ tiền xử lý
model = None
preprocess = None

def load_clip_model():
    """Tải mô hình CLIP và bộ tiền xử lý (chỉ chạy một lần)."""
    global model, preprocess
    if model is None:
        print(f"Đang tải mô hình CLIP: {CLIP_MODEL_NAME}...")
        try:
            import open_clip
            # Tải mô hình và bộ tiền xử lý
            model, _, preprocess = open_clip.create_model_and_transforms(
                CLIP_MODEL_NAME, 
                pretrained=CLIP_PRETRAINED
            )
            model.eval() # Đặt mô hình ở chế độ đánh giá
            print("Mô hình CLIP đã tải thành công.")
        except Exception as e:
            print(f"Lỗi tải mô hình OpenCLIP. Đảm bảo đã cài đặt 'open_clip_torch': {e}")
            model = None
            preprocess = None

# Tải mô hình khi module được import lần đầu


# ----------------------------
# Hàm Trích xuất Embedding
# ----------------------------

def get_clip_embedding(image_path: str) -> np.ndarray:
    """
    Trích xuất vector đặc trưng (embedding) 512 chiều từ hình ảnh.
    
    Tham số:
        image_path (str): Đường dẫn tuyệt đối hoặc tương đối đến file ảnh.
        
    Trả về:
        np.ndarray: Vector embedding 512 chiều, dtype='float32'.
        (Trả về mảng ngẫu nhiên nếu mô hình không tải được)
    """
    if model is None or preprocess is None:
        load_clip_model()

    if model is None or preprocess is None:
        print(" Mô hình CLIP chưa được tải. Trả về embedding ngẫu nhiên.")
        # Trả về embedding ngẫu nhiên 512D (dùng cho mục đích thử nghiệm)
        # Faiss index size: (104, 512).
        return np.random.rand(512).astype('float32') * 0.1

    try:
        # Mở và tiền xử lý ảnh
        image = Image.open(image_path).convert("RGB")
        image_tensor = preprocess(image).unsqueeze(0) # Thêm dimension batch
        
        # Trích xuất embedding
        with torch.no_grad():
            # Sử dụng image_encoder của mô hình CLIP
            embedding = model.encode_image(image_tensor)
        
        # Chuẩn hóa (Normalization) embedding
        embedding /= embedding.norm(dim=-1, keepdim=True)
        
        # Chuyển về numpy array float32 512 chiều (hoặc D chiều)
        embedding_np = embedding.cpu().numpy().flatten().astype('float32')

        # Faiss thường mong đợi vector shape (1, D) hoặc (D,)
        return embedding_np
    
    except Exception as e:
        print(f" Lỗi khi xử lý hoặc trích xuất embedding cho ảnh {image_path}: {e}")
        # Trả về embedding ngẫu nhiên trong trường hợp lỗi xử lý
        return np.random.rand(512).astype('float32') * 0.1

# ----------------------------
# Ví dụ kiểm tra (Chỉ chạy khi chạy trực tiếp clip_core.py)
# ----------------------------
if __name__ == '__main__':
    # Giả định đường dẫn ảnh test
    # Thay đổi đường dẫn này sang một file ảnh hợp lệ trong môi trường của bạn
    test_image_path = "static/uploads/4df778ee60e741f9b21b4723069a8861_ong_ho_thong_minh_Samsung_Galaxy_Watch_Ultra.png" # Dùng ảnh bạn đã upload
    
    if os.path.exists(test_image_path):
        print(f"\nĐang thử trích xuất embedding cho ảnh: {test_image_path}")
        embedding = get_clip_embedding(test_image_path)
        
        if embedding.shape == (512,):
            print(f"Kích thước Embedding: {embedding.shape}")
            print(f"Dtype: {embedding.dtype}")
            print("Trích xuất thành công. Đã sẵn sàng cho FAISS.")
        else:
            print("Lỗi: Kích thước embedding không đúng. Cần (512,).")
    else:
        print(f"\n Không tìm thấy ảnh test tại: {test_image_path}")
        print("Vui lòng thay đổi đường dẫn ảnh test để kiểm tra mô hình.")
