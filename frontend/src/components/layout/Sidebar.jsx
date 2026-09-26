import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_WIDTH_COLLAPSED = 68;

/**
 * Primary application navigation.
 *
 * Lives in a fixed left rail so the workspace header no longer has to fit the
 * brand, five nav tabs, search and every quick action on a single 64px row.
 * Vertical space is cheap and nav items can grow without crowding anything.
 *
 * - lg and up: always visible, collapsible to an icon-only rail via the
 *              toggle on the "Workspace" row.
 * - below lg:  an off-canvas drawer, opened from the Topbar (a drawer can't
 *              carry the control that reveals it).
 */
export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const {
    activeTab,
    setActiveTab,
    reviewQueue,
    isBackendConnected,
    username,
    userOrganization,
    isAdmin,
    isSuperAdmin,
    handleLogout,
  } = useApp();

  const superAdminNavItems = [
    { id: 'superadmin', label: 'Command Center', icon: 'ShieldCheck' },
    { id: 'superadmin-users', label: 'User Directory', icon: 'Users' },
    { id: 'superadmin-tenants', label: 'Organizations', icon: 'Buildings' },
    { id: 'superadmin-telemetry', label: 'System Health', icon: 'Cpu' },
    { id: 'superadmin-audit', label: 'Security Logs', icon: 'LockKey' },
  ];

  const operatorNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'SquaresFour' },
    { id: 'emails', label: 'Inbox & Explorer', icon: 'Tray' },
    {
      id: 'reviews',
      label: 'Review Queue',
      icon: 'UserFocus',
      badge: reviewQueue.length > 0 ? reviewQueue.length : null,
    },
    {
      id: 'audit',
      label: 'Company Audit',
      icon: 'ShieldCheck',
    },
    {
      id: 'evaluation',
      label: isAdmin ? 'Quality & Benchmark' : 'Quality & SLAs',
      icon: isAdmin ? 'Gauge' : 'ChartLineUp',
    },
    { id: 'settings', label: 'Settings', icon: 'Gear' },
  ];

  const navItems = isSuperAdmin ? superAdminNavItems : operatorNavItems;

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  const go = (tab) => {
    setActiveTab(tab);
    onCloseMobile();
  };

  // On mobile drawer, labels are always visible regardless of desktop collapsed rail state
  const showLabels = !collapsed || mobileOpen;

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onCloseMobile}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] lg:hidden transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200/80 transition-[width,transform] duration-200 ease-out w-[280px] max-w-[85vw] ${
          collapsed ? 'lg:w-[68px]' : 'lg:w-[240px]'
        } ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className={`h-16 flex items-center shrink-0 border-b border-slate-100 px-4 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <button
            onClick={() => go(isSuperAdmin ? 'superadmin' : 'dashboard')}
            title={isSuperAdmin ? 'SIBLIX Global — Super Admin' : 'SIBLIX.AI — Operations Desk'}
            className="flex items-center gap-2.5 min-w-0 group select-none rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <div className={`w-9 h-9 shrink-0 rounded-xl text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform ${
              isSuperAdmin ? 'bg-[#717486] shadow-[#717486]/20' : 'siblix-logo-badge'
            }`}>
              <PhosphorIcon name={isSuperAdmin ? 'ShieldCheck' : 'Boat'} size={20} weight="duotone" />
            </div>
            <span className={`flex flex-col min-w-0 text-left ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="flex items-center gap-1">
                <span className="font-extrabold text-base tracking-tight text-slate-900 truncate">
                  SIBLIX
                </span>
                <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded border ${
                  isSuperAdmin
                    ? 'bg-[#717486]/10 text-[#717486] border-[#717486]/30'
                    : 'bg-[#717486]/10 text-[#717486] border-[#717486]/30'
                }`}>
                  {isSuperAdmin ? 'ROOT' : 'AI'}
                </span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide truncate">
                {isSuperAdmin ? 'Super Admin' : 'Operations Desk'}
              </span>
            </span>
          </button>

          {/* Close (mobile only) */}
          <button
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="ml-auto lg:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <PhosphorIcon name="X" size={20} weight="duotone" />
          </button>
        </div>

        {/* Section heading + collapse toggle, side by side. When the rail
            is collapsed the heading is gone and the toggle centres. */}
        <div
          className={`hidden lg:flex items-center px-[22px] pt-3 pb-1.5 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {showLabels && (
            <div className="flex flex-col min-w-0 pr-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Workspace
              </p>
              <div
                className="flex items-center gap-1.5 mt-0.5"
                title={userOrganization ? `Organization: ${userOrganization}` : 'Personal Workspace'}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${userOrganization ? 'bg-brand-500' : 'bg-slate-400'}`} />
                <span className="text-[11px] font-medium text-slate-600 truncate max-w-[130px]">
                  {userOrganization || 'Personal'}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar`}
            className="p-1 -mr-0.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <PhosphorIcon name="SidebarSimple" size={16} weight="duotone" />
          </button>
        </div>

        {/* Drawer keeps a plain heading — it has no collapsed state. */}
        <div className="lg:hidden px-[22px] pt-3 pb-1.5 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${userOrganization ? 'bg-brand-500' : 'bg-slate-400'}`} />
            <span className="text-[11px] font-medium text-slate-600 truncate">
              {userOrganization ? `Org: ${userOrganization}` : 'Personal Workspace'}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto pb-3 px-2.5 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex items-center rounded-xl text-sm transition-colors duration-150 select-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                  collapsed && !mobileOpen ? 'justify-center h-11 px-0' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? (isSuperAdmin ? 'bg-[#717486]/10 text-[#717486] font-semibold' : 'bg-brand-50 text-brand-700 font-semibold')
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                }`}
              >
                {isActive && (
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full ${
                    isSuperAdmin ? 'bg-[#717486]' : 'bg-brand-600'
                  }`} />
                )}
                <PhosphorIcon
                  name={item.icon}
                  size={19}
                  weight="duotone"
                  color={isActive ? (isSuperAdmin ? '#717486' : '#4F46E5') : 'currentColor'}
                />
                {showLabels && <span className="truncate">{item.label}</span>}
                {item.badge ? (
                  <span
                    className={`font-mono font-bold ${
                      isSuperAdmin ? 'bg-[#717486] text-white' : 'bg-coral-500 text-white'
                    } ${
                      collapsed
                        ? 'absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 text-[9px] rounded-full flex items-center justify-center'
                        : 'ml-auto px-1.5 py-0.5 text-[10px] rounded-full'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 p-2.5 space-y-1">
          {/* Back to marketing site */}
          <button
            onClick={() => go('landing')}
            title="Return to the public marketing & problem statement page"
            className={`w-full flex items-center rounded-xl text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
              collapsed && !mobileOpen ? 'justify-center h-10 px-0' : 'gap-2.5 px-3 py-2'
            }`}
          >
            <PhosphorIcon name="ArrowLeft" size={15} weight="duotone" />
            {showLabels && <span>Website</span>}
          </button>

          {/* Interactive API Docs (Swagger UI) - SuperAdmin Only */}
          {isSuperAdmin && (
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              title="Open interactive API Documentation (Swagger UI)"
              className={`w-full flex items-center rounded-xl text-xs text-slate-500 hover:text-brand-600 hover:bg-brand-50/80 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                collapsed && !mobileOpen ? 'justify-center h-10 px-0' : 'gap-2.5 px-3 py-2'
              }`}
            >
              <PhosphorIcon name="Code" size={15} weight="duotone" />
              {showLabels && <span>API Docs (Swagger)</span>}
            </a>
          )}

          {/* Live connection status */}
          <div
            title={isSuperAdmin ? 'Connected to live Neon Database Core' : (isBackendConnected ? 'Connected to the live API' : 'Running on demo data')}
            className={`flex items-center rounded-xl text-[11px] font-medium border ${
              collapsed && !mobileOpen ? 'justify-center h-10 px-0' : 'gap-2 px-3 py-2'
            } ${
              isSuperAdmin
                ? 'bg-[#717486]/10 text-[#717486] border-[#717486]/30'
                : isBackendConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                isSuperAdmin
                  ? 'bg-[#717486] animate-pulse'
                  : isBackendConnected
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-400'
              }`}
            />
            {showLabels && (
              <span className="truncate">
                {isSuperAdmin ? 'System Core Online' : (isBackendConnected ? 'API Live' : 'Demo Mode')}
              </span>
            )}
          </div>

          {/* User */}
          <div className={`flex items-center ${collapsed && !mobileOpen ? 'flex-col gap-1' : 'gap-1'}`}>
            <button
              onClick={() => go('profile')}
              title={username ? `${username} — open your profile` : 'Open your profile'}
              className={`flex-1 min-w-0 flex items-center rounded-xl text-xs font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                activeTab === 'profile'
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              } ${collapsed && !mobileOpen ? 'justify-center h-10 w-full px-0' : 'gap-2.5 px-3 py-2'}`}
            >
              <PhosphorIcon name="User" size={15} weight="duotone" />
              {showLabels && <span className="truncate">{username || 'Profile'}</span>}
            </button>
            <button
              onClick={handleLogout}
              title={`Signed in as ${username}. Click to log out.`}
              aria-label="Log out"
              className={`p-2 rounded-xl text-slate-400 hover:text-coral-600 hover:bg-coral-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                collapsed && !mobileOpen ? 'w-full flex justify-center' : ''
              }`}
            >
              <PhosphorIcon name="SignOut" size={16} weight="duotone" />
            </button>
          </div>

        </div>
      </aside>
    </>
  );
}

export default Sidebar;
