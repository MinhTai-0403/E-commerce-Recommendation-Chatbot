import os
import json
import numpy as np
from PIL import Image
import torch
import open_clip # Đã chuyển sang OpenCLIP
import faiss
import clip_core

# ===============================
# Cấu hình đường dẫn & Tham số
# ===============================
EMBEDDING_DIM = 512 

BASE_DIR = os.path.abspath(os.path.dirname(__file__)) 
DATA_DIR = os.path.join(BASE_DIR, "data", "products")

# THÊM LOGIC ĐỊNH NGHĨA VÀ TẠO THƯ MỤC 'index/'
FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True) # Tạo thư mục nếu chưa có

# Output paths được lưu vào thư mục 'index/'
INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMB_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
META_PATH = os.path.join(FAISS_DIR, "products.json") 
# ... (Phần còn lại giữ nguyên)

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Thiết bị đang dùng: {DEVICE}")

# ===============================
#  Nạp mô hình CLIP (OpenCLIP)
# ===============================
model = None
preprocess = None

print(f"Đang tải mô hình CLIP ({CLIP_MODEL_NAME}, {DEVICE})...")
try:
    model, _, preprocess = open_clip.create_model_and_transforms(CLIP_MODEL_NAME, pretrained=CLIP_PRETRAINED)
    model.to(DEVICE).eval()
    print("Mô hình OpenCLIP đã tải thành công.")
except Exception as e:
    print(f"Lỗi tải mô hình OpenCLIP. Đảm bảo đã cài đặt 'open_clip_torch': {e}")
    model = None
    preprocess = None


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
                            img_path = os.path.abspath(os.path.join(root, item.get("image", "")))
                            if not os.path.exists(img_path):
                                if "image_path" in item and os.path.exists(item["image_path"]):
                                    img_path = item["image_path"]
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
    for p in products:
        pid = p.get("id")
        if pid and pid not in unique:
            unique[pid] = p
    return list(unique.values())

# ===============================
# Trích xuất embedding bằng GPU
# ===============================
def extract_embeddings(products):
    if model is None or preprocess is None:
        print("Lỗi: Mô hình CLIP không sẵn sàng.")
        return None, None
        
    embeddings, valid_products = [], []
    total = len(products)
    
    # # Kiểm tra kích thước mô hình
    # if model.embed_dim != EMBEDDING_DIM:
    #     print(f"Lỗi: Kích thước mô hình ({model.embed_dim}) không khớp với EMBEDDING_DIM ({EMBEDDING_DIM}).")
    #     return None, None
        

    print(f"Bắt đầu trích xuất embeddings cho {total} ảnh...")

    for i, p in enumerate(products, start=1):
        try:
            img_path = p.get("image_path", "")
            if not os.path.exists(img_path):
                print(f"[{i}/{total}]  File ảnh không tồn tại: {img_path}. Bỏ qua.")
                continue

            image = Image.open(img_path).convert("RGB")
            image_tensor = preprocess(image).unsqueeze(0).to(DEVICE) 

            with torch.no_grad():
                emb = model.encode_image(image_tensor)
                # Chuẩn hóa (L2 normalization)
                emb = emb / emb.norm(dim=-1, keepdim=True)

            embeddings.append(emb.cpu().numpy())
            valid_products.append(p)
            # print(f"[{i}/{total}]  {p['id']}")
        except Exception as e:
            print(f"[{i}/{total}]  Lỗi trích xuất {p['id']}: {e}. Bỏ qua.")

    if not embeddings:
        return None, None
    
    final_embeddings = np.vstack(embeddings).astype("float32")
    return final_embeddings, valid_products

# ===============================
#  Cập nhật dữ liệu cũ (Đã sửa lỗi NoneType)
# ===============================
def load_existing_data():
    # Khởi tạo giá trị an toàn (fix lỗi NoneType)
    old_products = []
    old_emb = np.array([]).reshape(0, EMBEDDING_DIM).astype("float32")
    old_index = None
    
    if os.path.exists(INDEX_PATH) and os.path.exists(EMB_PATH) and os.path.exists(META_PATH):
        print(" Phát hiện dữ liệu cũ → đang nạp index hiện có...")
        try:
            old_index = faiss.read_index(INDEX_PATH)
            old_emb = np.load(EMB_PATH)
            
            if old_emb.ndim == 1:
                old_emb = old_emb.reshape(-1, EMBEDDING_DIM)
                
            with open(META_PATH, "r", encoding="utf-8") as f:
                old_products = json.load(f)
            
            print(f"🔹 Có {len(old_products)} sản phẩm đã lưu trước đó.")
            
            # Kiểm tra tính toàn vẹn cơ bản
            if old_index.ntotal != old_emb.shape[0] or old_index.ntotal != len(old_products):
                 print("CẢNH BÁO: Dữ liệu FAISS/Embeddings/Meta không khớp kích thước. Sẽ xây dựng lại từ đầu.")
                 return None, np.array([]).reshape(0, EMBEDDING_DIM).astype("float32"), []

            return old_index, old_emb, old_products
        
        except Exception as e:
            print(f"Lỗi nạp dữ liệu FAISS/Embeddings cũ, xây dựng lại từ đầu: {e}")
            return None, np.array([]).reshape(0, EMBEDDING_DIM).astype("float32"), []
            
    return old_index, old_emb, old_products

