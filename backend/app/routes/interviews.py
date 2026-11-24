from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from google.genai.errors import APIError


interviews_bp = Blueprint("interviews", __name__)
MAX_JOB_DESCRIPTION_CHARS = 12_000
MAX_ANSWER_CHARS = 5_000


def _handle_ai_error(error):
    if error.code == 429:
        return jsonify({
            "message": "The AI service rate limit was reached. Please try again later."
        }), 429
    if error.code == 503:
        return jsonify({
            "message": "The AI service is temporarily unavailable. Please try again shortly."
        }), 503
    current_app.logger.exception("Interview AI request failed")
    return jsonify({"message": "Could not complete this interview step."}), 502


def _required_text(data, key, label, max_length):
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, str) or not value.strip():
        return None, f"{label} is required."
    value = value.strip()
    if len(value) > max_length:
        return None, f"{label} must be {max_length} characters or fewer."
    return value, None


@interviews_bp.route("/questions", methods=["POST"])
@jwt_required()
def create_questions():
    data = request.get_json(silent=True)
    job_description, error = _required_text(
        data, "job_description", "Job description", MAX_JOB_DESCRIPTION_CHARS
    )
    if error:
        return jsonify({"message": error}), 400
    interview_type = data.get("interview_type", "mixed") if isinstance(data, dict) else "mixed"
    if not isinstance(interview_type, str) or interview_type not in {
        "behavioral", "technical", "mixed"
    }:
        return jsonify({"message": "Choose a valid interview type."}), 400

    try:
        from app.services.interview_service import generate_interview_questions

        return jsonify({
            "questions": generate_interview_questions(job_description, interview_type)
        }), 200
    except ValueError as error:
        return jsonify({"message": str(error)}), 422
    except APIError as error:
        return _handle_ai_error(error)
    except Exception:
        current_app.logger.exception("Interview question generation failed")
        return jsonify({"message": "Could not create interview questions."}), 502


@interviews_bp.route("/evaluate", methods=["POST"])
@jwt_required()
def evaluate_answer():
    data = request.get_json(silent=True)
    job_description, error = _required_text(
        data, "job_description", "Job description", MAX_JOB_DESCRIPTION_CHARS
    )
    if error:
        return jsonify({"message": error}), 400
    question, error = _required_text(data, "question", "Question", 1_000)
    if error:
        return jsonify({"message": error}), 400
    answer, error = _required_text(data, "answer", "Answer", MAX_ANSWER_CHARS)
    if error:
        return jsonify({"message": error}), 400

    try:
        from app.services.interview_service import evaluate_interview_answer

        return jsonify({
            "evaluation": evaluate_interview_answer(job_description, question, answer)
        }), 200
    except ValueError as error:
        return jsonify({"message": str(error)}), 422
    except APIError as error:
        return _handle_ai_error(error)
    except Exception:
        current_app.logger.exception("Interview answer evaluation failed")
        return jsonify({"message": "Could not evaluate this answer."}), 502


@interviews_bp.route("/report", methods=["POST"])
@jwt_required()
def create_report():
    data = request.get_json(silent=True)
    job_description, error = _required_text(
        data, "job_description", "Job description", MAX_JOB_DESCRIPTION_CHARS
    )
    if error:
        return jsonify({"message": error}), 400
    answers = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(answers, list) or not 1 <= len(answers) <= 5:
        return jsonify({"message": "Complete at least one answer before creating a report."}), 400
    normalized_answers = []
    for item in answers:
        if not isinstance(item, dict):
            return jsonify({"message": "Interview answers are invalid."}), 400
        question = item.get("question")
        answer = item.get("answer")
        evaluation = item.get("evaluation")
        if not all(isinstance(value, str) for value in (question, answer)):
            return jsonify({"message": "Interview answers are invalid."}), 400
        if not isinstance(evaluation, dict):
            return jsonify({"message": "Interview feedback is missing."}), 400
        normalized_answers.append({
            "question": question[:1_000],
            "answer": answer[:MAX_ANSWER_CHARS],
            "score": evaluation.get("score"),
            "feedback": str(evaluation.get("feedback", ""))[:2_000],
            "strengths": evaluation.get("strengths", [])[:6],
            "improvements": evaluation.get("improvements", [])[:6],
        })

    try:
        from app.services.interview_service import create_interview_report

        return jsonify({
            "report": create_interview_report(job_description, normalized_answers)
        }), 200
    except ValueError as error:
        return jsonify({"message": str(error)}), 422
    except APIError as error:
        return _handle_ai_error(error)
    except Exception:
        current_app.logger.exception("Interview report generation failed")
        return jsonify({"message": "Could not create this report."}), 502
