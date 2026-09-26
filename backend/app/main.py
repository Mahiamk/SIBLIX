"""
main.py — FastAPI application entrypoint.

Modular monolith: routers per domain (emails/documents/comparison/reviews/
evaluation) all import from the same services/ layer, no microservices.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import init_db
from app.api import (auth, emails, documents, comparison, reviews, evaluation,
                     email_accounts, profile, shipments, audit, superadmin)

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


@app.get("/")
@app.get("/api")
def api_root():
    return {
        "platform": "SIBLIX AI",
        "description": "Intelligent Shipping Document (SI vs BL) Verification Engine",
        "version": "1.0.0",
        "status": "online",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_spec": "/openapi.json"
        },
        "endpoints": {
            "health": "GET /health",
            "auth": {
                "register": "POST /auth/register",
                "login": "POST /auth/login",
                "me": "GET /auth/me",
                "logout": "POST /auth/logout"
            },
            "dashboard": "GET /dashboard",
            "emails": {
                "list": "GET /emails",
                "full": "GET /emails/full",
                "pipeline_status": "GET /emails/pipeline-status",
                "process_all": "POST /emails/process-all",
                "single": "GET /emails/{email_id}",
                "process_single": "POST /emails/{email_id}/process"
            },
            "documents": "GET /documents/{email_id}",
            "comparison": "GET /comparison/{email_id}",
            "reviews": {
                "queue": "GET /reviews",
                "submit": "POST /reviews/{email_id}",
                "history": "GET /reviews/{email_id}/history"
            },
            "evaluation": {
                "generate": "POST /evaluation/generate",
                "submit": "POST /evaluation/submit",
                "submission": "GET /evaluation/submission"
            },
            "shipments": "GET /shipments",
            "audit": "GET /audit",
            "email_accounts": "GET /email-accounts",
            "profile": "GET /profile",
            "superadmin": "GET /superadmin/overview"
        }
    }


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
app.include_router(superadmin.router)
