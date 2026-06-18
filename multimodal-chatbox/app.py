from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import os, json, uuid, re
import numpy as np
import faiss
import traceback

# Gemini SDK cũ
import google.generativeai as genai

# YOLO
try:
    from ultralytics import YOLO
    print("Đã tải mô-đun YOLO.")
except ImportError:
    print("Lỗi: Không thể import ultralytics. Cài bằng: pip install ultralytics")

    class MockYOLO:
        def __init__(self, model_path):
            pass

        def predict(self, source, conf=0.25, iou=0.7, classes=None, verbose=False):
            return []

    YOLO = MockYOLO


# ----------------------------
# Flask cấu hình
# ----------------------------
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = os.path.join("data", "products")
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


# =========================
# GEMINI CONFIG - SDK CŨ
# =========================
GEMINI_API_KEY = "AIzaSyCSiMIcBXJw9TdsDFCYflH7XTQKAtQt1mc"

client = None

try:
    if not GEMINI_API_KEY:
        print("Lỗi: Chưa nhập API key Gemini.")
    else:
        genai.configure(api_key=GEMINI_API_KEY)

        MODEL_MAIN = genai.GenerativeModel("gemini-2.5-flash-lite")
        MODEL_TRANSLATION = genai.GenerativeModel("gemini-2.5-flash-lite")

        client = True
        print("Đã khởi tạo Gemini 2.5 Flash lite thành công.")

except Exception as e:
    print("Lỗi khởi tạo Gemini:", e)
    client = None


def ask_gemini(prompt):
    try:
        response = MODEL_MAIN.generate_content(
            prompt,
            generation_config={
                "max_output_tokens": 180,
                "temperature": 0.7
            }
        )

        reply = response.text

        # format chat đẹp hơn
        reply = reply.replace("\n", "<br>")
        reply = reply.replace("•", "<br>•")
        reply = reply.replace("* ", "<br>• ")
        reply = reply.replace("###", "<br><b>")
        reply = reply.replace("---", "<hr>")

        return reply

    except Exception as e:
        print("Gemini Error:", e)
        return "Hiện AI đang bận, vui lòng thử lại sau."


# ----------------------------
# Dữ liệu & Mô hình
# ----------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FAISS_DIR = os.path.join(BASE_DIR, "index")
os.makedirs(FAISS_DIR, exist_ok=True)

DATA_PATH = os.path.join(FAISS_DIR, "products.json")
FAISS_INDEX_PATH = os.path.join(FAISS_DIR, "faiss_index.index")
EMBEDDINGS_PATH = os.path.join(FAISS_DIR, "embeddings.npy")
MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

from data.faq_flow import faq_flows
from clip_core import get_clip_embedding


products = []
product_embeddings = None
faiss_index = None
product_ids = []
yolo_model = None

try:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)

    print(f"Đã tải {len(products)} sản phẩm từ {DATA_PATH.split(BASE_DIR)[-1]}")

    product_embeddings = np.load(EMBEDDINGS_PATH)
    faiss_index = faiss.read_index(FAISS_INDEX_PATH)
    product_ids = [p["id"] for p in products]

    if faiss_index.ntotal == product_embeddings.shape[0] and faiss_index.ntotal == len(product_ids):
        print("Đã tải FAISS index và Embeddings thành công.")
    else:
        print("Lỗi: Kích thước dữ liệu FAISS, Embeddings và products.json không khớp.")
        faiss_index = None
        product_embeddings = None
        products = []
        product_ids = []

except FileNotFoundError as e:
    print(f"Lỗi tải dữ liệu hoặc index: {e}")
    print("Vui lòng chạy build_index.py để tạo các file trong thư mục index/.")

except Exception as e:
    print(f"Lỗi khi load FAISS hoặc Embeddings: {e}")


