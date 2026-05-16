from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import os, json, uuid, re
import numpy as np
import faiss 
from google import genai
import traceback
from flask import send_from_directory


# TÁI KÍCH HOẠT YOLO
try:
    from ultralytics import YOLO
    print("Đã tải mô-đun YOLO.")
except ImportError:
    print("Lỗi: Không thể import ultralytics. Cài bằng: pip install ultralytics")
    class MockYOLO:
        def __init__(self, model_path): pass
        def predict(self, source, conf=0.25, iou=0.7, classes=None): return []
    YOLO = MockYOLO
    

# ----------------------------
# ⚙️ Flask cấu hình
# ----------------------------
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = os.path.join("data", "products") 
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True) 


# =========================
# GEMINI CONFIG (NEW SDK)
# =========================

import os
from google import genai
from google.genai import types

# ⚙️ API KEY
GEMINI_API_KEY = "AIzaSyBFOrDrmFfLC5eUSQ-c156TCSvbwnFU1Y4"

client = None
translation_client = None

try:
    if not GEMINI_API_KEY:
        print(" Lỗi: Chưa nhập API key cho Gemini.")
    else:
        # =========================
        # CLIENT INIT
        # =========================
        client = genai.Client(api_key=GEMINI_API_KEY)

        MODEL_MAIN = "gemini-2.0-flash"
        MODEL_TRANSLATION = "gemini-2.0-flash"

        # =========================
        # FUNCTION TOOL
        # =========================
        filter_products_tool = types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="filter_products",
                    description="Tìm kiếm và lọc sản phẩm trong kho theo yêu cầu người dùng.",
                    parameters=types.Schema(
                        type="object",
                        properties={
                            "category": types.Schema(
                                type="string",
                                description="Loại sản phẩm (vd: laptop, tai nghe, đồng hồ)."
                            ),
                            "price_max": types.Schema(
                                type="integer",
                                description="Giá tối đa người dùng muốn trả."
                            ),
                            "price_min": types.Schema(
                                type="integer",
                                description="Giá tối thiểu người dùng muốn trả."
                            ),
                            "ram": types.Schema(
                                type="string",
                                description="Dung lượng RAM (vd: '8', '16')."
                            ),
                            "screen": types.Schema(
                                type="string",
                                description="Kích thước màn hình (vd: '14', '15.6')."
                            ),
                            "search_terms": types.Schema(
                                type="array",
                                items=types.Schema(type="string"),
                                description="Từ khóa tìm kiếm bổ sung."
                            ),
                        },
                    ),
                )
            ]
        )

        # =========================
        # GEMINI CALL FUNCTION
        # =========================
        def ask_gemini(prompt: str):
            if not client:
                return "Gemini chưa khởi tạo"

            try:
                response = client.models.generate_content(
            model=MODEL_MAIN,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[filter_products_tool]
            )
        )
                return response.text
            except Exception as e:
                if "429" in str(e):
                    return "Hệ thống đang bận (hết quota), vui lòng thử lại sau 30-60 giây."
                return f"Lỗi: {str(e)}"



        # =========================
        # TEST
        # =========================
        #if __name__ == "__main__":
            #try:
             #   result = ask_gemini("Tìm laptop gaming dưới 20 triệu RAM 16GB")
              #  print("Gemini:", result)

             #   print("Translation:",
             #         translate_text("Xin chào bạn, tôi cần laptop tốt"))

            #except Exception as e:
            #    print(" Lỗi test Gemini:", e)

except Exception as e:
    print(" Lỗi khởi tạo Gemini:", e)
    client = None
    translation_client = None

# ----------------------------
#  Dữ liệu & Mô hình
# ----------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True)

DATA_PATH = os.path.join(FAISS_DIR, "products.json") 
FAISS_INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMBEDDINGS_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
MODEL_PATH = os.path.join(BASE_DIR, "best.pt") # File này nằm ở thư mục gốc

from data.faq_flow import faq_flows
from clip_core import get_clip_embedding 

# ----------------------------
#  Load dữ liệu sản phẩm, FAISS Index và YOLO
# ----------------------------
products = []
product_embeddings = None
faiss_index = None
product_ids = []
yolo_model = None

try:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)
    print(f" Đã tải {len(products)} sản phẩm từ {DATA_PATH.split(BASE_DIR)[-1]}")
    
    product_embeddings = np.load(EMBEDDINGS_PATH)
    faiss_index = faiss.read_index(FAISS_INDEX_PATH)
    product_ids = [p["id"] for p in products]

    if faiss_index.ntotal == product_embeddings.shape[0] and faiss_index.ntotal == len(product_ids):
        print(" Đã tải FAISS index và Embeddings thành công.")
    else:
        print(" Lỗi: Kích thước dữ liệu FAISS, Embeddings và products.json không khớp.")
        faiss_index = None
        product_embeddings = None
        products = []
        product_ids = []
        
except FileNotFoundError as e:
    print(f" Lỗi tải dữ liệu hoặc index: {e}")
    print(" Vui lòng chạy build_index.py để tạo các file trong thư mục index/.")
except Exception as e:
    print(f" Lỗi khi load FAISS hoặc Embeddings: {e}")
    
try:
    if os.path.exists(MODEL_PATH):
        yolo_model = YOLO(MODEL_PATH)
        print(f" Đã tải mô hình YOLO từ: {MODEL_PATH}")
    else:
        print(f" Không tìm thấy file model YOLO tại: {MODEL_PATH}")
        print(" Vui lòng chạy setup_yolo_model.py để tải/tạo file best.pt.")
except Exception as e:
    print(f" Lỗi tải YOLO model: {e}")


# ----------------------------
#  Ngôn ngữ & Dịch thuật 
# ----------------------------
def detect_language(text):
    if not client:
        return 'vi'
    try:
        prompt = f"Ngôn ngữ của văn bản sau là gì? Chỉ trả lời vi/en/fr: {text}"

        response = client.models.generate_content(
            model=MODEL_TRANSLATION,
            contents=prompt
        )

        lang = response.text.strip().lower()
        return lang if len(lang) == 2 else "vi"

    except:
        return "vi"

def translate_text(text, target_lang='en'):
    if not client or target_lang == 'vi':
        return text
    try:
        prompt = f"Dịch sang {target_lang}: {text}"

        response = client.models.generate_content(
            model=MODEL_TRANSLATION,
            contents=prompt
        )

        return response.text.strip()

    except:
        return text


# ----------------------------
#  HTML sản phẩm
# ----------------------------
def generate_product_cards(product_list, response_text_vi=None, target_lang='vi'):
    if response_text_vi is None:
        response_text_vi = (
            "Không tìm thấy sản phẩm phù hợp."
            if not product_list
            else f"Tìm thấy {len(product_list)} sản phẩm được đề xuất:"
        )

    response_text = (
        translate_text(response_text_vi, target_lang)
        if target_lang != 'vi' and target_lang is not None
        else response_text_vi
    )

    html = f"<p style='margin-bottom:10px;'>{response_text}</p>"
    if not product_list:
        return html

    html += "<div class='product-list' style='display:flex;flex-wrap:wrap;gap:15px;'>"

    for p in product_list:
        image_path = p.get("image_path") or p.get("image") or ""
        image_url = "/static/no-image.png"
        if image_path:
            image_path = image_path.replace("\\", "/")

    # URL online
    if image_path.startswith("http://") or image_path.startswith("https://"):
        image_url = image_path

    # Ảnh local trong data/products
    elif "data/products/" in image_path.lower():

        filename = os.path.basename(image_path)

        image_url = f"/data/products/{filename}"

    # Ảnh static
    elif "/static/" in image_path.lower():

        filename = os.path.basename(image_path)

        image_url = f"/static/{filename}"

        html += f"""
        <div class='product-card' style='width:200px;border:1px solid #ccc;padding:10px;border-radius:10px;text-align:center;box-shadow:0 0 6px rgba(0,0,0,0.1);'>
            <img src="{image_url}" alt="{p.get('name','')}" width="150" height="150" style="border-radius:8px;object-fit:contain;"><br>
            <b>{name}</b><br>
            <small><b>{p.get('brand','')}</b> - {p.get('category','')}</small><br>
        </div>
        """

    html += "</div>"
    return html

