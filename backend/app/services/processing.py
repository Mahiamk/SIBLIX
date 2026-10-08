"""
processing.py — bridges the pure pipeline (services/pipeline.py) to the
database. This is what the FastAPI BackgroundTasks worker calls per email.
"""
from datetime import datetime
import json
import os
from typing import Optional, List

from sqlmodel import Session, select

from app.models.email import Email
from app.models.document import Document
from app.models.shipment import ShipmentField
from app.models.shipment_folder import ShipmentFolder
from app.models.discrepancy import ComparisonResult
from app.services import normalizer as norm
from app.services.pipeline import process_email

def resolve_storage_root(override_path: Optional[str] = None) -> str:
    """Robustly resolve the storage root containing 'inbox' and 'attachments'."""
    candidates = []
    if override_path:
        candidates.append(os.path.abspath(override_path))
        candidates.append(override_path)

    env_val = os.environ.get("STORAGE_ROOT")
    if env_val:
        candidates.append(os.path.abspath(env_val))
        backend_base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        candidates.append(os.path.abspath(os.path.join(backend_base, env_val.lstrip("./"))))
        candidates.append(env_val)

    backend_default = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage"))
    candidates.append(backend_default)
    candidates.append(os.path.abspath("backend/storage"))
    candidates.append(os.path.abspath("storage"))

    for path in candidates:
        if path and os.path.exists(os.path.join(path, "inbox")):
            return os.path.abspath(path)

    return backend_default


STORAGE_ROOT = resolve_storage_root()


