"""
ethiopian_rules.py — Ethiopian Trade & Regulatory Rule Pack (NBE & Customs)

Implements deterministic validators specific to the Ethiopian cross-border
trade corridor (Addis Ababa / Modjo Dry Port / Djibouti transit):

1. L/C & Bank Permit Validator:
   - Reconciles Commercial Invoice total amount & currency against L/C / Bank Permit amount.
   - Verifies that the L/C Number is explicitly cited in the Bill of Lading remarks/body.
2. HS Code Consistency Gate:
   - Verifies that the 6-digit international Harmonized System (HS) code from the
     Certificate of Origin (CoO) matches the classification on the Commercial Invoice and B/L.
3. Weight Tolerance Gate:
   - Enforces strict regulatory tolerance (+/- 0.5%) between B/L Gross Weight and
     Packing List Gross Weight (or Net Weight + Tare).
4. Bank Endorsement / Consignment Validator (UCP 600 & NBE Directives):
   - In Ethiopian import under L/C, the B/L Consignee is consigned "To Order of [Bank]".
   - Recognizes bank consignment and validates that the importer is named as Notify Party,
     preventing false entity mismatches between SI and B/L.
"""
from typing import Dict, Any, List, Optional, Tuple
import re

from . import normalizer as norm
from .comparator import _text_matches

# Tolerance threshold for weight discrepancy between BL and Packing List (0.5%)
WEIGHT_TOLERANCE_PCT = 0.5

# HS Code: international standard matches the first 6 digits
_HS_CODE_CLEAN_RE = re.compile(r"[^0-9]")
_AMOUNT_RE = re.compile(r"([A-Z]{3})?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)")


def clean_hs_code(raw_code: Any) -> str:
    """Extracts first 6 numeric digits of an HS code."""
    if not raw_code:
        return ""
    digits = _HS_CODE_CLEAN_RE.sub("", str(raw_code))
    return digits[:6]


def parse_monetary_amount(raw_val: Any) -> Tuple[Optional[float], Optional[str]]:
    """Extracts numeric amount and currency from string or numeric input."""
    if raw_val is None:
        return None, None
    if isinstance(raw_val, (int, float)):
        return float(raw_val), None
    text = str(raw_val).strip()
    m = _AMOUNT_RE.search(text)
    if not m:
        return None, None
    currency = m.group(1) or ("USD" if "$" in text else "EUR" if "€" in text else None)
    amt_str = m.group(2).replace(",", "")
    try:
        return float(amt_str), currency
    except ValueError:
        return None, currency


