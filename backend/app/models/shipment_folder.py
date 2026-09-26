from datetime import datetime
import json
from typing import Optional, List

from sqlmodel import SQLModel, Field


class ShipmentFolder(SQLModel, table=True):
    __tablename__ = "shipment_folders"

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_ref: str = Field(index=True, unique=True)  # Canonical folder ref (Booking No / BL No / SHP-email_001)
    owner: Optional[str] = Field(default=None, index=True)         # username of creator/uploader
    organization: Optional[str] = Field(default=None, index=True)  # organization sharing scope
    
    booking_number: Optional[str] = Field(default=None, index=True)
    bl_number: Optional[str] = Field(default=None, index=True)
    lc_number: Optional[str] = Field(default=None, index=True)  # Letter of Credit / Permit reference
    
    shipper_name: Optional[str] = None
    consignee_name: Optional[str] = None
    
    status: str = Field(default="PENDING")  # PENDING | PROCESSING | OK | MISMATCH | NEEDS_REVIEW
    has_defect: bool = False
    defect_fields: str = "[]"  # JSON list of fields with cross-document conflicts
    review_reason: Optional[str] = None
    
    # Summary of documents in this folder (e.g., ["SI", "BL", "INVOICE"])
    document_types: str = "[]"
    
    # Regulatory compliance status
    regulatory_status: str = Field(default="NOT_APPLICABLE")  # NOT_APPLICABLE | COMPLIANT | NON_COMPLIANT
    regulatory_defects: str = "[]"  # JSON list of regulatory rule defects

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def defect_fields_list(self) -> List[str]:
        try:
            return json.loads(self.defect_fields or "[]")
        except Exception:
            return []

    def regulatory_defects_list(self) -> List[str]:
        try:
            return json.loads(self.regulatory_defects or "[]")
        except Exception:
            return []

    def document_types_list(self) -> List[str]:
        try:
            return json.loads(self.document_types or "[]")
        except Exception:
            return []

    @staticmethod
    def encode_list(items) -> str:
        return json.dumps(items or [])