try:
    if os.path.exists(MODEL_PATH):
        yolo_model = YOLO(MODEL_PATH)
        print(f"Đã tải mô hình YOLO từ: {MODEL_PATH}")
    else:
        print(f"Không tìm thấy file model YOLO tại: {MODEL_PATH}")
except Exception as e:
    print(f"Lỗi tải YOLO model: {e}")


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

    html = f"<p style='margin-bottom:10px;'>{response_text}</p>"

    if not product_list:
        return html

    html += "<div class='product-list' style='display:flex;flex-wrap:wrap;gap:15px;'>"

    for p in product_list:

        name = p.get("name", "Không có tên")
        price = p.get("price", 0)
        brand = p.get("brand", "")
        category = p.get("category", "")
        image_path = p.get("image_path") or p.get("image") or ""

        image_url = "/static/no-image.png"

        if image_path:

            image_path = image_path.replace("\\", "/")

            if image_path.startswith("http://") or image_path.startswith("https://"):
                image_url = image_path

            elif "data/products/" in image_path.lower():
                relative_path = image_path.split("data/products/")[-1]
                image_url = f"/data/products/{relative_path}"

            elif "static/" in image_path.lower():
                relative_path = image_path.split("static/")[-1]
                image_url = f"/static/{relative_path}"

            else:
                image_url = f"/data/products/{image_path}"

        # =========================
        # GỢI Ý RIÊNG
        # =========================
        product_text = f"{name} {brand} {category} {p.get('description', '')}".lower()

        suggestions = []

        if "laptop" in product_text:

            suggestions = [
                "Phù hợp học tập / văn phòng / gaming",
                "Nên xem RAM, CPU, SSD",
                "Phù hợp nếu bạn cần hiệu năng ổn định"
            ]

        elif "tai nghe" in product_text or "earphone" in product_text:

            suggestions = [
                "Phù hợp nghe nhạc / gaming / học online",
                "Nên xem pin và chống ồn",
                "Phù hợp nếu bạn thích sự tiện lợi"
            ]

        elif "tablet" in product_text or "máy tính bảng" in product_text:

            suggestions = [
                "Phù hợp học tập và giải trí",
                "Nên xem màn hình và pin",
                "Phù hợp nếu bạn cần thiết bị gọn nhẹ"
            ]

        elif "smartwatch" in product_text or "đồng hồ" in product_text:

            suggestions = [
                "Phù hợp theo dõi sức khỏe",
                "Nên xem pin và cảm biến",
                "Phù hợp nếu bạn hay vận động"
            ]

        suggestion_html = ""

        if suggestions:

            suggestion_html += """
            <ul style='
                text-align:left;
                font-size:13px;
                margin-top:8px;
                padding-left:18px;
                color:#444;
            '>
            """

            for s in suggestions:
                suggestion_html += f"<li>{s}</li>"

            suggestion_html += "</ul>"

        # =========================
        # CARD
        # =========================
        html += f"""
        <div class='product-card'
             style='
                width:240px;
                border:1px solid #ccc;
                padding:12px;
                border-radius:12px;
                text-align:center;
                box-shadow:0 0 6px rgba(0,0,0,0.15);
                background:white;
             '>

            <img src="{image_url}"
                 alt="{name}"
                 style="width:160px;height:160px;object-fit:contain;margin-bottom:10px;"
                 onerror="this.src='/static/no-image.png'">

            <h4 style="font-size:16px;margin:8px 0;color:#111;">
                {name}
            </h4>

            <p style="color:red;font-weight:bold;font-size:17px;margin:5px 0;">
                {price:,}đ
            </p>

            <p style="font-size:14px;margin:5px 0;">
                <b>{brand}</b> - {category}
            </p>

            {suggestion_html}

        </div>
        """

    html += "</div>"

    return html


# ----------------------------
# Lọc sản phẩm
# ----------------------------
def _product_to_searchable_text(product):
    name = product.get("name", "").lower()
    brand = product.get("brand", "").lower()
    category = product.get("category", "").lower()
    description = product.get("description", "").lower()

    full_text = " ".join([name, brand, category, description])
    full_text = re.sub(r"\s+", " ", full_text).strip()
    return full_text


