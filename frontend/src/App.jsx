import React, { useEffect, useState } from 'react';
import { useApp } from './context/AppContext';
import { Topbar } from './components/layout/Topbar';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './components/layout/Sidebar';
import { SearchCommand } from './components/layout/SearchCommand';
import { UploadModal } from './components/upload/UploadModal';
import { AuthModal } from './components/auth/AuthModal';
import { ToastContainer } from './components/ui/ToastContainer';
import { PipelineProgressBanner } from './components/pipeline/PipelineProgressBanner';

import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailsPage } from './pages/EmailsPage';
import { DetailPage } from './pages/DetailPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { Assistant } from './components/voice/Assistant';

const SIDEBAR_STORAGE_KEY = 'sdoc_sidebar_collapsed';

export function AppContent() {
  const { isAuthenticated, authChecked, activeTab } = useApp();

  // Desktop rail state, remembered per browser. Storage can throw in private
  // windows, so every access is guarded and falls back to "expanded".
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* storage unavailable — the rail still works, it just won't persist */
    }
  }, [sidebarCollapsed]);

  // Never leave the drawer open behind a route change.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  // 1. PUBLIC MARKETING WEBSITE (Completely separate from Dashboard)
  if (activeTab === 'landing') {
    return (
      <div className="min-h-screen bg-canvas-light text-slate-900 font-sans selection:bg-brand-100 selection:text-brand-900">
        <LandingPage />
        <AuthModal />
        <ToastContainer />
      </div>
    );
  }

  // 2. AUTHENTICATION — wait for the stored-token check before deciding, so
  //    a returning user with a live session never sees the sign-in screen.
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-canvas-light flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
          <span className="text-xs">Checking your session…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas-light text-slate-900 font-sans selection:bg-brand-100 selection:text-brand-900">
        <LoginPage />
        <AuthModal />
        <ToastContainer />
      </div>
    );
  }

  // 3. OPERATIONS APP WORKSPACE (Dashboard, Inbox, Review Queue, Inspector, Benchmark)
  const renderAppView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'emails':
        return <EmailsPage />;
      case 'detail':
        return <DetailPage />;
      case 'reviews':
        return <ReviewsPage />;
      case 'evaluation':
        return <EvaluationPage />;
      case 'audit':
        return <AuditPage />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-canvas-light selection:bg-brand-100 selection:text-brand-900 font-sans">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Content column — offset by the rail on lg+, full width below it */}
      <div
        className="flex flex-col min-h-screen transition-[padding] duration-200 ease-out lg:pl-[var(--sidebar-w)]"
        style={{
          '--sidebar-w': `${sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px`,
        }}
      >
        <Topbar
          onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
          mobileNavOpen={mobileNavOpen}
        />

        {/* Live Ingestion Progress Drawer / Banner */}
        <PipelineProgressBanner />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {renderAppView()}
        </main>

        {/* Operations Workspace Footer */}
        <footer className="border-t border-slate-200/80 bg-white/60 py-4 text-center text-xs text-slate-400">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              SIBLIX<span className="text-[#717486] font-bold">.AI</span> · Operations Verification Workspace
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              SIBLIX.AI · Enterprise Maritime Operations Desk
            </span>
          </div>
        </footer>
      </div>

      {/* Global Modals & Notifications */}
      <UploadModal />
      <SearchCommand />
      <AuthModal />
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <>
      <AppContent />
      <Assistant />
    </>
  );
}

export default App;
