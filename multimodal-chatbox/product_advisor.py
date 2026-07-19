from __future__ import annotations

import re
import unicodedata
from html import unescape
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


ADVICE_EXPLICIT_TERMS = (
    "tu van",
    "chon giup",
    "nen mua",
    "nen chon",
    "phu hop voi toi",
    "phu hop nhu cau",
    "goi y giup",
)

ADVICE_CRITERIA_TERMS = (
    "ngan sach", "tam gia", "gia re", "duoi", "tren", "khoang",
    "pin", "camera", "ram", "ssd", "bo nho", "man hinh", "chip",
    "mong nhe", "but", "gaming", "choi game", "hoc tap", "van phong",
    "do hoa", "chong on", "khong day", "5g", "wifi", "bluetooth",
)

QUERY_STOPWORDS = {
    "toi", "minh", "ban", "can", "muon", "mua", "tim", "kiem",
    "giup", "cho", "mot", "vai", "san", "pham", "loai", "hang",
    "tu", "van", "goi", "y", "nen", "chon", "phu", "hop", "voi",
    "co", "khong", "tot", "gia", "duoi", "tren", "khoang", "tam",
}

NEED_PROFILES = (
    {
        "key": "battery",
        "triggers": ("pin lau", "pin trau", "pin khoe", "pin tot", "thoi luong pin", "battery"),
        "spec_terms": ("pin", "battery", "mah", "thoi luong"),
    },
    {
        "key": "camera",
        "triggers": ("camera", "chup anh", "quay video", "camera dep"),
        "spec_terms": ("camera", "quay video", "ong kinh", "mp", "ois"),
    },
    {
        "key": "display",
        "triggers": ("man hinh", "hien thi", "oled", "amoled", "tan so quet"),
        "spec_terms": ("man hinh", "display", "do phan giai", "hz", "oled", "amoled"),
    },
    {
        "key": "performance",
        "triggers": ("gaming", "choi game", "hieu nang", "do hoa", "render"),
        "spec_terms": ("cpu", "chip", "vi xu ly", "gpu", "card do hoa", "ram", "tan so quet"),
    },
    {
        "key": "office",
        "triggers": ("van phong", "hoc tap", "sinh vien", "lam viec"),
        "spec_terms": ("cpu", "chip", "vi xu ly", "ram", "ssd", "bo nho", "pin", "trong luong"),
    },
    {
        "key": "portable",
        "triggers": ("mong nhe", "nhe", "gon nhe", "di chuyen", "du lich"),
        "spec_terms": ("trong luong", "kich thuoc", "do day", "weight", "dimension"),
    },
    {
        "key": "stylus",
        "triggers": ("co but", "kem but", "ho tro but", "stylus", "pencil", "s pen"),
        "spec_terms": ("but", "stylus", "pencil", "s pen"),
    },
    {
        "key": "audio",
        "triggers": ("chong on", "anc", "am thanh", "bass", "nghe nhac"),
        "spec_terms": ("chong on", "anc", "am thanh", "driver", "micro", "tan so"),
    },
    {
        "key": "connectivity",
        "triggers": ("5g", "wifi", "bluetooth", "khong day", "wireless"),
        "spec_terms": ("5g", "wifi", "bluetooth", "ket noi", "wireless"),
    },
)

CATEGORY_SPEC_PRIORITIES = {
    "phone": (
        "dung luong pin", "pin", "chip", "vi xu ly", "ram", "bo nho",
        "cong nghe man hinh", "kich thuoc man hinh", "camera", "he dieu hanh",
    ),
    "tablet": (
        "man hinh", "chip", "vi xu ly", "ram", "bo nho", "pin",
        "but", "stylus", "camera", "trong luong",
    ),
    "laptop": (
        "cpu", "vi xu ly", "ram", "ssd", "o cung", "card do hoa",
        "man hinh", "pin", "trong luong",
    ),
    "tv": (
        "kich thuoc man hinh", "do phan giai", "loai man hinh",
        "tan so quet", "he dieu hanh", "cong nghe hinh anh", "cong nghe am thanh",
    ),
    "headphones": (
        "chong on", "thoi luong pin", "ket noi", "bluetooth", "driver",
        "micro", "tan so", "thoi gian sac",
    ),
    "generic": (
        "cong suat", "dung luong", "kich thuoc", "trong luong", "chat lieu",
        "ket noi", "thoi luong pin", "bao hanh",
    ),
}


