# SDOC Hackathon — participant bundle

Build a pipeline that reads this inbox and, for each email, decides:

1. **category** — one of `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`,
   `GENERAL`, `SPAM`.
2. for `BL_COMPARISON` emails, compare the **Shipping Instruction (SI)** against
   the **draft Bill of Lading (BL)** attachments and report the outcome:
   - `status`: `OK` (all 7 fields match), `MISMATCH` (≥1 field differs), or
     `NEEDS_REVIEW` (you cannot decide — unreadable/missing/wrong document).
   - `has_defect` + `defect_fields` when it's a `MISMATCH`.
   - `review_reason` when it's `NEEDS_REVIEW`
     (`wrong_doc_type` | `missing_attachment` | `unreadable` | `missing_value`).

The 7 compared fields: **shipper, consignee, notify_party, port_of_loading,
port_of_discharge, container_count, gross_weight_kg**. Note the SI and BL often
*label the same field differently* (`Port of Loading` vs `Load Port`) — align by
meaning, not by header text.

## Quick start

```bash
# look at one email + its documents
cat inbox/email_004.json
cat attachments/email_004_SI.txt
cat attachments/email_004_BL.txt

# or use the loader (stdlib only for the .txt path)
python3 -c "from loader import Inbox; ib=Inbox('.'); print(len(ib.emails()),'emails')"
```

```python
from loader import Inbox
inbox = Inbox(".")                     # this folder  (or a server URL)
submission = {}
for email in inbox:
    eid = email["email_id"]
    # ... your classify + extract + compare pipeline ...
    submission[eid] = {
        "category": "BL_COMPARISON",
        "status": "MISMATCH",
        "review_reason": None,
        "has_defect": True,
        "defect_fields": ["consignee"],
    }
import json; json.dump(submission, open("submission.json", "w"), indent=2)
```

Match **`sample_submission.json`** exactly (every email_id present).

## Scoring

You don't have the ground truth. Either:
- the organizers run `score_cli.py submission.json` for you, **or**
- if they gave you the HTTP server URL:
  ```python
  inbox = Inbox("http://<host>:8080")
  print(inbox.submit(submission)["final_score"])
  ```

Final score = 50% end-to-end (defects caught all the way through) + 30% Stage-1
macro-F1 + 20% Stage-3 defect-F1. `NEEDS_REVIEW` handling is reported as a
separate reliability axis.