# ===============================
# Xây FAISS Index (IndexFlatL2)
# ===============================
def build_or_update_index(new_embeddings, new_products, old_index, old_emb, old_products):
    # Đảm bảo index đang ở CPU nếu đang dùng GPU
    if old_index is not None and faiss.get_num_gpus() > 0 and isinstance(old_index, faiss.GpuIndex):
        old_index = faiss.index_gpu_to_cpu(old_index)
        
    if old_index is None:
        print("Tạo FAISS index mới (IndexFlatL2)...")
        D = new_embeddings.shape[1]
        # Sử dụng IndexFlatL2 để đồng bộ với app.py
        index = faiss.IndexFlatL2(D)
        
        # Nếu có GPU, chuyển index sang GPU để thêm/tìm kiếm
        if torch.cuda.is_available() and faiss.get_num_gpus() > 0:
            index = faiss.index_cpu_to_all_gpus(index)
            print(f"FAISS GPU khả dụng: Đã chuyển index sang GPU.")
            
        index.add(new_embeddings)
        return index, new_embeddings, new_products

    print(f"Cập nhật FAISS index cũ (thêm {new_embeddings.shape[0]} mục)...")
    
    # Nếu có GPU, chuyển index cũ sang GPU để cập nhật
    if torch.cuda.is_available() and faiss.get_num_gpus() > 0:
        index = faiss.index_cpu_to_all_gpus(old_index)
        print(f"FAISS GPU khả dụng: Đã chuyển index cũ sang GPU để cập nhật.")
    else:
        index = old_index
        
    index.add(new_embeddings)

    # Kết hợp embeddings mới và cũ
    combined_embeddings = np.vstack([old_emb, new_embeddings])
    combined_products = old_products + new_products
    return index, combined_embeddings, combined_products


# ===============================
# Lưu lại kết quả
# ===============================
def save_all(index, embeddings, products):
    # Nếu index đang ở GPU, chuyển về CPU trước khi lưu
    if faiss.get_num_gpus() > 0 and isinstance(index, faiss.GpuIndex):
        index = faiss.index_gpu_to_cpu(index)

    # Lưu lại index và embeddings mới
    faiss.write_index(index, INDEX_PATH)
    np.save(EMB_PATH, embeddings)
    
    # Lưu lại file products.json đã được cập nhật (cần thiết nếu có sản phẩm mới)
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
        
    print(f"\n Đã lưu index: {INDEX_PATH}")
    print(f" Đã lưu embeddings: {EMB_PATH}")
    print(f" Đã lưu metadata: {META_PATH}")
    print(f" Tổng số sản phẩm sau cập nhật: {len(products)}")

# ===============================
#  MAIN
# ===============================
def main():
    if model is None or preprocess is None:
        print(" Lỗi: Dừng quá trình do không thể tải mô hình CLIP.")
        return
        
    print("-" * 50)
    print(" Đang tải dữ liệu sản phẩm từ thư mục...")
    # Tải tất cả sản phẩm từ cấu trúc thư mục
    all_products = load_all_products(DATA_DIR)
    all_products = deduplicate(all_products)

    if not all_products:
        print(" Lỗi: Không tìm thấy sản phẩm hợp lệ nào trong thư mục data/products.")
        return
        
    # Tải dữ liệu cũ (nếu có, nếu không sẽ là mảng/list rỗng)
    old_index, old_emb, old_products = load_existing_data()
    
    # Xác định các sản phẩm cần trích xuất/cập nhật (những ID chưa có)
    old_ids = {p["id"] for p in old_products}
    new_products_to_extract = [p for p in all_products if p["id"] not in old_ids]
    
    products_to_process = []
    
    # Trường hợp 1: Dữ liệu cũ bị hỏng (size không khớp), xử lý lại tất cả
    if len(old_products) != len(old_emb) or (old_index and old_index.ntotal != len(old_products)):
        print(" Dữ liệu FAISS/Embeddings cũ bị hỏng hoặc không khớp. Xây dựng lại TOÀN BỘ index.")
        products_to_process = all_products
        # Reset dữ liệu cũ để xây dựng index mới
        old_index, old_emb, old_products = None, np.array([]).reshape(0, EMBEDDING_DIM).astype("float32"), []
        
    # Trường hợp 2: Có sản phẩm mới cần thêm
    elif new_products_to_extract:
        products_to_process = new_products_to_extract
        print(f" Phát hiện {len(products_to_process)} sản phẩm mới cần trích xuất.")
    
    # Trường hợp 3: Không có gì để làm
    else:
        print(" Không có sản phẩm mới hoặc cần cập nhật index. Đã đồng bộ.")
        return


    # Trích xuất embeddings cho các sản phẩm cần xử lý
    new_embeddings, valid_products = extract_embeddings(products_to_process)
    
    if new_embeddings is None or new_embeddings.shape[0] == 0:
        print(" Không có sản phẩm hợp lệ để thêm.")
        return

    # Xây dựng hoặc cập nhật index
    index, emb_all, products_all = build_or_update_index(
        new_embeddings, valid_products, old_index, old_emb, old_products
    )

    # Lưu lại kết quả
    save_all(index, emb_all, products_all)
    print("-" * 50)
    print("Hoàn tất xây dựng lại index!")


if __name__ == "__main__":
    try:
        import faiss
    except ImportError:
        print(" Lỗi: Cần cài đặt faiss để chạy script này.")
        print("Vui lòng chạy: pip install faiss-cpu")
    else:
        main()