def normalize_text(value: Any) -> str:
    text = str(value or "").casefold().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(
        character
        for character in text
        if unicodedata.category(character) != "Mn"
    )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _contains_term(text: str, term: str) -> bool:
    normalized_term = normalize_text(term)
    if not text or not normalized_term:
        return False
    return re.search(
        rf"(?<![a-z0-9]){re.escape(normalized_term)}(?![a-z0-9])",
        text,
    ) is not None


def _flatten_text(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, dict):
        flattened: List[str] = []
        for item in value.values():
            flattened.extend(_flatten_text(item))
        return flattened
    if isinstance(value, (list, tuple, set)):
        flattened = []
        for item in value:
            flattened.extend(_flatten_text(item))
        return flattened
    text = _clean_display_text(value)
    return [text] if text else []


def _unique_text(values: Iterable[Any]) -> List[str]:
    output: List[str] = []
    seen = set()
    for value in values:
        text = _clean_display_text(value)
        key = normalize_text(text)
        if text and key and key not in seen:
            seen.add(key)
            output.append(text)
    return output


def _clean_display_text(value: Any, limit: int = 180) -> str:
    text = unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = f"{text[:limit - 3].rstrip()}..."
    return text


def _price_number(product: Dict[str, Any]) -> int:
    value = product.get("price", product.get("currentPrice", 0))
    if isinstance(value, (int, float)):
        return max(0, int(value))
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    return int(digits) if digits else 0


def _product_id(product: Dict[str, Any]) -> str:
    for key in ("id", "_id", "productId", "product_id", "sku", "slug"):
        value = product.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def _product_family_key(product: Dict[str, Any]) -> str:
    name = normalize_text(product.get("name") or product.get("title"))
    if not name:
        return _product_id(product)

    name = re.sub(r"\b\d+\s*(?:gb|tb)\b", " ", name)
    name = re.sub(
        r"\b(?:chinh hang|cong ty|cty|vn a|da kich hoat bao hanh|da kich hoat)\b.*$",
        " ",
        name,
    )
    name = re.sub(
        r"\b(?:mau\s+)?(?:trang|den|xanh|xanh duong|xanh la|do|vang|hong|tim|bac|xam|black pearl)\b$",
        " ",
        name,
    )
    return re.sub(r"\s+", " ", name).strip() or _product_id(product)


def _extract_spec_pairs(product: Dict[str, Any]) -> List[Tuple[str, str]]:
    pairs: List[Tuple[str, str]] = []
    seen = set()

    def add(label: Any, value: Any, group: str = "") -> None:
        label_text = _clean_display_text(label, limit=90)
        value_text = _clean_display_text(value, limit=220)
        if not label_text or not value_text:
            return
        full_label = f"{group} - {label_text}" if group and group not in label_text else label_text
        identity = (normalize_text(full_label), normalize_text(value_text))
        if identity in seen:
            return
        seen.add(identity)
        pairs.append((full_label, value_text))

    normalized_specs = product.get("specs")
    if isinstance(normalized_specs, dict):
        for label, value in normalized_specs.items():
            add(label, value)

    def consume(value: Any, group: str = "") -> None:
        if isinstance(value, list):
            for item in value:
                consume(item, group)
            return
        if not isinstance(value, dict):
            return

        nested_group = _clean_display_text(
            value.get("groupName") or value.get("group") or group,
            limit=80,
        )
        rows = value.get("rows")
        if isinstance(rows, list):
            consume(rows, nested_group)
            return

        label = value.get("label") or value.get("name") or value.get("key")
        spec_value = next(
            (
                value.get(key)
                for key in ("value", "content", "text", "values")
                if value.get(key) not in (None, "")
            ),
            None,
        )
        if label and spec_value is not None:
            add(label, spec_value, nested_group)
            return

        for key, item in value.items():
            if key in {"id", "groupName", "group", "labelUrl", "url"}:
                continue
            if isinstance(item, (dict, list)):
                consume(item, nested_group or _clean_display_text(key, limit=80))

    if not pairs:
        consume(product.get("specifications"))
    return pairs


