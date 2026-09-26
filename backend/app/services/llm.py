"""
llm.py — the optional LLM fallback, as an ordered chain of providers.

The deterministic rules handle the overwhelming majority of traffic; a model
is only consulted for the long tail (see classifier/extractor). Because that
path runs rarely, a broken provider is easy to miss — every call fails, the
error gets swallowed, and the only symptom is that the pipeline turns slow.
An exhausted OpenAI key did exactly that: ~2.4s burned per email on a request
that could never succeed.

So the chain here is explicit and self-limiting:

    OPENAI_API_KEY  ->  GEMINI_API_KEY  ->  give up, rules decide

* Each provider has its own circuit breaker. OpenAI running out of credits
  disables OpenAI only — Gemini keeps serving.
* A fatal error (no quota, bad key, no permission) trips that provider for
  the rest of the process: one wasted request, not one per email.
* Failures are recorded and readable via `status()` rather than vanishing,
  with API keys stripped from the text.
* Every request carries a timeout and no retries, so a hung network cannot
  stall a batch.

Gemini is called over its REST endpoint with httpx (already a dependency)
rather than pulling in another SDK.
"""
import json
import os
import re

DEFAULT_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", 20))
MAX_CONSECUTIVE_FAILURES = int(os.environ.get("LLM_MAX_FAILURES", 3))

# Per-process budget on fallback calls. A working provider still costs ~3s a
# request, and on a real mixed mailbox almost every message misses the
# shipping rules — 24 personal emails would stall a sync for 80s. The budget
# keeps a large batch bounded: once spent, everything falls back to rules,
# which is the correct answer for non-shipping mail anyway. Set 0 for no cap.
MAX_CALLS = int(os.environ.get("LLM_MAX_CALLS", 50))
_calls_made = 0

# Preference order. First provider with a key and an untripped breaker wins.
PROVIDER_ORDER = ("openai", "gemini")

