"""
main.py — FastAPI application entrypoint.

Modular monolith: routers per domain (emails/documents/comparison/reviews/
evaluation) all import from the same services/ layer, no microservices.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import init_db
from app.api import (auth, emails, documents, comparison, reviews, evaluation,
                     email_accounts, profile, shipments, audit)

app = FastAPI(
    title="AI Shipping Document Verification Platform",
    description="SIBLIX.AI — Intelligent Shipping Document (SI vs BL) Verification API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # configure CORS origins for production deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "tenant_isolation": "enabled"}


app.include_router(auth.router)
app.include_router(emails.router)
app.include_router(documents.router)
app.include_router(comparison.router)
app.include_router(reviews.router)
app.include_router(evaluation.router)
app.include_router(email_accounts.router)
app.include_router(profile.router)
app.include_router(shipments.router)
app.include_router(audit.router)
