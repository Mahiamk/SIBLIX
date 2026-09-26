import os
import sys
import time
import json

SHIM_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SHIM_DIR, "..", "..", "backend"))

# shim packages must be importable BEFORE the (nonexistent) real ones
sys.path.insert(0, SHIM_DIR)
sys.path.insert(0, BACKEND_DIR)

# fresh DB file each run
db_path = os.path.join(BACKEND_DIR, "storage", "shim_test.db")
if os.path.exists(db_path):
    os.remove(db_path)

os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
os.environ["STORAGE_ROOT"] = os.path.join(BACKEND_DIR, "storage")
os.environ["DISABLE_AUTH"] = "0"
os.environ["APP_USERNAME"] = "admin"
os.environ["APP_PASSWORD"] = "admin123"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("EVAL_SERVER_URL", None)  # deliberately unset -> /evaluation/submit should 502

os.chdir(BACKEND_DIR)

PASS = []
FAIL = []


def check(label, cond, extra=""):
    if cond:
        PASS.append(label)
        print(f"  [PASS] {label}")
    else:
        FAIL.append(label)
        print(f"  [FAIL] {label}  {extra}")


print("=" * 70)
print("Importing the REAL app.main through the shim...")
print("=" * 70)
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(app)

print("\n--- /health ---")
r = client.get("http://test/health")
check("GET /health -> 200", r.status_code == 200, r.status_code)
check("GET /health -> status ok", r.json().get("status") == "ok", r.json())

print("\n--- auth ---")
r = client.get("http://test/emails")
check("GET /emails with no token -> 401", r.status_code == 401, r.status_code)

r = client.post("http://test/auth/login", json={"username": "admin", "password": "wrong"})
check("POST /auth/login wrong password -> 401", r.status_code == 401, r.status_code)

r = client.post("http://test/auth/login", json={"username": "admin", "password": "admin123"})
check("POST /auth/login correct -> 200", r.status_code == 200, r.status_code)
token = r.json().get("token")
check("login response includes a token", bool(token), r.json())
auth_headers = {"Authorization": f"Bearer {token}"}

r = client.get("http://test/emails", headers=auth_headers)
check("GET /emails with valid token -> 200", r.status_code == 200, r.status_code)

print("\n--- dataset ingestion ---")
t0 = time.time()
r = client.post("http://test/upload", headers=auth_headers)
check("POST /upload -> 200", r.status_code == 200, r.status_code)
upload_body = r.json()
print(f"  upload response: {upload_body}  ({time.time()-t0:.1f}s)")
check("upload created ~520 emails", upload_body.get("total_emails", 0) >= 500, upload_body)

r = client.post("http://test/upload", headers=auth_headers)
check("POST /upload again is idempotent (created=0)", r.json().get("created") == 0, r.json())

print("\n--- full pipeline run through the real API (this is the big one) ---")
t0 = time.time()
r = client.post("http://test/emails/process-all", headers=auth_headers)
elapsed = time.time() - t0
check("POST /emails/process-all -> 200", r.status_code == 200, r.status_code)
queued = r.json().get("queued", 0)
print(f"  queued {queued} emails, processed via BackgroundTasks in {elapsed:.1f}s")
check("queued ~520 emails", queued >= 500, r.json())

print("\n--- dashboard ---")
r = client.get("http://test/dashboard", headers=auth_headers)
check("GET /dashboard -> 200", r.status_code == 200, r.status_code)
dash = r.json()
print(f"  dashboard: {dash}")
check("dashboard total_emails matches upload count", dash["total_emails"] == upload_body["total_emails"])
check("dashboard processed_emails > 0", dash["processed_emails"] > 0, dash)
check("dashboard bl_comparison_requests roughly matches expected (~220)",
      200 <= dash["bl_comparison_requests"] <= 240, dash)
check("dashboard human_review_cases == 20 (matches offline validation)",
      dash["human_review_cases"] == 20, dash)

print("\n--- list / filter emails ---")
r = client.get("http://test/emails?category=SPAM&limit=5", headers=auth_headers)
check("GET /emails?category=SPAM -> 200", r.status_code == 200, r.status_code)
spam_rows = r.json()
check("filtered rows are all SPAM", all(row["category"] == "SPAM" for row in spam_rows), spam_rows)
check("limit=5 respected", len(spam_rows) <= 5, len(spam_rows))

print("\n--- bulk /emails/full (what the frontend actually calls) ---")
t0 = time.time()
r = client.get("http://test/emails/full", headers=auth_headers)
check("GET /emails/full -> 200", r.status_code == 200, r.status_code)
full = r.json()
print(f"  {len(full)} emails, {time.time()-t0:.2f}s")
check("emails/full count matches total", len(full) == dash["total_emails"])
mismatch_rows = [e for e in full if e["comparison"] and e["comparison"]["status"] == "MISMATCH"]
check("at least one real MISMATCH present", len(mismatch_rows) > 0, len(mismatch_rows))
e004 = next((e for e in full if e["email_id"] == "email_004"), None)
check("email_004 present", e004 is not None)
if e004:
    check("email_004 is the known MISMATCH (consignee/notify_party)",
          e004["comparison"]["status"] == "MISMATCH"
          and set(e004["comparison"]["defect_fields"]) == {"consignee", "notify_party"},
          e004["comparison"])
    check("email_004 has 2 documents (SI + BL)", len(e004["documents"]) == 2, len(e004["documents"]))