def _category_key(product: Dict[str, Any]) -> str:
    direct_category_text = normalize_text(
        " ".join(
            _flatten_text([
                product.get("category"),
                product.get("categories"),
            ])
        )
    )
    if any(
        _contains_term(direct_category_text, term)
        for term in ("phu kien", "op lung", "bao da", "dich vu")
    ):
        return "generic"

    category_text = normalize_text(
        " ".join(
            _flatten_text([
                product.get("category"),
                product.get("categories"),
                product.get("name"),
            ])
        )
    )
    if any(_contains_term(category_text, term) for term in ("laptop", "may tinh xach tay", "macbook")):
        return "laptop"
    if any(_contains_term(category_text, term) for term in ("tablet", "may tinh bang", "ipad", "galaxy tab")):
        return "tablet"
    if any(_contains_term(category_text, term) for term in ("tivi", "smart tv", "television")):
        return "tv"
    if any(_contains_term(category_text, term) for term in ("tai nghe", "headphone", "earphone", "earbuds", "airpods")):
        return "headphones"
    if any(_contains_term(category_text, term) for term in ("dien thoai", "smartphone", "iphone", "galaxy")):
        return "phone"
    return "generic"


def is_explicit_advice_query(user_message: str) -> bool:
    normalized = normalize_text(user_message)
    return any(_contains_term(normalized, term) for term in ADVICE_EXPLICIT_TERMS)


def has_advice_criteria(user_message: str) -> bool:
    normalized = normalize_text(user_message)
    if any(_contains_term(normalized, term) for term in ADVICE_CRITERIA_TERMS):
        return True
    return re.search(
        r"\b\d+(?:[\.,]\d+)?\s*(?:trieu|tr|m|nghin|k|gb|tb|inch|hz|mah|w)\b",
        normalized,
    ) is not None


def should_use_advisor(
    user_message: str,
    *,
    specific_model: bool = False,
    has_criteria: bool = False,
) -> bool:
    explicit = is_explicit_advice_query(user_message)
    if specific_model and not explicit:
        return False
    return explicit or has_criteria or has_advice_criteria(user_message)


def product_detail_profile(product: Dict[str, Any]) -> Dict[str, Any]:
    specs = _extract_spec_pairs(product)
    highlights = _unique_text(_flatten_text(product.get("highlights")))
    detail_blob_info = product.get("detailBlobInfo")
    blob_decoded = bool(
        isinstance(detail_blob_info, dict)
        and detail_blob_info.get("decoded")
    )
    description_text = " ".join(
        _unique_text(
            _flatten_text([
                product.get("description"),
                product.get("articleText"),
                product.get("articleSections"),
            ])
        )
    )

    has_name = bool(_clean_display_text(product.get("name") or product.get("title")))
    price = _price_number(product)
    category_key = _category_key(product)
    minimum_price = {
        "phone": 100_000,
        "tablet": 100_000,
        "laptop": 500_000,
        "tv": 500_000,
        "headphones": 10_000,
        "generic": 1,
    }.get(category_key, 1)
    has_price = price >= minimum_price
    has_image = bool(
        product.get("image_path")
        or product.get("image")
        or product.get("image_url")
        or product.get("primaryImage")
    )
    has_category = bool(product.get("category") or product.get("categories"))
    has_brand = bool(product.get("brand") or product.get("manufacturer"))

    score = 0
    score += 10 if has_name else 0
    score += 15 if has_price else 0
    score += 10 if has_image else 0
    score += 5 if has_category else 0
    score += 5 if has_brand else 0
    score += min(35, len(specs) * 5)
    score += min(10, len(highlights) * 4)
    score += 10 if len(description_text) >= 120 else (5 if description_text else 0)
    score += 10 if blob_decoded else 0

    has_rich_details = (
        len(specs) >= 3
        or (len(specs) >= 2 and blob_decoded)
        or (len(highlights) >= 2 and len(description_text) >= 80)
    )
    ready = bool(
        has_name
        and has_price
        and has_image
        and has_category
        and has_rich_details
        and score >= 60
    )

    return {
        "ready": ready,
        "score": min(100, score),
        "specs": specs,
        "highlights": highlights,
        "blob_decoded": blob_decoded,
        "description_length": len(description_text),
        "missing": [
            label
            for label, present in (
                ("tên", has_name),
                ("giá", has_price),
                ("hình ảnh", has_image),
                ("danh mục", has_category),
                ("thông số chi tiết", has_rich_details),
            )
            if not present
        ],
    }


def _matched_need_profiles(user_message: str) -> List[Dict[str, Any]]:
    normalized_query = normalize_text(user_message)
    return [
        profile
        for profile in NEED_PROFILES
        if any(_contains_term(normalized_query, trigger) for trigger in profile["triggers"])
    ]


def _profile_has_need_evidence(
    profile: Dict[str, Any],
    need_profile: Dict[str, Any],
) -> bool:
    return any(
        any(
            _contains_term(normalize_text(f"{label} {value}"), term)
            for term in need_profile["spec_terms"]
        )
        for label, value in profile["specs"]
    )


