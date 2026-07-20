import re

# ----------------------------------------------------------------------
# XÂY DỰNG LOGIC LINH HOẠT (RULE-BASED) - PHIÊN BẢN 3
# ----------------------------------------------------------------------

# Tạo các "từ điển" đồng nghĩa
KEYWORDS = {
    "intent": {
        "tư vấn": ["tư vấn", "chọn mua", "mua", "nên mua"],
        "sửa lỗi": ["sửa lỗi", "lỗi cài", "bị lỗi", "fix", "error"],
        "cấu hình": ["cấu hình", "chạy mô hình", "học máy", "build pc"],
        "hướng dẫn": ["hướng dẫn", "cài đặt", "cài phần mềm"]
    },
    "category": {
        "laptop": ["laptop", "máy tính xách tay", "láp top", "laptops"],
        "earphone": ["tai nghe", "earphone", "headphone", "airpod", "airpods"],
        "smart watch": ["đồng hồ", "đồng hồ thông minh", "smart watch", "watch"], # Đảm bảo key là 2 từ
        "tablet": ["máy tính bảng", "tablet", "ipad"]
    }
}

# Từ khóa về giá
PRICE_KEYWORDS = {
    "max": ["dưới", "under", "less", "trở xuống", "tối đa"],
    "min": ["trên", "over", "more", "trở lên", "tối thiểu", "từ"]
}

# Từ khóa (Keywords) và Từ loại bỏ (Stop Words)
# Dùng để lọc ra các từ khóa chung
STOP_WORDS = [
    'bạn', 'có', 'thể', 'nói', 'rõ', 'hơn', 'một', 'chút', 'được', 'không', 'đang',
    'muốn', 'hỏi', 'hoặc', 'làm', 'gì', 'liên', 'quan', 'đến', 'ví', 'dụ', 'như',
    'cho', 'mình', 'biết', 'mục', 'đích', 'sẽ', 'hỗ', 'trợ', 'chi', 'tiết', 'nhé',
    'tìm', 'kiếm', 'giúp', 'tôi', 'với', 'là', 'dùng', 'loại', 'và', 'của', 'cái',
    'chiếc', 'máy', 'này', 'đó', 'kia', 'ạ', 'về', 'giá', 'khoảng', 'tầm'
]

# Regex để tìm kiếm thông số kỹ thuật
# Giờ đây chúng ta sẽ tìm "16gb" thay vì chỉ "16"
SPEC_REGEX = {
    "ram": re.compile(r'(\d+)\s*gb'), # Tìm số theo sau là "gb" (ví dụ: 16gb, 8 gb)
    "cpu": re.compile(r'(intel|amd|ryzen|core i[3579]|m[1234]|a\d+|snapdragon|exynos|helio)', re.IGNORECASE),
    "screen": re.compile(r'(\d+|\d+\.\d+)\s*inch') # Tìm số theo sau là "inch"
}


def extract_params_from_nlp(user_input):
    """
    Nâng cấp V3: Trích xuất intent, category, price_filters, specs_to_find (dict), 
    và các search_terms (list).
    """
    intent, category = None, None
    price_max, price_min = None, None
    specs_to_find = {} # Nâng cấp: Dùng dict để tìm spec cụ thể
    search_terms = []    # Giữ lại để tìm các từ khóa chung (như "dell", "acer")
    
    text_lower = user_input.lower()
    processed_text = text_lower # Văn bản sẽ bị "ăn" dần sau mỗi bước

    # 1. Tìm Intent (như cũ)
    for key, synonyms in KEYWORDS["intent"].items():
        if any(synonym in processed_text for synonym in synonyms):
            intent = key
            for s in synonyms: processed_text = processed_text.replace(s, "")
            break 

    # 2. Tìm Category (như cũ)
    for key, synonyms in KEYWORDS["category"].items():
        if any(synonym in processed_text for synonym in synonyms):
            category = key
            for s in synonyms: processed_text = processed_text.replace(s, "")
            break 

    # 3. Tìm Giá (như cũ, đã sửa "trở xuống")
    numbers = [int(s) for s in re.findall(r'\d+', text_lower.replace('.', '').replace(',', ''))]
    if numbers:
        price_found = False
        price = numbers[0]
        if "triệu" in text_lower or "tr" in text_lower: price *= 1000000
        elif "k" in text_lower: price *= 1000

        if any(kw in text_lower for kw in PRICE_KEYWORDS["max"]):
            price_max = price
            price_found = True
        elif any(kw in text_lower for kw in PRICE_KEYWORDS["min"]):
            price_min = price
            price_found = True
        
        if price_found:
            for kw in PRICE_KEYWORDS["max"]: processed_text = processed_text.replace(kw, "")
            for kw in PRICE_KEYWORDS["min"]: processed_text = processed_text.replace(kw, "")
            processed_text = re.sub(r'[\d., triệu tr k]+', '', processed_text)

    # 4. (NÂNG CẤP) Tìm Specs Cụ Thể bằng Regex
    
    # Tìm RAM (ví dụ: "16gb")
    ram_match = SPEC_REGEX["ram"].search(text_lower)
    if ram_match:
        specs_to_find["ram"] = ram_match.group(1) # Lấy số "16"
        processed_text = processed_text.replace(ram_match.group(0), "") # Xóa "16gb"

    # Tìm Màn hình (ví dụ: "14 inch")
    screen_match = SPEC_REGEX["screen"].search(text_lower)
    if screen_match:
        specs_to_find["screen"] = screen_match.group(1) # Lấy số "14"
        processed_text = processed_text.replace(screen_match.group(0), "")

    # 5. (NÂNG CẤP) Tìm Từ Khóa Chung (Brand, CPU,...)
    
    # Tìm CPU
    cpu_match = SPEC_REGEX["cpu"].search(text_lower)
    if cpu_match:
        term = cpu_match.group(1)
        # Chuẩn hóa (i5 -> "core i5", ryzen 5 -> "ryzen 5")
        if re.match(r'i\d', term): term = f"core {term}"
        if re.match(r'ryzen \d', term): term = f"ryzen {term}"
        
        if term not in search_terms: search_terms.append(term)
        processed_text = processed_text.replace(cpu_match.group(0), "")

    # Xóa stop words và lấy các từ khóa còn lại
    words = processed_text.split()
    remaining_words = [w.strip() for w in words if w not in STOP_WORDS and len(w.strip()) > 1]
    
    for term in remaining_words:
        if term not in search_terms:
            search_terms.append(term) # Các từ còn lại là search_terms (ví dụ: "dell", "acer")

    print(f"[NLP Extract V3] Intent: {intent}, Category: {category}, Max: {price_max}, Min: {price_min}, Specs: {specs_to_find}, Terms: {search_terms}")
    
    return intent, category, price_max, price_min, specs_to_find, search_terms