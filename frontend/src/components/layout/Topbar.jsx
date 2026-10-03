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
 * For Super Admin:
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
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 w-full max-w-full">
      <div className="flex items-center justify-between gap-2 sm:gap-4 h-14 sm:h-16 px-3.5 sm:px-6 lg:px-10 xl:px-12 w-full max-w-full overflow-hidden">
        {/* Left: Small-screen drawer trigger & Current View Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
          <button
            onClick={onToggleMobileNav}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            title={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            className="lg:hidden p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 shrink-0"
          >
            <PhosphorIcon name="SidebarSimple" size={20} weight="duotone" />
          </button>

          <h1 className="text-xs sm:text-sm font-semibold text-slate-900 truncate max-w-[120px] xs:max-w-[160px] sm:max-w-none">
            {TAB_TITLES[activeTab] || (isSuperAdmin ? 'Platform Command Center' : 'Dashboard')}
          </h1>
          {isSuperAdmin && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-[#717486]/10 text-[#717486] border border-[#717486]/30 shrink-0">
              SUPER ADMIN
            </span>
          )}
        </div>

        {isSuperAdmin ? (
          /* SUPER ADMIN CONTROLS: System Oversight Only — No Shipment Processing */
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
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
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border border-[#717486]/30 bg-[#717486]/10 hover:bg-[#717486]/20 text-[#717486] text-xs font-semibold transition-colors shadow-subtle shrink-0"
              title="Open SIBLIX FastAPI Swagger Documentation"
            >
              <PhosphorIcon name="Terminal" size={14} weight="bold" />
              <span className="hidden sm:inline">Swagger API Docs</span>
              <span className="sm:hidden text-[11px]">Swagger</span>
              <PhosphorIcon name="ArrowSquareOut" size={12} />
            </a>
          </div>
        ) : (
          /* OPERATOR CONTROLS: Shipment Search & Verification Pipeline */
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto">
            {/* Search: Compact icon on mobile, expanded with shortcut on larger screens */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 text-slate-500 hover:text-slate-700 text-xs transition-colors shadow-subtle shrink-0"
              title="Search shipments (⌘K)"
            >
              <PhosphorIcon name="MagnifyingGlass" size={15} weight="duotone" />
              <span className="hidden md:inline text-slate-400">Search shipments...</span>
              <kbd className="hidden sm:inline-block font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">
                ⌘K
              </kbd>
            </button>

            {/* Quick action: Upload */}
            <Button
              variant="outline"
              size="sm"
              icon="UploadSimple"
              onClick={() => setUploadModalOpen(true)}
              className="px-2 sm:px-3 py-1.5 text-xs shrink-0"
              title="Upload shipping documents"
            >
              <span className="hidden sm:inline">Upload</span>
            </Button>

            {/* Quick action: Verify All / Run Pipeline */}
            <Button
              variant="primary"
              size="sm"
              icon={pipelineProgress?.active && pipelineProgress?.status === 'running' ? 'Spinner' : 'Play'}
              loading={loading}
              onClick={() => processAll(true)}
              className="px-2.5 sm:px-3.5 py-1.5 text-xs shrink-0"
              title="Run Automated Verification Pipeline"
            >
              {pipelineProgress?.active && pipelineProgress?.status === 'running' ? (
                <>
                  <span className="hidden sm:inline">Verifying ({pipelineProgress.percentage}%)</span>
                  <span className="sm:hidden text-xs">{pipelineProgress.percentage}%</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Verify All</span>
                  <span className="sm:hidden text-xs">Verify</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Topbar;
