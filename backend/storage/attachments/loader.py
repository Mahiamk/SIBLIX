#!/usr/bin/env python3
"""
loader.py — one-import access to the SDOC hackathon inbox (participants).

Works two ways with the same API:

  # A) local files (static bundle):
  from loader import Inbox
  inbox = Inbox("data")                 # folder with inbox/ + attachments/
  for email in inbox:
      print(email["email_id"], email["subject"])
      for path in email["attachments"]:
          text = inbox.read_text(path)  # SI/BL .txt content

  # B) the HTTP server (docker):
  inbox = Inbox("http://localhost:8080")
  ...                                    # identical loop

No third-party dependencies for the plain-text path (only stdlib). Reading
PDF/DOCX/XLSX attachments is up to your pipeline — see read_bytes().

You do NOT have ground truth. Produce a submission dict shaped like
sample_submission.json and either score it with score_cli.py (if organizers
gave you a ground_truth.json) or POST it to the server's /submit.
"""
import json
import os
import urllib.request
from pathlib import Path


class Inbox:
    def __init__(self, source):
        self.source = source.rstrip("/")
        self.is_http = self.source.startswith("http://") or self.source.startswith("https://")

    # -- listing ---------------------------------------------------------
    def emails(self):
        """Return the list of email records (dicts)."""
        if self.is_http:
            return self._get_json("/emails")
        inbox_dir = Path(self.source) / "inbox"
        return [json.loads(p.read_text())
                for p in sorted(inbox_dir.glob("email_*.json"))]

    def __iter__(self):
        return iter(self.emails())

    def get(self, email_id):
        if self.is_http:
            return self._get_json(f"/emails/{email_id}")
        return json.loads((Path(self.source) / "inbox" / f"{email_id}.json").read_text())

    # -- attachments -----------------------------------------------------
    def read_bytes(self, att_path):
        """Raw bytes of an attachment. att_path is the string exactly as it
        appears in email['attachments'] (e.g. 'attachments/email_004_SI.txt')."""
        if self.is_http:
            return self._get_bytes("/" + att_path.lstrip("/"))
        return (Path(self.source) / att_path).read_bytes()

    def read_text(self, att_path, encoding="utf-8"):
        return self.read_bytes(att_path).decode(encoding, errors="replace")

    # -- submission ------------------------------------------------------
    def submit(self, submission):
        """POST a submission to the server and return the scoreboard. HTTP only."""
        if not self.is_http:
            raise RuntimeError("submit() needs an HTTP source; run the docker server")
        data = json.dumps(submission).encode()
        req = urllib.request.Request(self.source + "/submit", data=data,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    def sample_submission(self):
        if self.is_http:
            return self._get_json("/sample_submission")
        return json.loads((Path(self.source) / "sample_submission.json").read_text())

    # -- http helpers ----------------------------------------------------
    def _get_json(self, path):
        with urllib.request.urlopen(self.source + path) as r:
            return json.loads(r.read())

    def _get_bytes(self, path):
        with urllib.request.urlopen(self.source + path) as r:
            return r.read()


if __name__ == "__main__":
    # tiny smoke test / demo against a local bundle
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else "data"
    inbox = Inbox(src)
    ems = inbox.emails()
    print(f"{len(ems)} emails from {src}")
    docs = [e for e in ems if e["attachments"]]
    print(f"{len(docs)} have attachments; example: {docs[0]['email_id']}")
    for a in docs[0]["attachments"]:
        head = inbox.read_text(a)[:60].replace("\n", " ") if a.endswith(".txt") else "(binary)"
        print(f"  {a}: {head}")
