"""
comparator.py — Comparison Engine

Compares the 7 canonical fields extracted from an SI against the same 7
fields extracted from a BL.

Pipeline (per spec): normalize -> exact comparison -> semantic comparison
when required.

  * text fields (shipper/consignee/notify_party/ports): normalized exactly
    (case, punctuation, whitespace, UN/LOCODE suffix) and, if that doesn't
    match, a token-level check absorbs formatting drift such as
    "ABC SHIPPING LTD" vs "ABC Shipping Ltd." or a re-ordered corporate
    suffix, while never smoothing over a genuinely different word.
  * numeric fields (container_count/gross_weight_kg): normalized to an int
    and compared exactly — these are business facts, not free text, so a
    real difference (planted defect) must never be smoothed over.
"""
import re

from . import normalizer as norm

TEXT_FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading",
               "port_of_discharge"]
NUMERIC_FIELDS = ["container_count", "gross_weight_kg"]

# Legal-form suffixes that carry no identifying information: "ABC PTE LTD"
# and "ABC LTD" are the same company written two ways.
_CORPORATE_SUFFIXES = {
    "LTD", "LIMITED", "CO", "COMPANY", "INC", "INCORPORATED", "LLC", "LLP",
    "PLC", "CORP", "CORPORATION", "PTE", "PTY", "PVT", "PRIVATE", "SDN",
    "BHD", "BERHAD", "GMBH", "AG", "BV", "NV", "SA", "SAS", "SRL", "SPA",
    "AS", "OY", "AB", "KG", "FZE", "FZCO", "FZ-LLC", "FZLLC", "DMCC", "JSC",
    "OOO", "UAB", "THE", "AND", "&",
}

_TOKEN_RE = re.compile(r"[A-Z0-9]+")


def _significant_tokens(value):
    """Identifying tokens of a name: uppercase alphanumerics with legal-form
    suffixes and filler words removed."""
    tokens = _TOKEN_RE.findall((value or "").upper())
    return [t for t in tokens if t not in _CORPORATE_SUFFIXES]


def _text_matches(a, b):
    """True when two normalized text values name the same thing.

    Deliberately NOT a similarity ratio. A character-similarity score of
    0.90 rates "CONTAINER LINE A" and "CONTAINER LINE B" a match — two
    different consignees — because the strings share a long prefix. Every
    real match in these templated documents differs only by punctuation,
    spacing or a legal-form suffix, so comparing identifying tokens catches
    that drift exactly while treating any differing word as a defect.
    """
    if a == b:
        return True
    if not a or not b:
        return False

    ta, tb = _significant_tokens(a), _significant_tokens(b)
    if ta and ta == tb:
        return True
    # order-insensitive ("SMITH & CO JOHN" vs "JOHN SMITH & CO")
    if ta and sorted(ta) == sorted(tb):
        return True
    # transliteration/spacing drift only ("NHAVASHEVA" vs "NHAVA SHEVA")
    if ta and tb and "".join(ta) == "".join(tb):
        return True
    return False


def compare_fields(si_fields, bl_fields):
    """Compare the 7 canonical fields between an SI and a BL.

    Returns:
        {
          "defect_fields": [str, ...],
          "missing_fields": [str, ...],   # present in neither/blank in either
          "field_results": {field: {"si": norm_si, "bl": norm_bl, "match": bool}},
        }
    """
    defect_fields = []
    missing_fields = []
    field_results = {}

    for field in norm.CANONICAL_FIELDS:
        si_raw = si_fields.get(field)
        bl_raw = bl_fields.get(field)

        si_blank = norm.is_blank(si_raw)
        bl_blank = norm.is_blank(bl_raw)
        if si_blank or bl_blank:
            missing_fields.append(field)
            field_results[field] = {"si": si_raw, "bl": bl_raw, "match": None}
            continue

        si_norm = norm.normalize_value(field, si_raw)
        bl_norm = norm.normalize_value(field, bl_raw)

        if field in NUMERIC_FIELDS:
            match = si_norm is not None and bl_norm is not None and si_norm == bl_norm
        elif field == "consignee":
            match = _text_matches(si_norm, bl_norm)
            if not match:
                # Bank consignment endorsement check under UCP 600 / NBE
                from .ethiopian_rules import is_bank_consignment_match
                if is_bank_consignment_match(si_norm, bl_norm, bl_fields.get("notify_party")):
                    match = True
        else:
            match = _text_matches(si_norm, bl_norm)

        field_results[field] = {"si": si_norm, "bl": bl_norm, "match": match}
        if not match:
            defect_fields.append(field)

    return {
        "defect_fields": defect_fields,
        "missing_fields": missing_fields,
        "field_results": field_results,
    }
