import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { ComparisonTable } from '../components/email/ComparisonTable';
import { DecisionBanner } from '../components/email/DecisionBanner';
import { FIELDS } from '../constants/taxonomy';

export function LandingPage() {
  const { setActiveTab, setAuthModalOpen, setAuthMode, setSelectedEmailId,
          isAuthenticated, username, handleLogout } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile navigation menu on Escape key press
  React.useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileMenuOpen]);

  // Interactive Demo Playground Scenario State
  const scenarios = [
    {
      id: 'scenario-1',
      title: 'Container Overcount (Terminal Gate-in)',
      booking: 'MSCU7890123',
      category: 'BL_COMPARISON',
      status: 'MISMATCH',
      emailId: 'EML-1001',
      summary: 'SI instructs 3 containers; draft BL declares 4. Extra unit flagged at terminal gate.',
      defectFields: ['container_count'],
      si: {
        shipper: 'Meridian Traders Ltd.',
        consignee: 'Pacific Rim Imports Inc.',
        notify_party: 'Pacific Rim Imports — Receiving Dept.',
        port_of_loading: 'Shanghai, CN (CNSHA)',
        port_of_discharge: 'Rotterdam, NL (NLRTM)',
        container_count: 3,
        gross_weight_kg: 21500,
      },
      bl: {
        shipper: 'Meridian Traders Ltd.',
        consignee: 'Pacific Rim Imports Inc.',
        notify_party: 'Pacific Rim Imports — Receiving Dept.',
        port_of_loading: 'Shanghai, CN (CNSHA)',
        port_of_discharge: 'Rotterdam, NL (NLRTM)',
        container_count: 4,
        gross_weight_kg: 21500,
      },
    },
    {
      id: 'scenario-2',
      title: 'Gross Weight Variance (+2,000 kg)',
      booking: 'APT88410',
      category: 'BL_COMPARISON',
      status: 'MISMATCH',
      emailId: 'EML-1004',
      summary: 'Weight differs by 2,000 kg between documents. Flagged before original release.',
      defectFields: ['gross_weight_kg'],
      si: {
        shipper: 'Aptus Chemicals NV',
        consignee: 'Westport Industrial Corp.',
        notify_party: 'Westport Industrial Corp.',
        port_of_loading: 'Busan, KR (KRPUS)',
        port_of_discharge: 'Long Beach, US (USLGB)',
        container_count: 5,
        gross_weight_kg: 22850,
      },
      bl: {
        shipper: 'Aptus Chemicals NV',
        consignee: 'Westport Industrial Corp.',
        notify_party: 'Westport Industrial Corp.',
        port_of_loading: 'Busan, KR (KRPUS)',
        port_of_discharge: 'Long Beach, US (USLGB)',
        container_count: 5,
        gross_weight_kg: 24850,
      },
    },
    {
      id: 'scenario-3',
      title: 'Clean Match Release (100% Agreement)',
      booking: 'HSCG2299017',
      category: 'BL_COMPARISON',
      status: 'OK',
      emailId: 'EML-1002',
      summary: 'All 7 key shipment parameters matched between SI and BL. Auto-approved.',
      defectFields: [],
      si: {
        shipper: 'Nordwind Logistik GmbH',
        consignee: 'Andes Fresh Foods S.A.',
        notify_party: 'Andes Fresh Foods S.A.',
        port_of_loading: 'Hamburg, DE (DEHAM)',
        port_of_discharge: 'Buenos Aires, AR (ARBUE)',
        container_count: 2,
        gross_weight_kg: 18400,
      },
      bl: {
        shipper: 'Nordwind Logistik GmbH',
        consignee: 'Andes Fresh Foods S.A.',
        notify_party: 'Andes Fresh Foods S.A.',
        port_of_loading: 'Hamburg, DE (DEHAM)',
        port_of_discharge: 'Buenos Aires, AR (ARBUE)',
        container_count: 2,
        gross_weight_kg: 18400,
      },
    },
  ];

  const [activeScenario, setActiveScenario] = useState(scenarios[0]);

  const openAuth = (mode = 'signin') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const jumpToApp = () => {
    setActiveTab('dashboard');
  };

  const jumpToDetail = (emailId) => {
    setSelectedEmailId(emailId);
    setActiveTab('detail');
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas-light text-slate-900 font-sans selection:bg-brand-100 selection:text-brand-900">
      {/* 1. STANDALONE WEBSITE MARKETING HEADER */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div
            className="flex items-center gap-2.5 select-none cursor-pointer"
            onClick={() => {
              setMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="w-9 h-9 rounded-xl siblix-logo-badge text-white flex items-center justify-center shadow-sm">
              <PhosphorIcon name="Boat" size={20} weight="duotone" />
            </div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                SIBLIX
              </span>
              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-[#717486]/10 text-[#717486] border border-[#717486]/30">
                AI
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <a href="#problem" className="hover:text-slate-900 transition-colors">The Problem</a>
            <a href="#solution" className="hover:text-slate-900 transition-colors">Solution Engine</a>
            <a href="#interactive-demo" className="hover:text-slate-900 transition-colors">Interactive Demo</a>
            <a href="#fields" className="hover:text-slate-900 transition-colors">7 Maritime Fields</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Enterprise Security</a>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2.5">
            {isAuthenticated ? (
              <>
                <span className="hidden sm:inline text-xs text-slate-500 font-mono truncate max-w-[140px]">
                  {username}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  iconRight="ArrowRight"
                  onClick={jumpToApp}
                  className="shadow-sm shadow-brand-500/20"
                >
                  Open workspace
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="SignIn"
                  onClick={() => openAuth('signin')}
                >
                  Sign In
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  iconRight="ArrowRight"
                  onClick={() => openAuth('register')}
                  className="shadow-sm shadow-brand-500/20"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Right Controls: Quick CTA + Hamburger Menu Toggle */}
          <div className="flex md:hidden items-center gap-2">
            {isAuthenticated ? (
              <Button
                variant="primary"
                size="sm"
                iconRight="ArrowRight"
                onClick={jumpToApp}
                className="text-xs py-1.5 px-3 font-semibold shadow-xs"
              >
                Dashboard
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openAuth('signin')}
                className="text-xs py-1.5 px-2.5 font-medium text-slate-700"
              >
                Sign In
              </Button>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100/90 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 border border-slate-200/90 bg-white shadow-2xs"
            >
              <PhosphorIcon
                name={mobileMenuOpen ? 'X' : 'List'}
                size={20}
                weight="bold"
                className="text-slate-800"
              />
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200/90 bg-white/98 backdrop-blur-xl px-4 py-4 shadow-xl animate-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col space-y-1 text-sm font-medium text-slate-700">
              <a
                href="#problem"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="WarningCircle" size={17} weight="duotone" />
                </div>
                <span>The Problem</span>
              </a>
              <a
                href="#solution"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="Cpu" size={17} weight="duotone" />
                </div>
                <span>Solution Engine</span>
              </a>
              <a
                href="#interactive-demo"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="PlayCircle" size={17} weight="duotone" />
                </div>
                <span>Interactive Demo</span>
              </a>
              <a
                href="#fields"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="FileText" size={17} weight="duotone" />
                </div>
                <span>7 Maritime Fields</span>
              </a>
              <a
                href="#security"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="ShieldCheck" size={17} weight="duotone" />
                </div>
                <span>Enterprise Security</span>
              </a>
            </nav>

            <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                    <span className="text-slate-500 font-medium">Signed in as</span>
                    <span className="font-semibold text-slate-800 font-mono truncate max-w-[170px]">
                      {username}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    iconRight="ArrowRight"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      jumpToApp();
                    }}
                    className="w-full justify-center shadow-sm shadow-brand-500/20 py-2.5 text-sm font-semibold"
                  >
                    Open Workspace Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon="SignOut"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout?.();
                    }}
                    className="w-full justify-center text-rose-600 border-rose-200 hover:bg-rose-50 py-2"
                  >
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="md"
                    iconRight="ArrowRight"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuth('register');
                    }}
                    className="w-full justify-center shadow-sm shadow-brand-500/20 py-2.5 text-sm font-semibold"
                  >
                    Get Started (Free Trial)
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    icon="SignIn"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuth('signin');
                    }}
                    className="w-full justify-center py-2.5 text-sm font-semibold"
                  >
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>


      {/* MAIN WEBSITE CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-24">
        {/* HERO SECTION */}
        <section className="text-center space-y-6 max-w-4xl mx-auto pt-4">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
            From Email Inbox to <br />
            <span className="bg-gradient-to-r from-brand-700 via-brand-500 to-slate-600 bg-clip-text text-transparent">
              Discrepancy Report
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Automating maritime shipping document verification: classify chaotic operational emails, extract the 7 critical shipment fields from Shipping Instructions (SI) and draft Bills of Lading (BL), and catch costly mismatches before original release.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon="Play"
              onClick={() => {
                const el = document.getElementById('interactive-demo');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="shadow-lift shadow-brand-500/25 px-6"
            >
              Try Interactive Sandbox
            </Button>

            <Button
              variant="outline"
              size="lg"
              icon="UserPlus"
              onClick={() => openAuth('register')}
            >
              Create Account
            </Button>

            <Button
              variant="ghost"
              size="lg"
              icon="SignIn"
              onClick={() => openAuth('signin')}
            >
              Sign In
            </Button>
          </div>

          {/* Trust Badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <PhosphorIcon name="CheckCircle" size={16} weight="duotone" className="text-emerald-500" />
              7-Field Automated Extraction
            </span>
            <span className="flex items-center gap-1.5">
              <PhosphorIcon name="CheckCircle" size={16} weight="duotone" className="text-emerald-500" />
              Human-in-the-Loop Safeguard
            </span>
            <span className="flex items-center gap-1.5">
              <PhosphorIcon name="CheckCircle" size={16} weight="duotone" className="text-emerald-500" />
              Enterprise Cloud Infrastructure
            </span>
            <span className="flex items-center gap-1.5">
              <PhosphorIcon name="CheckCircle" size={16} weight="duotone" className="text-emerald-500" />
              520 Email Dataset Benchmark
            </span>
          </div>

          {/* Floating Hero Preview Verdict */}
          <div className="pt-4 text-left">
            <div className="luma-card p-5 border border-slate-200 shadow-lift bg-white/95">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-mono font-bold text-slate-800">EML-1001 · Booking MSCU7890123</span>
                  <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-semibold">BL_COMPARISON</span>
                </div>
                <span className="text-rose-600 font-semibold flex items-center gap-1 text-[11px]">
                  <PhosphorIcon name="Warning" size={14} weight="duotone" />
                  1 Discrepancy Flagged
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[10px] uppercase font-bold text-brand-700 mb-1">
                    Reference: Shipping Instruction (SI)
                  </div>
                  <div className="font-mono text-slate-700 space-y-0.5 text-[11px]">
                    <div>Shipper: Meridian Traders Ltd.</div>
                    <div>POL: Shanghai (CNSHA) → POD: Rotterdam (NLRTM)</div>
                    <div className="font-bold text-slate-900">Container Count: 3 x 40HC</div>
                    <div>Gross Weight: 21,500 kg</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                  <div className="text-[10px] uppercase font-bold text-rose-700 mb-1">
                    Draft Bill of Lading (BL)
                  </div>
                  <div className="font-mono text-slate-700 space-y-0.5 text-[11px]">
                    <div>Shipper: Meridian Traders Ltd.</div>
                    <div>POL: Shanghai (CNSHA) → POD: Rotterdam (NLRTM)</div>
                    <div className="font-bold text-rose-700 bg-rose-100 px-1 py-0.5 rounded inline-block">
                      Container Count: 4 (Overcount +1)
                    </div>
                    <div>Gross Weight: 21,500 kg</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. THE PROBLEMS SECTION (PDF Page 1) */}
        <section id="problem" className="space-y-8 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 font-mono">
              Operational Bottlenecks
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              The Problems in Shipping Operations
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Manual cross-checking across dense maritime documentation causes delays, customs holds, and severe penalties.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="luma-card p-6 space-y-3 border-rose-100 hover:border-rose-200">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <PhosphorIcon name="EnvelopeSimple" size={22} weight="duotone" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Triage Bottleneck & Inbox Noise
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Staff must read every single message in a shared operations inbox to discern document checks from SI requests, invoice queries, port advisories, and spam. An overlooked email means a draft BL is never verified.
              </p>
            </div>

            <div className="luma-card p-6 space-y-3 border-amber-100 hover:border-amber-200">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <PhosphorIcon name="WarningCircle" size={22} weight="duotone" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Repetitive & Error-Prone Checking
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Names, ports, container numbers, and weights must be cross-checked across two separate dense documents. Human fatigue causes missed discrepancies, leading to terminal holds and expensive amendment fees.
              </p>
            </div>

            <div className="luma-card p-6 space-y-3 border-brand-200/80 hover:border-brand-400">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <PhosphorIcon name="Files" size={22} weight="duotone" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Label Variance & Faded Scans
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                One carrier specifies "Port of Loading", another says "Load Port" or "POL". Scanned copies from maritime terminals arrive at 41 DPI with distorted OCR. The system must recognize equivalent concepts reliably.
              </p>
            </div>
          </div>
        </section>

        {/* 3. THE 4 SOLUTION CAPABILITIES (PDF Page 1 & 2) */}
        <section id="solution" className="space-y-8 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 font-mono">
              System Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              How SIBLIX.AI Solves It
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Four interconnected AI layers engineered specifically for end-to-end maritime document reconciliation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="luma-card p-5 space-y-3">
              <div className="p-2 w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold font-mono text-sm">
                01
              </div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight">Classify</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tells messages apart instantly into 5 categories: BL Comparison, SI Request, Invoice, General, and Spam.
              </p>
            </div>

            <div className="luma-card p-5 space-y-3">
              <div className="p-2 w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold font-mono text-sm">
                02
              </div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight">Extract Data</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Reads SI and BL PDF/Word attachments and extracts the 7 critical maritime shipment fields with OCR and rule fallbacks.
              </p>
            </div>

            <div className="luma-card p-5 space-y-3">
              <div className="p-2 w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center font-bold font-mono text-sm">
                03
              </div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight">Compare</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Compares normalized fields side-by-side. Clean matches report "No mismatch detected"; defects are highlighted with exact diffs.
              </p>
            </div>

            <div className="luma-card p-5 space-y-3">
              <div className="p-2 w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold font-mono text-sm">
                04
              </div>
              <h4 className="text-sm font-bold text-slate-900 tracking-tight">Ask for Help</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Never fails silently: escalates unreadable scans (&lt;50 DPI) and uncertain extractions to human-in-the-loop review with source context.
              </p>
            </div>
          </div>
        </section>

        {/* 4. INTERACTIVE LIVE PLAYGROUND SECTION */}
        <section id="interactive-demo" className="space-y-6 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 font-mono">
              Interactive Verification Sandbox
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Test the SI vs BL Verification Engine Live
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Select a sample shipment case from the benchmark dataset to inspect automated cross-comparison in real-time.
            </p>
          </div>

          {/* Scenario Selectors */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {scenarios.map((s) => {
              const isSelected = activeScenario.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveScenario(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-lift font-semibold'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.status === 'OK' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{s.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Comparison Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lift p-6 space-y-5 max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">Booking Ref: {activeScenario.booking}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{activeScenario.summary}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                iconRight="ArrowRight"
                onClick={() => jumpToDetail(activeScenario.emailId)}
              >
                Inspect Full Record
              </Button>
            </div>

            <DecisionBanner
              status={activeScenario.status}
              defectFields={activeScenario.defectFields}
            />

            <ComparisonTable
              si={activeScenario.si}
              bl={activeScenario.bl}
              defectFields={activeScenario.defectFields}
            />
          </div>
        </section>

        {/* 5. THE 7 CRITICAL MARITIME FIELDS (PDF Page 2) */}
        <section id="fields" className="space-y-8 scroll-mt-20">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 font-mono">
              Document Extraction Scope
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              The 7 Key Shipment Fields
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Per international shipping documentation standards, every comparison cross-references these exact parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FIELDS.map((f, i) => (
              <div key={f.key} className="luma-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-slate-100 text-brand-600">
                    <PhosphorIcon name={f.icon} size={18} weight="duotone" />
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">#0{i + 1}</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{f.label}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            ))}

            <div className="luma-card p-4 space-y-2 bg-gradient-to-br from-brand-50/50 to-slate-100/50 border-brand-200/80">
              <div className="p-2 rounded-lg bg-brand-600 text-white w-fit">
                <PhosphorIcon name="CheckCircle" size={18} weight="duotone" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Complete Agreement</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                When all 7 fields agree, the system logs "No mismatch detected" and authorizes instant draft BL release.
              </p>
            </div>
          </div>
        </section>

        {/* 6. ENTERPRISE SECURITY & INFRASTRUCTURE SECTION */}
        <section id="security" className="luma-card p-8 bg-gradient-to-br from-slate-900 to-slate-950 text-white border-slate-800 space-y-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                <PhosphorIcon name="ShieldCheck" size={14} weight="duotone" className="text-emerald-400" />
                <span>Enterprise Cloud Infrastructure & Security</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-white">
                Reliable Audit Trail & Encrypted Cloud Storage
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Operator credentials, authentication tokens, ingestion logs, and discrepancy audit trails are persisted securely with end-to-end encryption.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              icon="UserPlus"
              onClick={() => openAuth('register')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lift shrink-0"
            >
              Create Account
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80 text-xs">
            <div className="space-y-1">
              <div className="text-slate-400 font-medium">Data Encryption</div>
              <div className="font-mono text-emerald-300 font-bold">TLS 1.3 & AES-256 at Rest</div>
            </div>
            <div className="space-y-1">
              <div className="text-slate-400 font-medium">Audit Compliance</div>
              <div className="font-mono text-slate-300">Immutable Verification Timestamps</div>
            </div>
            <div className="space-y-1">
              <div className="text-slate-400 font-medium">Platform Availability</div>
              <div className="font-mono text-slate-300">99.9% Cloud Uptime SLA</div>
            </div>
          </div>
        </section>

        {/* 7. BOTTOM CALL TO ACTION */}
        <section className="text-center space-y-4 pt-4">
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
            Ready to verify shipping documents in real-time?
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
            Experience the dedicated Operations Dashboard, deep SI vs BL document inspector, human-in-the-loop review desk, and automated benchmark scoring.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon="UserPlus"
              onClick={() => openAuth('register')}
            >
              Get Started Free
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon="SignIn"
              onClick={() => openAuth('signin')}
            >
              Sign In
            </Button>
          </div>
        </section>
      </main>

      {/* DEDICATED MARKETING WEBSITE FOOTER */}
      <footer className="border-t border-slate-200/80 bg-white/70 py-8 text-xs text-slate-500 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg siblix-logo-badge text-white flex items-center justify-center font-bold text-xs">
              <PhosphorIcon name="Boat" size={14} weight="duotone" />
            </div>
            <span className="font-bold text-slate-800">SIBLIX<span className="text-[#717486]">.AI</span></span>
            <span>—</span>
            <span>Intelligent Shipping Document Verification Platform</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
            <span className="text-emerald-600 font-medium flex items-center gap-1">
              <PhosphorIcon name="ShieldCheck" size={13} weight="duotone" />
              Enterprise Cloud Infrastructure
            </span>
            <span>•</span>
            <span>Enterprise Maritime Operations Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
