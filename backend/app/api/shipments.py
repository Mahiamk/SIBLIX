"""
api/shipments.py — REST endpoints for Master Shipment Entities & Folders

Exposes multi-document shipment entities containing transport documents (SI, BL),
commercial documents (Invoice, Packing List), and regulatory documents (COO, Bank Permits),
along with their multi-document consistency graph matrix.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.auth import get_current_user, require_auth
from app.database.connection import get_session
from app.models.shipment_folder import ShipmentFolder
from app.models.document import Document
from app.models.shipment import ShipmentField
from app.models.email import Email
from app.services.graph_comparator import compare_document_graph
from app.services.scoping import get_scope_filter, can_user_access

router = APIRouter(prefix="/shipments", tags=["shipments"], dependencies=[Depends(require_auth)])


@router.get("")
def list_shipments(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Lists all master shipment folders with their document summary and status scoped to user."""
    query = select(ShipmentFolder).where(get_scope_filter(ShipmentFolder, user))
    if status:
        query = query.where(ShipmentFolder.status == status)
    query = query.order_by(ShipmentFolder.id.desc()).offset(offset).limit(limit)
    rows = session.exec(query).all()

    # Pre-fetch document counts per shipment
    docs = session.exec(select(Document.id, Document.shipment_id)).all()
    count_by_shipment = {}
    for d in docs:
        if d.shipment_id:
            count_by_shipment[d.shipment_id] = count_by_shipment.get(d.shipment_id, 0) + 1

    return [
        {
            "id": r.id,
            "shipment_ref": r.shipment_ref,
            "booking_number": r.booking_number,
            "bl_number": r.bl_number,
            "lc_number": r.lc_number,
            "shipper_name": r.shipper_name,
            "consignee_name": r.consignee_name,
            "status": r.status,
            "has_defect": r.has_defect,
            "defect_fields": r.defect_fields_list(),
            "review_reason": r.review_reason,
            "document_types": r.document_types_list(),
            "document_count": count_by_shipment.get(r.id, 0),
            "regulatory_status": getattr(r, "regulatory_status", "NOT_APPLICABLE") or "NOT_APPLICABLE",
            "regulatory_defects": r.regulatory_defects_list(),
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.get("/{shipment_id}")
def get_shipment_detail(
    shipment_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Returns full multi-document folder detail including all attached documents,
    extracted fields, and the multi-document graph consistency matrix."""
    folder = session.get(ShipmentFolder, shipment_id)
    if not folder or not can_user_access(folder, user):
        raise HTTPException(status_code=404, detail="Shipment folder not found")

    docs = session.exec(select(Document).where(Document.shipment_id == folder.id)).all()
    emails = session.exec(select(Email).where(Email.shipment_id == folder.id)).all()

    doc_items = []
    graph_docs = []
    for d in docs:
        sf = session.exec(select(ShipmentField).where(ShipmentField.document_id == d.id)).first()
        fields_dict = {}
        if sf:
            fields_dict = {
                "shipper": sf.shipper,
                "consignee": sf.consignee,
                "notify_party": sf.notify_party,
                "port_of_loading": sf.port_loading,
                "port_of_discharge": sf.port_discharge,
                "container_count": sf.container_count,
                "gross_weight_kg": sf.gross_weight,
            }
        doc_items.append({
            "id": d.id,
            "filename": d.filename,
            "document_type": d.document_type,
            "readable": d.readable,
            "used_ocr": d.used_ocr,
            "storage_path": d.storage_path,
            "fields": fields_dict,
        })
        graph_docs.append({
            "path": d.filename,
            "doc_type": d.document_type or "UNKNOWN",
            "fields": fields_dict,
            "readable": d.readable,
            "used_ocr": d.used_ocr,
        })

    # Evaluate dynamic multi-document consistency graph
    folder_meta = {
        "shipment_ref": folder.shipment_ref,
        "booking_number": folder.booking_number,
        "bl_number": folder.bl_number,
        "lc_number": folder.lc_number,
        "shipper_name": folder.shipper_name,
        "consignee_name": folder.consignee_name,
    }
    graph_result = compare_document_graph(graph_docs, folder_meta=folder_meta)

    return {
        "folder": {
            "id": folder.id,
            "shipment_ref": folder.shipment_ref,
            "booking_number": folder.booking_number,
            "bl_number": folder.bl_number,
            "lc_number": folder.lc_number,
            "shipper_name": folder.shipper_name,
            "consignee_name": folder.consignee_name,
            "status": folder.status,
            "has_defect": folder.has_defect,
            "defect_fields": folder.defect_fields_list(),
            "regulatory_status": folder.regulatory_status,
            "regulatory_defects": folder.regulatory_defects_list(),
            "review_reason": folder.review_reason,
            "document_types": folder.document_types_list(),
            "created_at": folder.created_at,
            "updated_at": folder.updated_at,
        },
        "documents": doc_items,
        "emails": [
            {
                "email_id": e.email_id,
                "subject": e.subject,
                "from": e.sender,
                "category": e.category,
                "status": e.status,
            }
            for e in emails
        ],
        "graph_matrix": {
            "pairwise_matrix": graph_result.get("pairwise_matrix", []),
            "consensus_fields": graph_result.get("consensus_fields", {}),
            "defect_fields": graph_result.get("defect_fields", []),
            "status": graph_result.get("status"),
        },
        "regulatory_compliance": graph_result.get("regulatory_compliance"),
    }


@router.get("/{shipment_id}/regulatory-audit")
def get_regulatory_audit_report(
    shipment_id: int,
    session: Session = Depends(get_session),
):
    """Generates an Ethiopian Regulatory Compliance & Pre-Clearance Audit Report.

    Evaluates:
    1. L/C & Bank Permit validation (invoice amount vs LC amount, LC citation in BL remarks)
    2. HS Code Consistency across CoO, Invoice, and BL
    3. Weight Tolerance Gate (BL vs Packing List within 0.5%)
    4. Bank Endorsement / Consignment Compliance (UCP 600 & NBE Directives)
    """
    folder = session.get(ShipmentFolder, shipment_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Shipment folder not found")

    docs = session.exec(select(Document).where(Document.shipment_id == folder.id)).all()
    graph_docs = []
    for d in docs:
        sf = session.exec(select(ShipmentField).where(ShipmentField.document_id == d.id)).first()
        fields_dict = {}
        if sf:
            fields_dict = {
                "shipper": sf.shipper,
                "consignee": sf.consignee,
                "notify_party": sf.notify_party,
                "port_of_loading": sf.port_loading,
                "port_of_discharge": sf.port_discharge,
                "container_count": sf.container_count,
                "gross_weight_kg": sf.gross_weight,
            }
        graph_docs.append({
            "path": d.filename,
            "doc_type": d.document_type or "UNKNOWN",
            "fields": fields_dict,
            "readable": d.readable,
            "used_ocr": d.used_ocr,
        })

    folder_meta = {
        "shipment_ref": folder.shipment_ref,
        "booking_number": folder.booking_number,
        "bl_number": folder.bl_number,
        "lc_number": folder.lc_number,
        "shipper_name": folder.shipper_name,
        "consignee_name": folder.consignee_name,
    }

    from app.services.ethiopian_rules import validate_ethiopian_regulations
    audit_report = validate_ethiopian_regulations(graph_docs, folder_meta=folder_meta)

    return {
        "shipment_id": folder.id,
        "shipment_ref": folder.shipment_ref,
        "booking_number": folder.booking_number,
        "bl_number": folder.bl_number,
        "lc_number": folder.lc_number,
        "audit_timestamp": folder.updated_at,
        "report": audit_report,
    }