def validate_lc_and_permit(
    invoice_doc: Optional[Dict[str, Any]],
    lc_doc: Optional[Dict[str, Any]],
    bl_doc: Optional[Dict[str, Any]],
    folder_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Rule 1: L/C & Bank Permit Validator."""
    if not lc_doc and not (folder_meta and folder_meta.get("lc_number")):
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "lc_and_bank_permit",
            "details": "No L/C or Bank Permit document attached to folder.",
            "discrepancies": [],
        }

    discrepancies = []
    lc_fields = (lc_doc.get("fields") or {}) if lc_doc else {}
    inv_fields = (invoice_doc.get("fields") or {}) if invoice_doc else {}
    bl_fields = (bl_doc.get("fields") or {}) if bl_doc else {}

    lc_number = lc_fields.get("lc_number") or (folder_meta.get("lc_number") if folder_meta else None)
    
    # Check 1: Invoice Total vs LC Amount
    inv_amount_raw = inv_fields.get("total_amount") or inv_fields.get("amount")
    lc_amount_raw = lc_fields.get("amount") or lc_fields.get("total_amount")

    if inv_amount_raw and lc_amount_raw:
        inv_amt, inv_curr = parse_monetary_amount(inv_amount_raw)
        lc_amt, lc_curr = parse_monetary_amount(lc_amount_raw)
        if inv_amt is not None and lc_amt is not None:
            # Under UCP 600 Art 30, invoice must not exceed LC amount unless tolerance specified
            if abs(inv_amt - lc_amt) > 0.01:
                discrepancies.append(
                    f"Invoice amount ({inv_curr or ''} {inv_amt:,.2f}) does not match "
                    f"L/C amount ({lc_curr or ''} {lc_amt:,.2f})"
                )
            if inv_curr and lc_curr and inv_curr != lc_curr:
                discrepancies.append(f"Currency mismatch: Invoice ({inv_curr}) vs L/C ({lc_curr})")

    # Check 2: LC Number citation in BL remarks
    if lc_number and bl_doc:
        bl_text = " ".join([
            str(bl_fields.get("remarks") or ""),
            str(bl_fields.get("description") or ""),
            str(bl_doc.get("raw_text") or ""),
            str(bl_doc.get("extracted_text") or ""),
        ]).upper()

        clean_lc_no = re.sub(r"[^A-Z0-9]", "", str(lc_number).upper())
        clean_bl_text = re.sub(r"[^A-Z0-9]", "", bl_text)

        if clean_lc_no and clean_lc_no not in clean_bl_text:
            discrepancies.append(f"L/C Number '{lc_number}' is not cited in Bill of Lading remarks.")

    passed = len(discrepancies) == 0
    return {
        "status": "PASS" if passed else "FAIL",
        "passed": passed,
        "rule": "lc_and_bank_permit",
        "details": "L/C amount and B/L remarks citation verified." if passed else "; ".join(discrepancies),
        "discrepancies": discrepancies,
    }


def validate_hs_code_consistency(
    coo_doc: Optional[Dict[str, Any]],
    invoice_doc: Optional[Dict[str, Any]],
    bl_doc: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Rule 2: HS Code Consistency (first 6 digits) across CoO, Invoice, and B/L."""
    coo_fields = (coo_doc.get("fields") or {}) if coo_doc else {}
    inv_fields = (invoice_doc.get("fields") or {}) if invoice_doc else {}
    bl_fields = (bl_doc.get("fields") or {}) if bl_doc else {}

    coo_hs = clean_hs_code(coo_fields.get("hs_code"))
    inv_hs = clean_hs_code(inv_fields.get("hs_code"))
    bl_hs = clean_hs_code(bl_fields.get("hs_code"))

    codes = {}
    if coo_hs:
        codes["Certificate of Origin"] = coo_hs
    if inv_hs:
        codes["Commercial Invoice"] = inv_hs
    if bl_hs:
        codes["Bill of Lading"] = bl_hs

    if len(codes) <= 1:
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "hs_code_consistency",
            "details": "Insufficient HS code declarations across documents to compare.",
            "discrepancies": [],
        }

    unique_hs = set(codes.values())
    if len(unique_hs) == 1:
        hs_val = list(unique_hs)[0]
        return {
            "status": "PASS",
            "passed": True,
            "rule": "hs_code_consistency",
            "details": f"HS Code (6-digit) {hs_val} matches consistently across documents ({', '.join(codes.keys())}).",
            "discrepancies": [],
        }

    discrepancies = [
        f"{doc_name} declares HS code {code}" for doc_name, code in codes.items()
    ]
    return {
        "status": "FAIL",
        "passed": False,
        "rule": "hs_code_consistency",
        "details": f"Conflicting 6-digit HS codes declared: {'; '.join(discrepancies)}",
        "discrepancies": discrepancies,
    }


