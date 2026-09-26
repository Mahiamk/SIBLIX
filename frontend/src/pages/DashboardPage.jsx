import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { Sparkline } from '../components/charts/Sparkline';
import { UsageChart } from '../components/charts/UsageChart';
import { CategoryDonut } from '../components/charts/CategoryDonut';
import { FieldAccuracyBar } from '../components/charts/FieldAccuracyBar';
import { TopDiscrepancyDrivers } from '../components/charts/TopDiscrepancyDrivers';
import { StatusPill } from '../components/ui/StatusPill';
import { CategoryPill } from '../components/ui/CategoryPill';
import { RecentEscalationsTable } from '../components/review/RecentEscalationsTable';

export function DashboardPage() {
  const {
    emails,
    usageStats,
    fieldStats,
    setActiveTab,
    setSelectedEmailId,
    processAll,
    loading,
    pipelineProgress,
    setUploadModalOpen,
  } = useApp();

  // Metrics computation strictly from active emails
  const total = emails.length;
  const blEmails = emails.filter((e) => e.category === 'BL_COMPARISON');
  const cleanMatches = blEmails.filter((e) => e.status === 'OK' || e.status === 'REVIEWED').length;
  const mismatches = blEmails.filter((e) => e.status === 'MISMATCH').length;
  const needsReview = emails.filter((e) => e.status === 'NEEDS_REVIEW').length;

  const matchRate = blEmails.length > 0 ? Math.round((cleanMatches / blEmails.length) * 100) : 0;
  const defectRate = blEmails.length > 0 ? Math.round((mismatches / blEmails.length) * 100) : 0;

  // Category counts for Donut
  const categoryCounts = emails.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + 1;
    return acc;
  }, {});

  // Today's dynamic activity count
  const todayEntry = usageStats && usageStats.length > 0 ? usageStats[usageStats.length - 1] : null;
  const todayCount = todayEntry ? todayEntry.processed : 0;

  // Dynamic sparkline data derived directly from the 7-day usage time-series
  const totalSpark = usageStats && usageStats.length > 0
    ? usageStats.map((d) => d.processed)
    : [0, 0, 0, 0, 0, 0, 0];
  const matchSpark = usageStats && usageStats.length > 0
    ? usageStats.map((d) => (d.processed > 0 ? Math.round((d.matches / d.processed) * 100) : 0))
    : [0, 0, 0, 0, 0, 0, 0];
  const defectSpark = usageStats && usageStats.length > 0
    ? usageStats.map((d) => (d.processed > 0 ? Math.round((d.mismatches / d.processed) * 100) : 0))
    : [0, 0, 0, 0, 0, 0, 0];
  const reviewSpark = usageStats && usageStats.length > 0
    ? usageStats.map((d) => d.reviews)
    : [0, 0, 0, 0, 0, 0, 0];

  const [highlightEscalations, setHighlightEscalations] = useState(false);

  const scrollToEscalations = () => {
    const el = document.getElementById('escalations-table');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightEscalations(true);
      setTimeout(() => setHighlightEscalations(false), 2500);
    }
  };

  const handleRowClick = (id) => {
    setSelectedEmailId(id);
    setActiveTab('detail');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time SI vs draft BL cross-verification analytics and AI document processing pipeline
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            icon="Tray"
            onClick={() => setActiveTab('emails')}
            className="w-full sm:w-auto justify-center text-xs"
          >
            Open Inbox
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={pipelineProgress?.active && pipelineProgress?.status === 'running' ? 'Spinner' : 'Play'}
            loading={loading}
            onClick={() => processAll(true)}
            className="w-full sm:w-auto justify-center text-xs"
          >
            {pipelineProgress?.active && pipelineProgress?.status === 'running'
              ? `Running (${pipelineProgress.percentage}%)`
              : 'Run Pipeline'}
          </Button>
        </div>
      </div>

      {/* Empty Workspace Onboarding Banner */}
      {total === 0 && (
        <div className="p-4 rounded-2xl bg-brand-50/60 border border-brand-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-brand-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <PhosphorIcon name="Tray" size={18} weight="duotone" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Your workspace is clean and ready</p>
              <p className="text-slate-500 text-[11px] mt-0.5">
                No shipping correspondence has been uploaded or connected yet. Upload files or link a mailbox to start automated verification.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="primary"
              size="sm"
              icon="UploadSimple"
              onClick={() => setUploadModalOpen(true)}
            >
              Upload Shipping Docs
            </Button>
          </div>
        </div>
      )}

      {/* Hands-Free Voice Triage & Port Field Dispatch Banner */}
      <div className="bg-gradient-to-r from-brand-50/70 via-slate-100/50 to-emerald-50/50 rounded-2xl border border-brand-200/60 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-brand-500/20">
              <PhosphorIcon name="Microphone" size={20} weight="fill" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-slate-900 tracking-tight">
                  Voice Operations Dispatch & Hands-Free Triage
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-100 text-brand-800 border border-brand-200/80">
                  VOXIDE AI · ALT+V
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Field agents and freight clerks at dry ports (Modjo, Kality, Djibouti) can query shipments, trigger discrepancy briefings, or record phone override justifications hands-free.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 text-xs font-mono text-slate-600 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Voice Agent Ready</span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500 border border-slate-200">
                Alt+V
              </kbd>
            </div>
          </div>
        </div>

        {/* Multilingual Voice Prompt Quick Chips */}
        <div className="mt-3.5 pt-3 border-t border-brand-200/40 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
            Try Speaking:
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-[11px] font-medium shadow-2xs transition-colors max-w-full break-words"
            title="Amharic: Show me Awash Bank shipments with weight discrepancies"
          >
            🇪🇹 <strong>Amharic:</strong> "የአዋሽ ባንክ የክብደት ልዩነት ያለባቸውን ጫነቶች አሳየኝ"
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-[11px] font-medium shadow-2xs transition-colors max-w-full break-words"
            title="Afaan Oromoo: Show me shipments cleared for Modjo port"
          >
            🇪🇹 <strong>Afaan Oromoo:</strong> "Meeshaalee buufata Mojootti qophii ta'an naaf agarsiisi"
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-[11px] font-medium shadow-2xs transition-colors max-w-full break-words"
          >
            🇬🇧 "Filter review queue to missing attachments"
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-[11px] font-medium shadow-2xs transition-colors max-w-full break-words"
          >
            🎙️ "Approved because shipper submitted amended NBE permit via phone"
          </span>
        </div>
      </div>

      {/* KPI Metric Cards with Integrated D3 Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingested */}
        <div className="luma-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Inbox</span>
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-700">
              <PhosphorIcon name="EnvelopeSimple" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {total}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium ml-2">
                {todayCount > 0 ? `+${todayCount} today` : 'Up to date'}
              </span>
            </div>
            <Sparkline data={totalSpark} color="#4F46E5" width={90} height={28} />
          </div>
        </div>

        {/* Clean Match Rate */}
        <div className="luma-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Clean Match Rate</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <PhosphorIcon name="CheckCircle" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {matchRate}%
              </span>
              <span className="text-[11px] text-slate-400 font-mono ml-2">
                {cleanMatches} clean
              </span>
            </div>
            <Sparkline data={matchSpark} color="#10B981" width={90} height={28} />
          </div>
        </div>

        {/* Discrepancies */}
        <div className="luma-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Defects Flagged</span>
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <PhosphorIcon name="XCircle" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {mismatches}
              </span>
              <span className="text-[11px] text-rose-600 font-medium ml-2">
                {defectRate}% rate
              </span>
            </div>
            <Sparkline data={defectSpark} color="#F43F5E" width={90} height={28} />
          </div>
        </div>

        {/* Human Review Queue / Immediate Attention Actionable Anchor */}
        <div
          onClick={scrollToEscalations}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              scrollToEscalations();
            }
          }}
          title="Click to jump directly to Recent Escalations Requiring Approval"
          className="luma-card p-4 space-y-3 cursor-pointer group hover:border-amber-400 hover:shadow-md transition-all relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <span>Review Queue</span>
            </span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <PhosphorIcon name="UserFocus" size={16} weight="duotone" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {needsReview}
              </span>
              <span className="text-[11px] text-amber-600 font-medium ml-2">
                Action required
              </span>
            </div>
            <Sparkline data={reviewSpark} color="#F59E0B" width={90} height={28} />
          </div>
          {/* Actionable Table Anchor Callout */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-amber-700 font-medium group-hover:text-amber-800">
            <span className="flex items-center gap-1">
              <PhosphorIcon
                name="ArrowDown"
                size={12}
                className="group-hover:translate-y-0.5 transition-transform"
              />
              Jump to Escalations Table
            </span>
            <span className="font-mono text-[10px] bg-amber-100/80 text-amber-900 px-1.5 py-0.5 rounded font-bold">
              {needsReview} urgent · {emails.filter((e) => e.status === 'NEEDS_REVIEW' || e.status === 'MISMATCH').length} in desk
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verification Throughput Time Series Chart */}
        <Card
          title="Verification Velocity & Volume"
          subtitle="Time-series analysis of processed documents and clean release rate"
          icon="ChartLineUp"
          className="lg:col-span-2 relative z-20"
          overflowVisible
        >
          <div className="pt-2">
            <UsageChart data={usageStats} height={230} />
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                  Total Processed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Clean Matches
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 font-mono">
                  <PhosphorIcon name="Timer" size={13} className="text-slate-400" />
                  Average latency: {total > 0 ? '0.84s / email' : '—'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200/60 font-mono">
                  <PhosphorIcon name="Lightning" size={13} weight="fill" className="text-brand-600" />
                  Throughput: {total > 0 ? (pipelineProgress?.throughputDpm || 72) : 0} docs/min
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                  <PhosphorIcon name="ClockCountdown" size={13} weight="fill" className="text-emerald-600" />
                  Saved: {pipelineProgress?.hoursSaved || Math.round((total * 15) / 60)} hrs
                </span>
              </div>
            </div>

            {/* Top Discrepancy Drivers Widget */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <TopDiscrepancyDrivers />
            </div>
          </div>
        </Card>

        {/* Email Classification Breakdown */}
        <Card
          title="Category Distribution"
          subtitle="Classification breakdown across incoming correspondence"
          icon="Folder"
        >
          <div className="pt-2 flex flex-col items-center">
            <CategoryDonut counts={categoryCounts} size={170} />
            <div className="w-full mt-4 space-y-1 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand-600" /> BL Comparisons
                </span>
                <span className="font-mono font-medium">{categoryCounts.BL_COMPARISON || 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600" /> SI Requests
                </span>
                <span className="font-mono font-medium">{categoryCounts.SI_REQUEST || 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600" /> Invoices
                </span>
                <span className="font-mono font-medium">{categoryCounts.INVOICE_QUERY || 0}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" /> General / Advisories
                </span>
                <span className="font-mono font-medium">{categoryCounts.GENERAL || 0}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Action "Needs Immediate Attention" Drawer / Table */}
      <RecentEscalationsTable isHighlighted={highlightEscalations} />

      {/* Field Health & Recent Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7 Shipping Fields Health Monitor */}
        <Card
          title="7-Field Extraction Accuracy"
          subtitle="OCR fidelity and verification match consistency by data entity"
          icon="ShieldCheck"
        >
          <div className="pt-2">
            <FieldAccuracyBar stats={fieldStats} totalEmails={total} />
          </div>
        </Card>

        {/* Live Inbox Activity Stream */}
        <Card
          title="Recent Verification Stream"
          subtitle="Latest processed shipping instructions and comparison verdicts"
          icon="Tray"
          action={
            <Button
              variant="ghost"
              size="sm"
              iconRight="ArrowRight"
              onClick={() => setActiveTab('emails')}
            >
              View All
            </Button>
          }
          className="lg:col-span-2"
        >
          {emails.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <PhosphorIcon name="Tray" size={24} className="text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">No Ingested Shipments Yet</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Processed shipping documents and verification verdicts will stream in real-time here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {emails.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  onClick={() => handleRowClick(e.id)}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 p-2.5 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                      <PhosphorIcon
                        name={e.category === 'BL_COMPARISON' ? 'GitDiff' : 'EnvelopeSimple'}
                        size={16}
                        weight="duotone"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {e.id}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {e.date} {e.time}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5" title={e.subject}>
                        {e.subject}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center pl-11 sm:pl-0">
                    <CategoryPill category={e.category} size="sm" />
                    <StatusPill status={e.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default DashboardPage;
