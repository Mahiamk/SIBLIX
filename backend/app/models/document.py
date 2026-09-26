from typing import Optional

from sqlmodel import SQLModel, Field


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    email_id: str = Field(index=True, foreign_key="emails.email_id")
    shipment_id: Optional[int] = Field(default=None, index=True, foreign_key="shipment_folders.id")
    filename: str
    document_type: Optional[str] = None      # SI | BL | INVOICE | PACKING_LIST | COO | UNKNOWN
    storage_path: str
    extracted_text: Optional[str] = None
    readable: bool = True
    used_ocr: bool = False
