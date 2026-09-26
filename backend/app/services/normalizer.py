"""
normalizer.py — Field Normalization Engine

Two responsibilities:

1. LABEL normalisation: shipping documents label the same field differently
   depending on the vendor / template ("Port of Loading" vs "Load Port" vs
   "POL"). `canonical_field()` maps any observed label string to one of the
   seven canonical field names used everywhere else in the pipeline.

2. VALUE normalisation: once we have a value for a field, `normalize_value()`
   cleans it up (casing, punctuation, whitespace, units) so that two values
   that mean the same thing compare equal even if formatted differently
   ("ABC SHIPPING LTD" vs "ABC Shipping Ltd.").

Pure dictionary + rule matching, no ML/LLM calls — this keeps normalization
fast, deterministic and fully explainable, per the "rules first" strategy.
"""
import re

# The 7 canonical fields the whole pipeline compares.
CANONICAL_FIELDS = [
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
]

# Fields we also try to extract because they're useful for evidence /
# confidence scoring, even though they aren't part of the 7-field compare.
AUX_FIELDS = ["vessel", "voyage", "commodity", "booking", "bl_no", "hs_code"]

ALL_FIELDS = CANONICAL_FIELDS + AUX_FIELDS

# --------------------------------------------------------------------------
# Label dictionary. Keys are canonical field names; values are every label
# variant we know how to recognise. Matching is case-insensitive and ignores
# bilingual/parenthetical suffixes (see _clean_label below), so we only need
# the "core" English phrase here.
# --------------------------------------------------------------------------
LABEL_MAP = {
    "shipper": [
        "shipper", "shipper/exporter", "shipper (principal or seller)",
        "exporter", "seller",
    ],
    "consignee": [
        "consignee", "consignee (non-negotiable)", "to the order of",
        "buyer",
    ],
    "notify_party": [
        "notify party", "notify", "notify party/intermediate consignee",
    ],
    "port_of_loading": [
        "port of loading", "port of loading (pol)", "load port", "pol",
        "port of loading (transit)", "transit port", "port of departure",
    ],
    "port_of_discharge": [
        "port of discharge", "port of discharge (pod)", "discharge port",
        "pod", "final port of delivery (dry port)", "final port of delivery",
        "inland destination", "final destination", "place of delivery", "port of delivery",
    ],
    "container_count": [
        "no. of containers", "total containers",
        "no. of containers or packages", "container count", "containers",
    ],
    "gross_weight_kg": [
        "gross weight (kg)", "gross wt (kgs)", "gross weight",
        "total gross weight (kg)", "gross wt", "total gross weight",
        "gross weight declared", "declared gross weight",
    ],
    "vessel": ["vessel", "ocean vessel", "vessel name",
               "export carrier (vessel, voyage)"],
    "voyage": ["voyage no.", "voy.", "voy. no", "voyage"],
    "commodity": ["commodity", "description of goods", "description",
                  "kinds of packages; description of goods"],
    "booking": ["booking reference", "booking no.", "booking ref"],
    "bl_no": ["b/l no.", "bl no.", "bill of lading no.", "b/l number"],
    "hs_code": ["hs code", "hs_code"],
}

# Flattened reverse lookup, longest label first so "port of loading (pol)"
# matches before the shorter "pol" fragment would.
_REVERSE = sorted(
    ((label, field) for field, labels in LABEL_MAP.items() for label in labels),
    key=lambda t: -len(t[0]),
)

# Tokens that indicate a value is intentionally blank / a placeholder rather
# than a real (if unusual) value. Used by the confidence engine to detect
# `missing_value` NEEDS_REVIEW cases.
BLANK_TOKENS = {"???", "_______", "____mt", "tba", "tbc", "n/a", "", "-", "none"}


def _clean_label(raw_label):
    """Strip bilingual / parenthetical decoration and punctuation so we can
    match against LABEL_MAP, e.g. 'Shipper (Principal or Seller) (发货人)'
    -> 'shipper (principal or seller)'."""
    s = raw_label.strip()
    # drop trailing CJK / non-ascii parenthetical blocks like (发货人)
    s = re.sub(r"\([^)]*[\u4e00-\u9fff][^)]*\)", "", s)
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = s.rstrip(":").strip()
    return s


def canonical_field(raw_label):
    """Return the canonical field name for a raw label string, or None if it
    doesn't match anything we know about."""
    if not raw_label:
        return None
    cleaned = _clean_label(raw_label)
    if not cleaned:
        return None
    # exact match first
    for label, field in _REVERSE:
        if cleaned == label:
            return field
    # then "starts with" / "contains" match, for labels with extra words
    for label, field in _REVERSE:
        if cleaned.startswith(label) or label in cleaned:
            return field
    return None


def is_blank(value):
    """True if a value is a placeholder / blank token rather than real data."""
    if value is None:
        return True
    v = str(value).strip().strip(".").lower()
    v = re.sub(r"\s+", " ", v)
    return v in BLANK_TOKENS or v == ""


# A trailing UN/LOCODE, e.g. "NHAVA SHEVA, INDIA (INNSA)". The BL template
# carries it and the SI template often doesn't, so it must be stripped before
# comparing ports or an identical port reads as a mismatch.
_LOCODE_RE = re.compile(r"\s*\(\s*[A-Z]{2}[A-Z0-9]{3}\s*\)\s*$")

PORT_FIELDS = ("port_of_loading", "port_of_discharge")


