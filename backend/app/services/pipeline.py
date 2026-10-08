"""
pipeline.py — orchestrates the full per-email workflow:

    classify -> (if BL_COMPARISON) locate SI+BL -> extract -> normalize
    -> compare -> decide (OK / MISMATCH / NEEDS_REVIEW)

This module has no FastAPI / database dependency so it can be run and unit
tested standalone (see backend/tests and backend/scripts/run_pipeline.py),
and is reused unchanged by the FastAPI background-task endpoints.
"""
import os

from . import classifier
from . import extractor
from . import confidence as conf_engine
from . import shipment_resolver


def process_email(email, storage_root, extraction_cache=None):
    """email: dict with keys email_id/from/subject/body/attachments (paths
    relative to storage_root, e.g. 'attachments/email_004_SI.txt').

    extraction_cache: optional dict of {path: extraction_result} to avoid
    re-parsing the same attachment twice (harmless to omit).

    Returns a result dict combining the classification, shipment folder
    identity, and multi-document graph comparison outcome.
    """
    subject = email.get("subject", "")
    body = email.get("body", "")
    email_id = email.get("email_id", "")

    # Resolve master shipment entity references
    ship_refs = shipment_resolver.extract_shipment_references(
        subject=subject, body=body, email_id=email_id
    )

    cls = classifier.classify_email(subject, body)
    category = cls["category"]

    result = {
        "email_id": email_id,
        "shipment_ref": ship_refs["shipment_ref"],
        "booking_number": ship_refs["booking_number"],
        "bl_number": ship_refs["bl_number"],
        "lc_number": ship_refs["lc_number"],
        "category": category,
        "classification_confidence": cls["confidence"],
        "decided_by": cls["decided_by"],
        "status": "OK",
        "has_defect": False,
        "defect_fields": [],
        "review_reason": None,
        "confidence": cls["confidence"],
        "attachments_meta": [],
        "graph_comparison": None,
    }

    if category != "BL_COMPARISON":
        # Only BL_COMPARISON emails go through document extraction/compare;
        # everything else is "processed" as soon as it's classified.
        return result

    attachments_meta = []
    for rel_path in email.get("attachments", []):
        full_path = os.path.join(storage_root, rel_path)
        if not os.path.exists(full_path):
            for alt_root in [
                "/tmp/storage",
                os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage")),
                os.path.abspath("backend/storage"),
                os.path.abspath("storage"),
            ]:
                alt_full = os.path.join(alt_root, rel_path)
                if os.path.exists(alt_full):
                    full_path = alt_full
                    break
        if extraction_cache is not None and rel_path in extraction_cache:
            extraction = extraction_cache[rel_path]
        else:
            extraction = extractor.extract_document(full_path)
            if extraction_cache is not None:
                extraction_cache[rel_path] = extraction
        attachments_meta.append({"path": rel_path, "extraction": extraction})

    decision = conf_engine.evaluate_bl_comparison(attachments_meta, email_body=body)

    result.update({
        "status": decision["status"],
        "has_defect": decision["has_defect"],
        "defect_fields": decision["defect_fields"],
        "review_reason": decision["review_reason"],
        "confidence": decision["confidence"],
        "comparison": decision.get("comparison"),
        "graph_comparison": decision.get("graph_comparison"),
        "si_path": decision.get("si_path"),
        "bl_path": decision.get("bl_path"),
        "attachments_meta": attachments_meta,
    })
    return result


def to_submission_record(result):
    """Project a full pipeline result down to the exact shape required by
    sample_submission.json / the evaluation server."""
    return {
        "category": result["category"],
        "status": result["status"],
        "review_reason": result["review_reason"],
        "has_defect": result["has_defect"],
        "defect_fields": result["defect_fields"],
    }
