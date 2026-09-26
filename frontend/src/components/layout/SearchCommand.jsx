import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { StatusPill } from '../ui/StatusPill';

export function SearchCommand() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    emails,
    setSelectedEmailId,
    setActiveTab,
  } = useApp();

  const [query, setQuery] = useState('');

  const matches = emails
    .filter((e) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        e.id.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        (e.si && e.si.consignee && e.si.consignee.toLowerCase().includes(q))
      );
    })
    .slice(0, 7);

  const handleSelect = (emailId) => {
    setSelectedEmailId(emailId);
    setActiveTab('detail');
    setCommandPaletteOpen(false);
    setQuery('');
  };

  return (
    <Modal
      isOpen={commandPaletteOpen}
      onClose={() => {
        setCommandPaletteOpen(false);
        setQuery('');
      }}
      maxWidth="max-w-2xl"
      className="p-0"
    >
      <div className="p-3 border-b border-slate-100 flex items-center gap-3">
        <PhosphorIcon name="MagnifyingGlass" size={18} weight="duotone" className="text-slate-400 ml-1" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by shipment ID, subject, booking ref, consignee..."
          autoFocus
          className="w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none font-sans"
        />
        <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          ESC
        </kbd>
      </div>

      <div className="max-h-96 overflow-y-auto p-2 space-y-1">
        {matches.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No matching shipments found.
          </div>
        ) : (
          matches.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                  <PhosphorIcon name="EnvelopeSimple" size={16} weight="duotone" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {item.id}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">· {item.date}</span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {item.subject}
                  </p>
                </div>
              </div>
              <div className="shrink-0 pl-3">
                <StatusPill status={item.status} size="sm" />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Use arrow keys to navigate</span>
        <span>↵ to inspect</span>
      </div>
    </Modal>
  );
}

export default SearchCommand;
