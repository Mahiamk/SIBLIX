import json
from typing import Optional

from sqlmodel import SQLModel, Field


class ComparisonResult(SQLModel, table=True):
    __tablename__ = "comparison_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    email_id: str = Field(index=True, foreign_key="emails.email_id")
    status: str                              # OK | MISMATCH | NEEDS_REVIEW
    has_defect: bool = False
    defect_fields: str = "[]"                 # JSON-encoded list[str]
    review_reason: Optional[str] = None       # wrong_doc_type|missing_attachment|unreadable|missing_value

    def defect_fields_list(self):
        return json.loads(self.defect_fields or "[]")

    @staticmethod
    def encode_fields(fields):
        return json.dumps(fields or [])
