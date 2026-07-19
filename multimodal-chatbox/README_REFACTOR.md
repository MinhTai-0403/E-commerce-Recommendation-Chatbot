# Refactor chatbot Flask theo module

Bản này tách file `app.py` gần 5k dòng thành các nhóm chính:

```text
multimodal-chatbox/
├── app.py                         # Khởi tạo Flask, CORS, register blueprint
├── core.py                        # Logic lõi đang giữ nguyên từ app cũ để tránh vỡ luồng
├── routes/
│   ├── auth_routes.py             # Register/login/OTP/me/logout
│   ├── chat_routes.py             # /chat và /upload
│   ├── health_routes.py           # /api/health và /api/products/reload
│   └── static_routes.py           # Ảnh sản phẩm và frontend build
├── services/                      # Chỗ để tách tiếp: Gemini/Mongo/Auth/Email
├── catalog/                       # Chỗ để tách tiếp: load products, normalize metadata
├── search/                        # Chỗ để tách tiếp: FAISS, parser, validator
├── chat/                          # Chỗ để tách tiếp: khung gợi ý, card sản phẩm, câu trả lời
└── utils/                         # Chỗ để tách tiếp: text/price/html helpers
```

## Cách dùng

1. Giải nén thư mục này.
2. Copy toàn bộ file/thư mục bên trong vào thư mục `multimodal-chatbox/` của dự án.
3. Đảm bảo các file/thư mục cũ vẫn còn:
   - `index/products.json`
   - `index/embeddings.npy`
   - `index/faiss_index.index`
   - `clip_core.py`
   - `data/faq_flow.py`
   - `best.pt` nếu có dùng YOLO
4. Chạy:

```bash
python app.py
```

## Ghi chú quan trọng

- Đây là bước tách an toàn: `app.py` đã gọn, route đã tách riêng.
- `core.py` vẫn còn khá dài vì đang giữ nguyên logic search/validator/khung gợi ý để tránh làm hỏng các chức năng bạn đã chỉnh trước đó.
- Bước tiếp theo mới nên tách sâu `core.py` thành:
  - `services/gemini_service.py`
  - `catalog/loader.py`
  - `catalog/normalizer.py`
  - `search/query_parser.py`
  - `search/embedding_search.py`
  - `search/requirement_validator.py`
  - `chat/suggestion_boxes.py`
  - `chat/product_cards.py`
```
