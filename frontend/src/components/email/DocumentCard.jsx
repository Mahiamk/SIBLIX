import React, { useState } from 'react';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export function DocumentCard({ doc }) {
  const [expanded, setExpanded] = useState(false);

  const isExtracted = doc.status === 'extracted';
  const hasExcerpt = doc.excerpt && doc.excerpt.length > 0;

  return (
    <div className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-subtle hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
            <PhosphorIcon
              name={doc.type === 'SI' ? 'FileText' : 'Files'}
              size={20}
              weight="duotone"
              color={doc.type === 'SI' ? '#4F46E5' : '#0D9488'}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800 font-mono">
                {doc.name}
              </span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {doc.type}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span>{doc.size || '320 KB'}</span>
              <span>•</span>
              <span className={isExtracted ? 'text-emerald-600 font-medium' : 'text-rose-600'}>
                {isExtracted ? `${doc.fields || 7}/7 Fields Extracted` : 'OCR Scan Failed'}
              </span>
            </div>
          </div>
        </div>

        {hasExcerpt && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 p-1 rounded hover:bg-brand-50"
          >
            <span>{expanded ? 'Hide Excerpt' : 'View Excerpt'}</span>
            <PhosphorIcon
              name={expanded ? 'CaretUp' : 'CaretDown'}
              size={14}
              weight="duotone"
            />
          </button>
        )}
      </div>

      {/* Expandable OCR / Text Excerpt */}
      {expanded && hasExcerpt && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg font-mono text-[11px] text-slate-700 space-y-1 overflow-x-auto">
            {doc.excerpt.map((line, idx) => (
              <div key={idx} className="leading-relaxed">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentCard;
