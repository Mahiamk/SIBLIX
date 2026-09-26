import React from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { StatusPill } from '../components/ui/StatusPill';
import { CategoryPill } from '../components/ui/CategoryPill';
import { CATEGORIES, STATUS } from '../constants/taxonomy';

export function EmailsPage() {
  const {
    filteredEmails,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    selectedDefectField,
    selectedDefectLabel,
    clearDefectFilter,
    setSelectedEmailId,
    setActiveTab,
    processAll,
    loading,
    pipelineProgress,
  } = useApp();

  const handleInspect = (id) => {
    setSelectedEmailId(id);
    setActiveTab('detail');
  };

  const categoriesList = ['ALL', ...Object.keys(CATEGORIES)];
  const statusList = ['ALL', 'OK', 'MISMATCH', 'NEEDS_REVIEW', 'PROCESSED'];

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inbox & Verification Explorer
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse, filter, and inspect incoming shipping emails, SI requests, and draft BL comparisons
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={pipelineProgress?.active && pipelineProgress?.status === 'running' ? 'Spinner' : 'ArrowsClockwise'}
            loading={loading}
            onClick={() => processAll(true)}
          >
            {pipelineProgress?.active && pipelineProgress?.status === 'running'
              ? `Running Pipeline (${pipelineProgress.percentage}%)`
              : 'Run Pipeline'}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-card space-y-3">
        {/* Search input */}
        <div className="relative">
          <PhosphorIcon
            name="MagnifyingGlass"
            size={16}
            weight="duotone"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by shipment ID, subject, sender, consignee, container number..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <PhosphorIcon name="X" size={14} weight="duotone" />
            </button>
          )}
        </div>

        {/* Active Defect Field Filter Chip */}
        {selectedDefectField && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-rose-200/70 text-rose-700">
                <PhosphorIcon name="Funnel" size={14} weight="fill" />
              </span>
              <span>
                Filtered by Defect: <strong className="font-semibold text-rose-900">{selectedDefectLabel || selectedDefectField}</strong>
                <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-200/50 text-rose-800 font-mono text-[11px] font-medium">
                  {filteredEmails.length} matching shipments
                </span>
              </span>
            </div>
            <button
              onClick={clearDefectFilter}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-700 font-medium text-[11px] transition-colors shadow-2xs"
            >
              <span>Clear Filter</span>
              <PhosphorIcon name="X" size={12} weight="bold" />
            </button>
          </div>
        )}

        {/* Filter Pill Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Category:
            </span>
            {categoriesList.map((catKey) => {
              const isSelected = selectedCategory === catKey;
              const label = catKey === 'ALL' ? 'All Inboxes' : (CATEGORIES[catKey]?.label || catKey);
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Statuses */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Status:
            </span>
            {statusList.map((stKey) => {
              const isSelected = selectedStatus === stKey;
              const label = stKey === 'ALL' ? 'All Statuses' : (STATUS[stKey]?.label || stKey);
              return (
                <button
                  key={stKey}
                  onClick={() => setSelectedStatus(stKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Count & Email List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing <strong className="text-slate-800 font-mono">{filteredEmails.length}</strong> emails</span>
          <span className="text-[11px] text-slate-400">Click any row for side-by-side verification</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-28">ID</th>
                <th className="py-3 px-4">Subject & Details</th>
                <th className="py-3 px-4 w-36">Category</th>
                <th className="py-3 px-4 w-32">Status</th>
                <th className="py-3 px-4 w-24 text-center">Docs</th>
                <th className="py-3 px-4 w-32 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    No emails match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => (
                  <tr
                    key={email.id}
                    onClick={() => handleInspect(email.id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    {/* ID */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 text-[11px]">
                      {email.id}
                    </td>

                    {/* Subject & sender */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                        {email.subject}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {email.from || email.sender}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4">
                      <CategoryPill category={email.category} size="sm" />
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <StatusPill status={email.status} size="sm" />
                    </td>

                    {/* Document Count */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        <PhosphorIcon name="Paperclip" size={12} weight="duotone" />
                        {email.atts ? email.atts.length : 0}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {email.date}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default EmailsPage;
