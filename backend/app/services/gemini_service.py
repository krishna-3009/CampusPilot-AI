
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors


BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY is missing from backend/.env")

client = genai.Client(api_key=API_KEY)

MODEL_NAME = "gemini-3.8-flash"
FALLBACK_MODEL_NAMES = tuple(dict.fromkeys(
    model.strip()
    for model in (
        os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        os.getenv("GEMINI_SECONDARY_FALLBACK_MODEL", "gemini-3.6-flash")
    )
    if model.strip()
))
HTTP_RETRY_OPTIONS = {
    "attempts": 3,
    "initial_delay": 1.0,
    "max_delay": 4.0,
    "exp_base": 2.0,
    "jitter": 1.0
}
FALLBACK_HTTP_RETRY_OPTIONS = {
    **HTTP_RETRY_OPTIONS,
    "attempts": 1
}
FALLBACK_ERROR_CODES = {429, 503}
logger = logging.getLogger(__name__)


def _generate_answer_with_model(model_name, prompt, retry_options):
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config={
            "http_options": {
                "retry_options": retry_options
            }
        }
    )

    if not response.text:
        raise ValueError("Gemini returned an empty response")

    return response.text


def _build_prompt(question, context):
    return f"""
You are CampusPilot AI, an educational document assistant.

Answer the student's question using only the provided document context.

Rules:
1. Base your answer on the supplied context.
2. Never invent facts or citations.
3. If the answer is unavailable, say so.
4. Explain concepts in simple student-friendly language.

DOCUMENT CONTEXT:
{context}

STUDENT QUESTION:
{question}

Provide a clear and helpful answer.
"""


def _stream_answer_with_model(model_name, prompt, retry_options):
    response_stream = client.models.generate_content_stream(
        model=model_name,
        contents=prompt,
        config={
            "http_options": {
                "retry_options": retry_options
            }
        }
    )

    for response in response_stream:
        if response.text:
            yield response.text


def generate_answer(question, context):
    """Generate an answer using Gemini with bounded SDK-level retries."""
    prompt = _build_prompt(question, context)

    try:
        return _generate_answer_with_model(
            MODEL_NAME,
            prompt,
            HTTP_RETRY_OPTIONS
        )
    except errors.APIError as error:
        if error.code not in FALLBACK_ERROR_CODES:
            raise

        last_error = error
        for fallback_model in FALLBACK_MODEL_NAMES:
            if fallback_model == MODEL_NAME:
                continue

            logger.warning(
                "Gemini model returned HTTP %s; trying fallback model %s",
                last_error.code,
                fallback_model
            )
            try:
                return _generate_answer_with_model(
                    fallback_model,
                    prompt,
                    FALLBACK_HTTP_RETRY_OPTIONS
                )
            except errors.APIError as fallback_error:
                if fallback_error.code not in FALLBACK_ERROR_CODES:
                    raise
                last_error = fallback_error

        raise last_error


def generate_answer_stream(question, context):
    """Yield Gemini response text as soon as streamed chunks are available."""
    prompt = _build_prompt(question, context)
    has_output = False

    try:
        for text in _stream_answer_with_model(
            MODEL_NAME,
            prompt,
            HTTP_RETRY_OPTIONS
        ):
            has_output = True
            yield text
    except errors.APIError as error:
        if error.code not in FALLBACK_ERROR_CODES:
            raise
        last_error = error
    else:
        if has_output:
            return
        raise ValueError("Gemini returned an empty response")

    for fallback_model in FALLBACK_MODEL_NAMES:
        if fallback_model == MODEL_NAME:
            continue

        logger.warning(
            "Gemini stream returned HTTP %s; trying fallback model %s",
            last_error.code,
            fallback_model
        )
        response_stream = iter(_stream_answer_with_model(
            fallback_model,
            prompt,
            FALLBACK_HTTP_RETRY_OPTIONS
        ))

        try:
            first_text = next(response_stream)
        except StopIteration:
            continue
        except errors.APIError as fallback_error:
            if fallback_error.code not in FALLBACK_ERROR_CODES:
                raise
            last_error = fallback_error
            continue

        if has_output:
            yield None

        has_output = True
        yield first_text

        try:
            for text in response_stream:
                yield text
        except errors.APIError as fallback_error:
            if fallback_error.code not in FALLBACK_ERROR_CODES:
                raise
            last_error = fallback_error
            continue

        return

    # Streaming can be unavailable independently of ordinary content
    # generation. Make one final non-streaming attempt across the configured
    # fallback models so the chat can still return a complete answer.
    for fallback_model in FALLBACK_MODEL_NAMES:
        if fallback_model == MODEL_NAME:
            continue

        logger.warning(
            "Gemini streaming is unavailable; trying non-streaming fallback "
            "model %s",
            fallback_model
        )
        try:
            answer = _generate_answer_with_model(
                fallback_model,
                prompt,
                FALLBACK_HTTP_RETRY_OPTIONS
            )
        except errors.APIError as fallback_error:
            if fallback_error.code not in FALLBACK_ERROR_CODES:
                raise
            last_error = fallback_error
            continue

        if has_output:
            yield None
        yield answer
        return

    raise last_error
