import json
import os
import uuid

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

import core


chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/chat", methods=["POST"])
def chat():
    user_document, auth_error = core.get_authenticated_user()
    if auth_error:
        return jsonify({"error": auth_error}), 401

    payload = request.get_json(silent=True) or {}
    user_message = str(payload.get("message", "")).strip()

    authenticated_name = (
        str(user_document.get("full_name", "")).strip()
        if user_document
        else ""
    )
    frontend_name = str(
        payload.get("user_name")
        or payload.get("userName")
        or ""
    ).strip()
    user_name = core._clean_chat_user_name(authenticated_name or frontend_name)

    print("ĐÃ VÀO ROUTE /chat")
    print("TÀI KHOẢN:", user_name or "Khách")
    print("TIN NHẮN:", user_message)

    if not user_message:
        return jsonify({"reply": "Bạn hãy nhập nội dung cần hỏi nhé."}), 400

    social_reply = core.get_natural_social_response(user_message, user_name)
    if social_reply:
        return jsonify({"reply": social_reply})

    current_products = core.products
    if not current_products or core.faiss_index is None or core.product_embeddings is None:
        return jsonify({
            "reply": (
                "Bộ tìm kiếm sản phẩm cục bộ chưa sẵn sàng. "
                "Hãy chạy build_index.py và kiểm tra thư mục index."
            )
        }), 503

    matched_products, parsed_query, retrieval_info = core.search_products_text_embedding(
        user_message,
        current_products,
        limit=40,
    )
    specific_model_query = core.is_specific_model_query(
        user_message=user_message,
        parsed_query=parsed_query,
        matched_products=matched_products,
    )

    print("CHẾ ĐỘ TÌM KIẾM VĂN BẢN:", retrieval_info.get("mode"))
    print("CLIP TEXT QUERY:", retrieval_info.get("clip_query"))
    if retrieval_info.get("error"):
        print("CẢNH BÁO RETRIEVAL:", retrieval_info.get("error"))
    print("TRUY VẤN CHUẨN HÓA:", parsed_query["normalized_query"])
    print("CONCEPT:", [concept["trigger"] for concept in parsed_query["concepts"]])
    print("TOKEN:", parsed_query["tokens"])
    print("SỐ KẾT QUẢ:", len(matched_products))

    if core.should_ask_clarifying_question(
        user_message,
        parsed_query=parsed_query,
        matched_products=matched_products,
    ):
        suggestions = core.get_clarification_suggestion_actions(
            user_message,
            parsed_query=parsed_query,
            matched_products=matched_products,
        )
        return jsonify({
            "reply": core.build_clarifying_suggestion_box(
                user_message,
                user_name=user_name,
                parsed_query=parsed_query,
                matched_products=matched_products,
                include_chips=False,
            ),
            "response_type": "clarification",
            "products": [],
            "suggestions": suggestions,
            "needs_clarification": True,
        })

    final_checked_products = []
    seen_final_ids = set()
    price_constraints = core.parse_price_constraints(user_message)
    for product in matched_products:
        product_id = str(product.get("id", ""))
        if product_id and product_id in seen_final_ids:
            continue
        if core.product_satisfies_user_requirements(
            product,
            user_message,
            parsed_query=parsed_query,
            price_constraints=price_constraints,
        ):
            final_checked_products.append(product)
            if product_id:
                seen_final_ids.add(product_id)
    matched_products = final_checked_products
    print("SỐ KẾT QUẢ SAU VALIDATOR:", len(matched_products))
    advisory_query = core.is_product_advisory_query(
        user_message,
        parsed_query=parsed_query,
        matched_products=matched_products,
        specific_model=specific_model_query,
    )

    if not matched_products:
        faq_reply = core.get_faq_response(user_message.lower())
        if faq_reply and not core.looks_like_product_request(user_message):
            return jsonify({
                "reply": faq_reply,
                "response_type": "faq",
            })

        raw_alternative_products = []
        if not specific_model_query:
            raw_alternative_products = core.find_alternative_products(
                user_message,
                current_products,
                limit=8,
            )
        alternative_products = []
        seen_alternative_ids = set()
        for product in raw_alternative_products:
            product_id = str(product.get("id", ""))
            if product_id and product_id in seen_alternative_ids:
                continue
            if core.product_satisfies_user_requirements(
                product,
                user_message,
                parsed_query=parsed_query,
                price_constraints=price_constraints,
            ):
                alternative_products.append(product)
                if product_id:
                    seen_alternative_ids.add(product_id)
            if len(alternative_products) >= 3:
                break

        available_categories = core.get_available_category_names(
            current_products,
            limit=5,
        )
        not_found_intro = core.generate_product_not_found_reply(
            user_message=user_message,
            user_name=user_name,
            alternative_products=alternative_products,
            available_categories=available_categories,
        )

        if alternative_products:
            if advisory_query:
                alternative_advice = core.prepare_product_advice(
                    alternative_products,
                    user_message,
                    price_constraints=price_constraints,
                    limit=3,
                )
                if alternative_advice:
                    advised_products = [
                        item["product"]
                        for item in alternative_advice
                    ]
                    serialized_advice = core.serialize_product_advice(
                        alternative_advice
                    )
                    return jsonify({
                        "reply": core.generate_product_cards(
                            advised_products,
                            response_text_vi=not_found_intro,
                            product_advice=alternative_advice,
                        ),
                        "response_type": "product_advisor",
                        "products": [
                            {
                                "id": item["product_id"],
                                "name": item["name"],
                                "price": item["price"],
                            }
                            for item in serialized_advice
                        ],
                        "advice": serialized_advice,
                    })

            return jsonify({
                "reply": core.generate_product_cards(
                    alternative_products,
                    response_text_vi=not_found_intro,
                ),
                "response_type": "product_alternatives",
            })

        return jsonify({
            "reply": core._safe_text(not_found_intro).replace("\n", "<br>"),
            "response_type": "not_found",
            "products": [],
        })

    if advisory_query:
        advice_items = core.prepare_product_advice(
            matched_products,
            user_message,
            price_constraints=price_constraints,
            limit=5,
            allow_variants=specific_model_query,
        )
        if not advice_items:
            return jsonify({
                "reply": core.generate_advice_unavailable_reply(
                    user_message,
                    user_name=user_name,
                ),
                "response_type": "advice_unavailable",
                "products": [],
                "advice": [],
            })

        advised_products = [item["product"] for item in advice_items]
        serialized_advice = core.serialize_product_advice(advice_items)
        query_display_name = core.get_product_query_display_name(
            user_message,
            parsed_query,
            matched_products=advised_products,
        )
        intro = (
            "Mình đã đối chiếu yêu cầu với thông số chi tiết và chọn "
            f"các sản phẩm phù hợp với {query_display_name}:"
        )
        if user_name:
            intro = (
                f"{user_name}, mình đã đối chiếu yêu cầu với thông số chi tiết "
                f"và chọn các sản phẩm phù hợp với {query_display_name}:"
            )

        return jsonify({
            "reply": core.generate_product_cards(
                advised_products,
                response_text_vi=intro,
                product_advice=advice_items,
            ),
            "response_type": "product_advisor",
            "products": [
                {
                    "id": item["product_id"],
                    "name": item["name"],
                    "price": item["price"],
                }
                for item in serialized_advice
            ],
            "advice": serialized_advice,
        })

    query_display_name = core.get_product_query_display_name(
        user_message,
        parsed_query,
        matched_products=matched_products,
    )
    intro = f"🛒 Mình tìm thấy một số sản phẩm phù hợp với {query_display_name}:"
    if user_name:
        intro = (
            f"🛒 {user_name}, mình tìm thấy một số sản phẩm phù hợp với "
            f"{query_display_name}:"
        )

    return jsonify({
        "reply": core.generate_product_cards(
            matched_products[:5],
            response_text_vi=intro,
        ),
        "response_type": "product_search",
    })


