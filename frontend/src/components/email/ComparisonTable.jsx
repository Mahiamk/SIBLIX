import React from 'react';
import { FIELDS } from '../../constants/taxonomy';
import { PhosphorIcon } from '../ui/PhosphorIcon';

/**
 * Side-by-Side SI vs BL Comparison Table
 * Highlights matching fields vs discrepancies with subtle Luma styling.
 */
export function ComparisonTable({ si, bl, defectFields = [] }) {
  const formatValue = (val) => {
    if (val === null || val === undefined || val === '') {
      return <span className="text-slate-300 italic">Not specified</span>;
    }
    if (typeof val === 'number') {
      return val.toLocaleString('en-US');
    }
    return String(val);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
            <th className="py-3 px-4 w-1/4">Shipment Field</th>
            <th className="py-3 px-4 w-1/3">
              <div className="flex items-center gap-1.5 text-brand-700">
                <PhosphorIcon name="FileText" size={14} weight="duotone" />
                <span>Shipping Instruction (SI)</span>
              </div>
            </th>
            <th className="py-3 px-4 w-1/3">
              <div className="flex items-center gap-1.5 text-slate-800">
                <PhosphorIcon name="Files" size={14} weight="duotone" />
                <span>Bill of Lading (Draft BL)</span>
              </div>
            </th>
            <th className="py-3 px-4 text-center w-24">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {FIELDS.map((field) => {
            const siVal = si ? si[field.key] : null;
            const blVal = bl ? bl[field.key] : null;
            const isDefect = defectFields.includes(field.key);
            const isMissing = (!siVal && siVal !== 0) || (!blVal && blVal !== 0);

            return (
              <tr
                key={field.key}
                className={`transition-colors ${
                  isDefect
                    ? 'bg-rose-50/30 hover:bg-rose-50/50'
                    : 'hover:bg-slate-50/70'
                }`}
              >
                {/* Field Name */}
                <td className="py-3 px-4 font-medium text-slate-800 flex items-center gap-2">
                  <div className={`p-1 rounded-md ${isDefect ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                    <PhosphorIcon name={field.icon} size={14} weight="duotone" />
                  </div>
                  <span>{field.label}</span>
                </td>

                {/* SI Value */}
                <td className="py-3 px-4 text-slate-700 font-mono text-[11px]">
                  <div
                    className={`p-1.5 rounded-lg inline-block max-w-full truncate ${
                      isDefect ? 'bg-rose-50 text-rose-900 font-medium' : ''
                    }`}
                  >
                    {formatValue(siVal)}
                  </div>
                </td>

                {/* BL Value */}
                <td className="py-3 px-4 text-slate-700 font-mono text-[11px]">
                  <div
                    className={`p-1.5 rounded-lg inline-block max-w-full truncate ${
                      isDefect ? 'bg-rose-100/70 text-rose-900 font-semibold' : ''
                    }`}
                  >
                    {formatValue(blVal)}
                  </div>
                </td>

                {/* Verification Badge */}
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {isDefect ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                      <PhosphorIcon name="XCircle" size={12} weight="duotone" />
                      Mismatch
                    </span>
                  ) : isMissing ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                      <PhosphorIcon name="Question" size={12} weight="duotone" />
                      Incomplete
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <PhosphorIcon name="CheckCircle" size={12} weight="duotone" />
                      Match
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ComparisonTable;
