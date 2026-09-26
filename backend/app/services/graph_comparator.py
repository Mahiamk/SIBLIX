"""
graph_comparator.py — Multi-Document Graph Matching Engine

Reconciles an arbitrary set of shipping, commercial, and regulatory documents
within a master Shipment Folder.

Instead of a rigid 2-way pair (SI vs BL), this engine evaluates documents
as a consistency graph:
  - Transport Documents: SI, BL / Multimodal Transport Document (MTD)
  - Commercial Documents: Commercial Invoice, Packing List
  - Regulatory Documents: Certificate of Origin (COO), Bank Permit / LC

Nodes in the graph represent individual documents with their extracted fields.
Edges represent pairwise consistency checks across shared fields.
The consensus layer synthesizes cross-document agreement and isolates defects.
"""
from typing import Dict, Any, List, Optional, Tuple
from itertools import combinations

from . import normalizer as norm
from .comparator import compare_fields, _text_matches

# Document roles and categories
TRANSPORT_DOCS = {"SI", "BL", "MTD"}
COMMERCIAL_DOCS = {"INVOICE", "PACKING_LIST"}
REGULATORY_DOCS = {"COO", "PERMIT"}

# Fields relevant to commercial and packing list cross-checks
CROSS_DOC_RELEVANT_FIELDS = {
    "shipper": ["SI", "BL", "INVOICE", "COO"],
    "consignee": ["SI", "BL", "INVOICE", "COO"],
    "notify_party": ["SI", "BL"],
    "port_of_loading": ["SI", "BL", "COO"],
    "port_of_discharge": ["SI", "BL", "COO"],
    "container_count": ["SI", "BL", "PACKING_LIST", "INVOICE"],
    "gross_weight_kg": ["SI", "BL", "PACKING_LIST"],
}

NUMERIC_FIELDS = {"container_count", "gross_weight_kg"}
TEXT_FIELDS = {"shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge"}


def _compare_two_documents(doc_a: Dict[str, Any], doc_b: Dict[str, Any]) -> Dict[str, Any]:
    """Compares shared fields between two arbitrary documents in the folder."""
    type_a = doc_a.get("doc_type", "UNKNOWN")
    type_b = doc_b.get("doc_type", "UNKNOWN")
    fields_a = doc_a.get("fields", {}) or {}
    fields_b = doc_b.get("fields", {}) or {}

    pair_defects = []
    field_results = {}

    for field in norm.CANONICAL_FIELDS:
        allowed_types = CROSS_DOC_RELEVANT_FIELDS.get(field, ["SI", "BL"])
        # Check if this field is relevant for both documents
        is_relevant = (type_a in allowed_types or type_a in ("SI", "BL", "UNKNOWN")) and \
                      (type_b in allowed_types or type_b in ("SI", "BL", "UNKNOWN"))
        if not is_relevant:
            continue

        val_a = fields_a.get(field)
        val_b = fields_b.get(field)

        # In cross-document comparison, only compare when both documents specify the field
        if norm.is_blank(val_a) or norm.is_blank(val_b):
            continue

        norm_a = norm.normalize_value(field, val_a)
        norm_b = norm.normalize_value(field, val_b)

        if field == "gross_weight_kg":
            if type_a == "PACKING_LIST" or type_b == "PACKING_LIST":
                if norm_a and norm_b:
                    diff_pct = (abs(norm_a - norm_b) / max(norm_a, norm_b)) * 100.0
                    matches = diff_pct <= 0.5
                else:
                    matches = norm_a == norm_b
            else:
                matches = norm_a is not None and norm_b is not None and norm_a == norm_b
        elif field in NUMERIC_FIELDS:
            matches = norm_a is not None and norm_b is not None and norm_a == norm_b
        elif field == "consignee":
            matches = _text_matches(str(norm_a), str(norm_b))
            if not matches:
                from .ethiopian_rules import is_bank_consignment_match
                notify_b = fields_b.get("notify_party")
                notify_a = fields_a.get("notify_party")
                if is_bank_consignment_match(norm_a, norm_b, notify_b) or is_bank_consignment_match(norm_b, norm_a, notify_a):
                    matches = True
        else:
            matches = _text_matches(str(norm_a), str(norm_b))

        field_results[field] = {
            "doc_a_val": norm_a,
            "doc_b_val": norm_b,
            "match": matches,
        }
        if not matches:
            pair_defects.append(field)

    return {
        "doc_a": doc_a.get("path", type_a),
        "doc_b": doc_b.get("path", type_b),
        "type_a": type_a,
        "type_b": type_b,
        "defect_fields": pair_defects,
        "field_results": field_results,
        "has_defect": len(pair_defects) > 0,
    }


