"""
test_llm_chain.py — the OpenAI -> Gemini fallback chain and its guard rails.

No network: every provider call is stubbed. What matters here is the policy
around the call, which is where the real defects were — a dead key that
failed slowly on every email, and transient server hiccups that retired a
perfectly good provider.

    python3 tests/test_llm_chain.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services import llm


def setup():
    os.environ["OPENAI_API_KEY"] = "sk-test-key-longenough-123456"
    os.environ["GEMINI_API_KEY"] = "AQ.test-key-longenough-123456"
    os.environ.pop("LLM_DISABLE_FALLBACK", None)
    llm.reset()


def test_openai_is_preferred_and_gemini_takes_over_when_it_dies():
    setup()
    calls = []
    llm._CALLERS["openai"] = lambda p: (calls.append("openai"), {"category": "GENERAL"})[1]
    llm._CALLERS["gemini"] = lambda p: (calls.append("gemini"), {"category": "SPAM"})[1]

    _, provider = llm.complete_json("x")
    assert provider == "openai", provider

    # OpenAI runs out of credit -> chain must move on, not give up
    def broke(_):
        raise RuntimeError("429 insufficient_quota credit_balance_exhausted")
    llm._CALLERS["openai"] = broke

    data, provider = llm.complete_json("x")
    assert provider == "gemini", provider
    assert data["category"] == "SPAM"
    assert llm.provider_available("openai") is False
    assert llm.provider_available("gemini") is True


def test_a_dead_key_is_tried_once_not_once_per_item():
    """REGRESSION: an exhausted key failed on every single email, costing
    ~2.4s each and turning a 1s run into 56s."""
    setup()
    attempts = {"n": 0}

    def broke(_):
        attempts["n"] += 1
        raise RuntimeError("429 insufficient_quota credit_balance_exhausted")

    llm._CALLERS["openai"] = broke
    llm._CALLERS["gemini"] = broke

    for _ in range(25):
        try:
            llm.complete_json("x")
        except llm.LLMUnavailable:
            pass
    assert attempts["n"] == 2, f"retried a known-dead provider: {attempts['n']} calls"


def test_a_transient_503_does_not_retire_a_provider():
    """REGRESSION: Gemini answering 'high demand, try again later' three
    times disabled it for the whole run, discarding a working fallback."""
    setup()

    def flaky(_):
        raise RuntimeError('HTTP 503: {"error":{"code":503,"status":"UNAVAILABLE",'
                           '"message":"This model is currently experiencing high demand"}}')
    llm._CALLERS["openai"] = flaky
    llm._CALLERS["gemini"] = flaky

    for _ in range(5):
        try:
            llm.complete_json("x")
        except llm.LLMUnavailable:
            pass
    assert llm.provider_available("gemini") is True
    assert llm.status()["providers"]["gemini"]["transient_failures"] >= 5


def test_rate_limiting_is_reported_as_throttling_not_a_dead_key():
    setup()

    def throttled(_):
        raise RuntimeError("HTTP 429: You exceeded your current quota, "
                           "please check your plan and billing details")
    llm._CALLERS["gemini"] = throttled
    llm._CALLERS["openai"] = throttled

    for _ in range(4):
        try:
            llm.complete_json("x")
        except llm.LLMUnavailable:
            pass
    reason = llm.status()["providers"]["gemini"]["disabled_reason"] or ""
    assert "rate limited" in reason, reason
    assert "no remaining credits" not in reason, reason


def test_call_budget_bounds_a_large_batch():
    """A real mailbox is mostly non-shipping mail; without a cap every one of
    those messages would spend seconds confirming it."""
    setup()
    llm.MAX_CALLS = 3
    try:
        llm.reset()
        llm._CALLERS["openai"] = lambda p: {"category": "GENERAL"}
        ok = 0
        for _ in range(10):
            try:
                llm.complete_json("x")
                ok += 1
            except llm.LLMUnavailable:
                pass
        assert ok == 3, ok
        assert llm.status()["budget_exhausted"] is True
    finally:
        llm.MAX_CALLS = 50
        llm.reset()


def test_api_keys_never_appear_in_a_recorded_error():
    setup()
    key = os.environ["GEMINI_API_KEY"]
    llm._CALLERS["gemini"] = lambda p: (_ for _ in ()).throw(
        RuntimeError(f"bad request with key={key} rejected: api_key_invalid")
    )
    llm._CALLERS["openai"] = lambda p: (_ for _ in ()).throw(
        RuntimeError("429 insufficient_quota")
    )
    try:
        llm.complete_json("x")
    except llm.LLMUnavailable as exc:
        assert key not in str(exc), "API key leaked into the error"
    assert key not in str(llm.status())


def test_fallback_can_be_switched_off_entirely():
    setup()
    os.environ["LLM_DISABLE_FALLBACK"] = "1"
    try:
        assert llm.available() is False
    finally:
        os.environ.pop("LLM_DISABLE_FALLBACK", None)


TESTS = [
    test_openai_is_preferred_and_gemini_takes_over_when_it_dies,
    test_a_dead_key_is_tried_once_not_once_per_item,
    test_a_transient_503_does_not_retire_a_provider,
    test_rate_limiting_is_reported_as_throttling_not_a_dead_key,
    test_call_budget_bounds_a_large_batch,
    test_api_keys_never_appear_in_a_recorded_error,
    test_fallback_can_be_switched_off_entirely,
]

if __name__ == "__main__":
    _real = dict(llm._CALLERS)
    failed = 0
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL  {t.__name__}: {exc}")
        finally:
            llm._CALLERS.update(_real)
    print("All LLM chain tests passed." if not failed else f"{failed} failed.")
    sys.exit(1 if failed else 0)
