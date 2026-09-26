from typing import Optional

from sqlmodel import SQLModel, Field


class ShipmentField(SQLModel, table=True):
    __tablename__ = "shipment_fields"

    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(index=True, foreign_key="documents.id")

    shipper: Optional[str] = None
    consignee: Optional[str] = None
    notify_party: Optional[str] = None
    port_loading: Optional[str] = None
    port_discharge: Optional[str] = None
    container_count: Optional[int] = None
    gross_weight: Optional[int] = None