print("\n--- single email detail ---")
r = client.get("http://test/emails/email_004", headers=auth_headers)
check("GET /emails/email_004 -> 200", r.status_code == 200, r.status_code)
detail = r.json()
check("detail has real subject text", "BL DRAFT" in detail["subject"].upper(), detail["subject"])
check("detail documents include extracted fields",
      detail["documents"][0]["fields"] is not None, detail["documents"][0])

r = client.get("http://test/emails/does_not_exist", headers=auth_headers)
check("GET /emails/does_not_exist -> 404", r.status_code == 404, r.status_code)

print("\n--- documents & comparison endpoints ---")
r = client.get("http://test/documents/email_004", headers=auth_headers)
check("GET /documents/email_004 -> 200", r.status_code == 200, r.status_code)
check("returns 2 documents", len(r.json()) == 2, len(r.json()))

r = client.get("http://test/comparison/email_004", headers=auth_headers)
check("GET /comparison/email_004 -> 200", r.status_code == 200, r.status_code)
check("comparison status MISMATCH", r.json()["status"] == "MISMATCH", r.json())

print("\n--- reviews queue ---")
r = client.get("http://test/reviews", headers=auth_headers)
check("GET /reviews -> 200", r.status_code == 200, r.status_code)
reviews = r.json()
print(f"  {len(reviews)} pending reviews")
check("exactly 20 pending reviews (matches offline validation)", len(reviews) == 20, len(reviews))
reasons = {r_["reason"] for r_ in reviews}
check("all 4 review reasons represented",
      reasons == {"wrong_doc_type", "missing_attachment", "unreadable", "missing_value"}, reasons)

target = reviews[0]["email_id"]
r = client.post(f"http://test/reviews/{target}", json={"decision": "approve"}, headers=auth_headers)
check(f"POST /reviews/{target} approve -> 200", r.status_code == 200, r.status_code)
check("approve decision echoed back", r.json().get("decision") == "approve", r.json())

r = client.get("http://test/reviews", headers=auth_headers)
check("review queue count unchanged after approve (approve doesn't clear status)",
      len(r.json()) == 20, len(r.json()))

bad_target = reviews[1]["email_id"]
r = client.post(f"http://test/reviews/{bad_target}",
                 json={"decision": "correct", "corrected_status": "OK", "corrected_defect_fields": []},
                 headers=auth_headers)
check(f"POST /reviews/{bad_target} correct -> 200", r.status_code == 200, r.status_code)
check("corrected status is OK", r.json().get("status") == "OK", r.json())

r = client.get("http://test/reviews", headers=auth_headers)
check("review queue shrank by 1 after a 'correct' decision", len(r.json()) == 19, len(r.json()))

print("\n--- evaluation ---")
r = client.post("http://test/evaluation/generate", headers=auth_headers)
check("POST /evaluation/generate -> 200", r.status_code == 200, r.status_code)
check("generate reports emails_included ~520", r.json()["emails_included"] >= 500, r.json())

r = client.post("http://test/evaluation/submit", headers=auth_headers)
check("POST /evaluation/submit with no EVAL_SERVER_URL configured -> 502 (handled gracefully)",
      r.status_code == 502, r.status_code)
check("502 body has a clear detail message", "submission.json" in r.json().get("detail", ""), r.json())

r = client.get("http://test/evaluation/submission", headers=auth_headers)
check("GET /evaluation/submission -> 200", r.status_code == 200, r.status_code)
submission = r.json()
check("submission has ~520 entries", len(submission) >= 500, len(submission))
check("email_004 in submission is MISMATCH with correct defect_fields",
      submission["email_004"]["status"] == "MISMATCH"
      and set(submission["email_004"]["defect_fields"]) == {"consignee", "notify_party"},
      submission.get("email_004"))

print("\n--- retry action (re-runs the real pipeline for one email) ---")
retry_target = reviews[2]['email_id']
r = client.get(f"http://test/documents/{retry_target}", headers=auth_headers)
docs_before = len(r.json()) if r.status_code == 200 else 0
r = client.post(f"http://test/reviews/{retry_target}", json={"decision": "retry"}, headers=auth_headers)
check("POST retry -> 200", r.status_code == 200, r.status_code)
check("retry reprocessed", r.json().get("status") == "reprocessed", r.json())
r2 = client.get(f"http://test/documents/{retry_target}", headers=auth_headers)
docs_after = len(r2.json()) if r2.status_code == 200 else 0
check("retry doesn't duplicate document rows (idempotent re-processing)",
      docs_after == docs_before, (docs_before, docs_after))

print("\n" + "=" * 70)
print(f"RESULTS: {len(PASS)} passed, {len(FAIL)} failed (out of {len(PASS)+len(FAIL)})")
if FAIL:
    print("FAILED CHECKS:")
    for f in FAIL:
        print("  -", f)
print("=" * 70)
