"""
classifier.py — Email Classification AI

Classifies an email (subject + body) into exactly one of:

    BL_COMPARISON | SI_REQUEST | INVOICE_QUERY | GENERAL | SPAM

Strategy: weighted keyword rules over the subject and body, in line with the
locked "Rules + NLP + OpenAI fallback" AI strategy — the LLM is only
consulted when the rule engine is not confident, and only if an API key is
configured. This keeps the pipeline fast, deterministic and fully explainable
for the majority of traffic (real shipping-ops inboxes are extremely
template-driven), while leaving room to catch the long tail.

Returns: {"category": str, "confidence": float,
          "decided_by": "rule" | "openai" | "gemini"}
"""
import os
import re

from . import llm

CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]

# (pattern, weight) — matched case-insensitively against subject / body.
# Weights were tuned against the real coded-subject conventions used across
# shipping-documentation teams (see README for the exact phrase list).
RULES = {
    "BL_COMPARISON": [
        (r"\bto confirm docs\b", 5),
        (r"\brequest bl draft\b", 5),
        (r"\bdraft bl\b", 4),
        (r"\bdraft multimodal b/?l\b", 5),
        (r"\bmultimodal b/?l\b", 4),
        (r"\bamend bl\b", 3),
        (r"\bbl draft\b", 4),
        (r"\bverify (the )?bl\b", 3),
        (r"\bverify\b[^\n]{0,60}\b(?:b/?l|bill of lading|mtd)\b", 5),
        (r"\bcheck the draft bl\b", 3),
        (r"\bshipping instruction and.*draft bill of lading\b", 4),
        (r"\bbill of lading\b", 2),
        (r"\bconfirm(ation)? of (the )?bl\b", 2),
        (r"\bagainst (the|our) si\b", 4),
        (r"\beslse verification\b", 5),
        (r"\bdiscrepanc", 2),
        (r"\(sinf\d|\(oolu\d|\(msc[uw]\d", 1),  # coded BL numbers in parens
    ],
    "SI_REQUEST": [
        (r"\bsi - \b", 4),
        (r"\bcust si\b", 4),
        (r"\brequest si\b", 5),
        (r"\bsi needed\b", 5),
        (r"\blatest si\b", 4),
        (r"\bshipping instruction\b", 3),
        (r"\bpol\s*:", 2),
        (r"\bpod\s*:", 2),
        (r"\bplease find shipping instruction\b", 4),
        (r"\bdocuments required\b", 2),
    ],
    "INVOICE_QUERY": [
        (r"\bbilling\b", 3),
        (r"\bmissing gr\b", 4),
        (r"\bcancel invoice\b", 5),
        (r"\blocal charges\b", 4),
        (r"\bd\s*&\s*d charges\b", 4),
        (r"\btotal freight\b", 3),
        (r"\binvoice\b", 2),
        (r"\btelex release charges\b", 3),
        (r"\bdetention\b", 2),
        (r"\bpgi\b", 2),
        (r"\bthc\b", 1),
    ],
    "GENERAL": [
        (r"\bupdate summary\b", 4),
        (r"\bberthing report\b", 5),
        (r"\b_rpa_\b", 5),
        (r"\boutstanding bl\b", 4),
        (r"\bpending bl release\b", 4),
        (r"\bapproval required\b", 3),
        (r"\btime off request\b", 4),
        (r"\bnew year\b", 3),
        (r"\bsubmit si & aed\b", 3),
        (r"\bautomated notification\b", 3),
        (r"\bno action required\b", 2),
    ],
    "SPAM": [
        (r"\bcongratulations\b", 4),
        (r"\bgift card\b", 5),
        (r"\bclaim now\b", 4),
        (r"\bparcel\b", 4),
        (r"\bunpaid customs fee\b", 4),
        (r"\bcustoms fee\b", 3),
        (r"\bundelivered messages?\b", 4),
        (r"\bweird trick\b", 4),
        (r"\bstorage (limit|is full)\b", 4),
        (r"\bverify your account\b", 4),
        (r"\b90% off\b", 4),
        (r"\bbank details\b", 4),
        (r"\bbitcoin\b", 5),
        (r"\bguaranteed .*returns\b", 4),
        (r"\bhot singles\b", 5),
        (r"\bwon a\b", 3),
        (r"\bsuspension\b", 2),
        (r"\bmailbox\b", 2),
    ],
}

# Precompile.
_COMPILED = {
    cat: [(re.compile(p, re.IGNORECASE), w) for p, w in rules]
    for cat, rules in RULES.items()
}


def _score(text):
    scores = {cat: 0 for cat in CATEGORIES}
    for cat, patterns in _COMPILED.items():
        for pattern, weight in patterns:
            if pattern.search(text):
                scores[cat] += weight
    return scores


def classify_email(subject, body):
    """Deterministic rule-based classification. Falls back to an LLM only
    when no rule fired at all and an OpenAI key is configured; otherwise
    defaults to GENERAL with low confidence (never leaves the field blank)."""
    subject = subject or ""
    body = body or ""
    text = f"{subject}\n{body}"

    scores = _score(text)
    total = sum(scores.values())
    best_cat = max(scores, key=scores.get)
    best_score = scores[best_cat]

    if total == 0:
        # Rule engine found nothing at all to go on.
        if llm.available():
            try:
                return _llm_classify(subject, body)
            except Exception:
                # Already recorded by the provider chain (llm.status()), and
                # each provider self-disables after a fatal error rather than
                # failing slowly on every email.
                pass
        return {"category": "GENERAL", "confidence": 0.4, "decided_by": "rule"}

    confidence = round(min(0.5 + best_score / (total + best_score) * 0.5, 0.99), 2)
    return {"category": best_cat, "confidence": confidence, "decided_by": "rule"}


def _llm_classify(subject, body):
    """LLM fallback for emails no rule matched. Tries each configured
    provider in turn (OpenAI, then Gemini); isolated here so the rest of the
    pipeline never needs network access or a key to run and test."""
    prompt = (
        "Classify this shipping-operations email into exactly one category: "
        "BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, or SPAM. "
        "Respond with JSON only: {\"category\": ..., \"confidence\": 0-1}.\n\n"
        f"Subject: {subject}\n\nBody:\n{body[:3000]}"
    )
    data, provider = llm.complete_json(prompt)
    cat = data.get("category") if data.get("category") in CATEGORIES else "GENERAL"
    try:
        conf = float(data.get("confidence", 0.6))
    except (TypeError, ValueError):
        conf = 0.6
    return {"category": cat, "confidence": max(0.0, min(conf, 1.0)),
            "decided_by": provider}
