"""
test_review_persistence.py — a human decision must survive a refresh.

Covers the two defects the operations desk hit:

  1. `approve` recorded a Review row but left the email NEEDS_REVIEW/MISMATCH,
     so the case never left the queue and the decision vanished on reload.
  2. The desk posts `action` + `corrections`; the API only understood
     `decision`, and the client posted to /reviews instead of
     /reviews/{email_id}, so every save silently failed.

    python3 tests/test_review_persistence.py
"""
import os
import sys
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ["DISABLE_AUTH"] = "1"
os.environ["LLM_DISABLE_FALLBACK"] = "1"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient          # noqa: E402
from sqlmodel import Session, select               # noqa: E402

from app.main import app                           # noqa: E402
from app.database.connection import engine         # noqa: E402
from app.models.email import Email                 # noqa: E402
from app.models.discrepancy import ComparisonResult  # noqa: E402
from app.models.review import Review               # noqa: E402

client = TestClient(app)


def _auth_bypass():
    """This module drives the API without tokens, so it needs the bypass on.
    Another module may have turned it off (the flag is global and read per
    request), so each test states the mode it needs instead of relying on
    import order."""
    os.environ["DISABLE_AUTH"] = "1"



def _seed(email_id, status, defects):
    with Session(engine) as s:
        for row in s.exec(select(Email).where(Email.email_id == email_id)).all():
            s.delete(row)
        for row in s.exec(select(ComparisonResult).where(
                ComparisonResult.email_id == email_id)).all():
            s.delete(row)
        for row in s.exec(select(Review).where(Review.email_id == email_id)).all():
            s.delete(row)
        s.commit()
        s.add(Email(email_id=email_id, sender="ops@x.com", subject="Discrepancy case",
                    body="", category="BL_COMPARISON", status=status))
        s.add(ComparisonResult(
            email_id=email_id, status=status, has_defect=bool(defects),
            defect_fields=ComparisonResult.encode_fields(defects),
            review_reason=None if status == "MISMATCH" else "missing_value"))
        s.commit()


def _stored(email_id):
    with Session(engine) as s:
        e = s.exec(select(Email).where(Email.email_id == email_id)).first()
        c = s.exec(select(ComparisonResult).where(
            ComparisonResult.email_id == email_id)).first()
        return e, c


def test_approve_with_corrections_is_persisted():
    _auth_bypass()
    _seed("rev_approve", "MISMATCH", ["container_count"])
    r = client.post("/reviews/rev_approve", json={
        "action": "approve",
        "notes": "Carrier confirmed 3 containers",
        "corrections": {"container_count": "3"},
    })
    assert r.status_code == 200, r.text
    assert r.json()["resolved"] is True

    # the durable record, not the response
    email, cr = _stored("rev_approve")
    assert email.status == "OK", email.status
    assert cr.status == "OK" and cr.has_defect is False
    assert cr.defect_fields_list() == []


def test_an_approved_case_leaves_the_queue():
    """REGRESSION: approve left the status untouched, so the item reappeared
    in the review queue on every refresh."""
    _auth_bypass()
    _seed("rev_queue", "MISMATCH", ["gross_weight_kg"])
    assert any(x["email_id"] == "rev_queue" for x in client.get("/reviews").json())
    client.post("/reviews/rev_queue", json={"action": "approve", "corrections": {}})
    assert not any(x["email_id"] == "rev_queue" for x in client.get("/reviews").json())


def test_discrepancies_appear_in_the_queue_at_all():
    """REGRESSION: the queue only listed NEEDS_REVIEW, never MISMATCH, even
    though the desk reviews discrepancies."""
    _auth_bypass()
    _seed("rev_mismatch", "MISMATCH", ["consignee"])
    queue = client.get("/reviews").json()
    row = next((x for x in queue if x["email_id"] == "rev_mismatch"), None)
    assert row is not None
    assert row["defect_fields"] == ["consignee"]


def test_reject_keeps_the_defect_but_closes_the_case():
    _auth_bypass()
    _seed("rev_reject", "MISMATCH", ["notify_party"])
    r = client.post("/reviews/rev_reject", json={
        "action": "reject", "notes": "Genuine mismatch, hold the release"})
    assert r.status_code == 200, r.text
    email, cr = _stored("rev_reject")
    assert email.status == "MISMATCH"
    assert cr.defect_fields_list() == ["notify_party"]
    assert not any(x["email_id"] == "rev_reject" for x in client.get("/reviews").json())


def test_both_action_and_decision_spellings_work():
    _auth_bypass()
    _seed("rev_alias", "NEEDS_REVIEW", [])
    assert client.post("/reviews/rev_alias", json={"decision": "approve"}).status_code == 200
    _seed("rev_alias2", "NEEDS_REVIEW", [])
    assert client.post("/reviews/rev_alias2", json={"action": "approve"}).status_code == 200


def test_an_invalid_decision_is_rejected():
    _auth_bypass()
    _seed("rev_bad", "MISMATCH", ["shipper"])
    assert client.post("/reviews/rev_bad", json={"action": "whatever"}).status_code == 422
    email, _ = _stored("rev_bad")
    assert email.status == "MISMATCH", "a rejected payload must not change anything"


def test_history_records_the_correction_for_audit():
    _auth_bypass()
    _seed("rev_hist", "MISMATCH", ["container_count"])
    client.post("/reviews/rev_hist", json={
        "action": "approve", "notes": "verified with carrier",
        "corrections": {"container_count": "3"}})
    hist = client.get("/reviews/rev_hist/history").json()
    assert len(hist) == 1
    assert hist[0]["decision"] == "approve"
    assert hist[0]["result"]["corrections"] == {"container_count": "3"}
    assert hist[0]["result"]["notes"] == "verified with carrier"
    assert hist[0]["resolved_at"] is not None


TESTS = [
    test_approve_with_corrections_is_persisted,
    test_an_approved_case_leaves_the_queue,
    test_discrepancies_appear_in_the_queue_at_all,
    test_reject_keeps_the_defect_but_closes_the_case,
    test_both_action_and_decision_spellings_work,
    test_an_invalid_decision_is_rejected,
    test_history_records_the_correction_for_audit,
]

if __name__ == "__main__":
    failed = 0
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL  {t.__name__}: {exc}")
    print("All review-persistence tests passed." if not failed else f"{failed} failed.")
    sys.exit(1 if failed else 0)