# ----------------------------
#  Lọc sản phẩm (NÂNG CẤP LỚN V3)
# ----------------------------
def _product_to_searchable_text(product):
    """
    Hàm nội bộ: Biến toàn bộ JSON sản phẩm thành một chuỗi văn bản 
    CHO TÌM KIẾM MỜ (fuzzy search).
    """
    name = product.get("name", "").lower()
    brand = product.get("brand", "").lower()
    category = product.get("category", "").lower()
    description = product.get("description", "").lower()
    
    # Chỉ lấy các trường đơn giản, không lấy specs
    full_text = " ".join([name, brand, category, description])
    full_text = re.sub(r'\s+', ' ', full_text).strip()
    return full_text

def filter_products(category=None, price_max=None, price_min=None, specs_to_find=None, search_terms=None, ram=None, screen=None):
    """
    Nâng cấp V3: Lọc sản phẩm dựa trên category, giá, specs (chính xác) và search_terms (mờ).
    """
    results = products
    if specs_to_find is None: specs_to_find = {}
    if ram:
        specs_to_find["ram"] = ram
    if screen:
        specs_to_find["screen"] = screen
# (Kết thúc phần thêm)
    if search_terms is None: search_terms = []
    
    has_filters = any([category, price_max, price_min, specs_to_find, search_terms])

    # 1. Lọc Category (như cũ)
    if category:
        results = [p for p in results if category in p.get("category", "").lower()]
    
    # 2. Lọc Giá (như cũ)
    if price_max:
        results = [p for p in results if p.get("price", 0) <= price_max]
    if price_min:
        results = [p for p in results if p.get("price", 0) >= price_min]

    # 3. Lọc SPECS (CHÍNH XÁC) - NÂNG CẤP QUAN TRỌNG
    if specs_to_find:
        temp_results = []
        for p in results:
            all_specs_found = True
            product_specs = p.get("specs", {})
            
            # Kiểm tra RAM
            if "ram" in specs_to_find:
                ram_spec = product_specs.get("Dung lượng RAM", "").lower().replace("gb", "").strip()
                if "ram" in specs_to_find:
                    user_ram = str(specs_to_find["ram"]).lower()
                    product_ram = str(product_specs.get("Dung lượng RAM", "")).lower()
                    if user_ram not in product_ram:
                        all_specs_found = False
            
            # Kiểm tra Màn hình
            if "screen" in specs_to_find:
                screen_spec = product_specs.get("Kích thước màn hình", "").lower().replace("inches", "").strip()
                if specs_to_find["screen"] != screen_spec:
                    all_specs_found = False

            # (Bạn có thể thêm các bộ lọc specs khác ở đây, ví dụ: "Ổ cứng")

            if all_specs_found:
                temp_results.append(p)
        results = temp_results

    # 4. Lọc SEARCH TERMS (MỜ) - Tìm trong tên, mô tả...
    if search_terms:
        temp_results = []
        for p in results:
            # Tạo chuỗi văn bản mờ (không bao gồm specs chi tiết để tránh nhầm lẫn)
            searchable_text = _product_to_searchable_text(p)
            
            # Bổ sung thêm CPU và Card đồ họa vào chuỗi tìm kiếm mờ
            searchable_text += " " + p.get("specs", {}).get("Loại CPU", "").lower()
            searchable_text += " " + p.get("specs", {}).get("Card đồ họa", "").lower()

            all_terms_found = True
            for term in search_terms:
                if term.lower() not in searchable_text:
                    all_terms_found = False
                    break 
                        
            if all_terms_found:
                temp_results.append(p)
        
        results = temp_results
    
    return results if has_filters else []

