import React from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from '../ui/PhosphorIcon';

/**
 * Top Discrepancy Drivers Widget
 * Renders a compact horizontal bar chart breaking down the root causes of flagged defects
 * based strictly on real shipment discrepancies in the active workspace.
 *
 * When the workspace has 0 emails or 0 discrepancies, it displays a clean, authentic empty state.
 */
export function TopDiscrepancyDrivers({ className = '' }) {
  const { emails, filterByDefectField, selectedDefectField } = useApp();

  // Compute dynamic defect occurrences from emails in the workspace
  const mismatches = emails.filter(
    (e) => e.status === 'MISMATCH' || (Array.isArray(e.defectFields) && e.defectFields.length > 0)
  );
  const totalMismatches = mismatches.length;

  // Empty state 1: Workspace has no documents uploaded yet
  if (emails.length === 0) {
    return (
      <div className={`p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center space-y-2 ${className}`}>
        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <PhosphorIcon name="WarningOctagon" size={18} weight="duotone" />
        </div>
        <h4 className="text-xs font-semibold text-slate-700">No Discrepancy Drivers Recorded</h4>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Your workspace currently has no uploaded or synced shipping documents. Connect a mailbox or upload documents to analyze defect failure modes.
        </p>
      </div>
    );
  }

  // Empty state 2: Documents exist, but 0 discrepancies were found (all clean!)
  if (totalMismatches === 0) {
    return (
      <div className={`p-6 rounded-xl border border-emerald-200/80 bg-emerald-50/30 text-center space-y-2 ${className}`}>
        <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <PhosphorIcon name="CheckCircle" size={20} weight="fill" />
        </div>
        <h4 className="text-xs font-semibold text-emerald-900">Zero Discrepancies Detected</h4>
        <p className="text-[11px] text-emerald-700 max-w-md mx-auto">
          All verified shipping instructions and draft bills of lading match with 100% precision. No defect drivers to report.
        </p>
      </div>
    );
  }

  // Driver definitions with field mappings
  const drivers = [
    {
      key: 'gross_weight_kg',
      label: 'Gross Weight Variance (KG)',
      sub: 'Tare calculation mismatches & declared cargo weight variance',
      icon: 'Scales',
      barColor: 'from-rose-500 to-rose-600',
      pillBg: 'bg-rose-50 text-rose-700 border-rose-200/60',
      dotColor: 'bg-rose-500',
    },
    {
      key: 'consignee',
      label: 'Consignee / Bank Legal Title',
      sub: 'Legal title, notify party, corporate address divergence',
      icon: 'UserFocus',
      barColor: 'from-brand-600 to-brand-800',
      pillBg: 'bg-brand-50 text-brand-700 border-brand-200/60',
      dotColor: 'bg-brand-600',
    },
    {
      key: 'port_of_discharge',
      label: 'Port of Discharge (POD)',
      sub: 'Maritime transit port vs inland multimodal dry port destination',
      icon: 'MapPin',
      barColor: 'from-brand-500 to-brand-700',
      pillBg: 'bg-brand-50 text-brand-700 border-brand-200/60',
      dotColor: 'bg-brand-600',
    },
    {
      key: 'container_count',
      label: 'Container Count / Check-Digit',
      sub: 'Discrepancy in unit count or ISO 6346 check digit between SI & B/L',
      icon: 'Package',
      barColor: 'from-amber-500 to-amber-600',
      pillBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
      dotColor: 'bg-amber-500',
    },
  ];

  // Count actual occurrences for each driver strictly from currently loaded emails
  const counts = {};
  drivers.forEach((d) => {
    counts[d.key] = emails.filter((e) => {
      if (!Array.isArray(e.defectFields)) return false;
      return e.defectFields.some((f) => {
        if (f === d.key) return true;
        if (d.key === 'gross_weight_kg' && (f === 'gross_weight' || f === 'gross_weight_kg')) return true;
        if (d.key === 'port_of_discharge' && (f === 'port_discharge' || f === 'port_of_discharge')) return true;
        if (d.key === 'container_count' && (f === 'container_number' || f === 'container_count')) return true;
        return false;
      });
    }).length;
  });

  return (
    <div className={`space-y-3.5 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-1.5">
            <PhosphorIcon name="WarningOctagon" size={16} weight="duotone" className="text-rose-500" />
            Top Discrepancy Drivers
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Root cause breakdown across {totalMismatches} flagged shipment defects · Click any bar to filter inbox
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Showing top failure modes
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {drivers.map((driver) => {
          const isSelected = selectedDefectField === driver.key;
          const actualCount = counts[driver.key] || 0;
          const pct = totalMismatches > 0 ? Math.round((actualCount / totalMismatches) * 100) : 0;

          return (
            <div
              key={driver.key}
              onClick={() => filterByDefectField(driver.key, driver.label)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && filterByDefectField(driver.key, driver.label)}
              className={`group relative p-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-rose-50/70 border-rose-400 shadow-sm ring-1 ring-rose-400/40'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-card'
              }`}
            >
              {/* Top row: Label & Percentage */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`p-1.5 rounded-lg border shrink-0 ${driver.pillBg}`}>
                    <PhosphorIcon name={driver.icon} size={15} weight="duotone" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 truncate block group-hover:text-brand-600 transition-colors">
                      {driver.label}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {actualCount} {actualCount === 1 ? 'shipment' : 'shipments'} flagged
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 shrink-0 font-mono text-right">
                  <span className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Horizontal Bar Graphic */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2 relative">
                <div
                  className={`h-full bg-gradient-to-r ${driver.barColor} rounded-full transition-all duration-500 ease-out group-hover:opacity-90`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Bottom row: Subtitle & Filter Prompt */}
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate pr-2 text-[10px] text-slate-500">
                  {driver.sub}
                </span>
                <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 group-hover:translate-x-0.5 transition-transform shrink-0 text-[11px]">
                  Filter <PhosphorIcon name="ArrowRight" size={11} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TopDiscrepancyDrivers;