def _meaningful_query_tokens(user_message: str) -> List[str]:
    normalized = normalize_text(user_message)
    return [
        token
        for token in re.findall(r"[a-z0-9]+", normalized)
        if len(token) >= 3 and token not in QUERY_STOPWORDS
    ]


def _spec_relevance_score(
    spec: Tuple[str, str],
    *,
    query_tokens: Sequence[str],
    need_profiles: Sequence[Dict[str, Any]],
    category_key: str,
) -> int:
    label, value = spec
    label_text = normalize_text(label)
    full_text = normalize_text(f"{label} {value}")
    score = 0

    for profile in need_profiles:
        if any(_contains_term(full_text, term) for term in profile["spec_terms"]):
            score += 90

    score += min(
        45,
        sum(15 for token in query_tokens if _contains_term(full_text, token)),
    )

    priorities = CATEGORY_SPEC_PRIORITIES.get(
        category_key,
        CATEGORY_SPEC_PRIORITIES["generic"],
    )
    for index, term in enumerate(priorities):
        if _contains_term(label_text, term):
            score += max(8, 40 - index * 3)
            break

    return score


def _select_key_specs(
    product: Dict[str, Any],
    profile: Dict[str, Any],
    user_message: str,
    limit: int = 4,
) -> List[Dict[str, str]]:
    query_tokens = _meaningful_query_tokens(user_message)
    need_profiles = _matched_need_profiles(user_message)
    category_key = _category_key(product)
    ranked = []

    for position, spec in enumerate(profile["specs"]):
        relevance = _spec_relevance_score(
            spec,
            query_tokens=query_tokens,
            need_profiles=need_profiles,
            category_key=category_key,
        )
        ranked.append((relevance, position, spec))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [
        {"label": label, "value": value}
        for _, _, (label, value) in ranked[:max(0, int(limit))]
    ]


def _format_price(value: Optional[int]) -> str:
    return f"{int(value):,}đ".replace(",", ".") if value else ""


def _price_reason(product: Dict[str, Any], constraints: Dict[str, Any]) -> str:
    price = _price_number(product)
    price_min = constraints.get("price_min")
    price_max = constraints.get("price_max")
    if not price:
        return ""
    if price_min is not None and price_max is not None:
        return (
            f"Giá {_format_price(price)} nằm trong khoảng "
            f"{_format_price(price_min)}–{_format_price(price_max)} bạn đặt ra."
        )
    if price_max is not None:
        return f"Giá {_format_price(price)} không vượt ngân sách {_format_price(price_max)}."
    if price_min is not None:
        return f"Giá {_format_price(price)} đáp ứng mức tối thiểu {_format_price(price_min)}."
    return ""


def _build_reasons(
    product: Dict[str, Any],
    profile: Dict[str, Any],
    key_specs: Sequence[Dict[str, str]],
    user_message: str,
    constraints: Dict[str, Any],
) -> List[str]:
    reasons: List[str] = []
    price_reason = _price_reason(product, constraints)
    if price_reason:
        reasons.append(price_reason)

    need_profiles = _matched_need_profiles(user_message)
    for need in need_profiles:
        matched_spec = next(
            (
                spec
                for spec in key_specs
                if any(
                    _contains_term(
                        normalize_text(f"{spec['label']} {spec['value']}"),
                        term,
                    )
                    for term in need["spec_terms"]
                )
            ),
            None,
        )
        if matched_spec:
            reasons.append(f"{matched_spec['label']}: {matched_spec['value']}.")

    if len(reasons) < 2:
        query_tokens = _meaningful_query_tokens(user_message)
        matching_highlight = next(
            (
                highlight
                for highlight in profile["highlights"]
                if any(
                    _contains_term(normalize_text(highlight), token)
                    for token in query_tokens
                )
            ),
            None,
        )
        if matching_highlight:
            reasons.append(matching_highlight.rstrip(".") + ".")

    if len(reasons) < 2 and key_specs:
        first_spec = key_specs[0]
        reasons.append(f"{first_spec['label']}: {first_spec['value']}.")

    if len(reasons) < 2:
        reasons.append(
            f"Có {len(profile['specs'])} thông số chi tiết để đối chiếu trước khi chọn mua."
        )

    return _unique_text(reasons)[:3]