# ----------------------------
#  Gợi ý hội thoại từ faq_flows (NÂNG CẤP V3)
# ----------------------------
def get_faq_response(user_message):
    message_lower = user_message.lower().strip()
    
    # Sửa logic: Chỉ khớp khi tin nhắn CHÍNH XÁC LÀ KEY
    if message_lower in faq_flows:
        flow = faq_flows[message_lower]
        intro = flow["intro"]
        suggestions = flow.get("suggestions", [])
        
        # Chuyển sang dạng bullet point (như bạn yêu cầu)
        list_html = "<ul style='margin-top: 10px; margin-left: 20px;'>"
        list_html += "".join(
            [f"<li>{s}</li>" for s in suggestions]
        )
        list_html += "</ul>"
        
        conclusion = "<p> Cho mình biết rõ mục đích, mình sẽ hỗ trợ chi tiết nhé.</p>"
        
        return f"{intro}<br>{list_html}<br>{conclusion}"
            
    return None

# ----------------------------
#  Tìm kiếm tương tự bằng CLIP+FAISS (Giữ nguyên)
# ----------------------------
def find_similar_products_clip_faiss(query_embedding, k=5):
    if faiss_index is None:
        return [], " FAISS index chưa được tải thành công."
    
    D, I = faiss_index.search(query_embedding.reshape(1, -1), k)
    
    results = []
    for index in I[0]:
        if 0 <= index < len(products):
            results.append(products[index])
            
    return results, None

# ----------------------------
#  Routes (NÂNG CẤP V3)
# ----------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json.get("message", "").strip()
    if not user_message:
        return jsonify({"reply": "Vui lòng nhập tin nhắn."})

    if not client:
        return jsonify({"reply": "Gemini chưa khởi tạo."})

    detected_lang = detect_language(user_message)

    # FAQ trước
    faq_reply = get_faq_response(user_message.lower())
    if faq_reply:
        return jsonify({"reply": faq_reply})

    try:
        # GỌI GEMINI (NEW SDK)
        response = client.models.generate_content(
            model=MODEL_MAIN,
            contents=user_message,
            config=types.GenerateContentConfig(
                tools=[filter_products_tool]
            )
        )

        part = None
        if response.candidates and response.candidates[0].content.parts:
            part = response.candidates[0].content.parts[0]

        #  KHÔNG CALL TOOL → trả text
        if not part or not part.function_call:
            return jsonify({"reply": response.text})

        #  CÓ CALL TOOL
        function_call = part.function_call
        args = dict(function_call.args)

        print("CALL TOOL:", args)

        tool_result_data = filter_products(**args)

        #  gửi lại cho Gemini
        response2 = client.models.generate_content(
            model=MODEL_MAIN,
            contents=[
                user_message,
                {
                    "function_response": {
                        "name": function_call.name,
                        "response": {
                            "success": True,
                            "products_found_count": len(tool_result_data),
                            "products": tool_result_data
                        }
                    }
                }
            ]
        )

        final_text = response2.text

        html_reply = generate_product_cards(
            tool_result_data,
            response_text_vi=final_text,
            target_lang=detected_lang
        )

        return jsonify({"reply": html_reply})

    except Exception as e:
        print("CHAT ERROR:", e)
        return jsonify({"reply": f"Lỗi Gemini: {e}"})


