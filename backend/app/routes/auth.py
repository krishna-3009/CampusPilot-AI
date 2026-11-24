from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
    set_access_cookies,
    unset_jwt_cookies,
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from datetime import datetime, timezone
import os
import re
from pymongo.errors import DuplicateKeyError, PyMongoError
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token

from app.database.mongodb import users_collection
from app import limiter


auth_bp = Blueprint("auth", __name__)
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _json_object():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


# Register API
@auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per hour")
def register():

    data = _json_object()
    raw_name = data.get("name")
    raw_email = data.get("email")
    password = data.get("password")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""

    # Validate input
    if not name or not email or not isinstance(password, str):
        return jsonify({
            "message": "All fields are required"
        }), 400

    if len(name) > 100 or len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        return jsonify({"message": "Enter a valid name and email address."}), 400

    if len(password) < 8 or len(password) > 1024:
        return jsonify({
            "message": "Password must be between 8 and 1024 characters"
        }), 400

    # Hash password
    hashed_password = generate_password_hash(password)

    user = {
        "name": name,
        "email": email,
        "password_hash": hashed_password,
        "created_at": datetime.now(timezone.utc)
    }

    try:
        result = users_collection.insert_one(user)

    except DuplicateKeyError:
        return jsonify({
            "message": "Email already registered"
        }), 409
    except PyMongoError:
        return jsonify({
            "message": "Authentication service is temporarily unavailable"
        }), 503

    return jsonify({
        "message": "Registration successful",
        "user_id": str(result.inserted_id)
    }), 201


# Login API
@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():

    data = _json_object()
    raw_email = data.get("email")
    email = raw_email.strip().lower() if isinstance(raw_email, str) else ""
    password = data.get("password")

    if not email or not isinstance(password, str) or not password or len(password) > 1024:
        return jsonify({
            "message": "Email and password required"
        }), 400

    try:
        user = users_collection.find_one({
            "email": email
        })
    except PyMongoError:
        return jsonify({
            "message": "Authentication service is temporarily unavailable"
        }), 503

    if not user or not user.get("password_hash") or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify({
            "message": "Invalid email or password"
        }), 401

    response = jsonify({
        "message": "Login successful",
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"]
        }
    })
    set_access_cookies(response, create_access_token(identity=str(user["_id"])))
    return response, 200


@auth_bp.route("/google", methods=["POST"])
@limiter.limit("10 per minute")
def google_login():
    data = _json_object()
    credential = data.get("credential", "")
    client_id = os.getenv("GOOGLE_CLIENT_ID")

    if not client_id:
        return jsonify({"message": "Google sign-in is not configured on the server."}), 503
    if not re.fullmatch(r"[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", client_id):
        return jsonify({"message": "GOOGLE_CLIENT_ID must be a Google Web application OAuth client ID."}), 503
    if not isinstance(credential, str) or not credential or len(credential) > 16_384:
        return jsonify({"message": "Google credential is required."}), 400

    try:
        claims = google_id_token.verify_oauth2_token(
            credential, GoogleAuthRequest(), client_id
        )
    except (ValueError, GoogleAuthError):
        return jsonify({"message": "Google sign-in could not be verified. Please try again."}), 401
    except Exception:
        current_app.logger.exception("Google ID token verification failed")
        return jsonify({"message": "Google sign-in is temporarily unavailable."}), 503

    email_claim = claims.get("email")
    email = email_claim.strip().lower() if isinstance(email_claim, str) else ""
    google_sub = claims.get("sub")
    name_claim = claims.get("name")
    name = name_claim.strip() if isinstance(name_claim, str) else ""
    if not name:
        name = email.split("@", 1)[0]
    name = name[:100]
    if (
        not EMAIL_PATTERN.fullmatch(email)
        or len(email) > 254
        or not isinstance(google_sub, str)
        or not google_sub
        or len(google_sub) > 255
        or claims.get("email_verified") is not True
    ):
        return jsonify({"message": "A verified Google email is required."}), 401

    try:
        # Prefer the immutable Google subject. Email matching is used only for
        # linking a previously registered password account with a verified email.
        user = users_collection.find_one({"google_sub": google_sub})
        matched_google_subject = user is not None
        if not user:
            user = users_collection.find_one({"email": email})

        if user:
            if user.get("google_sub") and user["google_sub"] != google_sub:
                return jsonify({"message": "This email is linked to a different Google account."}), 409
            if matched_google_subject and user.get("email") != email:
                email_owner = users_collection.find_one({"email": email}, {"_id": 1})
                if email_owner and email_owner["_id"] != user["_id"]:
                    return jsonify({"message": "This email is linked to another CampusPilot account."}), 409
            update_result = users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": {"google_sub": google_sub, "email": email}},
            )
            if update_result.matched_count != 1:
                return jsonify({"message": "Authentication service is temporarily unavailable."}), 503
            user["email"] = email
        else:
            result = users_collection.insert_one({
                "name": name,
                "email": email,
                "google_sub": google_sub,
                "created_at": datetime.now(timezone.utc),
            })
            user = {"_id": result.inserted_id, "name": name, "email": email}

    except DuplicateKeyError:
        # A concurrent first sign-in may have created this email already.
        try:
            user = users_collection.find_one({"google_sub": google_sub})
            if not user:
                user = users_collection.find_one({"email": email})
            if not user or (user.get("google_sub") and user["google_sub"] != google_sub):
                return jsonify({"message": "This email is linked to a different Google account."}), 409
            users_collection.update_one({"_id": user["_id"]}, {"$set": {"google_sub": google_sub}})
        except PyMongoError:
            return jsonify({"message": "Authentication service is temporarily unavailable."}), 503
    except PyMongoError:
        return jsonify({"message": "Authentication service is temporarily unavailable."}), 503

    response = jsonify({
        "message": "Google sign-in successful",
        "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]},
    })
    set_access_cookies(response, create_access_token(identity=str(user["_id"])))
    return response, 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    response = jsonify({"message": "Logged out"})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/csrf", methods=["GET"])
@jwt_required()
def csrf_token():
    # Let a trusted frontend on another origin obtain the double-submit token
    # without making the HttpOnly access token readable to JavaScript.
    return jsonify({"csrf_token": get_jwt()["csrf"]}), 200


# Protected profile API
@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def profile():

    user_id = get_jwt_identity()

    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        user = users_collection.find_one({
            "_id": ObjectId(user_id)
        })
    except InvalidId:
        return jsonify({"message": "Invalid user token"}), 401
    except PyMongoError:
        return jsonify({
            "message": "Authentication service is temporarily unavailable"
        }), 503

    if not user:
        return jsonify({
            "message": "User not found"
        }), 404

    return jsonify({
        "name": user["name"],
        "email": user["email"]
    }), 200
