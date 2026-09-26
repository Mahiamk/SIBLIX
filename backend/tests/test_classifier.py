import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.classifier import classify_email


def test_bl_comparison_subject_detected():
    r = classify_email("RE_ TO CONFIRM DOCS _ 5AAT-03056", "Please check the draft BL against the SI.")
    assert r["category"] == "BL_COMPARISON"
    assert 0 <= r["confidence"] <= 1


def test_si_request_detected():
    r = classify_email("REQUEST SI - booking 12345", "Please find Shipping instruction attached. POL: Shanghai")
    assert r["category"] == "SI_REQUEST"


def test_invoice_query_detected():
    r = classify_email("Missing GR for invoice 998", "Please confirm the total freight and local charges.")
    assert r["category"] == "INVOICE_QUERY"


def test_spam_detected():
    r = classify_email("You have (3) undelivered messages in your mailbox",
                        "unpaid customs fee. Confirm payment or parcel will be returned.")
    assert r["category"] == "SPAM"


def test_general_fallback_never_blank():
    r = classify_email("", "")
    assert r["category"] in ("GENERAL", "SPAM", "BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY")


if __name__ == "__main__":
    test_bl_comparison_subject_detected()
    test_si_request_detected()
    test_invoice_query_detected()
    test_spam_detected()
    test_general_fallback_never_blank()
    print("All classifier tests passed.")