#  THAY THẾ TOÀN BỘ HÀM /upload BẰNG HÀM MỚI NÀY
@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    # Lấy thêm tin nhắn text từ form
    user_message = request.form.get("message", "Tìm giúp tôi sản phẩm tương tự như ảnh") 
    
    if not file:
        return jsonify({"reply": " Không có file được tải lên."})

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], f"{uuid.uuid4().hex}_{filename}")
    file.save(filepath)

    # BƯỚC 1: YOLO (Giữ nguyên, không đổi)
    yolo_label = ""
    if yolo_model:
        try:
            results = yolo_model.predict(source=filepath, conf=0.25, iou=0.7, classes=None, verbose=False)
            if results and len(results[0].boxes) > 0:
                best_box = results[0].boxes[0]
                class_id = int(best_box.cls.item())
                detected_class = yolo_model.names.get(class_id, "sản phẩm") 
                yolo_label = detected_class.lower()
        except Exception as e:
            print(f" Lỗi khi chạy YOLO: {e}")
            
    # BƯỚC 2: CLIP + FAISS (Giữ nguyên, không đổi)
    try:
        query_embedding = get_clip_embedding(filepath)
    except Exception as e:
        print(f" Lỗi khi trích xuất embedding bằng CLIP: {e}")
        return jsonify({"reply": f" Lỗi xử lý ảnh: Không thể trích xuất đặc trưng bằng CLIP."})

    recs, err_msg = find_similar_products_clip_faiss(query_embedding, k=5)
    
    if err_msg:
        html_reply = generate_product_cards([], response_text_vi=err_msg, target_lang='vi')
        return jsonify({"reply": html_reply})

    # BƯỚC 3:  HỎI Ý KIẾN GEMINI
    if not recs:
        msg_vi = " Rất tiếc, tôi không tìm thấy sản phẩm nào tương tự trong kho."
        html_reply = generate_product_cards([], response_text_vi=msg_vi, target_lang='vi')
        return jsonify({"reply": html_reply})
        
    try:
        # Chuyển 5 sản phẩm tìm được thành JSON
        # (Chỉ lấy các trường cần thiết để prompt ngắn gọn)
        simplified_recs = [
            {"id": p.get("id"), "name": p.get("name"), "price": p.get("price"), "specs": p.get("specs")} 
            for p in recs
        ]
        products_json = json.dumps(simplified_recs, ensure_ascii=False)
        
        # Xây dựng câu lệnh (prompt) cho Gemini
        prompt = f"""
        Bạn là chuyên gia tư vấn. Người dùng upload ảnh sản phẩm (YOLO nhận diện: {yolo_label}).
        Câu hỏi khách: "{user_message}"
        Dưới đây là 5 sản phẩm khớp nhất từ kho: {products_json}

        Nhiệm vụ: 
        1. Lọc ra các ID sản phẩm phù hợp nhất với yêu cầu khách.
        2. Viết câu tư vấn ngắn gọn, thân thiện.
        3. Trả về DUY NHẤT định dạng JSON: {{"reply_text": "...", "filtered_product_ids": ["..."]}}
        """

        # Gọi bằng SDK mới (thống nhất với phần trên)
        response = client.models.generate_content(
            model=MODEL_MAIN, # Dùng gemini-2.0-flash cho nhanh và tiết kiệm
            contents=prompt
        )
        
        # Làm sạch chuỗi JSON (đề phòng Gemini trả về kèm dấu ```json)
        raw_text = response.text.strip()
        clean_json = re.sub(r'^ ```json|```$', '', raw_text, flags=re.MULTILINE).strip()
        gemini_result = json.loads(clean_json)
        
        # Dùng một mô hình Gemini khác (không cần Tool) để chạy tác vụ đơn giản này
        # = genai.GenerativeModel("gemini-1.5-pro-latest")
        #response = simple_model.generate_content(prompt)
        
        # Parse JSON trả về từ Gemini
        #json_response_text = response.text.strip().replace("```json", "").replace("```", "")
        #gemini_result = json.loads(json_response_text)
        
        final_reply_text = gemini_result.get("reply_text", "Đây là các sản phẩm tôi tìm thấy:")
        filtered_ids = gemini_result.get("filtered_product_ids", [p["id"] for p in recs])
        
        # Lọc danh sách 'recs' ban đầu để lấy đúng các sản phẩm mà Gemini đã chọn
        final_products = [p for p in recs if p["id"] in filtered_ids]

        html_reply = generate_product_cards(
            final_products, 
            response_text_vi=final_reply_text, 
            target_lang='vi' # Upload luôn trả về tiếng Việt
        )
        return jsonify({"reply": html_reply})

    except Exception as e:
        print(f" Lỗi khi gọi Gemini trong /upload: {e}")
        # Lỗi: Quay về logic cũ (trả về cả 5 sản phẩm)
        msg_vi = f" Tìm thấy {len(recs)} sản phẩm tương tự. (Lỗi Gemini, hiển thị kết quả gốc)"
        html_reply = generate_product_cards(recs, response_text_vi=msg_vi, target_lang='vi')
        return jsonify({"reply": html_reply})
    


    @app.route("/data/products/<filename>")
    def serve_product_image(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)
    

# ----------------------------
#  Run Flask
# ----------------------------
if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)