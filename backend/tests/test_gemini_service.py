import importlib
import os
import unittest
from unittest.mock import Mock, patch

from google.genai import types
from google.genai import errors


class GeminiRetryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            cls.service = importlib.import_module(
                "app.services.gemini_service"
            )

    def test_generate_answer_uses_bounded_sdk_retries(self):
        response = Mock(text="Grounded answer")

        with patch.object(
            self.service.client.models,
            "generate_content",
            return_value=response
        ) as generate_content:
            answer = self.service.generate_answer(
                "What is the topic?",
                "The topic is biology."
            )

        self.assertEqual(answer, "Grounded answer")
        config = generate_content.call_args.kwargs["config"]
        retry_options = types.GenerateContentConfig(
            **config
        ).http_options.retry_options
        self.assertEqual(retry_options.attempts, 3)
        self.assertEqual(retry_options.max_delay, 4.0)

    def test_generate_answer_uses_fallback_after_primary_503(self):
        overloaded = errors.ServerError(
            503,
            {"error": {"message": "temporarily unavailable"}}
        )
        response = Mock(text="Fallback answer")

        with (
            patch.object(
                self.service,
                "FALLBACK_MODEL_NAMES",
                ("gemini-3.5-flash-lite",)
            ),
            patch.object(
                self.service.client.models,
                "generate_content",
                side_effect=[overloaded, response]
            ) as generate_content
        ):
            answer = self.service.generate_answer(
                "What is the topic?",
                "The topic is biology."
            )

        self.assertEqual(answer, "Fallback answer")
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in generate_content.call_args_list
            ],
            [self.service.MODEL_NAME, "gemini-3.5-flash-lite"]
        )
        retry_options = types.GenerateContentConfig(
            **generate_content.call_args_list[1].kwargs["config"]
        ).http_options.retry_options
        self.assertEqual(retry_options.attempts, 1)

    def test_generate_answer_uses_fallback_after_primary_429(self):
        limited = errors.APIError(
            429,
            {"error": {"message": "rate limit exceeded"}}
        )
        response = Mock(text="Fallback answer")

        with (
            patch.object(
                self.service,
                "FALLBACK_MODEL_NAMES",
                ("gemini-3.5-flash-lite",)
            ),
            patch.object(
                self.service.client.models,
                "generate_content",
                side_effect=[limited, response]
            ) as generate_content
        ):
            answer = self.service.generate_answer(
                "What is the topic?",
                "The topic is biology."
            )

        self.assertEqual(answer, "Fallback answer")
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in generate_content.call_args_list
            ],
            [self.service.MODEL_NAME, "gemini-3.5-flash-lite"]
        )

    def test_generate_answer_stream_yields_chunks_incrementally(self):
        response_chunks = [
            Mock(text="First line.\n"),
            Mock(text="Second line.")
        ]

        with patch.object(
            self.service.client.models,
            "generate_content_stream",
            return_value=iter(response_chunks)
        ):
            answer_chunks = list(
                self.service.generate_answer_stream(
                    "Summarize this document.",
                    "Document text."
                )
            )

        self.assertEqual(
            answer_chunks,
            ["First line.\n", "Second line."]
        )

    def test_generate_answer_stream_falls_back_before_first_chunk_on_503(self):
        overloaded = errors.ServerError(
            503,
            {"error": {"message": "temporarily unavailable"}}
        )

        class FailingStream:
            def __iter__(self):
                raise overloaded

        response_chunks = [Mock(text="Fallback stream.")]

        with (
            patch.object(
                self.service,
                "FALLBACK_MODEL_NAMES",
                ("gemini-3.5-flash-lite",)
            ),
            patch.object(
                self.service.client.models,
                "generate_content_stream",
                side_effect=[
                    FailingStream(),
                    iter(response_chunks)
                ]
            ) as generate_content_stream
        ):
            answer_chunks = list(
                self.service.generate_answer_stream(
                    "Summarize this document.",
                    "Document text."
                )
            )

        self.assertEqual(answer_chunks, ["Fallback stream."])
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in generate_content_stream.call_args_list
            ],
            [self.service.MODEL_NAME, "gemini-3.5-flash-lite"]
        )

    def test_generate_answer_stream_falls_back_before_first_chunk_on_429(self):
        limited = errors.APIError(
            429,
            {"error": {"message": "rate limit exceeded"}}
        )
        overloaded = errors.ServerError(
            503,
            {"error": {"message": "temporarily unavailable"}}
        )

        class FailingStream:
            def __init__(self, error):
                self.error = error

            def __iter__(self):
                raise self.error

        response_chunks = [Mock(text="Secondary fallback stream.")]

        with (
            patch.object(
                self.service,
                "FALLBACK_MODEL_NAMES",
                ("gemini-3.5-flash-lite", "gemini-3.6-flash")
            ),
            patch.object(
                self.service.client.models,
                "generate_content_stream",
                side_effect=[
                    FailingStream(limited),
                    FailingStream(overloaded),
                    iter(response_chunks)
                ]
            ) as generate_content_stream
        ):
            answer_chunks = list(
                self.service.generate_answer_stream(
                    "Summarize this document.",
                    "Document text."
                )
            )

        self.assertEqual(answer_chunks, ["Secondary fallback stream."])
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in generate_content_stream.call_args_list
            ],
            [
                self.service.MODEL_NAME,
                "gemini-3.5-flash-lite",
                "gemini-3.6-flash"
            ]
        )

    def test_stream_restarts_with_next_fallback_after_partial_output(self):
        overloaded = errors.ServerError(
            503,
            {"error": {"message": "temporarily unavailable"}}
        )
        limited = errors.APIError(
            429,
            {"error": {"message": "rate limit exceeded"}}
        )

        class PartialFailingStream:
            def __iter__(self):
                yield Mock(text="Partial primary answer")
                raise limited

        class FailingStream:
            def __iter__(self):
                raise overloaded

        with (
            patch.object(
                self.service,
                "FALLBACK_MODEL_NAMES",
                ("gemini-3.5-flash-lite", "gemini-3.6-flash")
            ),
            patch.object(
                self.service.client.models,
                "generate_content_stream",
                side_effect=[
                    PartialFailingStream(),
                    FailingStream(),
                    iter([Mock(text="Complete fallback answer")])
                ]
            ) as generate_content_stream
        ):
            answer_chunks = list(
                self.service.generate_answer_stream(
                    "Summarize this document.",
                    "Document text."
                )
            )

        self.assertEqual(
            answer_chunks,
            ["Partial primary answer", None, "Complete fallback answer"]
        )
        self.assertEqual(
            [
                call.kwargs["model"]
                for call in generate_content_stream.call_args_list
            ],
            [
                self.service.MODEL_NAME,
                "gemini-3.5-flash-lite",
                "gemini-3.6-flash"
            ]
        )


if __name__ == "__main__":
    unittest.main()