def validate_weight_tolerance(
    bl_doc: Optional[Dict[str, Any]],
    packing_list_doc: Optional[Dict[str, Any]],
    tolerance_pct: float = WEIGHT_TOLERANCE_PCT,
) -> Dict[str, Any]:
    """Rule 3: Weight Tolerance Gate between B/L Gross Weight and Packing List."""
    if not bl_doc or not packing_list_doc:
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "weight_tolerance_gate",
            "details": "Both B/L and Packing List are required to evaluate weight tolerance.",
            "discrepancies": [],
        }

    bl_fields = (bl_doc.get("fields") or {})
    pl_fields = (packing_list_doc.get("fields") or {})

    bl_gw = norm.normalize_weight_value(bl_fields.get("gross_weight_kg") or bl_fields.get("gross_weight"))
    pl_gw = norm.normalize_weight_value(pl_fields.get("gross_weight_kg") or pl_fields.get("gross_weight"))

    if pl_gw is None:
        # Fall back to net_weight + tare_weight if present on packing list
        pl_nw = norm.normalize_weight_value(pl_fields.get("net_weight_kg") or pl_fields.get("net_weight"))
        pl_tare = norm.normalize_weight_value(pl_fields.get("tare_weight_kg") or pl_fields.get("tare_weight") or 0)
        if pl_nw is not None:
            pl_gw = pl_nw + pl_tare

    if bl_gw is None or pl_gw is None:
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "weight_tolerance_gate",
            "details": "Gross weight not specified in both documents.",
            "discrepancies": [],
        }

    if pl_gw == 0:
        return {
            "status": "FAIL",
            "passed": False,
            "rule": "weight_tolerance_gate",
            "details": "Packing list declared gross weight is 0.",
            "discrepancies": ["Packing list declared gross weight is 0."],
        }

    diff = abs(bl_gw - pl_gw)
    pct_diff = (diff / pl_gw) * 100.0

    if pct_diff <= tolerance_pct:
        return {
            "status": "PASS",
            "passed": True,
            "rule": "weight_tolerance_gate",
            "details": f"B/L Gross Weight ({bl_gw:,} kg) matches Packing List ({pl_gw:,} kg) within {pct_diff:.2f}% tolerance (max {tolerance_pct}%).",
            "discrepancies": [],
        }

    msg = (
        f"Weight discrepancy exceeds {tolerance_pct}% regulatory threshold: "
        f"B/L declared {bl_gw:,} kg vs Packing List {pl_gw:,} kg (variance: {diff:,} kg / {pct_diff:.2f}%)"
    )
    return {
        "status": "FAIL",
        "passed": False,
        "rule": "weight_tolerance_gate",
        "details": msg,
        "discrepancies": [msg],
    }


