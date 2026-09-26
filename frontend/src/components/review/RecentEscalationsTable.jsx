import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { Button } from '../ui/Button';
import { StatusPill } from '../ui/StatusPill';
import { REASONS } from '../../constants/taxonomy';

/**
 * Extracts or infers a booking reference from the email data
 */
export function getBookingRef(email) {
  if (!email) return 'N/A';
  if (email.si?.booking_number) return email.si.booking_number;
  if (email.bl?.booking_number) return email.bl.booking_number;
  if (email.shipmentId) return `SHP-${email.shipmentId}`;

  // Check subject for booking pattern
  const subjectMatch = email.subject?.match(/(?:booking|b\/l|bl|ref)[:\s#]*([A-Z0-9_-]{5,15})/i);
  if (subjectMatch) return subjectMatch[1].toUpperCase();

  // Check attachment filenames
  const attMatch = email.atts?.find((a) =>
    (a.name || a.filename)?.match(/(?:SI_|BL_|draft_)([A-Z0-9]{5,15})/i)
  );
  if (attMatch) {
    const m = (attMatch.name || attMatch.filename).match(/(?:SI_|BL_|draft_)([A-Z0-9]{5,15})/i);
    if (m) return m[1].toUpperCase();
  }

  // Check body for booking pattern
  const bodyMatch = email.body?.match(/(?:booking|ref)[:\s#]*([A-Z0-9_-]{5,15})/i);
  if (bodyMatch) return bodyMatch[1].toUpperCase();

  // Fallback cleanly formatted
  const idClean = email.id ? email.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() : '789012';
  return `BK-${idClean}`;
}

/**
 * Builds the side-by-side snippet for an escalation
 */
export function getSnippet(email) {
  const reason = email.reviewReason || (email.status === 'NEEDS_REVIEW' ? 'unreadable' : null);

  if (reason === 'missing_attachment') {
    const siName = email.atts?.find((a) => a.type === 'SI')?.name || email.atts?.[0]?.name || 'SI_submission.pdf';
    return {
      field: 'Draft B/L Document',
      siLabel: 'SI Document',
      siValue: `Attached: ${siName} (Verified)`,
      blLabel: 'Carrier Draft B/L',
      blValue: 'Missing attachment in carrier email',
      isMissing: true,
      hint: 'Carrier did not attach the draft bill of lading file',
    };
  }

  if (reason === 'unreadable') {
    const blAtt = email.atts?.find((a) => a.type === 'BL') || email.atts?.[1] || email.atts?.[0];
    const excerpt = blAtt?.excerpt?.[0] || 'Scan quality low (<150 DPI) — OCR text unreadable';
    return {
      field: 'OCR Scan Fidelity',
      siLabel: 'SI Declared Entity',
      siValue: email.si?.shipper || email.si?.consignee || 'SI text parsed cleanly (300 DPI)',
      blLabel: 'B/L Scan Quality',
      blValue: excerpt.length > 55 ? `${excerpt.slice(0, 55)}...` : excerpt,
      isUnreadable: true,
      hint: 'Resolution too degraded for automated verification confidence (>90%)',
    };
  }

  if (reason === 'wrong_doc_type') {
    const wrongDoc = email.atts?.find((a) => a.type !== 'SI' && a.type !== 'BL')?.name || 'commercial_invoice.pdf';
    return {
      field: 'Doc Type Classification',
      siLabel: 'Valid SI Attached',
      siValue: 'Shipping Instruction (Verified)',
      blLabel: 'Enclosed Attachment',
      blValue: `Disallowed: ${wrongDoc}`,
      isWrongDoc: true,
      hint: 'Enclosed file is not recognized as a carrier draft B/L',
    };
  }

  if (reason === 'missing_value') {
    const missingField = email.defectFields?.[0] || 'container_count';
    const fieldLabel = missingField.replace(/_/g, ' ').toUpperCase();
    return {
      field: fieldLabel,
      siLabel: `SI ${fieldLabel}`,
      siValue: email.si?.[missingField] !== undefined ? String(email.si[missingField]) : 'Declared in SI',
      blLabel: `B/L ${fieldLabel}`,
      blValue: 'Omitted / Field blank on carrier draft',
      isMissingValue: true,
      hint: `Mandatory field ${fieldLabel} was omitted by the carrier`,
    };
  }

  // If there are defect fields (e.g. Mismatches)
  if (email.defectFields && email.defectFields.length > 0) {
    const f = email.defectFields[0];
    const fieldLabel = f.replace(/_/g, ' ').toUpperCase();
    const siVal = email.si?.[f] !== undefined ? String(email.si[f]) : 'Not specified';
    const blVal = email.bl?.[f] !== undefined ? String(email.bl[f]) : 'Not specified';
    return {
      field: fieldLabel,
      siLabel: `SI: ${fieldLabel}`,
      siValue: siVal,
      blLabel: `BL: ${fieldLabel}`,
      blValue: blVal,
      isMismatch: true,
      hint: 'Values conflict between customer instruction and carrier draft',
    };
  }

  // Evidence fallback
  if (email.evidence && email.evidence.length > 0) {
    const siEv = email.evidence.find((e) => e.doc === 'SI');
    const blEv = email.evidence.find((e) => e.doc === 'BL');
    return {
      field: email.evidence[0].field || 'Shipment Entity',
      siLabel: 'SI Evidence',
      siValue: siEv?.text || 'SI records on file',
      blLabel: 'BL Evidence',
      blValue: blEv?.text || 'BL variance detected',
      hint: 'Extracted text difference detected between sources',
    };
  }

  return {
    field: 'Shipment Verification',
    siLabel: 'SI Record',
    siValue: email.si?.shipper || 'Standard SI terms verified',
    blLabel: 'BL Record',
    blValue: email.bl?.shipper || 'Pending carrier clarification',
    hint: 'Discrepancy flagged during automated cross-check',
  };
}

export function RecentEscalationsTable({ isHighlighted = false }) {
  const {
    emails,
    submitReviewDecision,
    setSelectedEmailId,
    setActiveTab,
  } = useApp();

  const [filterMode, setFilterMode] = useState('urgent'); // 'urgent' (19) | 'all' (68)
  const [selectedReason, setSelectedReason] = useState('ALL');
  const [submittingIds, setSubmittingIds] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);

  // Urgent escalations (NEEDS_REVIEW)
  const urgentEscalations = useMemo(() => {
    return emails.filter((e) => e.status === 'NEEDS_REVIEW');
  }, [emails]);

  // All review queue items (NEEDS_REVIEW + MISMATCH = 68)
  const allReviewItems = useMemo(() => {
    return emails.filter((e) => e.status === 'NEEDS_REVIEW' || e.status === 'MISMATCH');
  }, [emails]);

  // Active list based on tab
  const baseItems = filterMode === 'urgent' ? urgentEscalations : allReviewItems;

  // Filtered by specific escalation reason if selected
  const displayItems = useMemo(() => {
    if (selectedReason === 'ALL') return baseItems;
    return baseItems.filter((e) => {
      const reason = e.reviewReason || (e.status === 'NEEDS_REVIEW' ? 'unreadable' : 'mismatch');
      return reason === selectedReason;
    });
  }, [baseItems, selectedReason]);

  const handleSelectEmail = (emailId) => {
    setSelectedEmailId(emailId);
    setActiveTab('detail');
  };

  const handleApproveOverride = async (e, emailId) => {
    e.stopPropagation();
    setSubmittingIds((prev) => ({ ...prev, [emailId]: 'approve' }));
    try {
      await submitReviewDecision(emailId, {
        action: 'approve',
        decision: 'approve',
        action_taken: 'MANUAL_OVERRIDE_APPROVED',
        audit_reason_code: 'PHONE_CONFIRMATION_NBE',
        notes: 'Operator manual override approved via Quick Action Desk (Phone Confirmation NBE)',
      });
    } catch {
      // toast already handled by submitReviewDecision
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [emailId]: null }));
    }
  };

  const handleRequestResubmission = async (e, emailId) => {
    e.stopPropagation();
    setSubmittingIds((prev) => ({ ...prev, [emailId]: 'reject' }));
    try {
      await submitReviewDecision(emailId, {
        action: 'reject',
        decision: 'reject',
        action_taken: 'REJECTED_TO_SHIPPER',
        audit_reason_code: 'DEFECT_STANDS_UNRESOLVED',
        notes: 'Operator rejected release to shipper due to unresolved discrepancy',
      });
    } catch {
      // toast already handled by submitReviewDecision
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [emailId]: null }));
    }
  };

  const renderReasonBadge = (email) => {
    const reasonKey = email.reviewReason || (email.status === 'NEEDS_REVIEW' ? 'unreadable' : 'mismatch');
    const meta = REASONS[reasonKey] || {
      label: reasonKey === 'mismatch' ? 'Field Discrepancy' : reasonKey.replace(/_/g, ' '),
      icon: reasonKey === 'mismatch' ? 'XCircle' : 'WarningCircle',
      color: reasonKey === 'mismatch' ? '#E11D48' : '#D97706',
      bg: reasonKey === 'mismatch' ? '#FFF1F2' : '#FFFBEB',
    };

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border select-none transition-all shadow-xs"
        style={{
          backgroundColor: meta.bg,
          color: meta.color,
          borderColor: `${meta.color}35`,
        }}
      >
        <PhosphorIcon name={meta.icon} size={13} weight="duotone" color={meta.color} />
        <span>{meta.label}</span>
      </span>
    );
  };

  return (
    <div
      id="escalations-table"
      className={`bg-white rounded-2xl border transition-all duration-500 overflow-hidden shadow-card ${
        isHighlighted
          ? 'border-amber-400 ring-4 ring-amber-300/40 shadow-xl'
          : 'border-slate-200/90'
      }`}
    >
      {/* Drawer / Table Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/40 via-white to-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-200/60">
                <PhosphorIcon name="UserFocus" size={18} weight="duotone" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Recent Escalations Requiring Approval
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300/80 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {urgentEscalations.length} Immediate Action
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                ({allReviewItems.length} total in review queue)
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Resolve unreadable terminal scans, missing attachments, and field discrepancies directly with inline authorization or resubmission requests.
            </p>
          </div>

          {/* Quick View Controls & View Full Desk Button */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Filter Toggle: 19 Urgent vs 68 All */}
            <div className="flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('urgent')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterMode === 'urgent'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Urgent Escalations ({urgentEscalations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Review Queue ({allReviewItems.length})
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              iconRight="ArrowRight"
              onClick={() => setActiveTab('reviews')}
              className="text-xs text-slate-700 hover:text-brand-600"
            >
              Open Desk ({allReviewItems.length})
            </Button>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand Drawer' : 'Collapse Drawer'}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <PhosphorIcon name={isCollapsed ? 'CaretDown' : 'CaretUp'} size={15} />
            </button>
          </div>
        </div>

        {/* Reason Filter Chips (when expanded) */}
        {!isCollapsed && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100/80 overflow-x-auto text-[11px]">
            <span className="text-slate-400 font-medium mr-1 shrink-0">Reason:</span>
            {[
              { id: 'ALL', label: 'All Reasons' },
              { id: 'missing_attachment', label: 'Missing Attachment' },
              { id: 'unreadable', label: 'Unreadable Scan' },
              { id: 'wrong_doc_type', label: 'Wrong Doc Type' },
              { id: 'missing_value', label: 'Missing Field' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedReason(tab.id)}
                className={`px-2.5 py-0.5 rounded-full border shrink-0 transition-all font-medium ${
                  selectedReason === tab.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drawer Body / Table Content */}
      {!isCollapsed && (
        <div className="divide-y divide-slate-100 overflow-x-auto">
          {displayItems.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <PhosphorIcon name="CheckCircle" size={20} weight="duotone" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">
                No active escalations in this category
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                All high-priority discrepancies have been cleared or approved by the operations team.
              </p>
            </div>
          ) : (
            <div className="min-w-[850px]">
              {/* Table Column Headers */}
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <div className="col-span-3">Email ID / Booking #</div>
                <div className="col-span-2">Escalation Reason</div>
                <div className="col-span-4">Side-by-Side Comparison Snippet</div>
                <div className="col-span-3 text-right">Quick Actions</div>
              </div>

              {/* Rows */}
              {displayItems.slice(0, 8).map((email) => {
                const bookingRef = getBookingRef(email);
                const snippet = getSnippet(email);
                const isSubmittingApprove = submittingIds[email.id] === 'approve';
                const isSubmittingReject = submittingIds[email.id] === 'reject';
                const isExpanded = expandedRowId === email.id;

                return (
                  <div
                    key={email.id}
                    className="hover:bg-slate-50/70 transition-colors px-5 py-3.5 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Col 1: Email ID / Booking # */}
                      <div className="col-span-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectEmail(email.id)}
                            className="font-mono text-xs font-bold text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1 group text-left"
                            title="Open full shipment verification detail"
                          >
                            <span>{email.id}</span>
                            <PhosphorIcon
                              name="ArrowUpRight"
                              size={11}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </button>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {bookingRef}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 font-medium truncate" title={email.subject}>
                          {email.subject}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                          <span className="truncate max-w-[130px]">{email.from || email.sender}</span>
                          <span>•</span>
                          <span>{email.date}</span>
                        </div>
                      </div>

                      {/* Col 2: Escalation Reason */}
                      <div className="col-span-2 space-y-1">
                        {renderReasonBadge(email)}
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {snippet.hint}
                        </p>
                      </div>

                      {/* Col 3: Side-by-side snippet */}
                      <div className="col-span-4">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            <span>{snippet.field}</span>
                            <StatusPill status={email.status} size="sm" />
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {/* SI Column */}
                            <div className="p-1.5 rounded-lg bg-white border border-slate-200/60 min-w-0">
                              <span className="block text-[9px] font-bold text-emerald-700 uppercase">
                                {snippet.siLabel || 'SI Declared'}
                              </span>
                              <span className="font-mono text-slate-800 block truncate font-medium mt-0.5" title={snippet.siValue}>
                                {snippet.siValue}
                              </span>
                            </div>

                            {/* BL Column */}
                            <div
                              className={`p-1.5 rounded-lg border min-w-0 ${
                                snippet.isMissing || snippet.isUnreadable || snippet.isWrongDoc
                                  ? 'bg-rose-50/70 border-rose-200/70'
                                  : 'bg-amber-50/70 border-amber-200/70'
                              }`}
                            >
                              <span
                                className={`block text-[9px] font-bold uppercase ${
                                  snippet.isMissing || snippet.isUnreadable || snippet.isWrongDoc
                                    ? 'text-rose-700'
                                    : 'text-amber-800'
                                }`}
                              >
                                {snippet.blLabel || 'Carrier Draft B/L'}
                              </span>
                              <span
                                className={`font-mono block truncate font-semibold mt-0.5 ${
                                  snippet.isMissing || snippet.isUnreadable || snippet.isWrongDoc
                                    ? 'text-rose-900'
                                    : 'text-amber-900'
                                }`}
                                title={snippet.blValue}
                              >
                                {snippet.blValue}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Col 4: Inline Quick Buttons */}
                      <div className="col-span-3 flex items-center justify-end gap-2">
                        {/* Approve Override button */}
                        <Button
                          variant="outline"
                          size="sm"
                          icon="CheckCircle"
                          loading={isSubmittingApprove}
                          disabled={isSubmittingApprove || isSubmittingReject}
                          onClick={(e) => handleApproveOverride(e, email.id)}
                          className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300/80 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-400 font-medium py-1.5 px-2.5 shadow-xs"
                          title="Authorize and approve shipment override"
                        >
                          Approve Override
                        </Button>

                        {/* Request Resubmission button */}
                        <Button
                          variant="outline"
                          size="sm"
                          icon="ArrowsClockwise"
                          loading={isSubmittingReject}
                          disabled={isSubmittingApprove || isSubmittingReject}
                          onClick={(e) => handleRequestResubmission(e, email.id)}
                          className="text-xs bg-rose-50 text-rose-700 border-rose-300/80 hover:bg-rose-100 hover:text-rose-800 hover:border-rose-400 font-medium py-1.5 px-2.5 shadow-xs"
                          title="Flag and request resubmission from carrier or customer"
                        >
                          Request Resubmission
                        </Button>

                        {/* Expand toggle */}
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(isExpanded ? null : email.id)}
                          title="Toggle email body preview"
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        >
                          <PhosphorIcon name={isExpanded ? 'CaretUp' : 'CaretDown'} size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Preview Section */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs bg-slate-50/70 p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span className="font-semibold text-slate-700">Email Body & Investigation Context:</span>
                          <button
                            type="button"
                            onClick={() => handleSelectEmail(email.id)}
                            className="text-brand-600 hover:underline font-medium"
                          >
                            Open Detailed Audit & Evidence Explorer →
                          </button>
                        </div>
                        <p className="text-slate-600 font-serif text-xs leading-relaxed italic bg-white p-2.5 rounded-lg border border-slate-200/60">
                          &ldquo;{email.body || 'No text content available in email envelope.'}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Drawer Footer bar */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="font-medium">
            Showing top {Math.min(8, displayItems.length)} of {displayItems.length} items requiring review
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('reviews')}
            className="text-brand-600 hover:text-brand-800 font-semibold text-xs flex items-center gap-1"
          >
            <span>View all in Human Review Desk</span>
            <PhosphorIcon name="ArrowRight" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecentEscalationsTable;
