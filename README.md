# E-commerce Recommendation Chatbot

AI chatbot hỗ trợ gợi ý sản phẩm thương mại điện tử bằng hình ảnh và ngôn ngữ tự nhiên.

## Giới thiệu

Đây là hệ thống chatbot gợi ý sản phẩm thương mại điện tử sử dụng trí tuệ nhân tạo nhằm hỗ trợ người dùng tìm kiếm và đề xuất sản phẩm thông qua văn bản hoặc hình ảnh.

Hệ thống kết hợp nhiều công nghệ AI hiện đại như:

- Gemini API để hội thoại
- OpenCLIP để trích xuất đặc trưng hình ảnh
- FAISS để tìm kiếm sản phẩm tương đồng
- MongoDB để lưu trữ dữ liệu sản phẩm
- Flask để xây dựng API Backend


## Tổng quan

Dự án gồm hai phần chính:

- `multimodal-chatbox/`: ứng dụng Python/Flask cho chatbot, nhận diện hình ảnh và gợi ý sản phẩm.
- `src/` và `scripts/`: pipeline Node.js để kết nối MongoDB, crawl dữ liệu sản phẩm CellphoneS, kiểm tra coverage sitemap và xem thống kê dữ liệu.

## Công nghệ

- Python, Flask
- YOLOv8
- Gemini API
- OpenCV
- Node.js
- MongoDB Atlas

## Chạy chatbot

```bash
cd multimodal-chatbox
pip install -r requirements.txt
python app.py
```

## Cấu hình data pipeline

Tạo file `.env` ở root repo dựa trên `.env.example`:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/?appName=<app-name>
MONGODB_DB=cosarii
MONGODB_PRODUCTS_COLLECTION=cellphones_products
```

File `.env` chứa thông tin kết nối thật và đã được ignore bởi git.

## Lệnh MongoDB và CellphoneS

```bash
npm install
npm run mongo:test
npm run mongo:cellphones:summary
npm run mongo:cellphones:export-sample
npm run scrape:cellphones:sample
```

Các lệnh chính:

- `npm run mongo:test`: kiểm tra kết nối MongoDB.
- `npm run mongo:cellphones:summary`: xem số lượng sản phẩm CellphoneS đã lưu và một sản phẩm mẫu.
- `npm run mongo:cellphones:export-sample`: xuất một vài sản phẩm từ MongoDB ra `data/cellphones-products.sample.json`.
- `npm run scrape:cellphones:sample`: crawl thử một sample nhỏ.
- `npm run scrape:cellphones`: chạy scraper tùy biến bằng tham số CLI.
- `npm run verify:cellphones`: kiểm tra URL trong sitemap đã có trong MongoDB chưa.
- `npm run verify:cellphones -- --sample-missing=0 --report-sitemaps`: xem số URL còn thiếu theo từng sitemap để chia worker crawl.

## Dữ liệu

Dữ liệu CellphoneS đầy đủ đang nằm trong MongoDB collection `cellphones_products`.

Để người mới đọc repo vẫn nhìn thấy cấu trúc dữ liệu mà không cần mở MongoDB, repo có file sample:

```text
data/cellphones-products.sample.json
```

Mỗi sản phẩm được chuẩn hóa theo các field như `url`, `name`, `brand`, `price`, `priceCurrency`, `availability`, `categories`, `primaryImage`, `sourceUrls`, `scrapedAt`.

## Chức năng chính

- Tìm kiếm sản phẩm bằng văn bản.
- Tìm kiếm sản phẩm bằng hình ảnh.
- Gợi ý sản phẩm tương tự.
- Hỗ trợ hội thoại với AI.
- Tìm kiếm nhanh bằng FAISS.
- Quản lý dữ liệu sản phẩm bằng MongoDB.


## Ghi chú crawl

CellphoneS có bot protection/rate limit. Khi crawl nhiều luồng quá nhanh, scraper sẽ dừng thay vì ghi dữ liệu lỗi vào MongoDB. Nên ưu tiên chạy `scripts/scrape-cellphones-adaptive.ps1` để tự cooldown và resume theo sitemap.
