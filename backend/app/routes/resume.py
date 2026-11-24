from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from google.genai.errors import APIError

resume_bp = Blueprint("resume", __name__)


@resume_bp.route("/analyze", methods=["POST"])
@jwt_required()
def analyze_uploaded_resume():
    resume_file = request.files.get("resume")
    job_description = request.form.get("job_description", "").strip()

    if resume_file is None or not resume_file.filename:
        return jsonify({"message": "Choose a resume PDF to analyze."}), 400
    if not job_description:
        return jsonify({"message": "Paste the job description to continue."}), 400
    max_job_description_chars = 12_000
    if len(job_description) > max_job_description_chars:
        return jsonify({
            "message": (
                f"Job description must be {max_job_description_chars} "
                "characters or fewer."
            )
        }), 400
    if not resume_file.filename.lower().endswith(".pdf"):
        return jsonify({"message": "Only PDF resumes are supported."}), 400

    pdf_bytes = resume_file.read()
    if not pdf_bytes.startswith(b"%PDF-"):
        return jsonify({"message": "The selected file is not a valid PDF."}), 400

    try:
        from app.services.resume_service import analyze_resume

        analysis = analyze_resume(pdf_bytes, job_description)
    except ValueError as error:
        return jsonify({"message": str(error)}), 422
    except APIError as error:
        if error.code == 429:
            return jsonify({
                "message": "The AI service rate limit was reached. Please try again later."
            }), 429
        if error.code == 503:
            return jsonify({
                "message": "The AI service is temporarily unavailable. Please try again shortly."
            }), 503
        current_app.logger.exception("Resume analysis failed")
        return jsonify({"message": "Could not analyze this resume right now."}), 502
    except Exception:
        current_app.logger.exception("Resume analysis failed")
        return jsonify({"message": "Could not analyze this resume right now."}), 502

    return jsonify({"analysis": analysis}), 200
