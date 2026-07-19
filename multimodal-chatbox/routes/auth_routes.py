from datetime import datetime, timedelta, timezone
import os
import re
import secrets

from flask import Blueprint, jsonify, request
from pymongo.errors import DuplicateKeyError, PyMongoError
from werkzeug.security import check_password_hash

import core


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/register/request-otp", methods=["POST"])
def request_register_otp():
    if core.users_collection is None or core.registration_otps_collection is None:
        return jsonify({"error": core.mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    registration_data, validation_error = core.validate_registration_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    email = registration_data["email"]
    phone = registration_data["phone"]

    try:
        duplicate = core.users_collection.find_one({
            "$or": [{"email": email}, {"phone": phone}]
        })
        if duplicate:
            if duplicate.get("email") == email:
                return jsonify({"error": "Email này đã được đăng ký."}), 409
            return jsonify({"error": "Số điện thoại này đã được đăng ký."}), 409

        otp = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=core.OTP_EXPIRES_MINUTES)

        core.registration_otps_collection.update_one(
            {"email": email},
            {
                "$set": {
                    **registration_data,
                    "otp_hash": core.otp_digest(email, otp),
                    "attempts": 0,
                    "created_at": now,
                    "expires_at": expires_at,
                }
            },
            upsert=True,
        )

        sent, delivery, send_error = core.send_registration_otp(
            email,
            registration_data["full_name"],
            otp,
        )
        if not sent:
            core.registration_otps_collection.delete_one({"email": email})
            return jsonify({"error": send_error or "Không thể gửi OTP."}), 503

        response_data = {
            "otpExpiresMinutes": core.OTP_EXPIRES_MINUTES,
            "delivery": delivery,
            "email": email,
        }
        if core.OTP_DEBUG and delivery == "debug":
            response_data["devOtp"] = otp

        return jsonify({
            "message": "Mã OTP đã được gửi.",
            "data": response_data,
        })
    except PyMongoError as exc:
        print(f"Lỗi tạo OTP MongoDB: {exc}")
        return jsonify({"error": "Không thể tạo yêu cầu đăng ký lúc này."}), 500


@auth_bp.route("/api/auth/register/verify-otp", methods=["POST"])
def verify_register_otp():
    if core.users_collection is None or core.registration_otps_collection is None:
        return jsonify({"error": core.mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    email = core.normalize_email(payload.get("email"))
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))

    if not re.fullmatch(r"\d{6}", otp):
        return jsonify({"error": "Mã OTP cần gồm 6 chữ số."}), 400

    try:
        pending = core.registration_otps_collection.find_one({"email": email})
        if not pending:
            return jsonify({"error": "Không tìm thấy yêu cầu OTP hoặc mã đã hết hạn."}), 404

        expires_at = pending.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expires_at:
                core.registration_otps_collection.delete_one({"_id": pending["_id"]})
                return jsonify({"error": "Mã OTP đã hết hạn. Vui lòng gửi lại mã."}), 410

        attempts = int(pending.get("attempts", 0))
        if attempts >= core.OTP_MAX_ATTEMPTS:
            core.registration_otps_collection.delete_one({"_id": pending["_id"]})
            return jsonify({"error": "Bạn đã nhập sai OTP quá số lần cho phép."}), 429

        if not secrets.compare_digest(
            str(pending.get("otp_hash", "")),
            core.otp_digest(email, otp),
        ):
            core.registration_otps_collection.update_one(
                {"_id": pending["_id"]},
                {"$inc": {"attempts": 1}},
            )
            remaining = max(0, core.OTP_MAX_ATTEMPTS - attempts - 1)
            return jsonify({
                "error": f"Mã OTP không đúng. Bạn còn {remaining} lần thử."
            }), 400

        now = datetime.now(timezone.utc)
        user_document = {
            "full_name": pending["full_name"],
            "birthday": pending["birthday"],
            "phone": pending["phone"],
            "email": pending["email"],
            "password_hash": pending["password_hash"],
            "customer_type": pending.get("customer_type", "normal"),
            "email_verified": True,
            "role": "customer",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        result = core.users_collection.insert_one(user_document)
        user_document["_id"] = result.inserted_id
        core.registration_otps_collection.delete_one({"_id": pending["_id"]})
        return core.build_auth_response(
            user_document,
            "Đăng ký và xác thực email thành công.",
            201,
        )
    except DuplicateKeyError:
        core.registration_otps_collection.delete_one({"email": email})
        return jsonify({"error": "Email hoặc số điện thoại đã được đăng ký."}), 409
    except PyMongoError as exc:
        print(f"Lỗi xác thực OTP MongoDB: {exc}")
        return jsonify({"error": "Không thể hoàn tất đăng ký lúc này."}), 500


@auth_bp.route("/api/auth/register", methods=["POST"])
def register_user_without_otp():
    allow = os.getenv("ALLOW_REGISTER_WITHOUT_OTP", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }
    if not allow:
        return jsonify({
            "error": "Đăng ký trực tiếp đã tắt. Hãy dùng quy trình gửi và xác thực OTP."
        }), 403

    if core.users_collection is None:
        return jsonify({"error": core.mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    registration_data, validation_error = core.validate_registration_payload(payload)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    now = datetime.now(timezone.utc)
    user_document = {
        **registration_data,
        "email_verified": False,
        "role": "customer",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = core.users_collection.insert_one(user_document)
        user_document["_id"] = result.inserted_id
        return core.build_auth_response(user_document, "Đăng ký thành công.", 201)
    except DuplicateKeyError:
        return jsonify({"error": "Email hoặc số điện thoại đã được đăng ký."}), 409
    except PyMongoError as exc:
        print(f"Lỗi đăng ký MongoDB: {exc}")
        return jsonify({"error": "Không thể tạo tài khoản lúc này."}), 500


@auth_bp.route("/api/auth/login", methods=["POST"])
def login_user():
    if core.users_collection is None:
        return jsonify({"error": core.mongo_error or "MongoDB chưa kết nối."}), 503

    payload = request.get_json(silent=True) or {}
    identifier = str(
        payload.get("identifier")
        or payload.get("email")
        or payload.get("phone")
        or ""
    ).strip()
    password = str(payload.get("password") or "")

    if not identifier or not password:
        return jsonify({"error": "Vui lòng nhập email/số điện thoại và mật khẩu."}), 400

    normalized_identifier = identifier.lower() if "@" in identifier else core.normalize_phone(identifier)
    query = (
        {"email": normalized_identifier}
        if "@" in normalized_identifier
        else {"phone": normalized_identifier}
    )

    try:
        user_document = core.users_collection.find_one(query)
    except PyMongoError as exc:
        print(f"Lỗi đọc tài khoản MongoDB: {exc}")
        return jsonify({"error": "Không thể đăng nhập lúc này."}), 500

    if not user_document or not check_password_hash(
        str(user_document.get("password_hash", "")),
        password,
    ):
        return jsonify({"error": "Email/số điện thoại hoặc mật khẩu không đúng."}), 401

    if user_document.get("is_active", True) is False:
        return jsonify({"error": "Tài khoản đã bị khóa."}), 403

    core.users_collection.update_one(
        {"_id": user_document["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc)}},
    )
    return core.build_auth_response(user_document, "Đăng nhập thành công.")


@auth_bp.route("/api/auth/me", methods=["GET"])
@core.login_required
def get_current_user(user_document):
    return jsonify({"user": core.serialize_user(user_document)})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout_user():
    return jsonify({"message": "Đăng xuất thành công."})
