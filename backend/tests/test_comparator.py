import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.comparator import compare_fields
from app.services import normalizer as norm


def test_all_fields_match_ok():
    si = {
        "shipper": "ABC Shipping Ltd.", "consignee": "XYZ Corp",
        "notify_party": "XYZ Corp", "port_of_loading": "Shanghai, China",
        "port_of_discharge": "Fremantle, Australia",
        "container_count": "6 x 40'HC", "gross_weight_kg": "131,058 KG",
    }
    bl = dict(si)
    bl["shipper"] = "ABC SHIPPING LTD"  # punctuation/casing only
    result = compare_fields(si, bl)
    assert result["defect_fields"] == []
    assert result["missing_fields"] == []


def test_container_count_mismatch_is_a_real_defect():
    si = {"container_count": "3", "gross_weight_kg": "1000"}
    bl = {"container_count": "4", "gross_weight_kg": "1000"}
    for f in norm.CANONICAL_FIELDS:
        si.setdefault(f, "SAME VALUE")
        bl.setdefault(f, "SAME VALUE")
    si["container_count"], bl["container_count"] = "3", "4"
    result = compare_fields(si, bl)
    assert "container_count" in result["defect_fields"]
    assert "gross_weight_kg" not in result["defect_fields"]


def test_blank_value_is_reported_as_missing_not_a_mismatch():
    si = {f: "VALUE" for f in norm.CANONICAL_FIELDS}
    bl = {f: "VALUE" for f in norm.CANONICAL_FIELDS}
    bl["notify_party"] = "???"
    result = compare_fields(si, bl)
    assert "notify_party" in result["missing_fields"]
    assert "notify_party" not in result["defect_fields"]


def test_fuzzy_match_catches_minor_punctuation_drift_only():
    assert norm.normalize_text_value("ABC Shipping Ltd.") == "ABC SHIPPING LTD"
    si = {f: "SAME" for f in norm.CANONICAL_FIELDS}
    bl = dict(si)
    si["consignee"], bl["consignee"] = "GLOBAL TRADERS PTE LTD", "COMPLETELY DIFFERENT ENTITY"
    result = compare_fields(si, bl)
    assert "consignee" in result["defect_fields"]  # genuine mismatch must NOT be smoothed over


if __name__ == "__main__":
    test_all_fields_match_ok()
    test_container_count_mismatch_is_a_real_defect()
    test_blank_value_is_reported_as_missing_not_a_mismatch()
    test_fuzzy_match_catches_minor_punctuation_drift_only()
    print("All comparator tests passed.")
