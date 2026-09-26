"""
confidence.py — Confidence Engine + Decision Engine

Turns per-document extraction results and the field comparison into the
final headline outcome the whole system reports:

    OK | MISMATCH | NEEDS_REVIEW

`NEEDS_REVIEW` is used whenever the pipeline cannot confidently decide, with
one of the allowed reasons: wrong_doc_type | missing_attachment | unreadable
| missing_value (in that priority order — if a request has 0 attachments we
don't also bother reporting it as "unreadable", we report the more specific,
more actionable reason first).

Confidence score (0-1, for UI display / triage ordering only — it does NOT
gate the OK/MISMATCH/NEEDS_REVIEW decision, which is rule-based and exact)
factors in: document availability, extraction completeness, whether OCR was
needed, and whether every compared field matched cleanly.
"""
import re
from typing import Any, Dict, Optional

from . import normalizer as norm
from .comparator import compare_fields
from . import graph_comparator

REVIEW_REASONS = ["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]

# Deciding whether 0/1 attachments is a *defect* depends on what the sender
# actually asked for, not on the attachment count alone:
#
#   * "Please assist to send the draft BL for checking"  -> a REQUEST for a
#     document. Nothing has been submitted for verification yet, so there is
#     no comparison that could have failed -> clean OK.
#   * "Please compare the SI and draft BL and confirm"   -> an ACTIVE
#     verification request. The sender believes they attached the documents.
#     If they are absent we must NOT report a clean pass -> NEEDS_REVIEW /
#     missing_attachment.
#
# The request-for-documents test is applied FIRST and wins, because those
# emails legitimately contain verification words ("for checking") while still
# only asking for the document to be sent.
_SEND_REQUEST_RE = re.compile(
    r"\b(?:send|share|provide|forward|issue|release|revert\s+with|assist\s+(?:to|with))\b"
    r"[^.?!\n]{0,60}?"
    r"\b(?:draft\s+)?(?:b/?l|bill\s+of\s+lading|si|shipping\s+instructions?)\b",
    re.IGNORECASE,
)

# An explicit statement that the expected attachment is absent.
_DOCS_ABSENT_RE = re.compile(
    r"(attachments?\s+appear\s+to\s+have\s+been\s+dropped|"
    r"appear\s+to\s+have\s+been\s+dropped|"
    r"(?:draft\s+)?b/?l\s+is\s+still\s+missing|"
    r"still\s+missing|not\s+attached|missing\s+attachment)",
    re.IGNORECASE,
)

# An active request to verify one document against the other, in any of the
# usual phrasings, plus "attached are the SI and BL ... please confirm".
_ACTIVE_COMPARE_RE = re.compile(
    r"\b(?:compare|cross[-\s]?check|reconcile|verify|check|confirm)\b"
    r"[^.?!\n]{0,80}?"
    r"\b(?:si|shipping\s+instructions?)\b[^.?!\n]{0,40}?"
    r"\b(?:against|versus|vs\.?|and|with|to)\b[^.?!\n]{0,40}?"
    r"\b(?:draft\s+)?(?:b/?l|bill\s+of\s+lading)\b"
    r"|"
    r"\b(?:compare|cross[-\s]?check|reconcile|verify)\b"
    r"[^.?!\n]{0,80}?"
    r"\b(?:draft\s+)?(?:b/?l|bill\s+of\s+lading)\b"
    r"[^.?!\n]{0,40}?"
    r"\b(?:against|versus|vs\.?|with|to)\b[^.?!\n]{0,40}?"
    r"\b(?:si|shipping\s+instructions?)\b",
    re.IGNORECASE,
)


def _is_active_comparison_request(body):
    """True when the sender is asking us to verify SI vs BL *now* (so a
    missing document is a real, reportable problem) rather than merely asking
    for a document to be sent over."""
    text = body or ""
    if _DOCS_ABSENT_RE.search(text):
        return True
    if _SEND_REQUEST_RE.search(text):
        # "please send the draft BL for checking" -- nothing to verify yet.
        return False
    return bool(_ACTIVE_COMPARE_RE.search(text))


def _pick_si_bl(attachments_meta):
    """Given a list of {"path":..., "extraction": {...}} dicts, decide which
    one is the SI and which is the BL. Prefers the filename convention
    (..._SI.ext / ..._BL.ext) used throughout the dataset; falls back to the
    content-based doc_type_guess when the filename doesn't say."""
    si_doc, bl_doc = None, None
    for att in attachments_meta:
        path = att["path"].upper()
        guess = att["extraction"]["doc_type_guess"]
        if "_SI." in path or path.endswith("SI.TXT"):
            si_doc = att
        elif "_BL." in path or path.endswith("BL.TXT"):
            bl_doc = att
        elif guess == "SI" and si_doc is None:
            si_doc = att
        elif guess == "BL" and bl_doc is None:
            bl_doc = att
    return si_doc, bl_doc


def evaluate_bl_comparison(attachments_meta, email_body=""):
    """Core decision function for a BL_COMPARISON email.

    attachments_meta: list of {"path": str, "extraction": <extract_document() result>}

    Returns:
        {
          "status": "OK"|"MISMATCH"|"NEEDS_REVIEW",
          "has_defect": bool,
          "defect_fields": [str, ...],
          "review_reason": Optional[str],
          "confidence": float,
          "comparison": Optional[Dict[str, Any]],
          "si_path": Optional[str], "bl_path": Optional[str],
        }
    """
    # 1) missing_attachment — 0 or only 1 attachment present.
    # Escalate only when the body shows an *active* verification request (see
    # _is_active_comparison_request); a plain "please send me the draft BL"
    # with nothing attached yet has nothing to flag and resolves OK.
    if len(attachments_meta) <= 1:
        if _is_active_comparison_request(email_body):
            return _review("missing_attachment",
                            confidence=0.95 if len(attachments_meta) == 0 else 0.9)
        return {
            "status": "OK", "has_defect": False, "defect_fields": [],
            "review_reason": None, "confidence": 0.8, "comparison": None,
            "si_path": attachments_meta[0]["path"] if attachments_meta else None,
            "bl_path": None,
        }

    si_doc, bl_doc = _pick_si_bl(attachments_meta)
    
    # 2) In a 2-attachment case where neither is a BL (e.g. SI + Invoice instead of BL):
    # maintain standard wrong_doc_type escalation
    if len(attachments_meta) == 2 and (si_doc is None or bl_doc is None):
        types = [a["extraction"]["doc_type_guess"] for a in attachments_meta]
        if any(t in ("INVOICE", "PACKING_LIST", "COO") for t in types):
            return _review("wrong_doc_type", confidence=0.9,
                           si_path=attachments_meta[0]["path"], bl_path=attachments_meta[1]["path"])
        return _review("missing_attachment", confidence=0.85)

    if si_doc is None or bl_doc is None:
        return _review("missing_attachment", confidence=0.85)

    si_x, bl_x = si_doc["extraction"], bl_doc["extraction"]

    # 3) unreadable — either document has no usable text
    if not si_x["readable"] or not bl_x["readable"]:
        return _review("unreadable", confidence=0.9,
                        si_path=si_doc["path"], bl_path=bl_doc["path"])

    # 4) wrong_doc_type — in strict 2-doc pair, verify they are SI & BL
    if len(attachments_meta) == 2:
        if bl_x["doc_type_guess"] not in ("BL", "UNKNOWN") or bl_x["doc_type_guess"] in (
            "INVOICE", "PACKING_LIST", "COO",
        ):
            return _review("wrong_doc_type", confidence=0.9,
                            si_path=si_doc["path"], bl_path=bl_doc["path"])
        if si_x["doc_type_guess"] in ("INVOICE", "PACKING_LIST", "COO"):
            return _review("wrong_doc_type", confidence=0.9,
                            si_path=si_doc["path"], bl_path=bl_doc["path"])

    # 5) Multi-document graph comparison across all documents in folder
    graph_docs = []
    for att in attachments_meta:
        ext = att["extraction"]
        graph_docs.append({
            "path": att["path"],
            "doc_type": ext.get("doc_type_guess", "UNKNOWN"),
            "fields": ext.get("fields", {}),
            "readable": ext.get("readable", True),
            "used_ocr": ext.get("used_ocr", False),
        })
    graph_res = graph_comparator.compare_document_graph(graph_docs)

    # 6) run the SI vs BL baseline comparison
    comparison = compare_fields(si_x["fields"], bl_x["fields"])

    # 7) missing_value — a required field is blank/placeholder in either doc
    if comparison["missing_fields"]:
        return _review("missing_value", confidence=0.85,
                        si_path=si_doc["path"], bl_path=bl_doc["path"],
                        comparison=comparison,
                        graph_comparison=graph_res)

    # 8) clean decision: OK or MISMATCH (combines SI-BL defects + any multi-doc graph defects)
    combined_defect_fields = sorted(list(set(comparison["defect_fields"] + graph_res.get("defect_fields", []))))
    has_defect = len(combined_defect_fields) > 0
    extraction_quality = (len(si_x["fields"]) + len(bl_x["fields"])) / (
        2 * len(norm.CANONICAL_FIELDS)
    )
    ocr_penalty = 0.1 if (si_x["used_ocr"] or bl_x["used_ocr"]) else 0.0
    confidence = round(max(0.55, min(0.98, 0.75 + 0.2 * extraction_quality - ocr_penalty)), 2)

    return {
        "status": "MISMATCH" if has_defect else "OK",
        "has_defect": has_defect,
        "defect_fields": combined_defect_fields,
        "review_reason": None,
        "confidence": confidence,
        "comparison": comparison,
        "graph_comparison": graph_res,
        "si_path": si_doc["path"],
        "bl_path": bl_doc["path"],
    }


def _review(reason, confidence, si_path=None, bl_path=None, comparison=None, graph_comparison=None):
    return {
        "status": "NEEDS_REVIEW",
        "has_defect": False,
        "defect_fields": [],
        "review_reason": reason,
        "confidence": confidence,
        "comparison": comparison,
        "graph_comparison": graph_comparison,
        "si_path": si_path,
        "bl_path": bl_path,
    }
