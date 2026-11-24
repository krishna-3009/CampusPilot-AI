from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from datetime import timedelta
import os

from dotenv import load_dotenv

load_dotenv()

jwt = JWTManager()


def create_app():

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    @app.errorhandler(413)
    def request_entity_too_large(_error):
        from flask import jsonify

        return jsonify({"message": "Uploads must be 10 MB or smaller."}), 413

    # Secret key for JWT
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET_KEY"
    )

    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        hours=1
    )

    # Enable frontend communication
    CORS(
        app,
        origins=["http://localhost:5173"]
    )

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
