# api_shim — offline FastAPI/SQLModel test harness

**This is a development tool, not part of the shipped application.** It
exists because the environment this project was originally built in has no
network access to `pip install fastapi sqlmodel`, so the real backend could
never actually be executed there. Rather than leave the entire API layer
untested, this is a small compatibility shim implementing just enough of
the FastAPI/SQLModel/Pydantic surface (checked by grepping every import in
`backend/app/`) to import and run the **real, unmodified**
`backend/app/main.py` — real routing, real dependency injection, real auth,
real background tasks — against a **real SQLite-backed database** (not
mocked/fake data).

## Why this is still meaningful

`run_full_api_test.py` doesn't test a reimplementation or a simulation — it
imports `app.main.app` directly from `backend/`, unmodified, and drives it
through 53 checks covering every endpoint: login (success/failure), dataset
upload, the full 520-email pipeline run through `POST
/emails/process-all`, dashboard aggregation, filtering, the bulk
`/emails/full` endpoint, single-email detail, documents/comparison lookup,
the review queue and all three human decisions (approve/correct/retry),
and both evaluation outcomes (reference server unreachable → 502 handled
gracefully; submission generation).

**Once you have real network access (which you will, once
`docker compose up --build` installs the real `requirements.txt`), this
shim becomes unnecessary** — the real FastAPI/SQLModel will just work, and
this folder can be deleted. Its only job was to get *some* real execution
signal on the API layer before that was possible.

## What it does NOT prove

- It doesn't validate against Postgres (falls back to SQLite regardless of
  `DATABASE_URL`'s scheme) — the app's SQL usage is simple enough
  (equality filters, no joins/subqueries) that this is unlikely to matter,
  but it's not a guarantee.
- It doesn't test the real `uvicorn`/ASGI/HTTP layer, CORS behavior, or
  request/response serialization edge cases FastAPI's real Pydantic
  validation would catch (e.g. a wrong type in a request body would be
  silently accepted here where real FastAPI would 422).
- It doesn't test the OpenAI fallback paths (no key configured).

## Running it

```bash
cd dev-tools/api_shim
python3 run_full_api_test.py
```

Takes about 10-15 seconds (most of it is the real pipeline processing 520
real emails with real PDF/OCR/text extraction). Prints a PASS/FAIL line per
check and a summary at the end. It writes a scratch database to
`backend/storage/shim_test.db` — safe to delete any time.
