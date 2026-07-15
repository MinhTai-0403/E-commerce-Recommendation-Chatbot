from __future__ import annotations

import base64
import gzip
import json
import re
import unicodedata
import zlib
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Optional, Tuple


RUNTIME_PRODUCT_FIELDS = (
    "_id", "productKey", "id", "productId", "product_id", "sku", "slug",
    "name", "title", "productName", "product_name", "brand", "brandKey",
    "manufacturer", "category", "category_name", "categories", "categoryTrail",
    "source", "currentPrice", "originalPrice", "price", "discount",
    "installment", "statusLabel", "stockNote", "shortNotice", "rating",
    "ratingCount", "trainingLabels", "training_labels", "labels", "tags",
    "keywords", "description", "highlights", "specs", "specifications",
    "colors", "variants", "promotions", "priceBenefits", "faqs",
    "reviewSummary", "articleTitle", "articleText", "primaryImage",
    "images", "image", "image_path", "thumbnail", "thumbnailUrl", "imageUrl",
    "image_url", "gallery", "url", "sourceUrl", "sourceUrls", "inputUrl",
    "detailBlobInfo",
)

BUILD_ONLY_RUNTIME_FIELDS = ("media",)
RUNTIME_ARTICLE_TEXT_LIMIT = 12000


class DetailBlobDecodeError(ValueError):
    pass


class _HTMLTextExtractor(HTMLParser):
    _BLOCK_TAGS = {
        "article", "aside", "blockquote", "br", "div", "figcaption",
        "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
        "header", "hr", "li", "main", "ol", "p", "section", "table",
        "tbody", "td", "th", "thead", "tr", "ul",
    }
    _IGNORED_TAGS = {"script", "style", "svg", "noscript"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS:
            self._ignored_depth += 1
        elif not self._ignored_depth and tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in self._IGNORED_TAGS and self._ignored_depth:
            self._ignored_depth -= 1
        elif not self._ignored_depth and tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth and data:
            self._parts.append(data)

    def text(self) -> str:
        value = unescape("".join(self._parts))
        value = re.sub(r"[ \t\f\v]+", " ", value)
        value = re.sub(r" *\n *", "\n", value)
        value = re.sub(r"\n{2,}", "\n", value)
        return value.strip()


def html_to_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    parser = _HTMLTextExtractor()
    try:
        parser.feed(text)
        parser.close()
        return parser.text()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", unescape(text)).strip()


def _extended_json_binary(value: Dict[str, Any]) -> Optional[bytes]:
    binary = value.get("$binary")
    if isinstance(binary, dict):
        encoded = binary.get("base64")
    else:
        encoded = binary

    if not isinstance(encoded, str) or not encoded.strip():
        return None

    try:
        return base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise DetailBlobDecodeError("detailBlob co base64 khong hop le") from exc


def _blob_bytes(value: Any) -> bytes:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)

    if isinstance(value, dict):
        binary = _extended_json_binary(value)
        if binary is not None:
            return binary
        return json.dumps(value, ensure_ascii=False).encode("utf-8")

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return b""
        if stripped.startswith(("{", "[")):
            return stripped.encode("utf-8")
        try:
            return base64.b64decode(stripped, validate=True)
        except Exception:
            return stripped.encode("utf-8")

    raise DetailBlobDecodeError(
        f"Khong ho tro kieu detailBlob: {type(value).__name__}"
    )


def _decompress_blob(payload: bytes) -> bytes:
    if payload.startswith(b"\x1f\x8b"):
        try:
            return gzip.decompress(payload)
        except (OSError, EOFError) as exc:
            raise DetailBlobDecodeError("detailBlob gzip bi hong") from exc

    try:
        return zlib.decompress(payload)
    except zlib.error:
        return payload


def decode_detail_blob(value: Any) -> Dict[str, Any]:
    """Decode MongoDB Binary/Extended JSON detailBlob into a JSON object."""
    if value in (None, "", b""):
        return {}

    payload = _blob_bytes(value)
    if not payload:
        return {}

    decoded_bytes = _decompress_blob(payload)
    try:
        decoded = json.loads(decoded_bytes.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DetailBlobDecodeError("detailBlob khong chua JSON UTF-8 hop le") from exc

    if not isinstance(decoded, dict):
        raise DetailBlobDecodeError("detailBlob phai giai ma thanh mot JSON object")
    return decoded


def _clean_embedded_html(value: Any, key: str = "") -> Any:
    if isinstance(value, dict):
        if set(value) == {"html"}:
            return html_to_text(value.get("html"))
        return {
            child_key: _clean_embedded_html(child_value, child_key)
            for child_key, child_value in value.items()
        }

    if isinstance(value, list):
        return [_clean_embedded_html(item, key) for item in value]

    if isinstance(value, tuple):
        return [_clean_embedded_html(item, key) for item in value]

    if isinstance(value, str) and key.casefold().endswith("html"):
        return html_to_text(value)
    return value


def _is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict, set)):
        return bool(value)
    return True


