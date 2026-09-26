#!/usr/bin/env python3
"""
backfill_upload_provenance.py — attribute already-imported emails to a user.

The `dataset_uploads` provenance log was added after these workspaces were
already populated, so emails imported before it existed have no record of who
loaded them and the profile page shows nothing. This writes that history back
for one user, classifying what is already in the database:

    email_*  -> the bundled shipping dataset
    mail_*   -> a connected mailbox sync

It never invents rows: it reports what it found, skips sources that are
already recorded, and does nothing at all unless you pass --commit.

    python3 scripts/backfill_upload_provenance.py --owner an@an.an
    python3 scripts/backfill_upload_provenance.py --owner an@an.an --commit
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app  # noqa: F401  (loads .env before the engine is built)
from sqlmodel import Session, select

from app.database.connection import engine, init_db
from app.models.dataset_upload import DatasetUpload
from app.models.email import Email
from app.models.user import User

SOURCES = [
    ("bundled", "email_", "Bundled shipping dataset (storage/inbox)"),
    ("mailbox", "mail_", "Connected mailbox sync"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", required=True, help="username to attribute the import to")
    ap.add_argument("--commit", action="store_true", help="write (otherwise dry-run)")
    args = ap.parse_args()

    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == args.owner)).first()
        if not user:
            known = [u.username for u in session.exec(select(User)).all()]
            sys.exit(f"No such user: {args.owner!r}. Known users: {known}")

        emails = session.exec(select(Email)).all()
        total = len(emails)
        existing = {
            u.source
            for u in session.exec(
                select(DatasetUpload).where(DatasetUpload.owner == args.owner)
            ).all()
        }

        planned = []
        for source, prefix, label in SOURCES:
            group = [e for e in emails if e.email_id.startswith(prefix)]
            if not group:
                continue
            if source in existing:
                print(f"  skip   {source:8s} already recorded for {args.owner}")
                continue
            earliest = min((e.created_at for e in group if e.created_at), default=None)
            planned.append(DatasetUpload(
                owner=args.owner,
                source=source,
                label=label,
                emails_created=len(group),
                emails_total=total,
                **({"created_at": earliest} if earliest else {}),
            ))
            print(f"  record {source:8s} {len(group):4d} emails  ({label})")

        if not planned:
            print("Nothing to backfill.")
            return

        if not args.commit:
            print(f"\nDry run — {len(planned)} record(s) would be written for "
                  f"{args.owner}. Re-run with --commit to apply.")
            return

        for row in planned:
            session.add(row)
        session.commit()
        print(f"\nWrote {len(planned)} provenance record(s) for {args.owner} "
              f"({total} emails in the workspace).")


if __name__ == "__main__":
    main()
