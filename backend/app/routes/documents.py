
import json
import os
import uuid
from functools import lru_cache
from pathlib import Path

from flask import (
    Blueprint,
    request,
    jsonify,
    current_app,
    Response,
    stream_with_context
)

from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity
)

from werkzeug.utils import secure_filename
from google.genai.errors import APIError
from pymongo.errors import PyMongoError

from app.database.mongodb import documents_collection


documents_bp = Blueprint("documents", __name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_FOLDER = BACKEND_DIR / "uploads"

ALLOWED_EXTENSION = ".pdf"


@lru_cache(maxsize=8)
def _load_document_index(file_path):
    from app.services.rag_service import build_document_index

    return build_document_index(file_path)


def _ask_document_question(question, document_index):
    from app.services.rag_service import ask_document_question

    return ask_document_question(question, document_index)


def _prepare_document_question(question, document_index):
    from app.services.rag_service import prepare_document_question

    return prepare_document_question(question, document_index)


def _stream_document_question(question, context):
    from app.services.rag_service import stream_document_question

    return stream_document_question(question, context)


def _get_user_document_path(document_id, user_id):
    document = documents_collection.find_one({
        "document_id": document_id,
        "user_id": user_id
    })
    if not document:
        return None

    file_path = UPLOAD_FOLDER / user_id / f"{document_id}.pdf"
    return file_path if file_path.is_file() else None


def _gemini_error_details(error):
    if error.code == 503:
        return (
            503,
            "The AI service is temporarily overloaded. Please try again shortly."
        )
    if error.code == 429:
        return (
            429,
            "The AI service rate limit was reached. Please try again later."
        )
    return (
        502,
        "The AI service could not answer right now. Please try again."
    )


def _encode_stream_event(event):
    return f"{json.dumps(event, ensure_ascii=False)}\n"


@documents_bp.route("/", methods=["GET"])
@jwt_required()
def list_documents():
    user_id = get_jwt_identity()

    try:
        documents = documents_collection.find(
            {"user_id": user_id},
            {
                "_id": 0,
                "document_id": 1,
                "original_filename": 1,
                "status": 1
            }
        ).sort("_id", -1)

        return jsonify({
            "documents": [
                {
                    "document_id": document["document_id"],
                    "filename": document["original_filename"],
                    "status": document.get("status", "uploaded")
                }
                for document in documents
            ]
        }), 200
    except PyMongoError:
        current_app.logger.exception("Document list retrieval failed")
        return jsonify({
            "message": "Could not load documents"
        }), 503


@documents_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_document():

    user_id = get_jwt_identity()

    # Check whether a file was provided
    if "file" not in request.files:
        return jsonify({
            "message": "No file provided"
        }), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({
            "message": "No file selected"
        }), 400

    # Validate the file extension
    original_filename = secure_filename(file.filename)

    if Path(original_filename).suffix.lower() != ALLOWED_EXTENSION:
        return jsonify({
            "message": "Only PDF files are allowed"
        }), 400

    # Validate PDF file signature
    file_header = file.stream.read(5)
    file.stream.seek(0)

    if file_header != b"%PDF-":
        return jsonify({
            "message": "Invalid PDF file"
        }), 400

    # Generate a unique document ID
    document_id = str(uuid.uuid4())

    # Create a separate folder for each user
    user_folder = UPLOAD_FOLDER / user_id
    user_folder.mkdir(parents=True, exist_ok=True)

    # Do not use the uploaded filename as the storage path
    file_path = user_folder / f"{document_id}.pdf"

    try:
        file.save(str(file_path))

        document = {
            "document_id": document_id,
            "user_id": user_id,
            "original_filename": original_filename,
            "file_path": str(file_path),
            "status": "uploaded"
        }

        documents_collection.insert_one(document)

        return jsonify({
            "message": "PDF uploaded successfully",
            "document_id": document_id,
            "filename": original_filename,
            "status": "uploaded"
        }), 201

    except (OSError, PyMongoError) as error:

        # Remove the saved file if metadata storage fails
        if file_path.exists():
            file_path.unlink()

        current_app.logger.exception(
            "Document upload failed"
        )

        return jsonify({
            "message": "Document upload failed"
        }), 500


@documents_bp.route("/<document_id>/chat", methods=["POST"])
@jwt_required()
def chat_with_document(document_id):
    try:
        document_id = str(uuid.UUID(document_id))
    except ValueError:
        return jsonify({"message": "Document not found"}), 404

    data = request.get_json(silent=True)
    question = data.get("question") if isinstance(data, dict) else None

    if not isinstance(question, str) or not question.strip():
        return jsonify({"message": "A question is required"}), 400

    question = question.strip()
    if len(question) > 1000:
        return jsonify({
            "message": "Question must be 1000 characters or fewer"
        }), 400

    user_id = get_jwt_identity()

    try:
        file_path = _get_user_document_path(document_id, user_id)
    except PyMongoError:
        current_app.logger.exception("Document lookup failed")
        return jsonify({
            "message": "Could not access the document"
        }), 503

    if not file_path:
        return jsonify({"message": "Document not found"}), 404

    try:
        document_index = _load_document_index(str(file_path))
    except (OSError, ValueError):
        current_app.logger.exception("Document processing failed")
        return jsonify({
            "message": "Could not read this PDF. Upload a text-based PDF and try again."
        }), 422

    try:
        result = _ask_document_question(question, document_index)
    except ValueError as error:
        return jsonify({"message": str(error)}), 422
    except APIError as error:
        status_code, message = _gemini_error_details(error)
        if status_code in (429, 503):
            current_app.logger.warning(
                "Gemini API request failed (HTTP %s)",
                status_code
            )
        else:
            current_app.logger.exception("Document answer generation failed")
        return jsonify({
            "message": message
        }), status_code

    return jsonify(result), 200


@documents_bp.route("/<document_id>/chat/stream", methods=["POST"])
@jwt_required()
def stream_document_chat(document_id):
    try:
        document_id = str(uuid.UUID(document_id))
    except ValueError:
        return jsonify({"message": "Document not found"}), 404

    data = request.get_json(silent=True)
    question = data.get("question") if isinstance(data, dict) else None
    if not isinstance(question, str) or not question.strip():
        return jsonify({"message": "A question is required"}), 400

    question = question.strip()
    if len(question) > 1000:
        return jsonify({
            "message": "Question must be 1000 characters or fewer"
        }), 400

    user_id = get_jwt_identity()
    try:
        file_path = _get_user_document_path(document_id, user_id)
    except PyMongoError:
        current_app.logger.exception("Document lookup failed")
        return jsonify({
            "message": "Could not access the document"
        }), 503

    if not file_path:
        return jsonify({"message": "Document not found"}), 404

    def generate_events():
        yield _encode_stream_event({
            "type": "status",
            "message": "Reading and searching the document..."
        })

        try:
            document_index = _load_document_index(str(file_path))
            context, sources = _prepare_document_question(
                question,
                document_index
            )
        except (OSError, ValueError):
            current_app.logger.exception("Document processing failed")
            yield _encode_stream_event({
                "type": "error",
                "message": (
                    "Could not read this PDF. Upload a text-based PDF and try again."
                )
            })
            return

        yield _encode_stream_event({
            "type": "status",
            "message": "Writing the answer..."
        })

        try:
            for text in _stream_document_question(question, context):
                if text is None:
                    yield _encode_stream_event({"type": "reset"})
                    continue

                yield _encode_stream_event({
                    "type": "text",
                    "text": text
                })
        except ValueError as error:
            yield _encode_stream_event({
                "type": "error",
                "message": str(error)
            })
            return
        except APIError as error:
            status_code, message = _gemini_error_details(error)
            if status_code in (429, 503):
                current_app.logger.warning(
                    "Gemini API stream failed (HTTP %s)",
                    status_code
                )
            else:
                current_app.logger.exception(
                    "Document answer streaming failed"
                )
            yield _encode_stream_event({
                "type": "error",
                "status": status_code,
                "message": message
            })
            return

        yield _encode_stream_event({
            "type": "complete",
            "sources": sources
        })

    return Response(
        stream_with_context(generate_events()),
        mimetype="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )
