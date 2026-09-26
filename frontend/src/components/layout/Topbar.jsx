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
  superadmin: 'Command Center',
  'superadmin-users': 'User Management & Access Control',
  'superadmin-tenants': 'Organizations & Tenants',
  'superadmin-telemetry': 'System Health & Telemetry',
  'superadmin-audit': 'Security & Compliance Logs',
};

/**
 * Workspace header.
 *
 * For Super Admin (Platform Owner):
 * Strips away all operational document processing tools (Upload, Verify All, Shipment search).
 * Displays platform governance context, Neon cloud connection status, and API documentation portal.
 *
 * For Operations users:
 * Standard shipment search, upload, and batch verify controls.
 */
export function Topbar({ onToggleMobileNav, mobileNavOpen }) {
  const {
    activeTab,
    isSuperAdmin,
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
        <div className="flex items-center gap-2.5 truncate shrink-0">
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            {TAB_TITLES[activeTab] || (isSuperAdmin ? 'Platform Command Center' : 'Dashboard')}
          </h1>
          {isSuperAdmin && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-purple-100 text-purple-700 border border-purple-200">
              OWNER / ROOT
            </span>
          )}
        </div>

        {isSuperAdmin ? (
          /* SUPER ADMIN CONTROLS: Platform Oversight Only — No Shipment Processing */
          <div className="ml-auto flex items-center gap-3">
            {/* Neon Database Live Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 text-slate-600 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium font-mono text-slate-600">Neon PostgreSQL Online</span>
            </div>

            {/* API Endpoints & Swagger Docs Portal */}
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100/70 text-purple-700 text-xs font-semibold transition-colors shadow-subtle"
              title="Open SIBLIX FastAPI Swagger Documentation"
            >
              <PhosphorIcon name="Terminal" size={14} weight="bold" />
              <span>Swagger API Docs</span>
              <PhosphorIcon name="ArrowSquareOut" size={12} />
            </a>
          </div>
        ) : (
          /* OPERATOR CONTROLS: Shipment Search & Verification Pipeline */
          <>
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
          </>
        )}
      </div>
    </header>
  );
}

export default Topbar;
