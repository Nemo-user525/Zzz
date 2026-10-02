"""Serve the built UI and existing API together for a temporary public demo.

Only frontend/dist is served as static files; never expose the repository root.
Run after pnpm build: python -m uvicorn app.public_demo:app --host 127.0.0.1 --port 8086
"""
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.main import app

dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
app.mount("/", StaticFiles(directory=dist, html=True), name="public-ui")
