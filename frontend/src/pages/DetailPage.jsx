import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { StatusPill } from '../components/ui/StatusPill';
import { CategoryPill } from '../components/ui/CategoryPill';
import { ComparisonTable } from '../components/email/ComparisonTable';
import { DecisionBanner } from '../components/email/DecisionBanner';
import { DocumentCard } from '../components/email/DocumentCard';
import { AuditTimeline } from '../components/email/AuditTimeline';
import { playAudioBriefing, stopAudioBriefing } from '../utils/audioBriefing';

export function DetailPage() {
  const {
    selectedEmail,
    setActiveTab,
    reprocessSingle,
    submitReviewDecision,
    loading,
  } = useApp();

  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [auditReasonCode, setAuditReasonCode] = useState('PHONE_CONFIRMATION_NBE');
  const [notes, setNotes] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [isPlayingNoteAudio, setIsPlayingNoteAudio] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      stopAudioBriefing();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    setNotes('');
    setVoiceNote('');
    setIsListeningVoice(false);
    setIsPlayingNoteAudio(false);
  }, [selectedEmail?.id]);

  const handleToggleAudioBriefing = () => {
    if (isPlayingAudio) {
      stopAudioBriefing();
      setIsPlayingAudio(false);
    } else {
      setIsPlayingAudio(true);
      playAudioBriefing(
        selectedEmail,
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

  const handlePlayVoiceNote = (textToPlay) => {
    if (!textToPlay) return;
    if (window.speechSynthesis) {
      if (isPlayingNoteAudio) {
        window.speechSynthesis.cancel();
        setIsPlayingNoteAudio(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToPlay);
      utterance.rate = 1.0;
      utterance.onstart = () => setIsPlayingNoteAudio(true);
      utterance.onend = () => setIsPlayingNoteAudio(false);
      utterance.onerror = () => setIsPlayingNoteAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!selectedEmail) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="p-3 rounded-2xl bg-slate-100 text-slate-400 w-12 h-12 flex items-center justify-center mx-auto">
          <PhosphorIcon name="FileDashed" size={24} weight="duotone" />
        </div>
        <h3 className="text-base font-semibold text-slate-700">No Email Selected</h3>
        <p className="text-xs text-slate-500">
          Select an email from the inbox to inspect the SI and BL documents.
        </p>
        <Button variant="outline" size="sm" onClick={() => setActiveTab('emails')}>
          Back to Inbox
        </Button>
      </div>
    );
  }

  const handleApprove = () => {
    const extractedVoice =
      voiceNote || (notes.includes('[VOICE NOTE]:') ? notes.split('[VOICE NOTE]:')[1]?.trim() : '');
    submitReviewDecision(selectedEmail.id, {
      action: 'approve',
      decision: 'approve',
      action_taken: 'MANUAL_OVERRIDE_APPROVED',
      audit_reason_code: auditReasonCode,
      notes: notes || `Approved via Deep Verification Inspector [${auditReasonCode}]`,
      voice_note: extractedVoice || undefined,
    });
  };

  const handleReject = () => {
    const extractedVoice =
      voiceNote || (notes.includes('[VOICE NOTE]:') ? notes.split('[VOICE NOTE]:')[1]?.trim() : '');
    submitReviewDecision(selectedEmail.id, {
      action: 'reject',
      decision: 'reject',
      action_taken: 'REJECTED_TO_SHIPPER',
      audit_reason_code: 'DEFECT_STANDS_UNRESOLVED',
      notes: notes || 'Rejected to shipper due to discrepancy via Inspector',
      voice_note: extractedVoice || undefined,
    });
  };

  const handleReprocess = () => {
    reprocessSingle(selectedEmail.id);
  };

  const isReviewed = selectedEmail.status === 'REVIEWED';
  const isRejected = selectedEmail.status === 'REJECTED';
  const isReviewedOrRejected = isReviewed || isRejected;

  const hr = selectedEmail.humanReview;
  const recordedVoiceNote =
    selectedEmail.voiceNote ||
    hr?.voice_note ||
    (selectedEmail.reviewNote?.includes('[VOICE NOTE]:')
      ? selectedEmail.reviewNote.split('[VOICE NOTE]:')[1]?.trim()
      : selectedEmail.reviewNote?.includes('[VOICE OVERRIDE]:')
      ? selectedEmail.reviewNote.split('[VOICE OVERRIDE]:')[1]?.trim()
      : null);

  const recordedNotes =
    selectedEmail.reviewNotes ||
    selectedEmail.reviewNote ||
    hr?.notes ||
    (isReviewed
      ? 'Approved and released by operator.'
      : isRejected
      ? 'Rejected to shipper due to discrepancy.'
      : '');

  const reviewerName =
    selectedEmail.reviewer ||
    hr?.reviewer ||
    'Operations Officer';

  const reviewedTimeRaw =
    selectedEmail.reviewedAt ||
    hr?.resolved_at ||
    hr?.resolvedAt ||
    hr?.created_at;

  const formatReviewedTimestamp = (isoStr) => {
    if (!isoStr) return 'Verified by Operator';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return String(isoStr);
    }
  };
  const reviewedTimestampFormatted = formatReviewedTimestamp(reviewedTimeRaw);

  const effectiveReasonCode =
    selectedEmail.auditReasonCode ||
    hr?.audit_reason_code ||
    (isReviewed ? 'PHONE_CONFIRMATION_NBE' : 'DEFECT_STANDS_UNRESOLVED');

  const actionTakenLabel =
    selectedEmail.actionTaken ||
    hr?.action_taken ||
    (isReviewed ? 'MANUAL_OVERRIDE_APPROVED' : 'REJECTED_TO_SHIPPER');

  const effectiveVerificationHash =
    selectedEmail.verificationHash ||
    hr?.verification_hash;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <button
          onClick={() => setActiveTab('emails')}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors"
        >
          <PhosphorIcon name="ArrowLeft" size={14} weight="duotone" />
          <span>Back to Inbox</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleAudioBriefing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isPlayingAudio
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm animate-pulse'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
            }`}
            title="Read 10-second spoken summary to terminal inspector"
          >
            <PhosphorIcon name={isPlayingAudio ? 'SpeakerHigh' : 'SpeakerSimpleHigh'} size={14} weight="fill" className={isPlayingAudio ? 'text-white' : 'text-amber-600'} />
            <span>{isPlayingAudio ? 'Playing Briefing...' : '10s Audio Briefing'}</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            icon="Code"
            onClick={() => setRawJsonOpen(!rawJsonOpen)}
          >
            {rawJsonOpen ? 'Hide JSON' : 'Raw JSON'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon="ArrowsClockwise"
            loading={loading}
            onClick={handleReprocess}
          >
            Re-run Check
          </Button>
        </div>
      </div>

      {/* Email Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-slate-900">
                {selectedEmail.id}
              </span>
              <CategoryPill category={selectedEmail.category} size="sm" />
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-mono">
                {selectedEmail.date} at {selectedEmail.time}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {selectedEmail.subject}
            </h1>
            <div className="text-xs text-slate-500">
              From: <strong className="text-slate-700">{selectedEmail.from || selectedEmail.sender}</strong>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <StatusPill status={selectedEmail.status} />
            <span className="text-[11px] font-mono text-slate-400">
              Confidence: {Math.round((selectedEmail.conf || 0.95) * 100)}%
            </span>
          </div>
        </div>

        {/* Email Body Snippet */}
        {selectedEmail.body && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-700 leading-relaxed font-sans">
            <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">
              Email Body Content:
            </div>
            {selectedEmail.body}
          </div>
        )}
      </div>

      {/* Raw JSON View (if toggled) */}
      {rawJsonOpen && (
        <Card title="Raw Document Payload (JSON)" icon="Code">
          <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed">
            {JSON.stringify(selectedEmail, null, 2)}
          </pre>
        </Card>
      )}

      {/* HITL Override & Reason Code Selector (if pending operator decision) */}
      {(selectedEmail.status === 'MISMATCH' || selectedEmail.status === 'NEEDS_REVIEW') && (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/90 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-600 text-white">
                <PhosphorIcon name="Scales" size={16} weight="bold" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-900 tracking-tight">
                  Human-in-the-Loop (HITL) Legal Override Protocol
                </h4>
                <p className="text-[11px] text-amber-800/80">
                  Select the authoritative regulatory justification code before releasing or overriding this shipment flag.
                </p>
              </div>
            </div>
            <span className="self-start sm:self-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-200/60 text-amber-900 border border-amber-300">
              Legal &amp; Financial Liability Attached
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-[10px] font-semibold text-amber-900 uppercase tracking-wider mb-1">
                Audit Reason Code (Regulatory Compliance)
              </label>
              <select
                value={auditReasonCode}
                onChange={(e) => setAuditReasonCode(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-amber-300/80 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-medium"
              >
                <option value="PHONE_CONFIRMATION_NBE">PHONE_CONFIRMATION_NBE — Verbal telephone confirmation with National Board / Line</option>
                <option value="AMENDED_PERMIT_RECEIVED">AMENDED_PERMIT_RECEIVED — Revised / amended customs permit or manifest received</option>
                <option value="OCR_READING_CORRECTED">OCR_READING_CORRECTED — OCR extraction typo corrected against physical bill</option>
                <option value="WEIGHT_TOLERANCE_ACCEPTED">WEIGHT_TOLERANCE_ACCEPTED — Accepted statutory weight variance (≤0.8%)</option>
                <option value="ENTITY_ALIAS_CONFIRMED">ENTITY_ALIAS_CONFIRMED — Verified legal entity trade alias / subsidiary</option>
              </select>
            </div>

            <div className="text-[11px] text-amber-800 font-mono bg-white/70 p-2.5 rounded-xl border border-amber-200/60 space-y-1">
              <div><strong className="text-amber-950">Action On Release:</strong> MANUAL_OVERRIDE_APPROVED</div>
              <div><strong className="text-amber-950">Signed Hash Seal:</strong> Computed via SHA-256 upon submission</div>
            </div>
          </div>

          {/* Reviewer Note & Voice Dictation Row */}
          <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
            <label className="block text-[10px] font-semibold text-amber-900 uppercase tracking-wider">
              Operator Justification &amp; Voice Note Override
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Type verbal override reason or click Voice Note to dictate verbal phone clearance..."
                className="flex-1 text-xs px-3 py-2 rounded-xl border border-amber-300/80 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
              />
              <button
                type="button"
                onClick={handleToggleVoiceNote}
                title="Click to speak verbal phone clearance note directly into audit trail"
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                  isListeningVoice
                    ? 'bg-rose-500 text-white border-rose-600 ring-2 ring-rose-500/30 animate-pulse'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                }`}
              >
                <PhosphorIcon
                  name="Microphone"
                  size={14}
                  weight={isListeningVoice ? 'fill' : 'bold'}
                  className={isListeningVoice ? 'text-white animate-bounce' : 'text-amber-700'}
                />
                <span>{isListeningVoice ? 'Listening...' : 'Voice Note'}</span>
              </button>
            </div>
            {voiceNote && (
              <div className="text-[11px] text-teal-800 bg-teal-50/80 px-2.5 py-1 rounded-lg border border-teal-200 flex items-center gap-1.5 font-sans">
                <PhosphorIcon name="CheckCircle" size={13} weight="fill" className="text-teal-600" />
                <span>Captured Voice Note: <strong>&ldquo;{voiceNote}&rdquo;</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Human Reviewed Final Output & Auditable Voice Clearance */}
      {(isReviewedOrRejected || recordedVoiceNote || selectedEmail.humanReview) && (
        <div className="rounded-2xl border bg-gradient-to-br from-teal-50/80 via-white to-slate-50 border-teal-200/90 p-5 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-teal-100">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl text-white shadow-sm ${
                isRejected ? 'bg-rose-600' : 'bg-teal-600'
              }`}>
                <PhosphorIcon name={isRejected ? 'Prohibit' : 'UserCheck'} size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Human Reviewed &amp; Operator Clearance
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 text-teal-800 border border-teal-200">
                    FINAL OUTPUT
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Official human-in-the-loop audit clearance recorded into the tamper-evident ledger.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                <PhosphorIcon name="Clock" size={13} className="text-teal-600" />
                <span>{reviewedTimestampFormatted}</span>
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono uppercase tracking-wide border shadow-2xs ${
                isRejected ? 'bg-rose-600 text-white border-rose-700' : 'bg-teal-600 text-white border-teal-700'
              }`}>
                {actionTakenLabel}
              </span>
            </div>
          </div>

          {/* Voice Note & Spoken Justification Output */}
          <div className="rounded-xl border border-teal-200/70 bg-white p-4 shadow-subtle space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-950">
                <PhosphorIcon name="Microphone" size={16} weight="fill" className="text-teal-600" />
                <span>Voice Note &amp; Verbal Override Record</span>
                {recordedVoiceNote && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-teal-100 text-teal-800 font-mono">
                    Captured Audio
                  </span>
                )}
              </div>
              {recordedVoiceNote && (
                <button
                  type="button"
                  onClick={() => handlePlayVoiceNote(recordedVoiceNote)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors"
                  title="Listen to the voice note spoken aloud"
                >
                  <PhosphorIcon name={isPlayingNoteAudio ? 'SpeakerHigh' : 'SpeakerSimpleHigh'} size={13} weight="fill" />
                  <span>{isPlayingNoteAudio ? 'Playing Audio...' : 'Play Voice Note'}</span>
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-sans">
              <div className="flex items-start gap-2.5">
                <PhosphorIcon name="Quotes" size={20} weight="fill" className="text-teal-500 shrink-0 mt-0.5" />
                <div className="space-y-1 w-full">
                  <div className="font-semibold text-slate-900 text-sm">
                    {recordedVoiceNote ? (
                      <span>&ldquo;{recordedVoiceNote}&rdquo;</span>
                    ) : recordedNotes ? (
                      <span>{recordedNotes}</span>
                    ) : (
                      <span className="text-slate-400 italic">No verbal note attached to this review.</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 font-mono">
                    <span>Operator: <strong className="text-slate-700">{reviewerName}</strong></span>
                    <span>•</span>
                    <span>Timestamp: <strong className="text-slate-700">{reviewedTimestampFormatted}</strong></span>
                    {effectiveReasonCode && (
                      <>
                        <span>•</span>
                        <span>Reason Code: <strong className="text-amber-900 bg-amber-50 px-1 rounded">{effectiveReasonCode}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Regulatory Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-teal-100 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operator / Reviewer</span>
              <span className="font-mono font-semibold text-slate-800">{reviewerName}</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-teal-100 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Regulatory Reason Code</span>
              <span className="font-mono font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block">
                {effectiveReasonCode || 'PHONE_CONFIRMATION_NBE'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-teal-100 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cryptographic SHA-256 Seal</span>
              <span className="font-mono text-[11px] text-emerald-800 truncate block" title={effectiveVerificationHash}>
                {effectiveVerificationHash ? `${effectiveVerificationHash.slice(0, 18)}...` : 'SEAL_VERIFIED'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Decision Summary Banner */}
      <DecisionBanner
        status={selectedEmail.status}
        defectFields={selectedEmail.defectFields}
        reviewReason={selectedEmail.reviewReason}
        voiceNote={recordedVoiceNote}
        reviewNote={recordedNotes}
        reviewer={reviewerName}
        reviewedAt={reviewedTimeRaw}
        onApprove={handleApprove}
        onReject={handleReject}
        onReprocess={handleReprocess}
        loading={loading}
      />

      {/* Side-by-Side Field Comparison (Only for BL_COMPARISON or emails with documents) */}
      <Card
        title="Cross-Document Field Verification (SI vs BL)"
        subtitle="Automated field-by-field verification across 7 core shipment parameters"
        icon="GitDiff"
      >
        <ComparisonTable
          si={selectedEmail.si}
          bl={selectedEmail.bl}
          defectFields={selectedEmail.defectFields}
        />
      </Card>

      {/* Documents & Audit Timeline Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Attachments */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
            <PhosphorIcon name="Paperclip" size={16} weight="duotone" />
            <span>Document Attachments ({selectedEmail.atts ? selectedEmail.atts.length : 0})</span>
          </h3>
          <div className="space-y-3">
            {selectedEmail.atts && selectedEmail.atts.length > 0 ? (
              selectedEmail.atts.map((att, i) => <DocumentCard key={i} doc={att} />)
            ) : (
              <div className="p-6 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No attachments found in this email.
              </div>
            )}
          </div>
        </div>

        {/* AI Audit Trail */}
        <Card
          title="Pipeline Audit Trail"
          subtitle="Execution progression from ingestion to verdict"
          icon="ClockCounterClockwise"
        >
          <AuditTimeline email={selectedEmail} />
        </Card>
      </div>
    </div>
  );
}

export default DetailPage;
