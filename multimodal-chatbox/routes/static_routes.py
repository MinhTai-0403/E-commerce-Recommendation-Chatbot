import os

from flask import Blueprint, current_app, jsonify, send_from_directory

import core


static_bp = Blueprint("static_files", __name__)


@static_bp.route("/data/products/<path:filename>")
def serve_product_image(filename):
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], filename)


@static_bp.route("/", defaults={"path": ""})
@static_bp.route("/<path:path>")
def serve_frontend(path):
    index_file = os.path.join(core.FRONTEND_DIST, "index.html")

    if not os.path.isfile(index_file):
        return jsonify({
            "error": "Chưa tìm thấy giao diện frontend đã build.",
            "frontend_dist": core.FRONTEND_DIST,
            "instruction": (
                "Mở terminal trong cellphones-clone, chạy npm install và "
                "npm run build, sau đó chạy lại app.py."
            ),
        }), 503

    requested_file = os.path.join(core.FRONTEND_DIST, path)
    if path and os.path.isfile(requested_file):
        return send_from_directory(core.FRONTEND_DIST, path)

    return send_from_directory(core.FRONTEND_DIST, "index.html")
