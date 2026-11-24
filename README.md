# CampusPilot AI

CampusPilot AI is a student assistant with account authentication and PDF question answering. The React frontend talks to a Flask API, which stores account and document metadata in MongoDB and uses Gemini for grounded answers.

## Prerequisites

- Python 3.11 or newer
- Node.js and npm
- A MongoDB connection string
- A Gemini API key

## Configure environment variables

Copy `backend/.env.example` to `backend/.env` and fill in your MongoDB URI, a long random JWT secret, and Gemini API key. Copy `frontend/.env.example` to `frontend/.env`.

Keep real `.env` files private. The repository ignores them; commit only the `.env.example` files.

## Start the backend

From the repository root:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Flask listens on `http://localhost:5001`.

## Start the frontend

In a second terminal, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

## Check the main flow

1. Register an account and log in.
2. Upload a text-based PDF.
3. Ask a question answered by the PDF and inspect the page source.

The backend currently builds the PDF index when the first question is asked. Scanned image-only PDFs need OCR, which is not currently implemented.
