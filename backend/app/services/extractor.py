"""
extractor.py — Document Extraction AI (rules/NLP first, OpenAI fallback)

Reads an SI/BL attachment (.txt / .pdf / .docx / .xlsx) and returns:

    {
      "fields":        {canonical_field: raw_value, ...},
      "raw_text":       str,           # for evidence / human review display
      "readable":       bool,          # False => needs OCR that didn't help,
                                        #          or empty/corrupt file
      "doc_type_guess": "SI"|"BL"|"OTHER"|"UNKNOWN",
      "used_ocr":       bool,
      "notes":          [str, ...],
    }

Strategy (per the locked architecture): deterministic rules/NLP do the heavy
lifting because these documents are structured "label: value" style forms.
An `llm_fallback()` hook is provided and is only invoked when the rule-based
pass fails to find enough fields AND a provider key is configured (OpenAI,
then Gemini) — we do not send every document straight to a model.
"""
import io
import os
import re

from . import llm
from . import normalizer as norm

SI_KEYWORDS = ["shipping instruction", "s.i."]
BL_KEYWORDS = ["bill of lading"]

# Document-type titles, matched against the document's own HEADER (its first
# few lines) rather than anywhere in the body. A genuine BL routinely refers
# to other paperwork in passing -- "freight payable as per commercial
# invoice", "see packing list attached" -- and scanning the whole text for
# those phrases mislabels it as the wrong document type and escalates a
# perfectly good comparison. The title line is the reliable signal.
_HEADER_LINES = 6

_TITLE_TYPES = [
    ("commercial invoice", "INVOICE"),
    ("tax invoice", "INVOICE"),
    ("packing list", "PACKING_LIST"),
    ("certificate of origin", "COO"),
    ("bill of lading", "BL"),
    ("shipping instruction", "SI"),
]

# Explicit "this is not the document you wanted" markers. These are
# unambiguous wherever they appear, so they are still matched body-wide.
WRONG_DOC_KEYWORDS = {
    "INVOICE": ["not a shipping instruction"],
    "PACKING_LIST": ["no port or vessel details"],
    "COO": ["not an si or bl"],
}


# Labels sorted longest-first so "port of loading (pol)" is tried before the
# shorter "pol" would otherwise steal the match.
_SORTED_LABELS = sorted(
    ((label, field) for field, labels in norm.LABEL_MAP.items() for label in labels),
    key=lambda t: -len(t[0]),
)


def _header(text, n=_HEADER_LINES):
    """The document's own title block: its first `n` non-empty, non-rule
    lines (a '=====' separator row carries no information)."""
    out = []
    for line in (text or "").splitlines():
        stripped = line.strip()
        if not stripped or set(stripped) <= set("=-_*# "):
            continue
        out.append(stripped.lower())
        if len(out) >= n:
            break
    return "\n".join(out)


def detect_doc_type(text):
    """Best-effort guess at what kind of document this is, from its own
    content (not from the filename — filenames can lie, which is exactly
    what the `wrong_doc_type` NEEDS_REVIEW cases test for).

    The document's header is authoritative: a BL that merely *mentions* an
    invoice is still a BL. Only if the header is silent do we fall back to
    body-wide evidence.
    """
    t = (text or "").lower()

    # 1) explicit self-describing markers ("*** NOT AN SI OR BL ***")
    for doc_type, kws in WRONG_DOC_KEYWORDS.items():
        if any(kw in t for kw in kws):
            return doc_type

    # 2) the title block -- earliest matching title in the header wins
    head = _header(text)
    best = None
    for title, doc_type in _TITLE_TYPES:
        pos = head.find(title)
        if pos != -1 and (best is None or pos < best[0]):
            best = (pos, doc_type)
    if best:
        return best[1]

    # 3) nothing in the header: fall back to body-wide keywords, still
    #    preferring the documents we actually work with.
    if any(kw in t for kw in BL_KEYWORDS):
        return "BL"
    if any(kw in t for kw in SI_KEYWORDS):
        return "SI"
    for title, doc_type in _TITLE_TYPES:
        if title in t:
            return doc_type
    return "UNKNOWN"


def _extract_fields_from_lines(lines):
    """Line-based extraction used for .txt files and for text pulled out of
    PDFs. Handles two layouts:

      1. colon form:   'Label: value'                  (.txt)
      2. prefix form:  'Label value...' on one line     (PDF block layout)
    """
    fields = {}
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # 1) colon form
        if ":" in line:
            label_part, _, value_part = line.partition(":")
            field = norm.canonical_field(label_part)
            if field and field not in fields:
                value = value_part.strip()
                if value:
                    fields[field] = value
                    continue

        # 2) prefix form (no colon, or colon match failed): does the line
        #    *start with* a known label?
        upper_line = line
        for label, field in _SORTED_LABELS:
            if field in fields:
                continue
            if upper_line.lower().startswith(label):
                remainder = upper_line[len(label):].strip(" :.-")
                if remainder:
                    fields[field] = remainder
                    break
    return fields


def _extract_fields_from_pairs(pairs):
    """Extraction for tabular (label, value) sources: .docx tables and
    .xlsx two-column rows."""
    fields = {}
    for label, value in pairs:
        if label is None or value is None:
            continue
        field = norm.canonical_field(str(label))
        if field and field not in fields:
            val = value if not isinstance(value, str) else value.strip()
            if val not in (None, ""):
                fields[field] = val
    return fields


def _read_txt(raw_bytes):
    text = raw_bytes.decode("utf-8", errors="replace")
    fields = _extract_fields_from_lines(text.splitlines())
    return fields, text, True, False, []