_KEY_ENV = {"openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}

# Conditions that will not fix themselves on the next email: the key is
# wrong, or the account genuinely has nothing left to spend.
_FATAL_MARKERS = (
    "insufficient_quota", "credit_balance_exhausted", "invalid_api_key",
    "incorrect api key", "api_key_invalid", "permission_denied",
    "unauthenticated", "authentication", "account is not active",
)

# Throttling. Gemini's free tier answers a batch with 429 "exceeded your
# current quota" after a handful of requests a minute — that is a rate limit,
# not an empty account, and must not be reported as a dead key. Retrying at
# batch speed will not help either, so it still retires the provider for the
# run, just after a few strikes and with an honest message.
_RATE_LIMIT_MARKERS = ("429", "rate limit", "rate-limit", "resource_exhausted",
                       "too many requests")
_FATAL_TYPES = ("AuthenticationError", "PermissionDeniedError", "RateLimitError")

# Server-side hiccups that say "try again later". These must NOT retire a
# provider: a couple of 503s during a busy minute is not a broken key, and
# disabling on them throws away a working fallback for the rest of the run.
_TRANSIENT_MARKERS = (
    "503", "500", "502", "504", "unavailable", "high demand",
    "overloaded", "try again later", "timeout", "timed out",
    "temporarily", "deadline exceeded", "connection reset",
)
_TRANSIENT_TYPES = (
    "ReadTimeout", "ConnectTimeout", "PoolTimeout", "TimeoutException",
    "ConnectError", "RemoteProtocolError", "APIConnectionError",
    "APITimeoutError", "InternalServerError",
)

_state = {
    p: {"disabled_reason": None, "failures": 0, "transient_failures": 0}
    for p in PROVIDER_ORDER
}


class LLMUnavailable(Exception):
    """No configured provider could answer."""


# --------------------------------------------------------------------------
# state
# --------------------------------------------------------------------------
def _configured(provider: str) -> bool:
    return bool(os.environ.get(_KEY_ENV[provider], "").strip())


def provider_available(provider: str) -> bool:
    if os.environ.get("LLM_DISABLE_FALLBACK") == "1":
        return False
    return _configured(provider) and _state[provider]["disabled_reason"] is None


def budget_exhausted() -> bool:
    return MAX_CALLS > 0 and _calls_made >= MAX_CALLS


def available() -> bool:
    """True when at least one provider is worth trying."""
    if budget_exhausted():
        return False
    return any(provider_available(p) for p in PROVIDER_ORDER)


def active_provider():
    for p in PROVIDER_ORDER:
        if provider_available(p):
            return p
    return None


def status() -> dict:
    return {
        "available": available(),
        "active_provider": active_provider(),
        "order": list(PROVIDER_ORDER),
        "calls_made": _calls_made,
        "call_budget": MAX_CALLS,
        "budget_exhausted": budget_exhausted(),
        "providers": {
            p: {
                "configured": _configured(p),
                "available": provider_available(p),
                "disabled_reason": _state[p]["disabled_reason"],
                "consecutive_failures": _state[p]["failures"],
                "transient_failures": _state[p].get("transient_failures", 0),
            }
            for p in PROVIDER_ORDER
        },
    }


def reset():
    """Re-arm every breaker and the call budget (tests, or after fixing a key)."""
    global _calls_made
    _calls_made = 0
    for p in PROVIDER_ORDER:
        _state[p] = {"disabled_reason": None, "failures": 0,
                     "transient_failures": 0}


def _redact(text: str) -> str:
    out = str(text)
    for env in _KEY_ENV.values():
        key = (os.environ.get(env) or "").strip()
        # Only redact plausible keys — blindly replacing a 1-2 char value
        # would shred unrelated words in the message.
        if len(key) >= 8:
            out = out.replace(key, "<redacted>")
    return re.sub(r"(key=)[\w.\-]+", r"\1<redacted>", out)


def _note_success(provider: str):
    _state[provider]["failures"] = 0


def _note_failure(provider: str, exc) -> str:
    name = type(exc).__name__
    # Classify on the raw text: redaction can rewrite the very substrings the
    # markers look for. Only the message shown to callers is redacted.
    lowered = str(exc).lower()
    detail = _redact(exc)

    transient = (name in _TRANSIENT_TYPES
                 or any(m in lowered for m in _TRANSIENT_MARKERS))
    out_of_credit = any(m in lowered for m in _FATAL_MARKERS)
    rate_limited = (not out_of_credit
                    and any(m in lowered for m in _RATE_LIMIT_MARKERS))
    fatal = not transient and not rate_limited and (
        name in _FATAL_TYPES or out_of_credit
    )

    if transient:
        # This item falls back to rules, but the provider stays in the chain.
        _state[provider]["transient_failures"] = (
            _state[provider].get("transient_failures", 0) + 1
        )
        return f"{provider}: temporary — {detail[:120]}"

    _state[provider]["failures"] += 1
    if fatal or _state[provider]["failures"] >= MAX_CONSECUTIVE_FAILURES:
        if "insufficient_quota" in lowered or "credit_balance_exhausted" in lowered:
            reason = f"{provider}: account has no remaining credits"
        elif rate_limited:
            reason = (
                f"{provider}: rate limited (429) — the plan allows only a few "
                "requests per minute, which a batch exhausts immediately. "
                "Rules handle the rest of this run."
            )
        elif ("invalid_api_key" in lowered or "api_key_invalid" in lowered
              or "authentication" in lowered or "unauthenticated" in lowered):
            reason = f"{provider}: the API key was rejected"
        elif "permission" in lowered:
            reason = f"{provider}: the key lacks permission for this model"
        else:
            reason = f"{provider}: disabled after {name} — {detail[:140]}"
        _state[provider]["disabled_reason"] = reason
        return reason
    return f"{provider}: {name} — {detail[:140]}"


# --------------------------------------------------------------------------
# providers
# --------------------------------------------------------------------------
def _strip_code_fence(text: str) -> str:
    """Models sometimes wrap JSON in ```json ... ``` despite being asked not to."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _call_openai(prompt: str) -> dict:
    from openai import OpenAI

    client = OpenAI(timeout=DEFAULT_TIMEOUT, max_retries=0)
    resp = client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return json.loads(_strip_code_fence(resp.choices[0].message.content))


def _call_gemini(prompt: str) -> dict:
    import httpx

    # "…-latest" tracks the current flash model. Pinning a version (e.g.
    # gemini-2.0-flash) silently 404s once Google retires it.
    model = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    resp = httpx.post(
        url,
        headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"].strip(),
                 "Content-Type": "application/json"},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        },
        timeout=DEFAULT_TIMEOUT,
    )
    if resp.status_code >= 400:
        # Surface Google's own reason so the breaker can classify it.
        raise RuntimeError(f"HTTP {resp.status_code}: {_redact(resp.text)[:300]}")
    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"unexpected Gemini response: {_redact(json.dumps(data))[:200]}")
    return json.loads(_strip_code_fence(text))


_CALLERS = {"openai": _call_openai, "gemini": _call_gemini}


# --------------------------------------------------------------------------
# public entry point
# --------------------------------------------------------------------------
def complete_json(prompt: str):
    """Ask the first working provider for a JSON object.

    Returns (data, provider_name). Raises LLMUnavailable when every
    configured provider is unusable, so callers fall back to rules.
    """
    global _calls_made
    if budget_exhausted():
        raise LLMUnavailable(
            f"LLM call budget spent ({MAX_CALLS}); remaining items use rules only"
        )
    # One budget unit per request, not per provider attempt — falling back
    # from OpenAI to Gemini is still a single item being classified.
    _calls_made += 1
    errors = []
    for provider in PROVIDER_ORDER:
        if not provider_available(provider):
            continue
        try:
            data = _CALLERS[provider](prompt)
            if not isinstance(data, dict):
                raise RuntimeError("provider did not return a JSON object")
            _note_success(provider)
            return data, provider
        except Exception as exc:
            errors.append(_note_failure(provider, exc))
    raise LLMUnavailable("; ".join(errors) or "no LLM provider configured")