def strip_locode(value):
    """Remove a trailing UN/LOCODE parenthetical from a port value."""
    return _LOCODE_RE.sub("", value or "").strip()


def normalize_text_value(value, field=None):
    """Normalise a free-text value (shipper/consignee/notify/ports) for
    comparison: uppercase, collapse whitespace, drop trailing punctuation
    and common corporate suffixes' punctuation quirks."""
    if value is None:
        return ""
    v = str(value)
    # keep only the first line (drop address block that sometimes rides
    # along with a name in binary-format documents)
    v = v.split("\n")[0].split("|")[0]
    v = v.upper()
    if field in PORT_FIELDS:
        v = strip_locode(v)
    v = re.sub(r"[.,]", "", v)          # "Ltd." / "Ltd," -> "LTD"
    v = re.sub(r"\s+", " ", v).strip()
    return v


_NUM_RE = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")

# Weight units -> multiplier into kilograms. Gross weight is compared as a
# business fact, so "235.5 MT" and "235500 KG" must compare equal, and
# "5 MT" must NOT silently equal "5 KG".
_WEIGHT_UNITS = [
    (re.compile(r"\b(?:mt|mts|m/?tons?|metric\s+tons?|tonnes?|tons?)\b", re.I), 1000.0),
    (re.compile(r"\b(?:kg|kgs|kgm|kilogram(?:me)?s?)\b", re.I), 1.0),
    (re.compile(r"\b(?:g|grams?)\b", re.I), 0.001),
    (re.compile(r"\b(?:lb|lbs|pounds?)\b", re.I), 0.45359237),
]


def normalize_weight_value(value):
    """Parse a gross-weight value into whole kilograms, honouring the unit
    written alongside it. Returns None if there is no number to read."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value)))
    text = str(value)
    m = _NUM_RE.search(text)
    if not m:
        return None
    amount = float(m.group(0).replace(",", ""))
    multiplier = 1.0
    for pattern, factor in _WEIGHT_UNITS:
        if pattern.search(text):
            multiplier = factor
            break
    return int(round(amount * multiplier))


def normalize_int_value(value):
    """Pull the first integer out of a free-form value like '6 x 40'HC' or
    '131,058 KG' -> 6 / 131058. Returns None if nothing numeric is found."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    m = _NUM_RE.search(str(value))
    if not m:
        return None
    return int(float(m.group(0).replace(",", "")))


def normalize_value(field, value):
    """Dispatch to the right normalizer for a canonical field."""
    if field == "gross_weight_kg":
        return normalize_weight_value(value)
    if field == "container_count":
        return normalize_int_value(value)
    return normalize_text_value(value, field=field)


# --------------------------------------------------------------------------
# Ethiopian Trade & Regulatory Recognition Helpers
# --------------------------------------------------------------------------
ETHIOPIAN_LOCATIONS = {
    "DJIBOUTI", "ADDIS ABABA", "MODJO", "MOJO", "HAWASSA", "DIRE DAWA",
    "KOMBOLCHA", "SEMERA", "MEKELLE", "BAHIR DAR", "ADAMA", "NAZRET",
    "ETHIOPIA", "ETHIOPIAN", "DJJIB", "ETADD", "ETQMJ", "ETDIR",
}

ETHIOPIAN_BANKS = {
    "COMMERCIAL BANK OF ETHIOPIA", "CBE", "AWASH BANK", "DASHEN BANK",
    "BANK OF ABYSSINIA", "WEGAGEN BANK", "WAGAGEN BANK", "NIB INTERNATIONAL BANK",
    "UNITED BANK", "HIBRET BANK", "COOPERATIVE BANK OF OROMIA", "ZEMEN BANK",
    "OROMIA BANK", "ABAY BANK", "BERHAN BANK", "BUNNA BANK", "ENAT BANK",
    "GLOBAL BANK ETHIOPIA", "SIINQEE BANK", "TSEDAY BANK", "AMHARA BANK",
    "GADAA BANK", "HIJRA BANK", "ZAMZAM BANK", "NATIONAL BANK OF ETHIOPIA", "NBE",
}

_TO_ORDER_BANK_RE = re.compile(
    r"\b(?:TO\s+(?:THE\s+)?ORDER\s+OF\s+|ORDER\s+OF\s+)(.+)",
    re.IGNORECASE,
)


def parse_to_order_bank(consignee_str: str) -> str:
    """If consignee is 'TO ORDER OF [BANK]', returns the normalized bank name.
    If 'TO ORDER', returns 'TO ORDER'. Otherwise returns empty string."""
    if not consignee_str:
        return ""
    text = consignee_str.strip()
    if text.upper() in ("TO ORDER", "TO THE ORDER"):
        return "TO ORDER"
    m = _TO_ORDER_BANK_RE.search(text)
    if m:
        return normalize_text_value(m.group(1))
    return ""


def is_ethiopian_trade(fields_or_text) -> bool:
    """Checks whether an entity, document, or field dictionary references the
    Ethiopian cross-border trade corridor (Addis Ababa, Modjo Dry Port, Djibouti transit,
    or Ethiopian banking/regulatory institutions)."""
    if isinstance(fields_or_text, dict):
        text = " ".join(str(v) for v in fields_or_text.values() if v).upper()
    else:
        text = str(fields_or_text or "").upper()

    for loc in ETHIOPIAN_LOCATIONS:
        if re.search(r"\b" + re.escape(loc) + r"\b", text):
            return True
    for bank in ETHIOPIAN_BANKS:
        if re.escape(bank) in text:
            return True
    return False

