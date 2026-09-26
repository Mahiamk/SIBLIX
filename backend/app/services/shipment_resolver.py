"""
shipment_resolver.py — Resolves the Master Shipment / Booking reference
from incoming emails and documents.

Every shipping communication belongs to an overarching Shipment Entity
(Master Booking/Folder). This service inspects subjects, bodies, and file
metadata to extract:
  - booking_number (e.g. "5RSG-00133", "BK-98213")
  - bl_number      (e.g. "MEDUUD104332", "MSKU7281923")
  - lc_number      (e.g. "LC-2026-9812", "NBE-FX-12849")
  - canonical shipment_ref (unique folder key)
"""
import re
from typing import Dict, Any, Optional

# Standard Ocean Carrier B/L prefixes (3-8 letters + 5-12 digits/alphanumerics)
_BL_NUMBER_RE = re.compile(
    r"\b([A-Z]{3,8}\d{5,12})\b",
    re.IGNORECASE
)

# Booking, Order Confirmation (OC), or Reference numbers
_BOOKING_RE = re.compile(
    r"\b(?:BOOKING|BK|ORDER|OC|BKG|REF)(?:\s+(?:NOTICE|CONFIRMATION|DETAILS|NUMBER|NO\.?|DOCS))?[\s:_#-]+([0-9][A-Z0-9-]{3,24}|[A-Z0-9-]{4,24})\b",
    re.IGNORECASE
)

# Common structured token in maritime subjects: e.g. "5RSG-00133" (digit+letters-digits)
_STRUCTURED_REF_RE = re.compile(
    r"\b([0-9][A-Z0-9]{2,5}-[0-9]{3,8})\b",
    re.IGNORECASE
)

# Letter of Credit / Bank Permit reference (e.g. LC 982103, L/C No. ET/CBE/2026/0091)
_LC_NUMBER_RE = re.compile(
    r"\b(?:L/?C|LC|PERMIT)(?:\s*(?:NO\.?|NUMBER|REF|CODE))?[\s:_#.-]+([A-Z0-9/-]{4,30})\b",
    re.IGNORECASE
)


def extract_shipment_references(subject: str = "", body: str = "", email_id: str = "") -> Dict[str, Optional[str]]:
    """Inspects email subject, body, and email_id to extract canonical
    maritime references and build the master shipment folder key.

    Returns:
        {
            "shipment_ref": str,
            "booking_number": Optional[str],
            "bl_number": Optional[str],
            "lc_number": Optional[str],
        }
    """
    subject = subject or ""
    body = body or ""
    combined_text = f"{subject}\n{body[:1500]}"

    booking_num = None
    bl_num = None
    lc_num = None

    # 1. Search for B/L Number
    bl_match = _BL_NUMBER_RE.search(subject) or _BL_NUMBER_RE.search(body[:1500])
    if bl_match:
        bl_num = bl_match.group(1).upper()

    # 2. Search for Booking / OC Reference
    booking_match = _BOOKING_RE.search(combined_text)
    if booking_match:
        booking_num = booking_match.group(1).upper().strip("-_")
    else:
        struct_match = _STRUCTURED_REF_RE.search(subject) or _STRUCTURED_REF_RE.search(body[:1500])
        if struct_match:
            booking_num = struct_match.group(1).upper().strip("-_")

    # 3. Search for Letter of Credit Reference
    lc_match = _LC_NUMBER_RE.search(combined_text)
    if lc_match:
        lc_num = lc_match.group(1).upper().strip("-_")

    # 4. Determine canonical shipment_ref
    # Priority: Booking number -> BL number -> LC number -> Deterministic SHP-{email_id}
    if booking_num:
        shipment_ref = booking_num
    elif bl_num:
        shipment_ref = bl_num
    elif lc_num:
        shipment_ref = lc_num
    elif email_id:
        shipment_ref = f"SHP-{email_id}"
    else:
        shipment_ref = "SHP-UNKNOWN"

    return {
        "shipment_ref": shipment_ref,
        "booking_number": booking_num,
        "bl_number": bl_num,
        "lc_number": lc_num,
    }
