"""
processing.py — bridges the pure pipeline (services/pipeline.py) to the
database. This is what the FastAPI BackgroundTasks worker calls per email.
"""
from datetime import datetime, timezone
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

def get_bundled_storage_root() -> str:
    """Find the directory containing the bundled inbox/*.json dataset files."""
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage")),
        os.path.abspath("backend/storage"),
        os.path.abspath("storage"),
        "/var/task/backend/storage",
    ]
    env_val = os.environ.get("STORAGE_ROOT")
    if env_val:
        candidates.insert(0, os.path.abspath(env_val))
        backend_base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        candidates.insert(1, os.path.abspath(os.path.join(backend_base, env_val.lstrip("./"))))

    for path in candidates:
        if path and os.path.exists(os.path.join(path, "inbox")):
            try:
                jsons = [f for f in os.listdir(os.path.join(path, "inbox")) if f.endswith(".json")]
                if len(jsons) > 0:
                    return os.path.abspath(path)
            except Exception:
                pass
    return candidates[0]


def get_writable_storage_root() -> str:
    """Return a directory path guaranteed to be writable (e.g. /tmp/storage on Vercel)."""
    if os.environ.get("VERCEL"):
        path = "/tmp/storage"
        for sub in ("inbox", "attachments", "processed", "reports"):
            os.makedirs(os.path.join(path, sub), exist_ok=True)
        return path

    candidate = os.environ.get("WRITABLE_STORAGE_ROOT") or resolve_storage_root()
    try:
        os.makedirs(os.path.join(candidate, "inbox"), exist_ok=True)
        os.makedirs(os.path.join(candidate, "attachments"), exist_ok=True)
        test_file = os.path.join(candidate, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return candidate
    except Exception:
        path = "/tmp/storage"
        for sub in ("inbox", "attachments", "processed", "reports"):
            os.makedirs(os.path.join(path, sub), exist_ok=True)
        return path


def resolve_storage_root(override_path: Optional[str] = None) -> str:
    """Robustly resolve storage root, preferring directories that actually exist."""
    if override_path and os.path.exists(override_path):
        return os.path.abspath(override_path)
    return get_bundled_storage_root()


def find_inbox_file(email_id: str) -> Optional[str]:
    """Search for an email JSON across writable (/tmp) and bundled storage roots."""
    candidates = [
        get_writable_storage_root(),
        "/tmp/storage",
        os.environ.get("STORAGE_ROOT", ""),
        get_bundled_storage_root(),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage")),
        os.path.abspath("backend/storage"),
        os.path.abspath("storage"),
    ]
    for root in candidates:
        if root:
            p = os.path.join(root, "inbox", f"{email_id}.json")
            if os.path.exists(p):
                return p
    return None


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
    # search both writable and bundled inbox directories.
    inbox_path = find_inbox_file(email_id) or os.path.join(STORAGE_ROOT, "inbox", f"{email_id}.json")
    with open(inbox_path) as f:
        email_json = json.load(f)

    effective_root = os.path.dirname(os.path.dirname(os.path.abspath(inbox_path))) if inbox_path and os.path.exists(inbox_path) else STORAGE_ROOT
    result = process_email(email_json, effective_root)

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
        folder.updated_at = datetime.now(timezone.utc)
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
    candidates = []
    if storage_root:
        candidates.append(os.path.join(storage_root, "inbox"))
    candidates.append(os.path.join(get_bundled_storage_root(), "inbox"))
    candidates.append("/tmp/storage/inbox")

    inbox_dir = None
    for cand in candidates:
        if cand and os.path.exists(cand):
            try:
                if any(f.endswith(".json") and not f.startswith(".") for f in os.listdir(cand)):
                    inbox_dir = cand
                    break
            except Exception:
                pass

    if not inbox_dir:
        return 0

    created = 0
    updated = 0
    now_utc = datetime.now(timezone.utc)

    # Prefetch all existing emails in a single query to avoid 520 sequential network trips
    existing_map = {e.email_id: e for e in session.exec(select(Email)).all()}

    for fname in sorted(os.listdir(inbox_dir)):
        if not fname.endswith(".json") or fname.startswith("."):
            continue
        try:
            with open(os.path.join(inbox_dir, fname)) as f:
                data = json.load(f)
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        email_id = data.get("email_id") or data.get("id")
        if not email_id:
            if fname.startswith("email_"):
                email_id = os.path.splitext(fname)[0]
            else:
                continue

        existing = existing_map.get(email_id)
        if existing:
            if overwrite:
                existing.sender = data.get("from", "")
                existing.subject = data.get("subject", "")
                existing.body = data.get("body", "")
                existing.status = "PENDING"
                existing.created_at = now_utc
                if owner:
                    existing.owner = owner
                    existing.organization = organization
                session.add(existing)
                updated += 1
            continue
        new_email = Email(
            email_id=email_id,
            owner=owner,
            organization=organization,
            sender=data.get("from", ""),
            subject=data.get("subject", ""),
            body=data.get("body", ""),
            status="PENDING",
            created_at=now_utc,
        )
        session.add(new_email)
        existing_map[email_id] = new_email
        created += 1
    session.commit()
    return created

