import React, { useState, useRef, useEffect } from 'react';
import { FIELDS } from '../../constants/taxonomy';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { Button } from '../ui/Button';
import { StatusPill } from '../ui/StatusPill';
import { playAudioBriefing, stopAudioBriefing } from '../../utils/audioBriefing';

export function ReviewCard({ email, onResolve, onSelect }) {
  const [correctedValues, setCorrectedValues] = useState({});
  const [notes, setNotes] = useState('');
  const [auditReasonCode, setAuditReasonCode] = useState('PHONE_CONFIRMATION_NBE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      stopAudioBriefing();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleToggleAudioBriefing = () => {
    if (isPlayingAudio) {
      stopAudioBriefing();
      setIsPlayingAudio(false);
    } else {
      setIsPlayingAudio(true);
      playAudioBriefing(
        email,
        () => setIsPlayingAudio(true),
        () => setIsPlayingAudio(false)
      );
    }
  };

  const handleToggleVoiceNote = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech-to-text is not supported in this browser. You can type the justification directly, or speak via the Voxide widget (Alt+V).');
      return;
    }

    if (isListeningVoice) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListeningVoice(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListeningVoice(true);
      };

      recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript;
        if (spoken) {
          setVoiceNote((prev) => (prev ? `${prev} ${spoken}` : spoken));
          setNotes((prev) => (prev ? `${prev} | [VOICE NOTE]: ${spoken}` : `[VOICE NOTE]: ${spoken}`));
        }
      };

      recognition.onerror = (e) => {
        console.warn('Voice transcription error:', e);
        setIsListeningVoice(false);
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition failed to start:', err);
      setIsListeningVoice(false);
    }
  };

  const defectFields = email.defectFields || [];
  const activeFields = defectFields.length > 0 ? defectFields : ['container_count', 'gross_weight_kg'];

  const handleFieldChange = (key, val) => {
    setCorrectedValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleAction = async (decisionType) => {
    setIsSubmitting(true);
    const actionTaken = decisionType === 'approve' ? 'MANUAL_OVERRIDE_APPROVED' : 'REJECTED_TO_SHIPPER';
    const reasonCode = decisionType === 'approve' ? auditReasonCode : 'DEFECT_STANDS_UNRESOLVED';
    const extractedVoice = voiceNote || (notes.includes('[VOICE NOTE]:') ? notes.split('[VOICE NOTE]:')[1]?.trim() : '');
    try {
      await onResolve(email.id, {
        action: decisionType,
        decision: decisionType,
        action_taken: actionTaken,
        audit_reason_code: reasonCode,
        notes: notes || `Operator override [${actionTaken}] under regulatory code ${reasonCode}`,
        voice_note: extractedVoice || undefined,
        corrections: correctedValues,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-card p-5 space-y-4 hover:border-slate-300 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-800">
              {email.id}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">
              {email.from || email.sender}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-400 font-mono">{email.date} {email.time}</span>
          </div>
          <h4
            onClick={() => onSelect(email.id)}
            className="text-sm font-semibold text-slate-900 mt-1 hover:text-brand-600 cursor-pointer"
          >
            {email.subject}
          </h4>
        </div>
        <StatusPill status={email.status} size="sm" />
      </div>

      {/* Discrepancy Alert / Evidence Box */}
      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 space-y-2">
        <div className="flex items-center justify-between font-semibold text-amber-800">
          <div className="flex items-center gap-1.5">
            <PhosphorIcon name="Warning" size={15} weight="duotone" />
            <span>Discrepancy Investigation</span>
          </div>

          <button
            type="button"
            onClick={handleToggleAudioBriefing}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
              isPlayingAudio
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm animate-pulse'
                : 'bg-white hover:bg-amber-100/80 text-amber-900 border-amber-300/80 shadow-xs'
            }`}
            title="Read rapid 10-second spoken summary to terminal inspector"
          >
            <PhosphorIcon name={isPlayingAudio ? 'SpeakerHigh' : 'SpeakerSimpleHigh'} size={14} weight="fill" />
            <span>{isPlayingAudio ? 'Speaking Briefing...' : '10s Audio Briefing'}</span>
          </button>
        </div>
        <p className="text-[11px] text-amber-800/90 leading-relaxed">
          The automated comparison detected conflicting data between the SI and BL. Inspect the values below and determine the authoritative shipping record.
        </p>

        {email.evidence && email.evidence.length > 0 && (
          <div className="mt-2 pt-2 border-t border-amber-200/60 space-y-1 font-mono text-[11px]">
            {email.evidence.map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="px-1 py-0.2 rounded bg-amber-200/60 font-bold text-[10px]">
                  {ev.doc}
                </span>
                <span className="text-amber-900">{ev.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side by side field resolution editor */}
      <div className="space-y-2.5">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
          Conflicting Fields & Correction
        </span>
        <div className="space-y-2">
          {activeFields.map((fieldKey) => {
            const fieldMeta = FIELDS.find((f) => f.key === fieldKey) || { label: fieldKey, icon: 'Package' };
            const siVal = email.si ? email.si[fieldKey] : '—';
            const blVal = email.bl ? email.bl[fieldKey] : '—';

            return (
              <div
                key={fieldKey}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs items-center"
              >
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <PhosphorIcon name={fieldMeta.icon} size={14} weight="duotone" className="text-brand-600" />
                  <span>{fieldMeta.label}</span>
                </div>

                <div className="text-[11px] text-slate-600 font-mono space-y-0.5">
                  <div>SI: <span className="font-semibold text-slate-800">{String(siVal)}</span></div>
                  <div>BL: <span className="font-semibold text-rose-700">{String(blVal)}</span></div>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder={`Override ${fieldMeta.label}...`}
                    defaultValue={String(siVal !== '—' ? siVal : '')}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                    className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* HITL Legal Liability & Regulatory Reason Code Selector */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <PhosphorIcon name="Scales" size={13} weight="duotone" className="text-brand-600" />
            <span>HITL Regulatory Reason Code</span>
          </span>
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded font-medium">
            Carries Legal Liability
          </span>
        </div>
        <select
          value={auditReasonCode}
          onChange={(e) => setAuditReasonCode(e.target.value)}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-medium"
        >
          <option value="PHONE_CONFIRMATION_NBE">PHONE_CONFIRMATION_NBE — Verbal telephone confirmation with National Board / Line</option>
          <option value="AMENDED_PERMIT_RECEIVED">AMENDED_PERMIT_RECEIVED — Revised / amended customs permit or manifest received</option>
          <option value="OCR_READING_CORRECTED">OCR_READING_CORRECTED — OCR extraction typo corrected against physical bill</option>
          <option value="WEIGHT_TOLERANCE_ACCEPTED">WEIGHT_TOLERANCE_ACCEPTED — Accepted statutory weight variance (≤0.8%)</option>
          <option value="ENTITY_ALIAS_CONFIRMED">ENTITY_ALIAS_CONFIRMED — Verified legal entity trade alias / subsidiary</option>
        </select>
      </div>

      {/* Reviewer notes & Auditable Voice Override Justification */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add verification note or verbal phone approval reason..."
          className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
        />

        <button
          type="button"
          onClick={handleToggleVoiceNote}
          title="Hold/click to speak verbal phone justification into audit trail"
          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
            isListeningVoice
              ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-500/20 animate-pulse'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          <PhosphorIcon
            name="Microphone"
            size={14}
            weight={isListeningVoice ? 'fill' : 'bold'}
            className={isListeningVoice ? 'text-rose-600 animate-bounce' : 'text-slate-500'}
          />
          <span>{isListeningVoice ? 'Listening...' : 'Voice Note'}</span>
        </button>
      </div>

      {/* Operator Decision Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button
          onClick={() => onSelect(email.id)}
          className="text-xs text-slate-500 hover:text-brand-600 font-medium flex items-center gap-1"
        >
          <span>Deep Inspect</span>
          <PhosphorIcon name="ArrowRight" size={12} weight="duotone" />
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            icon="X"
            loading={isSubmitting}
            onClick={() => handleAction('reject')}
          >
            Reject Release
          </Button>

          <Button
            variant="success"
            size="sm"
            icon="Check"
            loading={isSubmitting}
            onClick={() => handleAction('approve')}
          >
            Approve & Release
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ReviewCard;
