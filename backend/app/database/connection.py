"""
database/connection.py — SQLModel engine + session management.

DATABASE_URL comes from the environment so the same code runs against
SQLite (fast local dev, no Docker required) and PostgreSQL (docker-compose /
production) unchanged:

    sqlite:///./storage/app.db                       (default, local dev)
    postgresql+psycopg2://user:pass@postgres:5432/db (docker-compose)
"""
import os
from contextlib import contextmanager

from sqlmodel import SQLModel, Session, create_engine, select

_default_db = "sqlite:////tmp/app.db" if os.environ.get("VERCEL") else "sqlite:///./storage/app.db"
DATABASE_URL = os.environ.get("DATABASE_URL", _default_db)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {"connect_timeout": 10}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)


# Columns added after a table first shipped. create_all() only creates
# missing *tables*, so a new column on an existing deployment (the live Neon
# database already has `users`) would never appear and every query touching
# it would fail. These are applied additively at startup; adding a nullable
# column is safe to re-run and never touches existing data.
_ADDED_COLUMNS = {
    "users": [
        ("organization", "VARCHAR"),
        ("job_title", "VARCHAR"),
    ],
    "documents": [
        ("shipment_id", "INTEGER"),
    ],
    "emails": [
        ("shipment_id", "INTEGER"),
        ("owner", "VARCHAR"),
        ("organization", "VARCHAR"),
    ],
    "shipment_folders": [
        ("regulatory_status", "VARCHAR DEFAULT 'NOT_APPLICABLE'"),
        ("regulatory_defects", "TEXT DEFAULT '[]'"),
        ("owner", "VARCHAR"),
        ("organization", "VARCHAR"),
    ],
    "email_accounts": [
        ("organization", "VARCHAR"),
    ],
    "dataset_uploads": [
        ("organization", "VARCHAR"),
    ],
    "reviews": [
        ("reviewer", "VARCHAR"),
        ("organization", "VARCHAR"),
        ("action_taken", "VARCHAR"),
        ("audit_reason_code", "VARCHAR"),
        ("notes", "TEXT"),
        ("voice_note", "TEXT"),
    ],
    "audit_logs": [
        ("operator_id", "VARCHAR"),
        ("user_email", "VARCHAR"),
        ("action_taken", "VARCHAR"),
        ("audit_reason_code", "VARCHAR"),
    ],
}


def _existing_columns(conn, table):
    from sqlalchemy import inspect
    try:
        return {c["name"] for c in inspect(conn).get_columns(table)}
    except Exception:
        return set()


def _apply_additive_migrations():
    """Add any column listed in _ADDED_COLUMNS that the database lacks."""
    from sqlalchemy import text, inspect
    try:
        with engine.begin() as conn:
            tables = set(inspect(conn).get_table_names())
            for table, columns in _ADDED_COLUMNS.items():
                if table not in tables:
                    continue           # create_all will build it complete
                present = _existing_columns(conn, table)
                for name, ddl_type in columns:
                    if name in present:
                        continue
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {ddl_type}'))
    except Exception as exc:
        print(f"Warning: additive migration check skipped: {exc}")


def init_db():
    """Create tables if they don't exist, then apply additive column
    migrations. Import all models first so their metadata is registered on
    SQLModel.metadata before create_all runs."""
    try:
        from app.models import (email, document, shipment, discrepancy, review,  # noqa: F401
                                user as user_model, email_account, dataset_upload, shipment_folder, audit)  # noqa: F401
        SQLModel.metadata.create_all(engine)
        _apply_additive_migrations()

        # Seed default admin and demo accounts if missing
        try:
            with Session(engine) as session:
                admin_user = session.exec(select(user_model.User).where(user_model.User.username == "admin")).first()
                if not admin_user:
                    from app.api.auth import hash_password
                    session.add(user_model.User(
                        username="admin",
                        email="admin@siblix.ai",
                        password_hash=hash_password("admin123"),
                        full_name="Admin Lead",
                        role="admin",
                        organization="Maritime Assurance Desk",
                        job_title="Lead Verification Officer",
                    ))
                demo_user = session.exec(select(user_model.User).where(user_model.User.username == "demo")).first()
                if not demo_user:
                    from app.api.auth import hash_password
                    session.add(user_model.User(
                        username="demo",
                        email="operator@siblix.ai",
                        password_hash=hash_password("demo1234"),
                        full_name="Demo Operator",
                        role="operator",
                        organization="Modjo Dry Port Operations",
                        job_title="Logistics Specialist",
                    ))
                session.commit()
        except Exception as seed_exc:
            print(f"Notice: user seeding skipped: {seed_exc}")
    except Exception as exc:
        print(f"Warning: init_db encountered error: {exc}")


def get_session():
    """FastAPI dependency: yields a Session per-request."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope():
    """Use outside of request handlers (background tasks, scripts)."""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