def _build_cautions(product: Dict[str, Any]) -> List[str]:
    cautions = []
    status = _clean_display_text(
        product.get("statusLabel") or product.get("stockNote")
    )
    availability_present = any(
        product.get(key) not in (None, "")
        for key in ("availability", "inStock", "inventory")
    )
    if "lien he" in normalize_text(status) or not availability_present:
        cautions.append("Cần liên hệ để kiểm tra tồn kho thực tế.")

    product_name = normalize_text(product.get("name"))
    if any(
        _contains_term(product_name, term)
        for term in ("hang cu", "may cu", "cu tray xuoc", "da kich hoat")
    ):
        cautions.append("Đây là sản phẩm cũ hoặc đã kích hoạt; nên kiểm tra tình trạng máy.")
    return cautions[:2]


def _battery_capacity(profile: Dict[str, Any]) -> int:
    capacities = []
    for label, value in profile["specs"]:
        raw_text = str(f"{label} {value}").casefold()
        normalized_text = normalize_text(raw_text)
        if not any(term in normalized_text for term in ("pin", "battery", "mah")):
            continue
        for match in re.finditer(
            r"\b(\d{1,3}(?:[\.,\s]\d{3})+|\d{3,6})\s*mah\b",
            raw_text,
        ):
            digits = re.sub(r"[^0-9]", "", match.group(1))
            if digits:
                capacities.append(int(digits))
    return max(capacities, default=0)


def build_product_advice(
    products: Sequence[Dict[str, Any]],
    user_message: str,
    *,
    price_constraints: Optional[Dict[str, Any]] = None,
    limit: int = 5,
    allow_variants: bool = False,
) -> List[Dict[str, Any]]:
    constraints = dict(price_constraints or {})
    need_profiles = _matched_need_profiles(user_message)
    battery_requested = any(profile["key"] == "battery" for profile in need_profiles)
    candidates = []
    seen_ids = set()

    for position, product in enumerate(products):
        product_id = _product_id(product)
        if product_id and product_id in seen_ids:
            continue
        if product_id:
            seen_ids.add(product_id)

        profile = product_detail_profile(product)
        if not profile["ready"]:
            continue
        if any(
            not _profile_has_need_evidence(profile, need_profile)
            for need_profile in need_profiles
        ):
            continue
        battery_capacity = _battery_capacity(profile)
        if (
            battery_requested
            and _category_key(product) in {"phone", "tablet"}
            and battery_capacity < 4500
        ):
            continue

        key_specs = _select_key_specs(product, profile, user_message)
        reasons = _build_reasons(
            product,
            profile,
            key_specs,
            user_message,
            constraints,
        )
        cautions = _build_cautions(product)
        fit_score = float(profile["score"]) + max(0.0, 18.0 - position)

        if need_profiles:
            evidence_text = normalize_text(
                " ".join(
                    f"{spec['label']} {spec['value']}"
                    for spec in key_specs
                )
            )
            fit_score += sum(
                8.0
                for need in need_profiles
                if any(_contains_term(evidence_text, term) for term in need["spec_terms"])
            )
        if battery_requested:
            fit_score += min(15.0, battery_capacity / 400.0)

        candidates.append({
            "product": product,
            "product_id": product_id,
            "data_score": profile["score"],
            "fit_score": round(fit_score, 2),
            "battery_capacity": battery_capacity,
            "reasons": reasons,
            "key_specs": key_specs,
            "cautions": cautions,
        })

    candidates.sort(
        key=lambda item: (
            -(
                item["battery_capacity"]
                if battery_requested
                and _category_key(item["product"]) in {"phone", "tablet"}
                else 0
            ),
            -item["fit_score"],
            -item["data_score"],
            normalize_text(item["product"].get("name")),
        )
    )
    if allow_variants:
        return candidates[:max(0, int(limit))]

    selected = []
    seen_families = set()
    for item in candidates:
        family_key = _product_family_key(item["product"])
        if family_key and family_key in seen_families:
            continue
        if family_key:
            seen_families.add(family_key)
        selected.append(item)
        if len(selected) >= max(0, int(limit)):
            break
    return selected


def serialize_product_advice(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    serialized = []
    for item in items:
        product = item["product"]
        serialized.append({
            "product_id": item.get("product_id") or _product_id(product),
            "name": _clean_display_text(product.get("name") or product.get("title")),
            "price": _price_number(product),
            "data_score": item.get("data_score", 0),
            "reasons": list(item.get("reasons") or []),
            "key_specs": list(item.get("key_specs") or []),
            "cautions": list(item.get("cautions") or []),
        })
    return serialized
