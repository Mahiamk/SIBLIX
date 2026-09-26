"""
test_verification_stages.py — end-to-end checks that every stage of the
verification workflow actually runs over the raw dataset, plus regression
tests for the specific defects each stage had.

    RECEIVE -> CLASSIFY -> EXTRACT -> COMPARE -> DECIDE

Stdlib only for the dataset/decision checks; the extraction stage needs the
document-parsing dependencies from requirements.txt (openpyxl/python-docx/
pdfplumber) and is skipped with a clear message if they're absent.

    python3 tests/test_verification_stages.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services import classifier, confidence as conf_engine, normalizer as norm
from app.services.comparator import compare_fields, _text_matches
from app.services.extractor import detect_doc_type
from app.services.pipeline import process_email, to_submission_record

STORAGE = os.path.join(os.path.dirname(__file__), "..", "storage")

VALID_CATEGORIES = {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
VALID_STATUSES = {"OK", "MISMATCH", "NEEDS_REVIEW"}
VALID_REASONS = {None, "wrong_doc_type", "missing_attachment", "unreadable", "missing_value"}


def _load_inbox():
    inbox = os.path.join(STORAGE, "inbox")
    return [
        json.load(open(os.path.join(inbox, f)))
        for f in sorted(os.listdir(inbox)) if f.endswith(".json")
    ]


# --------------------------------------------------------------------------
# STAGE 1 — RECEIVE
# --------------------------------------------------------------------------
def test_receive_every_email_and_attachment_is_readable_from_disk():
    emails = _load_inbox()
    assert emails, "no emails found in storage/inbox"

    ids = [e["email_id"] for e in emails]
    assert len(ids) == len(set(ids)), "duplicate email_id in the inbox"

    for e in emails:
        for key in ("email_id", "from", "subject", "body", "attachments"):
            assert key in e, f"{e.get('email_id')} missing required key {key!r}"

    missing = [
        rel for e in emails for rel in e["attachments"]
        if not os.path.exists(os.path.join(STORAGE, rel))
    ]
    assert not missing, f"attachments referenced but absent on disk: {missing[:5]}"


# --------------------------------------------------------------------------
# STAGE 2 — CLASSIFY
# --------------------------------------------------------------------------
def test_classify_assigns_every_email_a_valid_category():
    for e in _load_inbox():
        out = classifier.classify_email(e["subject"], e["body"])
        assert out["category"] in VALID_CATEGORIES, f"{e['email_id']} -> {out}"
        assert 0.0 <= out["confidence"] <= 1.0


def test_classify_routes_every_two_attachment_email_to_comparison():
    """An email that carries both documents must reach the compare stage;
    misrouting it would silently skip verification altogether."""
    for e in _load_inbox():
        if len(e["attachments"]) >= 2:
            cat = classifier.classify_email(e["subject"], e["body"])["category"]
            assert cat == "BL_COMPARISON", f"{e['email_id']} routed to {cat}"


# --------------------------------------------------------------------------
# STAGE 3 — EXTRACT
# --------------------------------------------------------------------------
def test_extract_reads_the_seven_fields_from_every_document_format():
    from app.services.extractor import extract_document

    seen = {}
    for e in _load_inbox():
        for rel in e["attachments"]:
            ext = os.path.splitext(rel)[1].lower()
            if ext in seen:
                continue
            result = extract_document(os.path.join(STORAGE, rel))
            if result["readable"] and len(result["fields"]) >= 5:
                seen[ext] = (rel, len(result["fields"]))
    for ext in (".txt", ".xlsx", ".docx", ".pdf"):
        assert ext in seen, f"no {ext} document yielded a usable field set"


def test_extract_does_not_mislabel_a_bl_that_merely_mentions_other_paperwork():
    """REGRESSION: doc-type detection scanned the whole body, so a genuine BL
    saying 'freight payable as per commercial invoice' was read as an INVOICE
    and escalated as wrong_doc_type."""
    bl = ("BILL OF LADING (DRAFT)\n====\nShipper: ABC\n"
          "Freight payable as per commercial invoice\n"
          "See packing list attached for carton detail\n")
    assert detect_doc_type(bl) == "BL"

    # a document that really is an invoice is still caught
    assert detect_doc_type("COMMERCIAL INVOICE\n====\nInvoice No.: 1\n") == "INVOICE"
    assert detect_doc_type("PACKING LIST\n====\nCarton No.: 1\n") == "PACKING_LIST"
    assert detect_doc_type("CERTIFICATE OF ORIGIN\n====\nExporter: X\n") == "COO"


# --------------------------------------------------------------------------
# STAGE 4 — COMPARE
# --------------------------------------------------------------------------
def test_compare_ignores_a_un_locode_suffix_on_a_port():
    """REGRESSION: the BL template writes 'NHAVA SHEVA, INDIA (INNSA)' where
    the SI writes 'NHAVA SHEVA, INDIA'. That is the same port and must not be
    reported as a discrepancy."""
    si = {f: "SAME VALUE" for f in norm.CANONICAL_FIELDS}
    si.update({"container_count": "5", "gross_weight_kg": "1000 KG",
               "port_of_loading": "NHAVA SHEVA, INDIA",
               "port_of_discharge": "BUSAN, SOUTH KOREA"})
    bl = dict(si)
    bl["port_of_loading"] = "NHAVA SHEVA, INDIA (INNSA)"
    bl["port_of_discharge"] = "BUSAN, SOUTH KOREA (KRPUS)"
    assert compare_fields(si, bl)["defect_fields"] == []

    # a genuinely different port still fails
    bl["port_of_discharge"] = "TUTICORIN, INDIA (INTUT)"
    assert "port_of_discharge" in compare_fields(si, bl)["defect_fields"]


def test_compare_does_not_smooth_over_a_single_differing_word():
    """REGRESSION: a 0.90 similarity ratio rated 'CONTAINER LINE A' and
    'CONTAINER LINE B' a match — two different consignees."""
    assert not _text_matches("CONTAINER LINE A", "CONTAINER LINE B")
    assert not _text_matches("KPP-ANTALIS (SINGAPORE) PTE LTD",
                             "KPP-ANTALIS (SHANGHAI) PTE LTD")
    # while genuine formatting drift still matches
    assert _text_matches("ABC SHIPPING LTD", "ABC SHIPPING LTD")
    assert _text_matches(norm.normalize_text_value("ABC Shipping Ltd."),
                         norm.normalize_text_value("ABC SHIPPING LTD"))
    assert _text_matches("ABC LTD", "ABC PTE LTD")


def test_compare_reads_gross_weight_in_the_unit_it_was_written_in():
    """REGRESSION: the first number was taken regardless of unit, so
    '235.5 MT' and '235500 KG' (the same weight) compared unequal, and
    '5 MT' and '5 KG' compared equal."""
    assert norm.normalize_value("gross_weight_kg", "235.5 MT") == 235500
    assert norm.normalize_value("gross_weight_kg", "235,500 KG") == 235500
    assert norm.normalize_value("gross_weight_kg", "5 MT") != \
           norm.normalize_value("gross_weight_kg", "5 KG")
    # container count is a plain tally, never unit-scaled
    assert norm.normalize_value("container_count", "10 x 20'FCL") == 10


# --------------------------------------------------------------------------
# STAGE 5 — DECIDE
# --------------------------------------------------------------------------
def test_decide_escalates_an_active_compare_request_with_no_documents():
    """REGRESSION: the missing-attachment check only matched three hard-coded
    phrasings, so any other wording produced a clean OK — the system reported
    a passed verification it had never performed."""
    for body in (
        "Please compare the SI and draft BL and confirm.",
        "Kindly verify the attached SI against the BL and confirm.",
        "Please cross-check the draft BL with the SI.",
        "Please compare the SI and draft BL and confirm "
        "(attachments appear to have been dropped).",
    ):
        out = conf_engine.evaluate_bl_comparison([], email_body=body)
        assert out["status"] == "NEEDS_REVIEW", f"{body!r} -> {out['status']}"
        assert out["review_reason"] == "missing_attachment"


def test_decide_does_not_flag_a_plain_request_for_a_document():
    """The counterpart: asking for a BL to be sent is not a failed
    verification, because nothing has been submitted to verify yet."""
    for body in (
        "Please assist to send the draft BL for SIN832764835 for checking asap.",
        "Kindly provide the shipping instruction at your earliest convenience.",
    ):
        out = conf_engine.evaluate_bl_comparison([], email_body=body)
        assert out["status"] == "OK", f"{body!r} -> {out['status']}"
        assert out["has_defect"] is False


def test_decide_emits_a_schema_valid_record_for_every_email():
    emails = _load_inbox()
    cache = {}
    for e in emails:
        rec = to_submission_record(process_email(e, STORAGE, extraction_cache=cache))
        eid = e["email_id"]
        assert rec["category"] in VALID_CATEGORIES, f"{eid}: {rec}"
        assert rec["status"] in VALID_STATUSES, f"{eid}: {rec}"
        assert rec["review_reason"] in VALID_REASONS, f"{eid}: {rec}"
        # internal consistency the evaluation server relies on
        assert rec["has_defect"] == bool(rec["defect_fields"]), f"{eid}: {rec}"
        assert not (rec["status"] == "OK" and rec["has_defect"]), f"{eid}: {rec}"
        assert not (rec["status"] == "MISMATCH" and not rec["has_defect"]), f"{eid}: {rec}"
        if rec["status"] == "NEEDS_REVIEW":
            assert rec["review_reason"] is not None, f"{eid}: {rec}"
            assert rec["defect_fields"] == [], f"{eid}: {rec}"
        else:
            assert rec["review_reason"] is None, f"{eid}: {rec}"
        # a non-comparison email never carries a document verdict
        if rec["category"] != "BL_COMPARISON":
            assert rec["status"] == "OK" and not rec["has_defect"], f"{eid}: {rec}"


def test_decide_covers_all_four_review_reasons_on_the_real_dataset():
    """Every escalation path must be exercised by the shipped dataset —
    if one stops firing, a whole branch of the decision engine is dead."""
    cache = {}
    reasons = set()
    for e in _load_inbox():
        r = process_email(e, STORAGE, extraction_cache=cache)
        if r["status"] == "NEEDS_REVIEW":
            reasons.add(r["review_reason"])
    for expected in ("wrong_doc_type", "missing_attachment", "unreadable", "missing_value"):
        assert expected in reasons, f"no email produced review_reason={expected!r}"


TESTS = [
    test_receive_every_email_and_attachment_is_readable_from_disk,
    test_classify_assigns_every_email_a_valid_category,
    test_classify_routes_every_two_attachment_email_to_comparison,
    test_extract_reads_the_seven_fields_from_every_document_format,
    test_extract_does_not_mislabel_a_bl_that_merely_mentions_other_paperwork,
    test_compare_ignores_a_un_locode_suffix_on_a_port,
    test_compare_does_not_smooth_over_a_single_differing_word,
    test_compare_reads_gross_weight_in_the_unit_it_was_written_in,
    test_decide_escalates_an_active_compare_request_with_no_documents,
    test_decide_does_not_flag_a_plain_request_for_a_document,
    test_decide_emits_a_schema_valid_record_for_every_email,
    test_decide_covers_all_four_review_reasons_on_the_real_dataset,
]


if __name__ == "__main__":
    failed = 0
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except ImportError as exc:
            print(f"  SKIP  {t.__name__} (missing dependency: {exc})")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL  {t.__name__}: {exc}")
    print("All verification-stage tests passed." if not failed else f"{failed} test(s) failed.")
    sys.exit(1 if failed else 0)
