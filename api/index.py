"""
api/index.py — Vercel Serverless Function entrypoint for SIBLIX FastAPI backend.
Vercel's Python runtime invokes this module for serverless requests.
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure storage path is writable on Vercel (/tmp is the only writable directory on AWS Lambda / Vercel)
if os.environ.get("VERCEL"):
    os.environ.setdefault("STORAGE_ROOT", "/tmp/storage")
    os.makedirs("/tmp/storage", exist_ok=True)
    os.makedirs("/tmp/storage/inbox", exist_ok=True)
    os.makedirs("/tmp/storage/processed", exist_ok=True)
    os.makedirs("/tmp/storage/reports", exist_ok=True)

# Load backend/.env if present
env_path = BACKEND_DIR / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

from app.main import app

from fastapi.responses import JSONResponse
import traceback

# Error logging middleware for Vercel Serverless requests
@app.middleware("http")
async def vercel_exception_logging(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[VERCEL API EXCEPTION] {exc}\n{tb}", file=sys.stderr)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal Server Error: {str(exc)}", "type": type(exc).__name__},
        )

