import React from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from '../ui/PhosphorIcon';

/**
 * Live Ingestion Progress Drawer / Banner
 * Provides real-time operational feedback during batch verification runs:
 * Stage 1: Intent Classifying (420/545)...
 * Stage 2: Parsing Attachments (.pdf / .xlsx / OCR)...
 * Stage 3 & 4: Reconciling 7 Canonical Fields...
 * Active Badges: Throughput (72 docs/min), Latency (0.84s / email), Estimated Manual Hours Saved (136 hrs).
 */
export function PipelineProgressBanner() {
  const { pipelineProgress, dismissPipelineProgress, togglePipelineDrawer } = useApp();

  if (!pipelineProgress || !pipelineProgress.active) {
    return null;
  }

  const {
    stage,
    stageTitle,
    stageDetail,
    percentage,
    current,
    total,
    throughputDpm,
    avgLatency,
    hoursSaved,
    cleanMatches,
    mismatches,
    reviews,
    elapsedSeconds,
    status,
    isDrawerOpen,
  } = pipelineProgress;

  const isCompleted = status === 'completed';
  const isRunning = status === 'running';

  return (
    <div className="sticky top-16 z-30 transition-all duration-300">
      {/* Sticky Sub-Bar */}
      <div className="bg-white/95 backdrop-blur-md text-slate-900 border-b border-slate-200/80 shadow-sm px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Left: Active Radar & Stage Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-xl border shrink-0 ${
              isRunning
                ? 'bg-brand-50 text-brand-600 border-brand-200'
                : isCompleted
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {isRunning ? (
                <>
                  <span className="absolute w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                  <PhosphorIcon name="Cpu" size={17} weight="duotone" className="text-brand-600 animate-spin" />
                </>
              ) : isCompleted ? (
                <PhosphorIcon name="CheckCircle" size={18} weight="fill" className="text-emerald-500" />
              ) : (
                <PhosphorIcon name="WarningCircle" size={18} weight="fill" className="text-amber-500" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
                  {stageTitle}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ${
                  isRunning
                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {isRunning ? 'LIVE PIPELINE' : isCompleted ? 'VERIFIED' : 'STOPPED'}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {stageDetail}
                </span>
              </div>

              {/* Stage Progression Stepper Pills */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap">
                {/* Step 1 */}
                <span className={`flex items-center gap-1 font-medium transition-colors shrink-0 ${
                  stage > 1 ? 'text-emerald-600 font-semibold' : stage === 1 ? 'text-brand-600 font-semibold' : 'text-slate-400'
                }`}>
                  {stage > 1 ? (
                    <PhosphorIcon name="Check" size={12} weight="bold" className="text-emerald-600" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  )}
                  1. Intent Classifying
                </span>
                <span className="text-slate-300">›</span>

                {/* Step 2 */}
                <span className={`flex items-center gap-1 font-medium transition-colors shrink-0 ${
                  stage > 2 ? 'text-emerald-600 font-semibold' : stage === 2 ? 'text-brand-600 font-semibold' : 'text-slate-400'
                }`}>
                  {stage > 2 ? (
                    <PhosphorIcon name="Check" size={12} weight="bold" className="text-emerald-600" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                  2. Attachment OCR
                </span>
                <span className="text-slate-300">›</span>

                {/* Step 3 & 4 */}
                <span className={`flex items-center gap-1 font-medium transition-colors shrink-0 ${
                  stage >= 4 ? 'text-emerald-600 font-semibold' : stage === 3 ? 'text-brand-600 font-semibold' : 'text-slate-400'
                }`}>
                  {stage >= 4 ? (
                    <PhosphorIcon name="Check" size={12} weight="bold" className="text-emerald-600" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                  3 & 4. Reconciliation
                </span>
              </div>
            </div>
          </div>

          {/* Right: Operational Counters & Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap w-full md:w-auto justify-between md:justify-end">
            {/* Real-time Latency, Throughput & Cost Counters */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono text-[10px] sm:text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-600">
                <PhosphorIcon name="Timer" size={13} className="text-slate-400" />
                <span className="text-slate-500">Lat:</span> {avgLatency}s
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1 text-brand-700 font-semibold">
                <PhosphorIcon name="Lightning" size={13} weight="fill" className="text-brand-500" />
                <span>{throughputDpm} d/m</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <PhosphorIcon name="ClockCountdown" size={13} weight="fill" className="text-emerald-500" />
                <span>Saved: {hoursSaved}h</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Toggle Drawer */}
              <button
                onClick={togglePipelineDrawer}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                <span>{isDrawerOpen ? 'Hide' : 'Breakdown'}</span>
                <PhosphorIcon name={isDrawerOpen ? 'CaretUp' : 'CaretDown'} size={12} />
              </button>

              {/* Dismiss Button */}
              {isCompleted && (
                <button
                  onClick={dismissPipelineProgress}
                  title="Dismiss banner"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <PhosphorIcon name="X" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2.5 border border-slate-200/60">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isCompleted
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : 'bg-gradient-to-r from-brand-700 via-brand-500 to-emerald-400 animate-pulse'
            }`}
            style={{ width: `${Math.max(3, percentage)}%` }}
          />
        </div>
      </div>

      {/* Collapsible Operational Inspection Drawer */}
      {isDrawerOpen && (
        <div className="bg-slate-50/95 border-b border-slate-200 text-slate-700 px-4 sm:px-6 py-4 transition-all shadow-inner">
          <div className="max-w-7xl mx-auto space-y-4">
            
            {/* Drawer Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Progress Metric */}
              <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Total Processed</span>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {current} <span className="text-xs text-slate-400">/ {total} docs</span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-brand-50 text-brand-700 font-mono font-bold text-sm border border-brand-200/60">
                  {percentage}%
                </div>
              </div>

              {/* Clean Matches */}
              <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-emerald-600 uppercase tracking-wider font-semibold">Clean Matches</span>
                  <div className="text-xl font-bold font-mono text-emerald-600 mt-0.5">
                    {cleanMatches}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                  <PhosphorIcon name="CheckCircle" size={18} weight="fill" />
                </div>
              </div>

              {/* Defects Flagged */}
              <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-rose-600 uppercase tracking-wider font-semibold">Defects Flagged</span>
                  <div className="text-xl font-bold font-mono text-rose-600 mt-0.5">
                    {mismatches}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
                  <PhosphorIcon name="XCircle" size={18} weight="fill" />
                </div>
              </div>

              {/* Human Reviews / Hours Saved */}
              <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-amber-600 uppercase tracking-wider font-semibold">Review Queue</span>
                  <div className="text-xl font-bold font-mono text-amber-600 mt-0.5">
                    {reviews} <span className="text-xs text-slate-400 font-normal">({hoursSaved}h saved)</span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
                  <PhosphorIcon name="UserFocus" size={18} weight="duotone" />
                </div>
              </div>
            </div>

            {/* 3 Technical Stage Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              
              {/* Stage 1 Breakdown */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                stage === 1 ? 'bg-white border-brand-300 ring-2 ring-brand-500/10 shadow-sm' : 'bg-white/80 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center text-[10px] font-bold border border-brand-200/60">1</span>
                    Intent Classification
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
                    Confidence: 98.2%
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Fast regex heuristic parser with semantic intent routing: classifies correspondence into BL Comparison, SI Request, Telex Release, or Query.
                </p>
                <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  Routing: rule_classifier.py (0.002s / email)
                </div>
              </div>

              {/* Stage 2 Breakdown */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                stage === 2 ? 'bg-white border-brand-300 ring-2 ring-brand-500/10 shadow-sm' : 'bg-white/80 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold border border-slate-200/80">2</span>
                    Attachment Parsing & OCR
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
                    Fidelity: 99.4%
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Extracts structured shipping instruction metadata from PDF, plain text, and scanned Bills of Lading via Tesseract OCR and label normalizers.
                </p>
                <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  Extractors: PDF / TXT / OCR parser
                </div>
              </div>

              {/* Stage 3 & 4 Breakdown */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                stage >= 3 ? 'bg-white border-emerald-300 ring-2 ring-emerald-500/10 shadow-sm' : 'bg-white/80 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold border border-emerald-200/60">3</span>
                    7-Field Canonical Reconcile
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
                    Clean: {cleanMatches} | Flag: {mismatches}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Fuzzy cross-verification across Shipper, Consignee, Notify Party, POL, POD, Container Count, and Gross Weight, plus Ethiopian regulatory checks.
                </p>
                <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Engine: comparator.py + ethiopian_rules.py
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PipelineProgressBanner;
