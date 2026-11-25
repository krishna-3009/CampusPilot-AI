from flask import Flask, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import timedelta
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)


def create_app(test_config=None):

    app = Flask(__name__)
    environment = os.getenv("APP_ENV", "development").strip().lower()
    jwt_secret = (test_config or {}).get("JWT_SECRET_KEY") or os.getenv("JWT_SECRET_KEY", "")
    if len(jwt_secret) < 32 or jwt_secret.startswith("replace-with-"):
        raise RuntimeError("JWT_SECRET_KEY must be set to a random value of at least 32 characters.")

    configured_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    allowed_origins = [origin.strip().rstrip("/") for origin in configured_origins.split(",") if origin.strip()]
    if environment == "production" and (
        not allowed_origins
        or any("localhost" in origin or not origin.startswith("https://") for origin in allowed_origins)
    ):
        raise RuntimeError("Set CORS_ORIGINS to the production frontend origin(s).")

    cookie_samesite = os.getenv("JWT_COOKIE_SAMESITE", "Lax").strip()
    if cookie_samesite not in {"Lax", "Strict", "None"}:
        raise RuntimeError("JWT_COOKIE_SAMESITE must be Lax, Strict, or None.")

    rate_limit_storage = os.getenv("RATELIMIT_STORAGE_URI", "memory://").strip()
    if environment == "production" and (not rate_limit_storage or rate_limit_storage.startswith("memory://")):
        raise RuntimeError("Configure a shared RATELIMIT_STORAGE_URI such as Redis for production.")

    trusted_proxy_hops = int(os.getenv("TRUSTED_PROXY_HOPS", "0"))
    if trusted_proxy_hops < 0:
        raise RuntimeError("TRUSTED_PROXY_HOPS cannot be negative.")

    app.config.update(
        ENVIRONMENT=environment,
        JWT_SECRET_KEY=jwt_secret,
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=30),
        JWT_TOKEN_LOCATION=["cookies", "headers"],
        # Browsers require Secure on SameSite=None cookies. This also keeps
        # cross-site HTTPS deployments working if APP_ENV is misconfigured.
        JWT_COOKIE_SECURE=environment != "development" or cookie_samesite == "None",
        JWT_COOKIE_HTTPONLY=True,
        JWT_COOKIE_SAMESITE=cookie_samesite,
        JWT_COOKIE_CSRF_PROTECT=True,
        JWT_CSRF_METHODS=["POST", "PUT", "PATCH", "DELETE"],
        JWT_ACCESS_CSRF_HEADER_NAME="X-CSRF-TOKEN",
        JWT_COOKIE_DOMAIN=os.getenv("JWT_COOKIE_DOMAIN") or None,
        RATELIMIT_STORAGE_URI=rate_limit_storage,
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)

    if trusted_proxy_hops:
        # Only enable this when the ingress proxy strips client-supplied
        # forwarded headers and writes its own values.
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=trusted_proxy_hops,
            x_proto=trusted_proxy_hops,
            x_host=0,
            x_port=0,
        )

    @app.errorhandler(413)
    def request_entity_too_large(_error):
        from flask import jsonify

        return jsonify({"message": "Uploads must be 10 MB or smaller."}), 413

    @app.errorhandler(429)
    def too_many_requests(_error):
        from flask import jsonify

        return jsonify({"message": "Too many attempts. Please wait a little and try again."}), 429

    # Enable frontend communication
    CORS(
        app,
        origins=allowed_origins,
        allow_headers=["Content-Type", "Authorization", "X-CSRF-TOKEN"],
        methods=["GET", "POST", "OPTIONS"],
        supports_credentials=True,
    )
    limiter.init_app(app)

    @app.after_request
    def add_security_headers(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response

    # Initialize JWT
    jwt.init_app(app)

    # Register authentication routes
    from app.routes.auth import auth_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    from app.routes.documents import documents_bp
    app.register_blueprint(
         documents_bp,
         url_prefix="/api/documents"
    )

    from app.routes.resume import resume_bp
    app.register_blueprint(resume_bp, url_prefix="/api/resume")

    from app.routes.interviews import interviews_bp
    app.register_blueprint(interviews_bp, url_prefix="/api/interviews")

    return app
