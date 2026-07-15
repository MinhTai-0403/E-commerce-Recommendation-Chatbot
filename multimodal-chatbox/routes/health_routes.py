from datetime import datetime, timezone
import os

from flask import Blueprint, jsonify

import core


health_bp = Blueprint("health", __name__)


@health_bp.route("/api/health")
def health():
    metadata_mtime = None
    if os.path.isfile(core.PRODUCTS_METADATA_PATH):
        metadata_mtime = datetime.fromtimestamp(
            os.path.getmtime(core.PRODUCTS_METADATA_PATH),
            tz=timezone.utc,
        ).isoformat()

    return jsonify({
        "status": "ok",
        "product_source": "local_faiss_and_sqlite_catalog",
        "mongodb_used_for_products": False,
        "mongodb_auth": core.users_collection is not None,
        "mongodb_error": core.mongo_error or None,
        "database": core.MONGODB_DB,
        "users_collection": core.MONGODB_USERS_COLLECTION,
        "otp_collection": core.MONGODB_OTP_COLLECTION,
        "otp_email_configured": bool(core.SMTP_HOST and core.SMTP_FROM_EMAIL),
        "otp_debug": core.OTP_DEBUG,
        "chatbot": core.client is not None,
        "faiss": core.faiss_index is not None,
        "faiss_vectors": int(core.faiss_index.ntotal) if core.faiss_index is not None else 0,
        "embedding_rows": (
            int(core.product_embeddings.shape[0])
            if core.product_embeddings is not None
            else 0
        ),
        "metadata_products": len(core.products),
        "metadata_path": core.PRODUCTS_METADATA_PATH,
        "detailed_catalog_products": (
            core.catalog_search_store.product_count
            if core.catalog_search_store is not None
            else len(core.products)
        ),
        "detailed_catalog_path": core.PRODUCTS_CATALOG_SEARCH_PATH,
        "metadata_modified_at": metadata_mtime,
        "catalog_loaded_at": (
            core.catalog_loaded_at.isoformat()
            if isinstance(core.catalog_loaded_at, datetime)
            else None
        ),
        "text_embedding_search": (
            core.TEXT_EMBEDDING_SEARCH_ENABLED
            and core.faiss_index is not None
            and core.product_embeddings is not None
            and bool(core.products)
        ),
    })


@health_bp.route("/api/products/reload", methods=["POST"])
def reload_products():
    try:
        reloaded_products = core.load_local_search_assets()
        return jsonify({
            "message": (
                "Đã tải lại products.json, embeddings.npy "
                "và faiss_index.index từ ổ đĩa."
            ),
            "product_source": "local_index_files",
            "products": len(reloaded_products),
            "faiss_vectors": (
                int(core.faiss_index.ntotal)
                if core.faiss_index is not None
                else 0
            ),
        })
    except Exception as exc:
        print(f"Lỗi tải lại bộ tìm kiếm cục bộ: {exc}")
        return jsonify({
            "error": f"Không thể tải lại bộ tìm kiếm cục bộ: {exc}"
        }), 500