def _read_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    pairs = []
    text_lines = []
    for row in ws.iter_rows(values_only=True):
        if not row:
            continue
        label = row[0]
        value = row[1] if len(row) > 1 else None
        pairs.append((label, value))
        text_lines.append(" | ".join(str(c) for c in row if c is not None))
    fields = _extract_fields_from_pairs(pairs)
    return fields, "\n".join(text_lines), True, False, []


def _read_docx(path):
    import docx
    d = docx.Document(path)
    pairs = []
    text_lines = [p.text for p in d.paragraphs if p.text.strip()]
    for table in d.tables:
        for row in table.rows:
            cells = [c.text for c in row.cells]
            if len(cells) >= 2:
                pairs.append((cells[0], cells[1]))
                text_lines.append(f"{cells[0]}: {cells[1]}")
    fields = _extract_fields_from_pairs(pairs)
    # fall back to paragraph line-parsing for anything a table didn't cover
    para_fields = _extract_fields_from_lines(text_lines)
    for k, v in para_fields.items():
        fields.setdefault(k, v)
    return fields, "\n".join(text_lines), True, False, []


def _ocr_pdf(path, notes):
    """Best-effort OCR fallback for a PDF with no extractable text layer.
    Even when OCR *does* recover text, image-only / scanned documents are
    treated as low-trust and routed to human review (see confidence.py) —
    but we still OCR them so the review queue shows useful evidence instead
    of a blank page."""
    try:
        import pytesseract
        from pdf2image import convert_from_path

        images = convert_from_path(path, dpi=200)
        text = "\n".join(pytesseract.image_to_string(im) for im in images)
        notes.append("no native text layer; OCR applied for evidence")
        return text.strip()
    except Exception as exc:  # pragma: no cover - best effort only
        notes.append(f"OCR failed: {exc}")
        return ""


def _read_pdf(path):
    notes = []
    text = ""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            pages_text = [(page.extract_text() or "") for page in pdf.pages]
        text = "\n".join(pages_text).strip()
    except Exception as exc:
        notes.append(f"pdfplumber failed to open file: {exc}")
        text = ""

    used_ocr = False
    if not text:
        # no native text layer (scanned) OR a corrupt/garbled/truncated PDF
        ocr_text = _ocr_pdf(path, notes)
        used_ocr = True
        if ocr_text:
            fields = _extract_fields_from_lines(ocr_text.splitlines())
            # Scanned/garbled documents are policy-flagged unreadable
            # regardless of OCR success — see confidence.py rationale.
            return fields, ocr_text, False, used_ocr, notes
        return {}, "", False, used_ocr, notes

    fields = _extract_fields_from_lines(text.splitlines())
    return fields, text, True, used_ocr, notes


def extract_document(path):
    """Top-level entry point: read `path` (any supported extension) and
    return the standard extraction result dict."""
    notes = []
    ext = os.path.splitext(path)[1].lower()

    if not os.path.exists(path):
        return {
            "fields": {}, "raw_text": "", "readable": False,
            "doc_type_guess": "UNKNOWN", "used_ocr": False,
            "notes": ["file not found"],
        }

    if os.path.getsize(path) == 0:
        return {
            "fields": {}, "raw_text": "", "readable": False,
            "doc_type_guess": "UNKNOWN", "used_ocr": False,
            "notes": ["empty file (0 bytes)"],
        }

    try:
        if ext == ".txt":
            with open(path, "rb") as f:
                fields, text, readable, used_ocr, extra = _read_txt(f.read())
        elif ext == ".xlsx":
            fields, text, readable, used_ocr, extra = _read_xlsx(path)
        elif ext == ".docx":
            fields, text, readable, used_ocr, extra = _read_docx(path)
        elif ext == ".pdf":
            fields, text, readable, used_ocr, extra = _read_pdf(path)
        else:
            return {
                "fields": {}, "raw_text": "", "readable": False,
                "doc_type_guess": "UNKNOWN", "used_ocr": False,
                "notes": [f"unsupported file type: {ext}"],
            }
    except Exception as exc:
        return {
            "fields": {}, "raw_text": "", "readable": False,
            "doc_type_guess": "UNKNOWN", "used_ocr": False,
            "notes": [f"parse error: {exc}"],
        }

    notes.extend(extra)
    doc_type = detect_doc_type(text)

    # Rules/NLP found very little -> optional OpenAI fallback (only if a key
    # is configured; keeps the default pipeline fully offline/deterministic).
    if readable and len(fields) < 3 and llm.available():
        try:
            llm_fields, provider = llm_fallback(text)
            for k, v in llm_fields.items():
                fields.setdefault(k, v)
            notes.append(f"LLM fallback used ({provider}); rules found <3 fields")
        except Exception as exc:  # pragma: no cover
            notes.append(f"LLM fallback unavailable: {exc}")

    return {
        "fields": fields,
        "raw_text": text,
        "readable": readable,
        "doc_type_guess": doc_type,
        "used_ocr": used_ocr,
        "notes": notes,
    }


def llm_fallback(text):
    """Structured-extraction fallback. Only called when the deterministic
    pass under-extracted and a provider is configured; tries OpenAI then
    Gemini. Kept isolated so the rest of the pipeline is testable without
    network access or a key. Returns (fields, provider_name)."""
    prompt = (
        "Extract these fields from the shipping document text as JSON with "
        "exactly these keys: shipper, consignee, notify_party, "
        "port_of_loading, port_of_discharge, container_count, "
        "gross_weight_kg. Use null for anything not present. "
        "Respond with JSON only.\n\n" + text[:6000]
    )
    data, provider = llm.complete_json(prompt)
    return {k: v for k, v in data.items() if v not in (None, "")}, provider
