import React from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { Button } from '../ui/Button';

const TAB_TITLES = {
  dashboard: 'Dashboard',
  emails: 'Inbox & Explorer',
  detail: 'Shipment Inspector',
  reviews: 'Review Queue',
  evaluation: 'Benchmark',
  settings: 'Settings',
  profile: 'My Profile',
};

/**
 * Workspace header.
 *
 * Navigation, branding, connection status and the user menu now live in the
 * Sidebar, so this row only carries the current view's title, search and the
 * two quick actions — which is what stopped it running out of horizontal
 * space at the smaller breakpoints.
 *
 * The one nav control left here is the small-screen menu button: below lg the
 * sidebar is an off-canvas drawer, so the control that reveals it cannot live
 * inside it. On lg and up the collapse toggle sits in the sidebar itself.
 */
export function Topbar({ onToggleMobileNav, mobileNavOpen }) {
  const {
    activeTab,
    setUploadModalOpen,
    setCommandPaletteOpen,
    processAll,
    loading,
    pipelineProgress,
  } = useApp();

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
      <div className="flex items-center gap-3 h-16 px-4 sm:px-6 lg:px-8">
        {/* Small-screen drawer trigger (the rail's own toggle handles lg+) */}
        <button
          onClick={onToggleMobileNav}
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
          aria-controls="app-sidebar"
          title={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          className="lg:hidden -ml-1 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <PhosphorIcon name="SidebarSimple" size={20} weight="duotone" />
        </button>

        {/* Current view */}
        <h1 className="text-sm font-semibold text-slate-900 truncate shrink-0">
          {TAB_TITLES[activeTab] || 'Dashboard'}
        </h1>

        {/* Search */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="ml-auto lg:ml-6 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 text-slate-500 hover:text-slate-700 text-xs transition-colors shadow-subtle lg:flex-1 lg:max-w-sm"
        >
          <PhosphorIcon name="MagnifyingGlass" size={14} weight="duotone" />
          <span className="hidden sm:inline">Search shipments...</span>
          <kbd className="hidden sm:inline lg:ml-auto font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">
            ⌘K
          </kbd>
        </button>

        {/* Quick actions */}
        <div className="flex items-center gap-2.5 lg:ml-auto">
          <Button
            variant="outline"
            size="sm"
            icon="UploadSimple"
            onClick={() => setUploadModalOpen(true)}
            className="hidden sm:inline-flex"
          >
            Upload
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={pipelineProgress?.active && pipelineProgress?.status === 'running' ? 'Spinner' : 'Play'}
            loading={loading}
            onClick={() => processAll(true)}
          >
            {pipelineProgress?.active && pipelineProgress?.status === 'running'
              ? `Verifying (${pipelineProgress.percentage}%)`
              : 'Verify All'}
          </Button>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
