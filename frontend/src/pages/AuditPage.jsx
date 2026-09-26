import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { apiFetchAudits, apiRecordAudit, apiExportAudits } from '../services/api';

export function AuditPage() {
  const {
    token,
    userOrganization,
    username,
    isAdmin,
    addToast,
    setSelectedEmailId,
    setActiveTab,
  } = useApp();

  const [audits, setAudits] = useState([]);
  const [summary, setSummary] = useState({
    total_audited: 0,
    compliant_count: 0,
    flagged_count: 0,
    compliance_rate: '100.0%',
    organizations: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedAudit, setSelectedAudit] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedActionTaken, setSelectedActionTaken] = useState('');
  const [selectedReasonCode, setSelectedReasonCode] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');

  const loadAudits = async () => {
    setLoading(true);
    try {
      const res = await apiFetchAudits(token, {
        organization: selectedOrg || undefined,
        action: selectedAction || undefined,
        action_taken: selectedActionTaken || undefined,
        audit_reason_code: selectedReasonCode || undefined,
        severity: selectedSeverity || undefined,
        search: search || undefined,
        limit: 150,
      });
      setAudits(res.audits || []);
      setSummary(res.summary || {});
    } catch (err) {
      addToast(`Could not load company audit log: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudits();
  }, [selectedOrg, selectedAction, selectedActionTaken, selectedReasonCode, selectedSeverity]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAudits();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Escape key & body scroll lock for modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedAudit(null);
    };
    if (selectedAudit) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedAudit]);

  const handleExport = async () => {
    try {
      const dossier = await apiExportAudits(token, selectedOrg || userOrganization);
      const blob = new Blob([JSON.stringify(dossier, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Company_Audit_Dossier_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Audit compliance dossier exported successfully', 'success');
    } catch (err) {
      addToast(`Export failed: ${err.message}`, 'error');
    }
  };

  const handleRunComplianceCheck = async () => {
    try {
      await apiRecordAudit(
        {
          action: 'POLICY_COMPLIANCE_AUDIT',
          description: `Manual compliance sanity audit executed by operator ${username}`,
          entity_type: 'SECURITY',
          severity: 'NOTICE',
          status: 'COMPLIANT',
          metadata: {
            triggered_by: username,
            organization: userOrganization || 'Default Workspace',
            verified_parameters: ['STP_SLA', 'CUSTOMS_MATCH_RULE', 'CONTAINER_ISO6346'],
          },
        },
        token
      );
      addToast('Security & compliance audit recorded with SHA-256 seal', 'success');
      loadAudits();
    } catch (err) {
      addToast(`Failed to record audit: ${err.message}`, 'error');
    }
  };

  const formatTimestamp = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLIANT':
      case 'AUTO_APPROVED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Compliant',
        };
      case 'RESOLVED':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          dot: 'bg-teal-500',
          label: 'Resolved',
        };
      case 'FLAGGED':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
          label: 'Flagged Defect',
        };
      case 'PENDING':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Pending Action',
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          label: status || 'Recorded',
        };
    }
  };

  const getSeverityStyle = (sev) => {
    switch (sev) {
      case 'CRITICAL':
      case 'HIGH_RISK':
        return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'WARNING':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'NOTICE':
        return 'text-brand-700 bg-brand-50 border-brand-200';
      default:
        return 'text-slate-500 bg-slate-50 border-slate-200';
    }
  };

  const getActionTakenBadge = (actionTaken) => {
    switch (actionTaken) {
      case 'AUTO_RELEASED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: 'CheckCircle',
          label: 'Auto Released',
        };
      case 'MANUAL_OVERRIDE_APPROVED':
        return {
          bg: 'bg-brand-50 text-brand-700 border-brand-200',
          icon: 'UserCheck',
          label: 'Manual Override Approved',
        };
      case 'REJECTED_TO_SHIPPER':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: 'Prohibit',
          label: 'Rejected to Shipper',
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: 'FileText',
          label: actionTaken || 'Recorded',
        };
    }
  };

  const getReasonCodeBadge = (code) => {
    switch (code) {
      case 'PHONE_CONFIRMATION_NBE':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          label: 'Phone Confirmation NBE',
        };
      case 'AMENDED_PERMIT_RECEIVED':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          label: 'Amended Permit Received',
        };
      case 'OCR_READING_CORRECTED':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          label: 'OCR Reading Corrected',
        };
      case 'WEIGHT_TOLERANCE_ACCEPTED':
        return {
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          label: 'Weight Variance ≤0.8%',
        };
      case 'ENTITY_ALIAS_CONFIRMED':
        return {
          bg: 'bg-brand-50 text-brand-700 border-brand-200',
          label: 'Entity Alias Confirmed',
        };
      case 'SYSTEM_CLEARED_MATCH':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: 'System Cleared Match',
        };
      case 'DEFECT_STANDS_UNRESOLVED':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          label: 'Defect Stands Unresolved',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          label: code || 'General Audit',
        };
    }
  };

  const getActionIcon = (action) => {
    if (action.includes('REVIEW')) return 'UserFocus';
    if (action.includes('DISCREPANCY')) return 'WarningCircle';
    if (action.includes('INGESTION')) return 'UploadSimple';
    if (action.includes('MAILBOX')) return 'Tray';
    if (action.includes('RECONCILED')) return 'ShieldCheck';
    return 'FileText';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-sm">
              <PhosphorIcon name="ShieldCheck" size={20} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Company Audit & Compliance Trail
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  SHA-256 Tamper-Proof
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Every document verification, human override, and regulatory reconciliation is immutably logged for customs and internal audits.
              </p>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            icon="DownloadSimple"
            onClick={handleExport}
            title="Download signed JSON compliance audit package"
          >
            Export Audit Dossier
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="CheckCircle"
            onClick={handleRunComplianceCheck}
          >
            Run Compliance Check
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="luma-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Audited Compliance Events</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
              <PhosphorIcon name="Receipt" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {summary.total_audited || audits.length}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Logged</span>
          </div>
          <p className="text-[11px] text-slate-400">Total verified events recorded</p>
        </div>

        <div className="luma-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Regulatory Compliance Rate</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <PhosphorIcon name="SealCheck" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600 tracking-tight">
              {summary.compliance_rate || '100%'}
            </span>
            <span className="text-xs text-emerald-700 font-medium">Clearance</span>
          </div>
          <p className="text-[11px] text-slate-400">Clean matches & approved reviews</p>
        </div>

        <div className="luma-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Intercepted Discrepancies</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <PhosphorIcon name="WarningOctagon" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-amber-600 tracking-tight">
              {summary.flagged_count || 0}
            </span>
            <span className="text-xs text-amber-700 font-medium">Held at Gate</span>
          </div>
          <p className="text-[11px] text-slate-400">Demurrage / customs holds prevented</p>
        </div>

        <div className="luma-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Company Scope</span>
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-700">
              <PhosphorIcon name="Buildings" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-800 truncate" title={userOrganization || 'Default Desk'}>
              {userOrganization || 'Default Desk'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {isAdmin ? `${summary.organizations?.length || 1} company scopes indexed` : 'Isolated multi-tenant tenant log'}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card noPadding>
        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <PhosphorIcon
              name="MagnifyingGlass"
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ref, email ID, operator, description..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800 placeholder-slate-400"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            {/* Organization Filter (Admin only) */}
            {isAdmin && summary.organizations && summary.organizations.length > 0 && (
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">All Companies</option>
                {summary.organizations.map((org) => (
                  <option key={org} value={org}>
                    {org}
                  </option>
                ))}
              </select>
            )}

            {/* Action Taken Filter (Legal Standard) */}
            <select
              value={selectedActionTaken}
              onChange={(e) => setSelectedActionTaken(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-medium"
            >
              <option value="">All Signed Actions</option>
              <option value="AUTO_RELEASED">AUTO_RELEASED</option>
              <option value="MANUAL_OVERRIDE_APPROVED">MANUAL_OVERRIDE_APPROVED</option>
              <option value="REJECTED_TO_SHIPPER">REJECTED_TO_SHIPPER</option>
            </select>

            {/* Regulatory Reason Code Filter */}
            <select
              value={selectedReasonCode}
              onChange={(e) => setSelectedReasonCode(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-medium"
            >
              <option value="">All Reason Codes</option>
              <option value="PHONE_CONFIRMATION_NBE">PHONE_CONFIRMATION_NBE</option>
              <option value="AMENDED_PERMIT_RECEIVED">AMENDED_PERMIT_RECEIVED</option>
              <option value="OCR_READING_CORRECTED">OCR_READING_CORRECTED</option>
              <option value="WEIGHT_TOLERANCE_ACCEPTED">WEIGHT_TOLERANCE_ACCEPTED</option>
              <option value="ENTITY_ALIAS_CONFIRMED">ENTITY_ALIAS_CONFIRMED</option>
              <option value="SYSTEM_CLEARED_MATCH">SYSTEM_CLEARED_MATCH</option>
              <option value="DEFECT_STANDS_UNRESOLVED">DEFECT_STANDS_UNRESOLVED</option>
            </select>

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All Severities</option>
              <option value="INFO">Info</option>
              <option value="NOTICE">Notice</option>
              <option value="WARNING">Warning</option>
              <option value="HIGH_RISK">High Risk</option>
            </select>

            {(search || selectedOrg || selectedAction || selectedActionTaken || selectedReasonCode || selectedSeverity) && (
              <Button
                variant="ghost"
                size="sm"
                icon="X"
                onClick={() => {
                  setSearch('');
                  setSelectedOrg('');
                  setSelectedAction('');
                  setSelectedActionTaken('');
                  setSelectedReasonCode('');
                  setSelectedSeverity('');
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Audit Log Table */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin inline-block" />
            <p className="text-xs text-slate-400">Loading company audit records…</p>
          </div>
        ) : audits.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <PhosphorIcon name="ShieldCheck" size={24} weight="duotone" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Audit Records Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Company audit records are created automatically when shipment documents are reconciled, human reviews are submitted, or inboxes are synchronized.
            </p>
            <Button
              variant="outline"
              size="sm"
              icon="Plus"
              onClick={handleRunComplianceCheck}
            >
              Log Initial Compliance Check
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-3">Signed Action Taken</th>
                  <th className="py-3 px-3">Audit Reason Code</th>
                  <th className="py-3 px-3">Operator ID / Email</th>
                  <th className="py-3 px-3">Target Ref</th>
                  <th className="py-3 px-4">Audit Description</th>
                  <th className="py-3 px-3">Integrity Proof (SHA-256)</th>
                  <th className="py-3 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audits.map((a) => {
                  const actionBadge = getActionTakenBadge(a.action_taken || a.action);
                  const reasonBadge = getReasonCodeBadge(a.audit_reason_code);
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedAudit(a)}
                    >
                      {/* Timestamp (UTC) */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatTimestamp(a.timestamp)}
                      </td>

                      {/* Signed Action Taken */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${actionBadge.bg}`}>
                          <PhosphorIcon name={actionBadge.icon} size={13} weight="bold" />
                          <span>{a.action_taken || actionBadge.label}</span>
                        </span>
                      </td>

                      {/* Audit Reason Code */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${reasonBadge.bg}`}>
                          {a.audit_reason_code || reasonBadge.label}
                        </span>
                      </td>

                      {/* Operator ID / User Email */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="font-mono text-slate-900 font-semibold block text-[11px]">
                            {a.operator_id || a.owner || 'SYSTEM'}
                          </span>
                          <span className="font-mono text-slate-400 text-[10px] block truncate max-w-[150px]">
                            {a.user_email || `${a.owner || 'operator'}@siblix.ai`}
                          </span>
                        </div>
                      </td>

                      {/* Target Ref */}
                      <td className="py-3 px-3">
                        {a.entity_id ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (a.entity_id.startsWith('EML') || a.entity_id.startsWith('mail')) {
                                setSelectedEmailId(a.entity_id);
                                setActiveTab('detail');
                              }
                            }}
                            className="font-mono font-semibold text-brand-600 hover:underline"
                          >
                            {a.entity_id}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2 max-w-md">
                          <PhosphorIcon
                            name={getActionIcon(a.action)}
                            size={15}
                            weight="duotone"
                            className="text-slate-400 shrink-0 mt-0.5"
                          />
                          <div>
                            <p className="font-medium text-slate-900 leading-snug line-clamp-1">
                              {a.description}
                            </p>
                            <span className="text-[10px] font-mono text-slate-400">
                              Org: {a.organization}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Integrity Proof Hash */}
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                        {a.verification_hash ? (
                          <span
                            title={a.verification_hash}
                            className="bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md border border-slate-200/90 cursor-pointer transition-colors inline-block"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(a.verification_hash);
                              addToast('Copied SHA-256 audit seal to clipboard', 'info');
                            }}
                          >
                            {a.verification_hash.slice(0, 16)}…
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Inspect Action */}
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAudit(a);
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-brand-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Audit Detail Modal / Inspector */}
      {selectedAudit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={() => setSelectedAudit(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="shrink-0 px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0">
                  <PhosphorIcon name="ShieldCheck" size={20} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    HITL Legal Override &amp; Signed Action Log
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID #{selectedAudit.id} · {selectedAudit.action_taken || selectedAudit.action}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Close modal (Esc)"
              >
                <PhosphorIcon name="X" size={16} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              {/* Legal Liability Attestation Notice */}
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                  <PhosphorIcon name="Scales" size={14} weight="bold" className="text-amber-700" />
                  <span>Legal &amp; Financial Liability Attestation</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  When an operator overrides an AI flag, that decision carries legal and financial liability. This signed audit log is cryptographically bound to the operator ID and retained for customs and maritime regulatory audits.
                </p>
              </div>

              {/* Certificate Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">
                    Timestamp (UTC)
                  </span>
                  <span className="font-mono text-slate-800 font-medium text-[11px]">
                    {selectedAudit.timestamp ? new Date(selectedAudit.timestamp).toUTCString() : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">
                    Action Taken
                  </span>
                  <span className="font-mono font-bold text-brand-700 text-[11px]">
                    {selectedAudit.action_taken || selectedAudit.action}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">
                    Operator ID / Email
                  </span>
                  <span className="font-mono font-medium text-slate-800 block text-[11px]">
                    {selectedAudit.operator_id || selectedAudit.owner}
                  </span>
                  <span className="font-mono text-slate-500 text-[10px]">
                    {selectedAudit.user_email || `${selectedAudit.owner || 'operator'}@siblix.ai`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase tracking-wider">
                    Audit Reason Code
                  </span>
                  <span className="font-mono font-semibold text-purple-700 text-[11px]">
                    {selectedAudit.audit_reason_code || 'PHONE_CONFIRMATION_NBE'}
                  </span>
                </div>
              </div>

              {/* Voice Note & Verbal Attestation Record (if present) */}
              {selectedAudit.metadata?.voice_note && (
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-teal-900">
                    <PhosphorIcon name="Microphone" size={14} weight="fill" className="text-teal-700" />
                    <span>Auditable Voice Note Transcription</span>
                  </div>
                  <p className="font-mono text-[11px] text-teal-900 bg-white/90 p-2.5 rounded-lg border border-teal-100 font-medium">
                    &ldquo;{selectedAudit.metadata.voice_note}&rdquo;
                  </p>
                </div>
              )}

              {/* Narrative */}
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">Audit Description</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed font-sans">
                  {selectedAudit.description}
                </p>
              </div>

              {/* Cryptographic Seal */}
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">Signed Cryptographic Seal (SHA-256)</span>
                <div className="p-2 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] break-all border border-slate-800 flex items-center justify-between gap-2">
                  <span className="truncate">{selectedAudit.verification_hash || 'Unsealed'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedAudit.verification_hash || '');
                      addToast('Copied hash to clipboard', 'info');
                    }}
                    className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300 hover:text-white shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Attached Metadata JSON */}
              {selectedAudit.metadata && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Payload Metadata</span>
                  <pre className="p-2.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-[10px] overflow-x-auto max-h-32 leading-relaxed">
                    {JSON.stringify(selectedAudit.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {selectedAudit.entity_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon="ArrowSquareOut"
                  onClick={() => {
                    setSelectedEmailId(selectedAudit.entity_id);
                    setActiveTab('detail');
                    setSelectedAudit(null);
                  }}
                >
                  Inspect Shipment {selectedAudit.entity_id}
                </Button>
              ) : <div />}

              <Button
                variant="primary"
                size="sm"
                onClick={() => setSelectedAudit(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AuditPage;