@chat_bp.route("/upload", methods=["POST"])
def upload():
    user_document, auth_error = core.get_authenticated_user()
    if auth_error:
        return jsonify({"error": auth_error}), 401

    current_products = core.products
    if not current_products or core.faiss_index is None or core.product_embeddings is None:
        return jsonify({
            "reply": (
                "Bộ tìm kiếm sản phẩm cục bộ chưa sẵn sàng. "
                "Hãy chạy build_index.py và kiểm tra thư mục index."
            )
        }), 503

    file = request.files.get("file")
    user_message = request.form.get(
        "message",
        "Tìm giúp tôi sản phẩm tương tự như ảnh",
    )
    authenticated_name = (
        str(user_document.get("full_name", "")).strip()
        if user_document
        else ""
    )
    frontend_name = str(request.form.get("user_name", "")).strip()
    user_name = core._clean_chat_user_name(authenticated_name or frontend_name)

    if not file or not file.filename:
        return jsonify({"reply": "Không có file được tải lên."}), 400
    if not str(file.mimetype or "").startswith("image/"):
        return jsonify({"reply": "Vui lòng chọn một file ảnh hợp lệ."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(
        current_app.config["UPLOAD_FOLDER"],
        f"{uuid.uuid4().hex}_{filename}",
    )
    file.save(filepath)

    yolo_label = ""
    if core.yolo_model:
        try:
            results = core.yolo_model.predict(
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
                    core.yolo_model.names.get(class_id, "sản phẩm")
                ).lower()
        except Exception as exc:
            print(f"Lỗi khi chạy YOLO: {exc}")

    try:
        query_embedding = core.get_clip_embedding(filepath)
    except Exception as exc:
        print(f"Lỗi khi trích xuất embedding bằng CLIP: {exc}")
        return jsonify({
            "reply": "Lỗi xử lý ảnh: Không thể trích xuất đặc trưng bằng CLIP."
        }), 500

    recs, err_msg = core.find_similar_products_clip_faiss(query_embedding, k=5)
    if err_msg:
        html_reply = core.generate_product_cards(
            [],
            response_text_vi=err_msg,
            target_lang="vi",
        )
        return jsonify({"reply": html_reply}), 503

    recs = [
        product
        for product in recs
        if product and product.get("id")
    ]
    if not recs:
        return jsonify({
            "reply": "Không tìm thấy sản phẩm tương tự trong dữ liệu cửa hàng."
        })

    if core.MODEL_MAIN:
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

            prompt = f'''
Bạn là chuyên gia tư vấn sản phẩm thương mại điện tử.
Chỉ được chọn sản phẩm trong danh sách metadata cục bộ dưới đây.
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
'''

            response = core.MODEL_MAIN.generate_content(prompt)
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
                "reply": core.generate_product_cards(
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
        "reply": core.generate_product_cards(
            recs[:5],
            response_text_vi=intro,
            target_lang="vi",
        )
    })
