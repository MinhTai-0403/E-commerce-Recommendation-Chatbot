import os

from flask import Flask
from flask_cors import CORS

import core
from routes.auth_routes import auth_bp
from routes.health_routes import health_bp
from routes.chat_routes import chat_bp
from routes.static_routes import static_bp


def create_app():
    app = Flask(__name__)

    app.config["UPLOAD_FOLDER"] = core.UPLOAD_FOLDER
    app.config["MAX_CONTENT_LENGTH"] = core.MAX_CONTENT_LENGTH

    CORS(
        app,
        resources={r"/*": {"origins": core.cors_origins}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "OPTIONS"],
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(static_bp)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=True,
        use_reloader=False,
    )