def validate_bank_endorsement(
    si_doc: Optional[Dict[str, Any]],
    bl_doc: Optional[Dict[str, Any]],
    invoice_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Rule 4: Consignee / Bank Endorsement Rules under UCP 600 / NBE Directives."""
    if not bl_doc:
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "bank_endorsement",
            "details": "No Bill of Lading present to evaluate bank endorsement.",
            "discrepancies": [],
            "is_bank_consigned": False,
            "bank_name": None,
        }

    bl_fields = (bl_doc.get("fields") or {})
    si_fields = (si_doc.get("fields") or {}) if si_doc else {}
    inv_fields = (invoice_doc.get("fields") or {}) if invoice_doc else {}

    bl_consignee = str(bl_fields.get("consignee") or "")
    bl_notify = str(bl_fields.get("notify_party") or "")
    expected_importer = si_fields.get("consignee") or inv_fields.get("consignee")

    bank_name = norm.parse_to_order_bank(bl_consignee)
    is_bank_consigned = bool(bank_name)

    if not is_bank_consigned:
        return {
            "status": "SKIPPED",
            "passed": True,
            "rule": "bank_endorsement",
            "details": "B/L is straight-consigned (not consigned To Order of a bank).",
            "discrepancies": [],
            "is_bank_consigned": False,
            "bank_name": None,
        }

    # If consigned to order of a bank:
    # Under UCP 600 and NBE rules, the buyer MUST be stated in the Notify Party!
    discrepancies = []
    if not bl_notify or norm.is_blank(bl_notify):
        discrepancies.append(
            f"B/L is consigned to '{bl_consignee}', but Notify Party is blank. "
            "Under NBE/UCP 600 import rules, the applicant/importer must be designated in Notify Party."
        )
    elif expected_importer and not _text_matches(expected_importer, bl_notify):
        discrepancies.append(
            f"B/L is consigned to bank '{bank_name}', but B/L Notify Party ('{bl_notify}') "
            f"does not match the buyer/importer ('{expected_importer}') from SI/Invoice."
        )

    passed = len(discrepancies) == 0
    return {
        "status": "PASS" if passed else "FAIL",
        "passed": passed,
        "rule": "bank_endorsement",
        "details": (
            f"Valid bank consignment: B/L consigned to '{bank_name}' with applicant importer '{expected_importer or bl_notify}' correctly named in Notify Party."
            if passed else "; ".join(discrepancies)
        ),
        "discrepancies": discrepancies,
        "is_bank_consigned": True,
        "bank_name": bank_name,
    }


def is_bank_consignment_match(
    si_consignee: Optional[str],
    bl_consignee: Optional[str],
    bl_notify: Optional[str],
) -> bool:
    """Helper for comparator: returns True if bl_consignee is consigned to a bank
    and bl_notify properly matches si_consignee under UCP 600 bank consignment rules."""
    if not bl_consignee or not si_consignee:
        return False
    bank_name = norm.parse_to_order_bank(bl_consignee)
    if not bank_name:
        return False
    # If consigned to order of a bank, verify if notify party matches the SI consignee
    if bl_notify and _text_matches(si_consignee, bl_notify):
        return True
    return False


def validate_ethiopian_regulations(
    documents: List[Dict[str, Any]],
    folder_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Master evaluator for the Ethiopian Regulatory Rule Pack.

    Executes all 4 deterministic validators and returns a structured audit report.
    """
    if not documents:
        return {
            "is_applicable": False,
            "compliant": True,
            "status": "NOT_APPLICABLE",
            "rule_results": {},
            "regulatory_defects": [],
            "warnings": [],
        }

    # Index documents by type
    docs_by_type = {}
    for d in documents:
        dtype = (d.get("doc_type") or "UNKNOWN").upper()
        if dtype not in docs_by_type:
            docs_by_type[dtype] = d

    si_doc = docs_by_type.get("SI")
    bl_doc = docs_by_type.get("BL") or docs_by_type.get("MTD")
    inv_doc = docs_by_type.get("INVOICE")
    pl_doc = docs_by_type.get("PACKING_LIST")
    coo_doc = docs_by_type.get("COO")
    lc_doc = docs_by_type.get("LC") or docs_by_type.get("PERMIT")

    # Check applicability
    # Trigger if corridor indicates Ethiopia/Djibouti, LC is present, or Bank Consignment is detected
    is_ethiopian = False
    for doc in documents:
        if norm.is_ethiopian_trade(doc.get("fields") or {}):
            is_ethiopian = True
            break
        if norm.is_ethiopian_trade(doc.get("raw_text") or doc.get("extracted_text") or ""):
            is_ethiopian = True
            break

    if folder_meta and norm.is_ethiopian_trade(folder_meta):
        is_ethiopian = True

    bl_consignee = (bl_doc.get("fields") or {}).get("consignee") if bl_doc else None
    if bl_consignee and norm.parse_to_order_bank(bl_consignee):
        is_ethiopian = True

    if lc_doc or (folder_meta and folder_meta.get("lc_number")):
        is_ethiopian = True

    # Run the 4 validators
    rule_results = {
        "lc_bank_permit": validate_lc_and_permit(inv_doc, lc_doc, bl_doc, folder_meta),
        "hs_code_consistency": validate_hs_code_consistency(coo_doc, inv_doc, bl_doc),
        "weight_tolerance": validate_weight_tolerance(bl_doc, pl_doc),
        "bank_endorsement": validate_bank_endorsement(si_doc, bl_doc, inv_doc),
    }

    regulatory_defects = []
    warnings = []

    for rule_name, res in rule_results.items():
        if res["status"] == "FAIL":
            for d in res["discrepancies"]:
                regulatory_defects.append(f"[{rule_name.upper()}] {d}")
        elif res["status"] == "PASS" and res.get("details"):
            warnings.append(f"[{rule_name.upper()}] {res['details']}")

    compliant = len(regulatory_defects) == 0

    return {
        "is_applicable": is_ethiopian,
        "status": ("COMPLIANT" if compliant else "NON_COMPLIANT") if is_ethiopian else "NOT_APPLICABLE",
        "compliant": compliant,
        "regulatory_defects": regulatory_defects,
        "rule_results": rule_results,
    }
