import os
import base64
import httpx
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.api.auth import get_current_user, require_auth
from app.database.connection import get_session
from app.models.email import Email
from app.models.document import Document
from app.models.shipment import ShipmentField
from app.services.scoping import can_user_access

router = APIRouter(prefix="/documents", tags=["documents"])

# In-memory cache for ultra-fast instant replays of generated briefings
_BRIEFING_AUDIO_CACHE: dict[str, bytes] = {}


class BriefingAudioRequest(BaseModel):
    email_id: str
    text: str
    voice: Optional[str] = "Aoede"  # Aoede, Fenrir, Charon, Kore, Puck


@router.post("/briefing-audio")
async def generate_briefing_audio(req: BriefingAudioRequest):
    """Generate high-fidelity neural audio briefing using Gemini TTS.
    
    Caches audio by shipment ID and text hash so repeated clicks play instantly (0ms).
    """
    clean_text = req.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice_name = req.voice or "Aoede"
    cache_key = f"{req.email_id}:{voice_name}:{hash(clean_text)}"
    if cache_key in _BRIEFING_AUDIO_CACHE:
        return Response(content=_BRIEFING_AUDIO_CACHE[cache_key], media_type="audio/wav")

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in backend/.env")

    # Use Gemini 3.8 Flash Lite TTS (ultra-fast neural speech)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent?key={key}"
    payload = {
        "contents": [{"parts": [{"text": clean_text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name
                    }
                }
            }
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code != 200:
                # Fallback to standard 3.8 Flash TTS
                fallback_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key={key}"
                r = await client.post(fallback_url, json=payload)
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Gemini TTS generation failed: {r.text[:200]}")

            data = r.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise HTTPException(status_code=502, detail="No audio candidates returned by Gemini")

            part = candidates[0].get("content", {}).get("parts", [])[0]
            b64_data = part.get("inlineData", {}).get("data", "")
            if not b64_data:
                raise HTTPException(status_code=502, detail="No inline audio data found in Gemini response")

            audio_bytes = base64.b64decode(b64_data)
            _BRIEFING_AUDIO_CACHE[cache_key] = audio_bytes
            return Response(content=audio_bytes, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Gemini audio: {e}")


@router.get("/{email_id}", dependencies=[Depends(require_auth)])
def get_documents(
    email_id: str,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    email = session.exec(select(Email).where(Email.email_id == email_id)).first()
    if not email or not can_user_access(email, user):
        raise HTTPException(status_code=404, detail="Email not found")

    docs = session.exec(select(Document).where(Document.email_id == email_id)).all()
    if not docs:
        raise HTTPException(status_code=404, detail="No documents for this email")
    out = []
    for d in docs:
        sf = session.exec(select(ShipmentField).where(ShipmentField.document_id == d.id)).first()
        out.append({
            "filename": d.filename,
            "document_type": d.document_type,
            "readable": d.readable,
            "used_ocr": d.used_ocr,
            "extracted_text": d.extracted_text,
            "fields": sf.model_dump(exclude={"id", "document_id"}) if sf else None,
        })
    return out
