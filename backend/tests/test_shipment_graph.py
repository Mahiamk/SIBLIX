"""
test_shipment_graph.py — Automated verification of Master Shipment Entity resolution
and Multi-Document Graph Matching.

Tests:
1. Reference extraction (Booking number, BL number, LC number, fallback)
2. 2-way baseline graph matching (SI vs BL) equivalence
3. 3-way graph matching (SI + BL + Commercial Invoice)
4. 4-way graph matching (SI + BL + Invoice + Packing List)
5. Defect isolation across multi-document pairs
6. Backward compatibility with legacy verification expectations
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.shipment_resolver import extract_shipment_references
from app.services.graph_comparator import compare_document_graph
from app.services.comparator import compare_fields
from app.services.confidence import evaluate_bl_comparison


def test_shipment_reference_resolution():
    # Test 1: Subject with booking and B/L number
    subj1 = "TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ MOORIM SP CO., LTD _ MEDUUD104332"
    refs1 = extract_shipment_references(subject=subj1, body="", email_id="email_001")
    assert refs1["booking_number"] == "5RSG-00133", f"Expected 5RSG-00133, got {refs1['booking_number']}"
    assert refs1["bl_number"] == "MEDUUD104332", f"Expected MEDUUD104332, got {refs1['bl_number']}"
    assert refs1["shipment_ref"] == "5RSG-00133"

    # Test 2: Subject with BK- prefix and LC number
    subj2 = "Booking Notice BK-98214 - LC No. ET/CBE/2026/0091"
    refs2 = extract_shipment_references(subject=subj2, body="Details for shipment", email_id="email_002")
    assert refs2["booking_number"] == "98214" or "98214" in refs2["booking_number"]
    assert refs2["lc_number"] is not None
    assert "2026/0091" in refs2["lc_number"]

    # Test 3: Fallback when no explicit numbers exist
    subj3 = "General inquiry about sailing schedules"
    refs3 = extract_shipment_references(subject=subj3, body="Please let us know", email_id="email_500")
    assert refs3["shipment_ref"] == "SHP-email_500"
    print("  PASS  test_shipment_reference_resolution")


def test_2way_baseline_graph_equivalence():
    si_fields = {
        "shipper": "APEX FORWARDING PTE LTD",
        "consignee": "EAST AFRICA IMPORTS CORP",
        "notify_party": "DJIBOUTI TRANSIT AGENTS",
        "port_of_loading": "SINGAPORE (SGSIN)",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 2,
        "gross_weight_kg": 18400,
    }
    bl_fields = {
        "shipper": "APEX FORWARDING LTD",
        "consignee": "EAST AFRICA IMPORTS CORP",
        "notify_party": "DJIBOUTI TRANSIT AGENTS",
        "port_of_loading": "SINGAPORE",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 2,
        "gross_weight_kg": 18400,
    }

    # Legacy 2-way comparison
    legacy_res = compare_fields(si_fields, bl_fields)
    assert len(legacy_res["defect_fields"]) == 0

    # Multi-document graph comparison
    docs = [
        {"path": "email_001_SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "email_001_BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
    ]
    graph_res = compare_document_graph(docs)
    assert graph_res["status"] == "OK"
    assert not graph_res["has_defect"]
    assert len(graph_res["defect_fields"]) == 0
    assert len(graph_res["pairwise_matrix"]) == 1
    print("  PASS  test_2way_baseline_graph_equivalence")


def test_3way_graph_matching_with_commercial_invoice():
    si_fields = {
        "shipper": "MOORIM PAPER CO., LTD",
        "consignee": "PAPELERA DEL PACIFICO S.A.",
        "port_of_loading": "BUSAN",
        "port_of_discharge": "CALLAO",
        "container_count": 1,
        "gross_weight_kg": 19500,
    }
    bl_fields = {
        "shipper": "MOORIM PAPER CO., LTD",
        "consignee": "PAPELERA DEL PACIFICO S.A.",
        "port_of_loading": "BUSAN",
        "port_of_discharge": "CALLAO",
        "container_count": 1,
        "gross_weight_kg": 19500,
    }
    # Commercial Invoice matching clean
    inv_clean = {
        "shipper": "MOORIM PAPER CO., LTD",
        "consignee": "PAPELERA DEL PACIFICO S.A.",
        "container_count": 1,
    }
    docs_clean = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
        {"path": "INVOICE.pdf", "doc_type": "INVOICE", "fields": inv_clean, "readable": True, "used_ocr": False},
    ]
    res_clean = compare_document_graph(docs_clean)
    assert res_clean["status"] == "OK"
    assert not res_clean["has_defect"]
    assert len(res_clean["pairwise_matrix"]) == 3  # (SI, BL), (SI, INV), (BL, INV)

    # Commercial Invoice with CONFLICTING consignee
    inv_mismatch = {
        "shipper": "MOORIM PAPER CO., LTD",
        "consignee": "DIFFERENT IMPORTER CORP",  # Defect!
        "container_count": 1,
    }
    docs_mismatch = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
        {"path": "INVOICE.pdf", "doc_type": "INVOICE", "fields": inv_mismatch, "readable": True, "used_ocr": False},
    ]
    res_mismatch = compare_document_graph(docs_mismatch)
    assert res_mismatch["status"] == "MISMATCH"
    assert res_mismatch["has_defect"]
    assert "consignee" in res_mismatch["defect_fields"]
    assert not res_mismatch["consensus_fields"]["consignee"]["consistent"]
    print("  PASS  test_3way_graph_matching_with_commercial_invoice")


def test_4way_graph_matching_with_packing_list():
    si_fields = {
        "shipper": "ETHIO-DJIBOUTI TEXTILE CORP",
        "consignee": "HAWASSA INDUSTRIAL AGENTS",
        "container_count": 4,
        "gross_weight_kg": 42000,
    }
    bl_fields = {
        "shipper": "ETHIO-DJIBOUTI TEXTILE CORP",
        "consignee": "HAWASSA INDUSTRIAL AGENTS",
        "container_count": 4,
        "gross_weight_kg": 42000,
    }
    inv_fields = {
        "shipper": "ETHIO-DJIBOUTI TEXTILE CORP",
        "consignee": "HAWASSA INDUSTRIAL AGENTS",
        "container_count": 4,
    }
    # Packing list with mismatched weight
    pack_fields = {
        "container_count": 4,
        "gross_weight_kg": 48500,  # Conflict: 48,500 KG vs 42,000 KG!
    }

    docs_4way = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
        {"path": "INV.pdf", "doc_type": "INVOICE", "fields": inv_fields, "readable": True, "used_ocr": False},
        {"path": "PL.xlsx", "doc_type": "PACKING_LIST", "fields": pack_fields, "readable": True, "used_ocr": False},
    ]

    res_4way = compare_document_graph(docs_4way)
    assert res_4way["status"] == "MISMATCH"
    assert "gross_weight_kg" in res_4way["defect_fields"]
    assert not res_4way["consensus_fields"]["gross_weight_kg"]["consistent"]
    assert len(res_4way["pairwise_matrix"]) == 6  # 4 choose 2 = 6 pairwise edges
    print("  PASS  test_4way_graph_matching_with_packing_list")


def test_evaluate_bl_comparison_preserves_policy():
    # 2-document case where BL is missing and replaced by an Invoice -> must trigger wrong_doc_type
    bad_pair = [
        {"path": "doc_SI.txt", "extraction": {"doc_type_guess": "SI", "fields": {}, "readable": True, "used_ocr": False}},
        {"path": "doc_INV.pdf", "extraction": {"doc_type_guess": "INVOICE", "fields": {}, "readable": True, "used_ocr": False}},
    ]
    res_bad = evaluate_bl_comparison(bad_pair)
    assert res_bad["status"] == "NEEDS_REVIEW"
    assert res_bad["review_reason"] == "wrong_doc_type"

    # 3-document case where SI + BL + Invoice are present -> must NOT trigger wrong_doc_type!
    base_fields = {
        "shipper": "GLOBAL SHIPPER CORP",
        "consignee": "GLOBAL IMPORTS",
        "notify_party": "SAME NOTIFY",
        "port_of_loading": "SINGAPORE",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 2,
        "gross_weight_kg": 20000,
    }
    clean_trio = [
        {"path": "doc_SI.txt", "extraction": {"doc_type_guess": "SI", "fields": dict(base_fields), "readable": True, "used_ocr": False}},
        {"path": "doc_BL.txt", "extraction": {"doc_type_guess": "BL", "fields": dict(base_fields), "readable": True, "used_ocr": False}},
        {"path": "doc_INV.pdf", "extraction": {"doc_type_guess": "INVOICE", "fields": {"shipper": "GLOBAL SHIPPER CORP", "consignee": "GLOBAL IMPORTS"}, "readable": True, "used_ocr": False}},
    ]
    res_trio = evaluate_bl_comparison(clean_trio)
    assert res_trio["status"] != "NEEDS_REVIEW" or res_trio.get("review_reason") != "wrong_doc_type"
    assert res_trio["status"] == "OK"
    print("  PASS  test_evaluate_bl_comparison_preserves_policy")


if __name__ == "__main__":
    test_shipment_reference_resolution()
    test_2way_baseline_graph_equivalence()
    test_3way_graph_matching_with_commercial_invoice()
    test_4way_graph_matching_with_packing_list()
    test_evaluate_bl_comparison_preserves_policy()
    print("All shipment graph tests passed successfully!")
