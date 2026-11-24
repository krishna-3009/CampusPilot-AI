import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch

from flask_jwt_extended import create_access_token
from google.genai.errors import APIError

from app import create_app


class DocumentApiTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        from app.database.mongodb import client

        client.close()
        super().tearDownClass()

    def setUp(self):
        self.app = create_app()
        self.app.config.update(
            TESTING=True,
            JWT_SECRET_KEY="test-secret-key-for-document-api-tests"
        )
        self.client = self.app.test_client()

        with self.app.app_context():
            token = create_access_token(identity="user-1")

        self.headers = {"Authorization": f"Bearer {token}"}

    def test_list_documents_is_scoped_to_authenticated_user(self):
        collection = Mock()
        collection.find.return_value.sort.return_value = [{
            "document_id": "doc-1",
            "original_filename": "notes.pdf",
            "status": "uploaded"
        }]

        with patch(
            "app.routes.documents.documents_collection",
            collection
        ):
            response = self.client.get(
                "/api/documents/",
                headers=self.headers
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["documents"], [{
            "document_id": "doc-1",
            "filename": "notes.pdf",
            "status": "uploaded"
        }])
        collection.find.assert_called_once_with(
            {"user_id": "user-1"},
            {
                "_id": 0,
                "document_id": 1,
                "original_filename": 1,
                "status": 1
            }
        )

    def test_chat_rejects_documents_not_owned_by_user(self):
        collection = Mock()
        collection.find_one.return_value = None
        document_id = str(uuid.uuid4())

        with patch(
            "app.routes.documents.documents_collection",
            collection
        ):
            response = self.client.post(
                f"/api/documents/{document_id}/chat",
                headers=self.headers,
                json={"question": "What is this document about?"}
            )

        self.assertEqual(response.status_code, 404)
        collection.find_one.assert_called_once_with({
            "document_id": document_id,
            "user_id": "user-1"
        })

    def test_chat_returns_answer_and_page_sources(self):
        document_id = str(uuid.uuid4())
        collection = Mock()
        collection.find_one.return_value = {"document_id": document_id}
        result = {
            "answer": "The document covers biology.",
            "sources": [{"page_number": 2, "similarity": 0.81}]
        }

        with tempfile.TemporaryDirectory() as upload_dir:
            user_dir = Path(upload_dir) / "user-1"
            user_dir.mkdir()
            (user_dir / f"{document_id}.pdf").write_bytes(b"%PDF-")

            with (
                patch("app.routes.documents.UPLOAD_FOLDER", Path(upload_dir)),
                patch(
                    "app.routes.documents.documents_collection",
                    collection
                ),
                patch(
                    "app.routes.documents._load_document_index",
                    return_value={"index": object(), "chunks": []}
                ),
                patch(
                    "app.routes.documents._ask_document_question",
                    return_value=result
                ) as ask_question
            ):
                response = self.client.post(
                    f"/api/documents/{document_id}/chat",
                    headers=self.headers,
                    json={"question": "What is this document about?"}
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, result)
        ask_question.assert_called_once()

    def test_chat_returns_temporary_unavailable_for_gemini_503(self):
        document_id = str(uuid.uuid4())
        collection = Mock()
        collection.find_one.return_value = {"document_id": document_id}

        with tempfile.TemporaryDirectory() as upload_dir:
            user_dir = Path(upload_dir) / "user-1"
            user_dir.mkdir()
            (user_dir / f"{document_id}.pdf").write_bytes(b"%PDF-")

            with (
                patch("app.routes.documents.UPLOAD_FOLDER", Path(upload_dir)),
                patch(
                    "app.routes.documents.documents_collection",
                    collection
                ),
                patch(
                    "app.routes.documents._load_document_index",
                    return_value={"index": object(), "chunks": []}
                ),
                patch(
                    "app.routes.documents._ask_document_question",
                    side_effect=APIError(
                        503,
                        {"error": {"message": "temporarily unavailable"}}
                    )
                )
            ):
                response = self.client.post(
                    f"/api/documents/{document_id}/chat",
                    headers=self.headers,
                    json={"question": "What is this document about?"}
                )

        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily overloaded", response.json["message"])

    def test_stream_chat_returns_text_chunks_and_sources(self):
        document_id = str(uuid.uuid4())
        collection = Mock()
        collection.find_one.return_value = {"document_id": document_id}

        with tempfile.TemporaryDirectory() as upload_dir:
            user_dir = Path(upload_dir) / "user-1"
            user_dir.mkdir()
            (user_dir / f"{document_id}.pdf").write_bytes(b"%PDF-")

            with (
                patch("app.routes.documents.UPLOAD_FOLDER", Path(upload_dir)),
                patch(
                    "app.routes.documents.documents_collection",
                    collection
                ),
                patch(
                    "app.routes.documents._load_document_index",
                    return_value={"index": object(), "chunks": []}
                ),
                patch(
                    "app.routes.documents._prepare_document_question",
                    return_value=(
                        "Relevant context.",
                        [{"page_number": 2, "similarity": 0.81}]
                    )
                ),
                patch(
                    "app.routes.documents._stream_document_question",
                    return_value=iter([
                        "First line.\n",
                        None,
                        "Second line."
                    ])
                )
            ):
                response = self.client.post(
                    f"/api/documents/{document_id}/chat/stream",
                    headers=self.headers,
                    json={"question": "Summarize this document."},
                    buffered=True
                )

        events = [
            json.loads(line)
            for line in response.get_data(as_text=True).splitlines()
        ]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/x-ndjson")
        self.assertEqual(
            [event["type"] for event in events],
            ["status", "status", "text", "reset", "text", "complete"]
        )
        self.assertEqual(events[2]["text"], "First line.\n")
        self.assertEqual(events[4]["text"], "Second line.")
        self.assertEqual(
            events[-1]["sources"],
            [{"page_number": 2, "similarity": 0.81}]
        )

    def test_chat_rejects_empty_question(self):
        response = self.client.post(
            f"/api/documents/{uuid.uuid4()}/chat",
            headers=self.headers,
            json={"question": "  "}
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