def process_email_job(session: Session, email_id: str):
    """Load an Email row + its inbox JSON, run the pipeline, and persist
    Document / ShipmentField / ComparisonResult rows. Safe to re-run (clears
    any prior documents/comparison for this email first)."""
    email_row = session.exec(select(Email).where(Email.email_id == email_id)).first()
    if email_row is None:
        raise ValueError(f"Unknown email_id: {email_id}")

    email_row.status = "PROCESSING"
    session.add(email_row)
    session.commit()

    # The raw dataset JSON is the source of truth for subject/body/attachments;
    # the DB row mirrors it for querying.
    current_root = resolve_storage_root(STORAGE_ROOT)
    inbox_path = os.path.join(current_root, "inbox", f"{email_id}.json")
    with open(inbox_path) as f:
        email_json = json.load(f)

    result = process_email(email_json, current_root)

    # --- resolve or create master shipment folder -------------------------
    shipment_ref = result.get("shipment_ref") or f"SHP-{email_id}"
    folder = session.exec(select(ShipmentFolder).where(ShipmentFolder.shipment_ref == shipment_ref)).first()
    
    doc_types = [a["extraction"]["doc_type_guess"] for a in result.get("attachments_meta", [])]
    
    # Try to pick shipper/consignee from extracted fields
    folder_shipper = None
    folder_consignee = None
    for att in result.get("attachments_meta", []):
        f = att["extraction"].get("fields", {})
        if f.get("shipper") and not folder_shipper:
            folder_shipper = f.get("shipper")
        if f.get("consignee") and not folder_consignee:
            folder_consignee = f.get("consignee")

    if folder is None:
        graph_comp = result.get("graph_comparison") or {}
        reg_comp = graph_comp.get("regulatory_compliance") or {}
        folder = ShipmentFolder(
            shipment_ref=shipment_ref,
            owner=email_row.owner,
            organization=email_row.organization,
            booking_number=result.get("booking_number"),
            bl_number=result.get("bl_number"),
            lc_number=result.get("lc_number"),
            shipper_name=folder_shipper,
            consignee_name=folder_consignee,
            status=result["status"],
            has_defect=result["has_defect"],
            defect_fields=ShipmentFolder.encode_list(result["defect_fields"]),
            review_reason=result["review_reason"],
            document_types=ShipmentFolder.encode_list(doc_types),
            regulatory_status=reg_comp.get("status", "NOT_APPLICABLE"),
            regulatory_defects=ShipmentFolder.encode_list(reg_comp.get("regulatory_defects", [])),
        )
        session.add(folder)
        session.commit()
        session.refresh(folder)
    else:
        graph_comp = result.get("graph_comparison") or {}
        reg_comp = graph_comp.get("regulatory_compliance") or {}
        if not folder.owner and email_row.owner:
            folder.owner = email_row.owner
            folder.organization = email_row.organization
        folder.status = result["status"]
        folder.has_defect = result["has_defect"]
        folder.defect_fields = ShipmentFolder.encode_list(result["defect_fields"])
        folder.review_reason = result["review_reason"]
        folder.regulatory_status = reg_comp.get("status", folder.regulatory_status or "NOT_APPLICABLE")
        folder.regulatory_defects = ShipmentFolder.encode_list(reg_comp.get("regulatory_defects", []))
        if folder_shipper and not folder.shipper_name:
            folder.shipper_name = folder_shipper
        if folder_consignee and not folder.consignee_name:
            folder.consignee_name = folder_consignee
        merged_types = list(set(folder.document_types_list() + doc_types))
        folder.document_types = ShipmentFolder.encode_list(merged_types)
        folder.updated_at = datetime.utcnow()
        session.add(folder)
        session.commit()

    # --- persist documents + shipment fields -----------------------------
    # clear any previous run's rows for this email (idempotent re-process)
    doc_ids = [doc.id for doc in session.exec(select(Document).where(Document.email_id == email_id))]
    if doc_ids:
        for sf in session.exec(select(ShipmentField).where(ShipmentField.document_id.in_(doc_ids))):
            session.delete(sf)
        session.flush()
    for doc in session.exec(select(Document).where(Document.email_id == email_id)):
        session.delete(doc)
    for cr in session.exec(select(ComparisonResult).where(ComparisonResult.email_id == email_id)):
        session.delete(cr)
    session.commit()

    for att in result.get("attachments_meta", []):
        extraction = att["extraction"]
        doc = Document(
            email_id=email_id,
            shipment_id=folder.id,
            filename=os.path.basename(att["path"]),
            document_type=extraction["doc_type_guess"],
            storage_path=att["path"],
            extracted_text=extraction["raw_text"][:20000],  # cap for DB sanity
            readable=extraction["readable"],
            used_ocr=extraction["used_ocr"],
        )
        session.add(doc)
        session.commit()
        session.refresh(doc)

        fields = extraction["fields"]
        session.add(ShipmentField(
            document_id=doc.id,
            shipper=fields.get("shipper"),
            consignee=fields.get("consignee"),
            notify_party=fields.get("notify_party"),
            port_loading=fields.get("port_of_loading"),
            port_discharge=fields.get("port_of_discharge"),
            container_count=norm.normalize_int_value(fields.get("container_count")),
            gross_weight=norm.normalize_int_value(fields.get("gross_weight_kg")),
        ))

    # --- persist comparison result ---------------------------------------
    session.add(ComparisonResult(
        email_id=email_id,
        status=result["status"],
        has_defect=result["has_defect"],
        defect_fields=ComparisonResult.encode_fields(result["defect_fields"]),
        review_reason=result["review_reason"],
    ))

    # --- update the email row ---------------------------------------------
    email_row.shipment_id = folder.id
    email_row.category = result["category"]
    email_row.classification_confidence = result["classification_confidence"]
    email_row.status = result["status"]
    session.add(email_row)
    session.commit()

    # --- signed legal audit logging for automated release ----------------
    if result["status"] == "OK":
        try:
            from app.models.audit import ACTION_AUTO_RELEASED, REASON_SYSTEM_CLEARED_MATCH
            from app.services.audit import record_audit

            record_audit(
                session=session,
                action=ACTION_AUTO_RELEASED,
                action_taken=ACTION_AUTO_RELEASED,
                audit_reason_code=REASON_SYSTEM_CLEARED_MATCH,
                operator_id="SYSTEM_PIPELINE",
                user_email="system@siblix.ai",
                description=f"Automated Release: Reconciled SI vs BL for shipment ({email_row.subject[:45]}) with 100% agreement",
                entity_type="SHIPMENT",
                entity_id=email_id,
                owner=email_row.owner or "SYSTEM",
                organization=email_row.organization,
                severity="INFO",
                status="AUTO_APPROVED",
                metadata={
                    "verification_type": "AUTOMATED_7_FIELD_MATCH",
                    "canonical_fields_matched": 7,
                    "confidence": result.get("classification_confidence", 1.0),
                },
            )
        except Exception as e:
            print(f"[Audit Log Warning] Automated release audit failed: {e}")

    return result


def ingest_dataset(
    session: Session,
    storage_root: str = None,
    overwrite: bool = False,
    owner: Optional[str] = None,
    organization: Optional[str] = None,
):
    """Load storage/inbox/*.json files into the emails table with owner and organization scope.
    If overwrite is True, updates existing emails with new subject/body/from
    and resets their status to PENDING so they get re-verified.
    """
    storage_root = resolve_storage_root(storage_root)
    inbox_dir = os.path.join(storage_root, "inbox")
    created = 0
    updated = 0
    if not os.path.exists(inbox_dir):
        return created
    for fname in sorted(os.listdir(inbox_dir)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(inbox_dir, fname)) as f:
            data = json.load(f)
        existing = session.exec(
            select(Email).where(Email.email_id == data["email_id"])
        ).first()
        if existing:
            if overwrite:
                existing.sender = data.get("from", "")
                existing.subject = data.get("subject", "")
                existing.body = data.get("body", "")
                existing.status = "PENDING"
                existing.created_at = datetime.utcnow()
                if owner:
                    existing.owner = owner
                    existing.organization = organization
                session.add(existing)
                updated += 1
            continue
        session.add(Email(
            email_id=data["email_id"],
            owner=owner,
            organization=organization,
            sender=data.get("from", ""),
            subject=data.get("subject", ""),
            body=data.get("body", ""),
            status="PENDING",
        ))
        created += 1
    session.commit()
    return created

