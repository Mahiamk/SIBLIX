import React from 'react';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export function AuditTimeline({ email }) {
  const steps = [
    {
      title: 'Email Ingestion',
      desc: `Received from ${email.from || email.sender} at ${email.time || '12:00'}`,
      icon: 'EnvelopeSimple',
      status: 'complete',
    },
    {
      title: 'AI Classification',
      desc: `Classified as ${email.category} (${Math.round((email.conf || 0.95) * 100)}% confidence)`,
      icon: 'Sparkle',
      status: 'complete',
    },
    {
      title: 'Document OCR & Extraction',
      desc: email.atts && email.atts.length > 0
        ? `Processed ${email.atts.length} document attachment(s) for 7 shipping fields`
        : 'No PDF attachments detected',
      icon: 'Scan',
      status: email.reviewReason === 'unreadable' ? 'warning' : 'complete',
    },
    {
      title: 'SI vs BL Cross-Comparison',
      desc: email.defectFields && email.defectFields.length > 0
        ? `Discrepancy flagged on: ${email.defectFields.join(', ')}`
        : 'All 7 key shipment fields verified identical',
      icon: 'GitDiff',
      status: email.defectFields && email.defectFields.length > 0 ? 'error' : 'complete',
    },
  ];

  const isHumanReviewed =
    email.status === 'REVIEWED' ||
    email.status === 'REJECTED' ||
    Boolean(email.humanReview) ||
    Boolean(email.voiceNote);

  const voiceNoteText =
    email.voiceNote ||
    email.humanReview?.voice_note ||
    (email.reviewNote && email.reviewNote.includes('[VOICE NOTE]:')
      ? email.reviewNote.split('[VOICE NOTE]:')[1]?.trim()
      : email.reviewNote && email.reviewNote.includes('[VOICE OVERRIDE]:')
      ? email.reviewNote.split('[VOICE OVERRIDE]:')[1]?.trim()
      : null);

  const operatorName = email.reviewer || email.humanReview?.reviewer || 'Operator';
  const timestampText = email.reviewedAt
    ? new Date(email.reviewedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : email.time || '12:00';

  if (isHumanReviewed) {
    steps.push({
      title: 'Human Review & Clearance Verdict',
      desc: `Human Reviewed by ${operatorName} at ${timestampText}${
        voiceNoteText
          ? ` · Voice Note: "${voiceNoteText}"`
          : email.reviewNote
          ? ` · Note: "${email.reviewNote}"`
          : email.status === 'REVIEWED'
          ? ' · Approved & Released'
          : ' · Rejected to Shipper'
      }`,
      icon: 'UserCheck',
      status: email.status === 'REJECTED' ? 'error' : 'complete',
    });
  } else {
    steps.push({
      title: 'Final Decision',
      desc: `Status determined: ${email.status}`,
      icon: 'ShieldCheck',
      status: 'complete',
    });
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
      {steps.map((step, idx) => {
        const isWarning = step.status === 'warning';
        const isError = step.status === 'error';

        const dotColor = isError
          ? 'bg-rose-500 text-white'
          : isWarning
          ? 'bg-amber-500 text-white'
          : 'bg-brand-600 text-white';

        return (
          <div key={idx} className="relative group">
            {/* Step Marker */}
            <div
              className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-sm ${dotColor}`}
            >
              <PhosphorIcon name={step.icon} size={12} weight="duotone" />
            </div>

            {/* Step Details */}
            <div className="text-xs">
              <div className="font-semibold text-slate-800 tracking-tight flex items-center gap-2">
                <span>{step.title}</span>
                {isError && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                    Discrepancy
                  </span>
                )}
                {isWarning && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-600 border border-amber-200">
                    Low Confidence
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                {step.desc}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AuditTimeline;
