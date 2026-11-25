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

## Production deployment notes

- Configure `APP_ENV=production`, a randomly generated `JWT_SECRET_KEY` with at least 32 characters, and `CORS_ORIGINS` as a comma-separated list of the deployed frontend origins. Do not use localhost origins in production.
- The Vercel rewrite proxies `/api/*` to the Render API so browser requests and JWT cookies stay on the frontend origin. Production builds always use this same-origin proxy. Local development uses `VITE_API_URL` or defaults to `http://localhost:5001`. Keep `CORS_ORIGINS` set to the deployed frontend origin.
- Authentication uses an HttpOnly JWT cookie with CSRF protection. Since the Vercel rewrite keeps requests on the frontend origin, `JWT_COOKIE_SAMESITE=Lax` is suitable for deployment.
- Set `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` to the same Google OAuth **Web application** client ID. Add the deployed frontend origins to its authorized JavaScript origins.
- Configure `RATELIMIT_STORAGE_URI` to a shared Redis service. The in-memory limiter is only suitable for local development and single-process use.
- If the app runs behind a reverse proxy, set `TRUSTED_PROXY_HOPS` to the number of trusted proxies only after configuring the ingress to replace forwarded IP/protocol headers. This lets rate limits use the real client address without trusting spoofed headers.
- Before deploying, run `cd backend && python -m scripts.ensure_auth_indexes` once. It normalizes stored account emails and creates unique email and Google subject indexes. Resolve any reported duplicate accounts before rerunning it.
- Serve Flask with a production WSGI server, for example `gunicorn --workers 2 --bind 0.0.0.0:${PORT:-5001} 'app:create_app()'` from `backend/`. Terminate HTTPS at a trusted load balancer or reverse proxy and configure the platform's health checks and secret storage.
- Keep `.env` files out of version control and set production secrets through the deployment platform. Build the frontend with production `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` values; Vite embeds `VITE_` variables into the client bundle.

## Check the main flow

1. Register an account and log in.
2. Upload a text-based PDF.
3. Ask a question answered by the PDF and inspect the page source.

The backend currently builds the PDF index when the first question is asked. Scanned image-only PDFs need OCR, which is not currently implemented.
