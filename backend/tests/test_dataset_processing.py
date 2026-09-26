"""
Runs the full pipeline over the bundled dataset (storage/inbox +
storage/attachments) and sanity-checks the shape and coverage of the
result — this is the "Dataset processing test" required by the spec.

It intentionally does NOT compare against ground_truth.json (participants
don't have it) — it only checks internal consistency: every email got a
category, every BL_COMPARISON email got a valid status, every submission
record matches the required schema.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.pipeline import process_email, to_submission_record

STORAGE_ROOT = os.path.join(os.path.dirname(__file__), "..", "storage")
VALID_CATEGORIES = {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
VALID_STATUSES = {"OK", "MISMATCH", "NEEDS_REVIEW"}
VALID_REASONS = {"wrong_doc_type", "missing_attachment", "unreadable", "missing_value", None}


def _load_emails():
    inbox_dir = os.path.join(STORAGE_ROOT, "inbox")
    emails = []
    for fname in sorted(os.listdir(inbox_dir)):
        if fname.endswith(".json"):
            with open(os.path.join(inbox_dir, fname)) as f:
                emails.append(json.load(f))
    return emails


def test_full_dataset_processes_without_error():
    emails = _load_emails()
    assert len(emails) > 0, "expected the bundled dataset to be present under storage/inbox"

    cache = {}
    submission = {}
    for email in emails:
        result = process_email(email, STORAGE_ROOT, extraction_cache=cache)
        assert result["category"] in VALID_CATEGORIES
        assert result["status"] in VALID_STATUSES
        assert result["review_reason"] in VALID_REASONS
        assert isinstance(result["defect_fields"], list)
        submission[email["email_id"]] = to_submission_record(result)

    # every record matches the exact submission schema
    for record in submission.values():
        assert set(record.keys()) == {"category", "status", "review_reason", "has_defect", "defect_fields"}

    return submission


if __name__ == "__main__":
    submission = test_full_dataset_processes_without_error()
    print(f"Processed {len(submission)} emails without error.")
    out_path = os.path.join(STORAGE_ROOT, "reports", "submission.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(submission, f, indent=2)
    print(f"Wrote {out_path}")
