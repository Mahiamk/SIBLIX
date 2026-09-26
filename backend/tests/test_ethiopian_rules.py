"""
test_ethiopian_rules.py — Automated Test Suite for Ethiopian Regulatory Rule Pack

Verifies the 4 deterministic rules for Ethiopian cross-border trade:
1. L/C & Bank Permit Validator
2. HS Code Consistency Gate
3. Weight Tolerance Gate
4. Bank Endorsement / Consignment Validator (UCP 600 & NBE Directives)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.ethiopian_rules import (
    validate_lc_and_permit,
    validate_hs_code_consistency,
    validate_weight_tolerance,
    validate_bank_endorsement,
    validate_ethiopian_regulations,
    is_bank_consignment_match,
)
from app.services.graph_comparator import compare_document_graph
from app.services.comparator import compare_fields


def test_lc_amount_and_bl_remarks_validation():
    invoice_doc = {
        "doc_type": "INVOICE",
        "fields": {
            "total_amount": "USD 65,000.00",
            "currency": "USD",
        },
    }
    lc_doc = {
        "doc_type": "LC",
        "fields": {
            "lc_number": "CBE/ET/2026/LC-08912",
            "amount": "USD 65,000.00",
            "currency": "USD",
        },
    }
    bl_doc_clean = {
        "doc_type": "BL",
        "fields": {
            "remarks": "CARGO COVERED UNDER L/C NO. CBE/ET/2026/LC-08912 ISSUED BY COMMERCIAL BANK OF ETHIOPIA",
        },
        "raw_text": "OCEAN BILL OF LADING ... L/C NO. CBE/ET/2026/LC-08912",
    }
    # 1. Clean verification
    res_clean = validate_lc_and_permit(invoice_doc, lc_doc, bl_doc_clean)
    assert res_clean["passed"]
    assert res_clean["status"] == "PASS"
    assert len(res_clean["discrepancies"]) == 0

    # 2. Defect: Invoice amount exceeds L/C amount
    inv_over = {
        "doc_type": "INVOICE",
        "fields": {"total_amount": "USD 72,500.00"},
    }
    res_amt_fail = validate_lc_and_permit(inv_over, lc_doc, bl_doc_clean)
    assert not res_amt_fail["passed"]
    assert res_amt_fail["status"] == "FAIL"
    assert any("does not match L/C amount" in d for d in res_amt_fail["discrepancies"])

    # 3. Defect: L/C number not cited in BL remarks
    bl_doc_missing_lc = {
        "doc_type": "BL",
        "fields": {"remarks": "FREIGHT PREPAID. CLEAN ON BOARD."},
        "raw_text": "CLEAN ON BOARD",
    }
    res_cite_fail = validate_lc_and_permit(invoice_doc, lc_doc, bl_doc_missing_lc)
    assert not res_cite_fail["passed"]
    assert res_cite_fail["status"] == "FAIL"
    assert any("not cited in Bill of Lading remarks" in d for d in res_cite_fail["discrepancies"])
    print("  PASS  test_lc_amount_and_bl_remarks_validation")


def test_hs_code_consistency_check():
    # 1. Clean match (first 6 digits: 5208.11)
    coo_doc = {
        "doc_type": "COO",
        "fields": {"hs_code": "5208.11.00"},
    }
    inv_doc = {
        "doc_type": "INVOICE",
        "fields": {"hs_code": "5208.11"},
    }
    bl_doc = {
        "doc_type": "BL",
        "fields": {"hs_code": "5208.11.90"},
    }
    res_clean = validate_hs_code_consistency(coo_doc, inv_doc, bl_doc)
    assert res_clean["passed"]
    assert res_clean["status"] == "PASS"

    # 2. Defect: CoO has 5208.11, but Invoice has 5208.21
    inv_conflict = {
        "doc_type": "INVOICE",
        "fields": {"hs_code": "5208.21.00"},
    }
    res_fail = validate_hs_code_consistency(coo_doc, inv_conflict, bl_doc)
    assert not res_fail["passed"]
    assert res_fail["status"] == "FAIL"
    assert len(res_fail["discrepancies"]) > 0
    print("  PASS  test_hs_code_consistency_check")


def test_weight_tolerance_gate():
    bl_doc = {
        "doc_type": "BL",
        "fields": {"gross_weight_kg": 24500},
    }
    # 1. Within 0.5% tolerance (24,520 vs 24,500 = 0.08% diff)
    pl_doc_clean = {
        "doc_type": "PACKING_LIST",
        "fields": {"gross_weight_kg": 24520},
    }
    res_clean = validate_weight_tolerance(bl_doc, pl_doc_clean)
    assert res_clean["passed"]
    assert res_clean["status"] == "PASS"

    # 2. Exceeds 0.5% tolerance (26,000 vs 24,500 = 6.1% diff)
    pl_doc_fail = {
        "doc_type": "PACKING_LIST",
        "fields": {"gross_weight_kg": 26000},
    }
    res_fail = validate_weight_tolerance(bl_doc, pl_doc_fail)
    assert not res_fail["passed"]
    assert res_fail["status"] == "FAIL"
    assert any("exceeds 0.5% regulatory threshold" in d for d in res_fail["discrepancies"])
    print("  PASS  test_weight_tolerance_gate")


def test_bank_endorsement_consignee_matching():
    # SI consignee is actual buyer
    si_consignee = "HAWASSA TEXTILE SHARE COMPANY"
    # BL consignee is consigned to bank
    bl_consignee = "TO ORDER OF COMMERCIAL BANK OF ETHIOPIA"
    bl_notify = "HAWASSA TEXTILE SHARE COMPANY"

    # 1. Bank consignment helper check
    assert is_bank_consignment_match(si_consignee, bl_consignee, bl_notify)

    # 2. Rule validator check
    si_doc = {"doc_type": "SI", "fields": {"consignee": si_consignee}}
    bl_doc = {"doc_type": "BL", "fields": {"consignee": bl_consignee, "notify_party": bl_notify}}
    res_endorsement = validate_bank_endorsement(si_doc, bl_doc)
    assert res_endorsement["passed"]
    assert res_endorsement["status"] == "PASS"
    assert res_endorsement["is_bank_consigned"]
    assert "COMMERCIAL BANK OF ETHIOPIA" in res_endorsement["bank_name"]

    # 3. Two-way comparator check — must NOT trigger a consignee defect!
    si_fields = {
        "shipper": "GLOBAL COTTON LTD",
        "consignee": si_consignee,
        "notify_party": si_consignee,
        "port_of_loading": "MUMBAI",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 2,
        "gross_weight_kg": 38000,
    }
    bl_fields = {
        "shipper": "GLOBAL COTTON LTD",
        "consignee": bl_consignee,  # "TO ORDER OF COMMERCIAL BANK OF ETHIOPIA"
        "notify_party": bl_notify,  # "HAWASSA TEXTILE SHARE COMPANY"
        "port_of_loading": "MUMBAI",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 2,
        "gross_weight_kg": 38000,
    }
    comp = compare_fields(si_fields, bl_fields)
    assert "consignee" not in comp["defect_fields"]
    assert comp["field_results"]["consignee"]["match"] is True

    # 4. Multi-doc graph check
    docs = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
    ]
    graph_res = compare_document_graph(docs)
    assert graph_res["status"] == "OK"
    assert not graph_res["has_defect"]
    assert "consignee" not in graph_res["defect_fields"]
    print("  PASS  test_bank_endorsement_consignee_matching")


def test_full_ethiopian_shipment_folder_audit():
    # End-to-end 5-document Ethiopian shipment folder: SI, BL, Invoice, Packing List, LC
    si_fields = {
        "shipper": "SHANGHAI CHEMICALS CORP",
        "consignee": "MODJO PHARMA TRADING PLC",
        "notify_party": "MODJO PHARMA TRADING PLC",
        "port_of_loading": "SHANGHAI",
        "port_of_discharge": "DJIBOUTI (DJJIB)",
        "container_count": 3,
        "gross_weight_kg": 45000,
    }
    bl_fields = {
        "shipper": "SHANGHAI CHEMICALS CORP",
        "consignee": "TO ORDER OF AWASH BANK SC",
        "notify_party": "MODJO PHARMA TRADING PLC",
        "port_of_loading": "SHANGHAI",
        "port_of_discharge": "DJIBOUTI",
        "container_count": 3,
        "gross_weight_kg": 45000,
        "remarks": "CARGO TRANSIT TO ADDIS ABABA UNDER L/C NO. AWASH/2026/0122",
    }
    inv_fields = {
        "shipper": "SHANGHAI CHEMICALS CORP",
        "consignee": "MODJO PHARMA TRADING PLC",
        "total_amount": "USD 88,000.00",
        "hs_code": "2933.39",
    }
    pl_fields = {
        "container_count": 3,
        "gross_weight_kg": 45050,  # 50kg variance on 45,000kg = 0.11% (within 0.5%)
    }
    lc_fields = {
        "lc_number": "AWASH/2026/0122",
        "amount": "USD 88,000.00",
        "applicant": "MODJO PHARMA TRADING PLC",
    }
    docs = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
        {"path": "INV.pdf", "doc_type": "INVOICE", "fields": inv_fields, "readable": True, "used_ocr": False},
        {"path": "PL.xlsx", "doc_type": "PACKING_LIST", "fields": pl_fields, "readable": True, "used_ocr": False},
        {"path": "LC.pdf", "doc_type": "LC", "fields": lc_fields, "readable": True, "used_ocr": False},
    ]
    folder_meta = {
        "shipment_ref": "AWASH/2026/0122",
        "lc_number": "AWASH/2026/0122",
    }

    report = validate_ethiopian_regulations(docs, folder_meta=folder_meta)
    assert report["is_applicable"] is True
    assert report["compliant"] is True
    assert report["status"] == "COMPLIANT"
    assert len(report["regulatory_defects"]) == 0

    graph_res = compare_document_graph(docs, folder_meta=folder_meta)
    assert graph_res["status"] == "OK"
    assert not graph_res["has_defect"]
    assert graph_res["regulatory_compliance"]["status"] == "COMPLIANT"
    print("  PASS  test_full_ethiopian_shipment_folder_audit")


def test_non_ethiopian_shipment_bypass():
    # Regular shipment: Singapore to Fremantle, no LC, standard corporate consignee
    si_fields = {
        "shipper": "SINGAPORE TIMBER PTE LTD",
        "consignee": "PERTH BUILDING SUPPLIES",
        "notify_party": "PERTH BUILDING SUPPLIES",
        "port_of_loading": "SINGAPORE",
        "port_of_discharge": "FREMANTLE",
        "container_count": 2,
        "gross_weight_kg": 28000,
    }
    bl_fields = dict(si_fields)
    docs = [
        {"path": "SI.txt", "doc_type": "SI", "fields": si_fields, "readable": True, "used_ocr": False},
        {"path": "BL.txt", "doc_type": "BL", "fields": bl_fields, "readable": True, "used_ocr": False},
    ]
    report = validate_ethiopian_regulations(docs)
    assert report["is_applicable"] is False
    assert report["status"] == "NOT_APPLICABLE"
    assert report["compliant"] is True
    print("  PASS  test_non_ethiopian_shipment_bypass")


if __name__ == "__main__":
    test_lc_amount_and_bl_remarks_validation()
    test_hs_code_consistency_check()
    test_weight_tolerance_gate()
    test_bank_endorsement_consignee_matching()
    test_full_ethiopian_shipment_folder_audit()
    test_non_ethiopian_shipment_bypass()
    print("All Ethiopian Regulatory Rule Pack tests passed successfully!")
