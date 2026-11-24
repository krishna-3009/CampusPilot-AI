from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database.mongodb import users_collection


auth_bp = Blueprint("auth", __name__)


# Register API
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    # Validate input
    if not name or not email or not password:
        return jsonify({
            "message": "All fields are required"
        }), 400

    if len(password) < 8:
        return jsonify({
            "message": "Password must be at least 8 characters"
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
def login():

    data = request.get_json(silent=True) or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
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

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify({
            "message": "Invalid email or password"
        }), 401

    access_token = create_access_token(
        identity=str(user["_id"])
    )

    return jsonify({
        "message": "Login successful",
        "access_token": access_token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"]
        }
    }), 200


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