def filter_products(category=None, price_max=None, price_min=None, specs_to_find=None, search_terms=None, ram=None, screen=None):
    results = products

    if specs_to_find is None:
        specs_to_find = {}

    if ram:
        specs_to_find["ram"] = ram

    if screen:
        specs_to_find["screen"] = screen

    if search_terms is None:
        search_terms = []

    has_filters = any([category, price_max, price_min, specs_to_find, search_terms])

    if category:
        results = [p for p in results if category in p.get("category", "").lower()]

    if price_max:
        results = [p for p in results if p.get("price", 0) <= price_max]

    if price_min:
        results = [p for p in results if p.get("price", 0) >= price_min]

    if specs_to_find:
        temp_results = []

        for p in results:
            all_specs_found = True
            product_specs = p.get("specs", {})

            if "ram" in specs_to_find:
                user_ram = str(specs_to_find["ram"]).lower()
                product_ram = str(product_specs.get("Dung lượng RAM", "")).lower()

                if user_ram not in product_ram:
                    all_specs_found = False

            if "screen" in specs_to_find:
                screen_spec = product_specs.get("Kích thước màn hình", "").lower().replace("inches", "").strip()

                if specs_to_find["screen"] != screen_spec:
                    all_specs_found = False

            if all_specs_found:
                temp_results.append(p)

        results = temp_results

    if search_terms:
        temp_results = []

        for p in results:
            searchable_text = _product_to_searchable_text(p)
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

    D, I = faiss_index.search(query_embedding.reshape(1, -1), k)

    results = []

    for index in I[0]:
        if 0 <= index < len(products):
            results.append(products[index])

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
# Routes
# ----------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():

    user_message = request.json.get("message", "").strip()

    print("ĐÃ VÀO ROUTE /chat MỚI")
    print("USER:", user_message)

    if not user_message:
        return jsonify({"reply": "Vui lòng nhập tin nhắn."})

    if not client:
        return jsonify({"reply": "Gemini chưa khởi tạo."})

    # FAQ
    faq_reply = get_faq_response(user_message.lower())

    if faq_reply:
        return jsonify({"reply": faq_reply})

    # =========================
    # GỢI Ý NHU CẦU
    # =========================
    specific_keywords = [
        "không dây", "có dây", "gaming", "chơi game",
        "giá rẻ", "pin lâu", "chống ồn", "bass",
        "học online", "nghe nhạc", "văn phòng",
        "học tập", "đồ họa", "ssd", "ram"
    ]

    has_specific_need = any(
        kw in user_message.lower()
        for kw in specific_keywords
    )

    suggestion_reply = get_suggestion_questions(user_message)

    if suggestion_reply and not has_specific_need:
        return jsonify({
            "reply": suggestion_reply.replace("\n", "<br>")
        })

    # =========================
    # NHẬN DIỆN DANH MỤC
    # =========================
    allowed_keywords = [
        "laptop", "máy tính", "tai nghe", "earphone",
        "smartwatch", "đồng hồ", "tablet",
        "máy tính bảng", "điện thoại"
    ]

    user_lower = user_message.lower()

    matched_category = None

    for k in allowed_keywords:
        if k in user_lower:
            matched_category = k
            break

    if not matched_category:
        return jsonify({
            "reply": " Mình chỉ hỗ trợ tư vấn laptop, tai nghe, máy tính bảng và đồng hồ thông minh."
        })

    # =========================
    # LỌC SẢN PHẨM
    # =========================
    matched_products = []

    for p in products:

        searchable_text = (
            p.get("name", "").lower() + " " +
            p.get("category", "").lower() + " " +
            p.get("description", "").lower()
        )

        if matched_category in searchable_text:

            # lọc thêm theo nhu cầu
            if has_specific_need:

                ok = True

                for kw in specific_keywords:
                    if kw in user_lower and kw not in searchable_text:
                        ok = False
                        break

                if ok:
                    matched_products.append(p)

            else:
                matched_products.append(p)

    # =========================
    # KHÔNG TÌM THẤY
    # =========================
    if not matched_products:

        return jsonify({
            "reply": f"Không tìm thấy sản phẩm phù hợp cho '{user_message}'."
        })

    # =========================
    # TRẢ VỀ PRODUCT CARD
    # =========================
    return jsonify({
        "reply": generate_product_cards(
            matched_products[:5],
            response_text_vi=f"🛒 Đây là một số sản phẩm phù hợp với nhu cầu của bạn:"
        )
    })

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    user_message = request.form.get("message", "Tìm giúp tôi sản phẩm tương tự như ảnh")

    if not file:
        return jsonify({"reply": "Không có file được tải lên."})

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], f"{uuid.uuid4().hex}_{filename}")
    file.save(filepath)

    yolo_label = ""

    if yolo_model:
        try:
            results = yolo_model.predict(
                source=filepath,
                conf=0.25,
                iou=0.7,
                classes=None,
                verbose=False
            )

            if results and len(results[0].boxes) > 0:
                best_box = results[0].boxes[0]
                class_id = int(best_box.cls.item())
                detected_class = yolo_model.names.get(class_id, "sản phẩm")
                yolo_label = detected_class.lower()

        except Exception as e:
            print(f"Lỗi khi chạy YOLO: {e}")

    try:
        query_embedding = get_clip_embedding(filepath)

    except Exception as e:
        print(f"Lỗi khi trích xuất embedding bằng CLIP: {e}")
        return jsonify({"reply": "Lỗi xử lý ảnh: Không thể trích xuất đặc trưng bằng CLIP."})

    recs, err_msg = find_similar_products_clip_faiss(query_embedding, k=5)

    allowed_categories = ["laptop", "tai nghe", "earphone", "tablet", "smartwatch", "đồng hồ"]

    valid_recs = []

    for p in recs:
        text = (
        p.get("name", "").lower() + " " +
        p.get("category", "").lower() + " " +
        p.get("description", "").lower()
    )

    if any(cat in text for cat in allowed_categories):
        valid_recs.append(p)

    if not valid_recs:
        return jsonify({
        "reply": "🛒 Mình chỉ hỗ trợ tìm sản phẩm có trong cửa hàng như laptop, tai nghe, tablet và đồng hồ thông minh."
    })

    recs = valid_recs


    if err_msg:
        html_reply = generate_product_cards([], response_text_vi=err_msg, target_lang="vi")
        return jsonify({"reply": html_reply})

    if not recs:
        msg_vi = "Rất tiếc, tôi không tìm thấy sản phẩm nào tương tự trong kho."
        html_reply = generate_product_cards([], response_text_vi=msg_vi, target_lang="vi")
        return jsonify({"reply": html_reply})

    try:
        simplified_recs = [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "price": p.get("price")
            }
            for p in recs
        ]

        products_json = json.dumps(simplified_recs, ensure_ascii=False)



        prompt = f"""
Bạn là chuyên gia tư vấn sản phẩm thương mại điện tử.


CHỈ được tư vấn sản phẩm có trong database dưới đây.
KHÔNG được bịa thêm sản phẩm, thương hiệu hoặc danh mục ngoài database.
Nếu chưa rõ nhu cầu, hỏi lại đúng 1 câu ngắn.

Người dùng gửi ảnh và yêu cầu:
"{user_message}"

Danh sách sản phẩm tìm được từ ảnh:
{products_json}

Hãy trả về JSON đúng format sau, KHÔNG thêm chữ ngoài JSON:

{{
  "reply_text": "1 câu giới thiệu ngắn gọn cho người dùng",
  "filtered_product_ids": ["id1", "id2"]
}}

NHIỆM VỤ:
- Chỉ được tư vấn sản phẩm có trong database như laptop, earphone, smartwatchh, tablet
- Chỉ tập trung vào nhu cầu mua hàng của người dùng
- Ưu tiên gợi ý sản phẩm cụ thể 
- Không được trả lời kiến thức hay vấn đề khác
- Không giải thích dài dòng và không đúng chủ đề 

QUY TẮC TRẢ LỜI:
- Trả lời NGẮN GỌN
- Dễ đọc
- Không viết bài văn dài
- xuống dòng rõ ràng 
- Tối đa 6 dòng
- Dùng bullet points
- Giọng thân thiện như chatbot bán hàng hiện đại
- Có emoji nhẹ nhàng
- Chỉ tập trung vào nhu cầu người dùng
- format đẹp cho giao diện chat

QUAN TRỌNG:
- Không được nói về những vấn đề ngoài lề nằm ngoài database 
- Không được trả lời như một chatbot đa năng 
- Không được tự dự đoán ý nghĩa của từ
- Nếu không hiểu rõ câu hỏi hoặc câu hỏi không rõ sản phẩm -> hỏi lại ngắn gọn

Nếu người dùng hỏi chung chung:
- hãy gợi ý nhanh các phân khúc sản phẩm phù hợp
- hỏi thêm 1 câu ngắn để làm rõ nhu cầu

KHÔNG:
- viết quá dài
- giải thích lan man
- liệt kê quá nhiều mẫu sản phẩm

Người dùng hỏi:
"{user_message}"

Ví dụ format đẹp:

🛒 Với nhu cầu của bạn, mình gợi ý:

• Laptop gaming
• Tai nghe không dây
• Máy tính bảng 
• Đồng hồ thông minh

🔥 Phân khúc phù hợp:
• Học tập
• Gaming
• Văn phòng

❓ Bạn ưu tiên:
• hiệu năng
• pin
• camera
• giá rẻ?
"""

        response = MODEL_MAIN.generate_content(prompt)

        raw_text = response.text.strip()
        clean_json = raw_text.replace("```json", "").replace("```", "").strip()

        gemini_result = json.loads(clean_json)

        final_reply_text = "🛒 Dưới đây là các sản phẩm phù hợp mình tìm được từ ảnh bạn gửi:"
        filtered_ids = gemini_result.get("filtered_product_ids", [p["id"] for p in recs])

        final_products = [p for p in recs if str(p["id"]) in [str(x) for x in filtered_ids]]

        if not final_products:
            final_products = recs

        html_reply = generate_product_cards(
            final_products,
            response_text_vi=final_reply_text,
            target_lang="vi"
        )

        return jsonify({"reply": html_reply})

    except Exception as e:

        print(f"Lỗi khi gọi Gemini trong /upload: {e}")

    msg_vi = """
📷 Mình đã nhận được hình ảnh sản phẩm của bạn.<br><br>

Lưu ý: Hình ảnh khác thương hiệu với các sản phẩm hiện có trong cửa hàng.<br>
Mình sẽ gợi ý các sản phẩm tương tự trong cửa hàng bạn có thể tham khảo.<br><br>

Bạn muốn mình tìm theo hướng nào?<br><br>

• Tìm sản phẩm tương tự<br>
• Tìm sản phẩm giá rẻ hơn<br>
• Tìm sản phẩm cấu hình mạnh hơn<br>
• Tìm sản phẩm cùng thương hiệu nếu có<br>
• Tìm sản phẩm phù hợp gaming / học tập / văn phòng<br><br>

Dưới đây là một số sản phẩm phù hợp:
"""

    html_reply = generate_product_cards(
        recs[:5],
        response_text_vi=msg_vi,
        target_lang="vi"
    )

    return jsonify({
        "reply": html_reply
    })


@app.route("/data/products/<path:filename>")
def serve_product_image(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# ----------------------------
# Run Flask
# ----------------------------
if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)