def compare_document_graph(
    documents: List[Dict[str, Any]],
    folder_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Evaluates multi-document consistency across all documents in a Shipment Folder.

    documents: list of {
        "path": str,
        "doc_type": "SI" | "BL" | "INVOICE" | "PACKING_LIST" | "COO" | ...,
        "fields": dict,
        "readable": bool,
        "used_ocr": bool,
    }

    Returns:
        {
            "status": "OK" | "MISMATCH" | "NEEDS_REVIEW",
            "has_defect": bool,
            "defect_fields": list[str],
            "review_reason": Optional[str],
            "pairwise_matrix": list[dict],
            "consensus_fields": dict,
            "document_types": list[str],
            "si_bl_comparison": Optional[dict],
        }
    """
    if not documents:
        return {
            "status": "NEEDS_REVIEW",
            "has_defect": False,
            "defect_fields": [],
            "review_reason": "missing_attachment",
            "pairwise_matrix": [],
            "consensus_fields": {},
            "document_types": [],
            "si_bl_comparison": None,
        }

    # 1. Unreadable check across all documents in folder
    for doc in documents:
        if not doc.get("readable", True):
            return {
                "status": "NEEDS_REVIEW",
                "has_defect": False,
                "defect_fields": [],
                "review_reason": "unreadable",
                "pairwise_matrix": [],
                "consensus_fields": {},
                "document_types": [d.get("doc_type", "UNKNOWN") for d in documents],
                "si_bl_comparison": None,
            }

    doc_types = [d.get("doc_type", "UNKNOWN") for d in documents]

    # 2. Identify SI and BL if present for canonical baseline
    si_doc = next((d for d in documents if d.get("doc_type") == "SI"), None)
    bl_doc = next((d for d in documents if d.get("doc_type") == "BL"), None)

    si_bl_comp = None
    if si_doc and bl_doc:
        si_bl_comp = compare_fields(si_doc.get("fields", {}), bl_doc.get("fields", {}))

    # 3. Build pairwise consistency matrix for all document pairs
    pairwise_matrix = []
    all_defect_fields = set()

    for doc_a, doc_b in combinations(documents, 2):
        pair_res = _compare_two_documents(doc_a, doc_b)
        pairwise_matrix.append(pair_res)
        if pair_res["has_defect"]:
            all_defect_fields.update(pair_res["defect_fields"])

    # 4. Build field-level consensus across all documents
    consensus_fields = {}
    for field in norm.CANONICAL_FIELDS:
        field_values = {}
        for doc in documents:
            val = (doc.get("fields") or {}).get(field)
            if not norm.is_blank(val):
                field_values[doc.get("doc_type", "DOC")] = norm.normalize_value(field, val)

        if len(field_values) > 1:
            # Check consistency among all extracted values
            distinct_values = set(field_values.values())
            if len(distinct_values) == 1:
                is_consistent = True
            elif field == "gross_weight_kg":
                vals = [v for v in distinct_values if isinstance(v, (int, float))]
                if vals and min(vals) > 0 and ((max(vals) - min(vals)) / max(vals)) * 100.0 <= 0.5:
                    is_consistent = True
                else:
                    is_consistent = False
            elif field in NUMERIC_FIELDS:
                is_consistent = False
            elif field == "consignee":
                first_val = list(distinct_values)[0]
                is_consistent = all(_text_matches(str(first_val), str(v)) for v in distinct_values)
                if not is_consistent:
                    from .ethiopian_rules import is_bank_consignment_match
                    notify_parties = [
                        (doc.get("fields") or {}).get("notify_party")
                        for doc in documents if (doc.get("fields") or {}).get("notify_party")
                    ]
                    non_bank_vals = [v for v in distinct_values if not norm.parse_to_order_bank(v)]
                    bank_vals = [v for v in distinct_values if norm.parse_to_order_bank(v)]
                    if non_bank_vals and bank_vals:
                        target = non_bank_vals[0]
                        if all(any(is_bank_consignment_match(target, b, np) for np in notify_parties) for b in bank_vals):
                            is_consistent = True
            else:
                # Text check for corporate suffix drift
                first_val = list(distinct_values)[0]
                is_consistent = all(_text_matches(str(first_val), str(v)) for v in distinct_values)

            consensus_fields[field] = {
                "consistent": is_consistent,
                "values": field_values,
            }
            if not is_consistent:
                all_defect_fields.add(field)
        elif len(field_values) == 1:
            consensus_fields[field] = {
                "consistent": True,
                "values": field_values,
            }

    # 5. Evaluate Ethiopian Regulatory Rule Pack
    from .ethiopian_rules import validate_ethiopian_regulations
    reg_report = validate_ethiopian_regulations(documents, folder_meta=folder_meta)
    if reg_report["is_applicable"] and not reg_report["compliant"]:
        for rd in reg_report["regulatory_defects"]:
            all_defect_fields.add(rd)

    # 6. Determine overall folder status
    # If strictly a 2-way SI & BL folder and fields were missing:
    if len(documents) == 2 and si_bl_comp and si_bl_comp.get("missing_fields"):
        return {
            "status": "NEEDS_REVIEW",
            "has_defect": False,
            "defect_fields": [],
            "review_reason": "missing_value",
            "pairwise_matrix": pairwise_matrix,
            "consensus_fields": consensus_fields,
            "document_types": doc_types,
            "si_bl_comparison": si_bl_comp,
            "regulatory_compliance": reg_report,
        }

    has_defect = len(all_defect_fields) > 0
    defect_list = sorted(list(all_defect_fields))

    return {
        "status": "MISMATCH" if has_defect else "OK",
        "has_defect": has_defect,
        "defect_fields": defect_list,
        "review_reason": None,
        "pairwise_matrix": pairwise_matrix,
        "consensus_fields": consensus_fields,
        "document_types": doc_types,
        "si_bl_comparison": si_bl_comp,
        "regulatory_compliance": reg_report,
    }