def enrich_product_document(
    document: Dict[str, Any],
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Merge detailBlob into a JSON-friendly product document.

    Mongo top-level values remain authoritative. Raw scrape data and raw HTML are
    replaced by searchable text to keep the runtime catalog reasonably sized.
    """
    product = dict(document or {})
    raw_blob = product.pop("detailBlob", None)
    if raw_blob is None:
        product["detailBlobInfo"] = {"decoded": False, "present": False}
        return product, None

    try:
        detail = decode_detail_blob(raw_blob)
    except DetailBlobDecodeError as exc:
        product["detailBlobInfo"] = {
            "decoded": False,
            "present": True,
            "error": str(exc),
        }
        return product, str(exc)

    article_text = html_to_text(detail.get("articleHtml"))
    detail.pop("articleHtml", None)
    raw_source_present = _is_present(detail.pop("rawSource", None))
    detail = _clean_embedded_html(detail)

    merged = dict(detail)
    for key, value in product.items():
        if _is_present(value) or key not in merged:
            merged[key] = value

    if article_text:
        merged["articleText"] = article_text

    if not _is_present(merged.get("description")):
        meta = merged.get("meta")
        if isinstance(meta, dict):
            merged["description"] = str(meta.get("description") or "").strip()

    merged["detailBlobInfo"] = {
        "decoded": True,
        "present": True,
        "fieldCount": len(detail),
        "rawSourceOmitted": raw_source_present,
    }
    return merged, None


def runtime_product_document(
    product: Dict[str, Any],
    include_build_fields: bool = False,
) -> Dict[str, Any]:
    """Keep rich searchable product data while dropping scrape-only payloads."""
    runtime_product = {
        key: product[key]
        for key in RUNTIME_PRODUCT_FIELDS
        if key in product
    }

    if include_build_fields:
        for key in BUILD_ONLY_RUNTIME_FIELDS:
            if key in product:
                runtime_product[key] = product[key]

    category_trail = runtime_product.get("categoryTrail")
    if isinstance(category_trail, list):
        runtime_product["categoryTrail"] = [
            str(item.get("name") or item.get("title") or "").strip()
            if isinstance(item, dict)
            else str(item or "").strip()
            for item in category_trail
            if item
        ]

    article_text = str(runtime_product.get("articleText") or "")
    if len(article_text) > RUNTIME_ARTICLE_TEXT_LIMIT:
        runtime_product["articleText"] = article_text[:RUNTIME_ARTICLE_TEXT_LIMIT]

    if not _is_present(runtime_product.get("description")):
        meta = product.get("meta")
        if isinstance(meta, dict) and _is_present(meta.get("description")):
            runtime_product["description"] = str(meta["description"]).strip()

    meta = product.get("meta")
    if isinstance(meta, dict) and _is_present(meta.get("keywords")):
        existing_keywords = runtime_product.get("keywords")
        if not _is_present(existing_keywords):
            runtime_product["keywords"] = meta["keywords"]

    return runtime_product


def flatten_search_values(value: Any):
    if value is None:
        return []
    if isinstance(value, dict):
        values = []
        for key, item in value.items():
            if key not in {"id", "href", "url", "labelUrl", "image"}:
                values.extend(flatten_search_values(key))
            if key not in {"href", "url", "labelUrl", "image"}:
                values.extend(flatten_search_values(item))
        return values
    if isinstance(value, (list, tuple, set)):
        values = []
        for item in value:
            values.extend(flatten_search_values(item))
        return values

    text = str(value).strip()
    if re.search(r"<[a-zA-Z][^>]*>", text):
        text = html_to_text(text)
    return [text] if text else []


def normalize_search_text(value: Any) -> str:
    text = " ".join(flatten_search_values(value))
    text = text.casefold().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(
        character
        for character in text
        if unicodedata.category(character) != "Mn"
    )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_catalog_search_fields(product: Dict[str, Any]) -> Dict[str, str]:
    identifiers = [
        product.get("productKey"), product.get("_id"), product.get("id"),
        product.get("productId"), product.get("product_id"), product.get("sku"),
        product.get("slug"), product.get("url"), product.get("sourceUrl"),
    ]
    return {
        "name": normalize_search_text([
            product.get("name"), product.get("title"),
            product.get("productName"), product.get("product_name"),
        ]),
        "brand": normalize_search_text([
            product.get("brand"), product.get("brandKey"),
            product.get("manufacturer"),
        ]),
        "category": normalize_search_text([
            product.get("category"), product.get("category_name"),
            product.get("categories"), product.get("categoryTrail"),
        ]),
        "labels": normalize_search_text([
            product.get("trainingLabels"), product.get("training_labels"),
            product.get("labels"), product.get("tags"), product.get("keywords"),
        ]),
        "specs": normalize_search_text([
            product.get("specs"), product.get("specifications"),
        ]),
        "description": normalize_search_text([
            product.get("description"), product.get("meta"),
            product.get("shortNotice"),
        ]),
        "details": normalize_search_text([
            product.get("highlights"), product.get("articleText"),
            product.get("articleSections"), product.get("stockNote"),
            product.get("statusLabel"), product.get("reviewSummary"),
            product.get("faqs"), product.get("policies"),
            product.get("privileges"), product.get("paymentOffers"),
        ]),
        "extras": normalize_search_text([
            product.get("colors"), product.get("variants"),
            product.get("promotions"), product.get("priceBenefits"),
        ]),
        "identifiers": normalize_search_text(identifiers),
    }
