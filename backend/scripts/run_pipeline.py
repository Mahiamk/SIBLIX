#!/usr/bin/env python3
"""
run_pipeline.py — run the full pipeline over storage/inbox + storage/attachments
and write storage/reports/submission.json.

Usage:
    python3 scripts/run_pipeline.py [--storage ../storage] [--out submission.json]
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.pipeline import process_email, to_submission_record


def load_inbox(storage_root):
    inbox_dir = os.path.join(storage_root, "inbox")
    emails = []
    for fname in sorted(os.listdir(inbox_dir)):
        if fname.endswith(".json"):
            with open(os.path.join(inbox_dir, fname)) as f:
                emails.append(json.load(f))
    return emails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--storage", default=os.path.join(os.path.dirname(__file__), "..", "storage"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    storage_root = os.path.abspath(args.storage)
    out_path = args.out or os.path.join(storage_root, "reports", "submission.json")

    emails = load_inbox(storage_root)
    print(f"Loaded {len(emails)} emails from {storage_root}/inbox")

    submission = {}
    counts = {}
    t0 = time.time()
    extraction_cache = {}
    for i, email in enumerate(emails, 1):
        result = process_email(email, storage_root, extraction_cache=extraction_cache)
        submission[email["email_id"]] = to_submission_record(result)
        counts[result["category"]] = counts.get(result["category"], 0) + 1
        if args.verbose:
            print(email["email_id"], result["category"], result["status"],
                  result["defect_fields"], result["review_reason"])
        if i % 100 == 0:
            print(f"  ...{i}/{len(emails)}")

    elapsed = time.time() - t0
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(submission, f, indent=2)

    print(f"\nWrote {out_path}")
    print(f"Processed {len(emails)} emails in {elapsed:.1f}s")
    print("Category counts:", counts)


if __name__ == "__main__":
    main()
