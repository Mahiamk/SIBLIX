import React from 'react';
import { STATUS, FIELDS } from '../../constants/taxonomy';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { Button } from '../ui/Button';

export function DecisionBanner({
  status,
  defectFields = [],
  reviewReason,
  voiceNote,
  reviewNote,
  reviewer,
  reviewedAt,
  onApprove,
  onReject,
  onReprocess,
  loading = false,
}) {
  const isReviewed = status === 'REVIEWED';
  const isRejected = status === 'REJECTED';
  const isOk = status === 'OK' || isReviewed;
  const isMismatch = status === 'MISMATCH';
  const isReview = status === 'NEEDS_REVIEW';

  const statusMeta = STATUS[status] || STATUS.PROCESSING;

  const timeStr = reviewedAt
    ? (() => {
        try {
          return new Date(reviewedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } catch {
          return '';
        }
      })()
    : '';

  return (
    <div
      className="p-5 rounded-2xl border transition-all"
      style={{
        backgroundColor: statusMeta.bg,
        borderColor: statusMeta.border,
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title & Icon */}
        <div className="flex items-start gap-3.5">
          <div
            className="p-2 rounded-xl bg-white shadow-subtle border shrink-0"
            style={{ color: statusMeta.color, borderColor: statusMeta.border }}
          >
            <PhosphorIcon name={statusMeta.icon} size={24} weight="duotone" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight" style={{ color: statusMeta.color }}>
                {statusMeta.label}
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-600">
                Decision Engine v2
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {isReviewed && (
                <span>
                  Human reviewed and approved by <strong className="text-slate-800">{reviewer || 'Operator'}</strong>{timeStr ? ` at ${timeStr}` : ''}.
                  {voiceNote ? (
                    <span className="block mt-1 text-teal-800 font-medium">
                      Voice Note: &ldquo;{voiceNote}&rdquo;
                    </span>
                  ) : reviewNote ? (
                    <span className="block mt-1 text-slate-700">
                      Note: {reviewNote}
                    </span>
                  ) : (
                    ' Shipment cleared for automated release.'
                  )}
                </span>
              )}
              {isRejected && (
                <span>
                  Human reviewed and rejected by <strong className="text-slate-800">{reviewer || 'Operator'}</strong>{timeStr ? ` at ${timeStr}` : ''}.
                  {voiceNote ? (
                    <span className="block mt-1 text-rose-800 font-medium">
                      Voice Note: &ldquo;{voiceNote}&rdquo;
                    </span>
                  ) : reviewNote ? (
                    <span className="block mt-1 text-slate-700">
                      Note: {reviewNote}
                    </span>
                  ) : (
                    ' Shipment defect confirmed. Escalated to carrier/shipper.'
                  )}
                </span>
              )}
              {status === 'OK' && 'All 7 key shipment fields matched between the Shipping Instruction and draft Bill of Lading. Document approved for release.'}
              {isMismatch && `Discrepancy detected in ${defectFields.length} field(s): ${defectFields.map((k) => (FIELDS.find((f) => f.key === k) || {}).label || k).join(', ')}. Action required before release.`}
              {isReview && `Human review required due to: ${reviewReason || 'Uncertain OCR extraction / scan quality'}. Inspect source attachments below.`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {onReprocess && (
            <Button
              variant="outline"
              size="sm"
              icon="ArrowsClockwise"
              loading={loading}
              onClick={onReprocess}
            >
              Re-run
            </Button>
          )}

          {(isMismatch || isReview) && onReject && (
            <Button
              variant="danger"
              size="sm"
              icon="X"
              onClick={onReject}
            >
              Reject
            </Button>
          )}

          {(isMismatch || isReview) && onApprove && (
            <Button
              variant="success"
              size="sm"
              icon="Check"
              onClick={onApprove}
            >
              Approve Release
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DecisionBanner;
