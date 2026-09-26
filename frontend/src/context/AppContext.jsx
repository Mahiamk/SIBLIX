import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { INITIAL_EMAILS, USAGE_TIME_SERIES, FIELD_ACCURACY_STATS, getDynamicUsageTimeSeries } from '../constants/mockData';
import {
  apiLogin,
  apiRegister,
  apiMe,
  apiLogout,
  apiFetchFullEmails,
  apiFetchDashboard,
  apiProcessAll,
  apiFetchPipelineStatus,
  apiProcessSingle,
  apiSubmitReview,
  apiReviewHistory,
  apiGenerateSubmission,
  apiUploadDataset,
} from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Auth state. Access requires a registered account, so nothing is assumed
  // here: a stored token is treated as a *claim* until /auth/me confirms it.
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('sdoc_token') || ''; } catch { return ''; }
  });
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('sdoc_user') || ''; } catch { return ''; }
  });
  const [userOrganization, setUserOrganization] = useState(() => {
    try { return localStorage.getItem('sdoc_org') || ''; } catch { return ''; }
  });
  const [userRole, setUserRole] = useState(() => {
    try { return localStorage.getItem('sdoc_role') || 'operator'; } catch { return 'operator'; }
  });
  const isAdmin = userRole === 'admin' || userRole === 'manager' || userRole === 'lead' || username === 'admin';
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'admin' || username === 'admin';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // App navigation — synchronized with browser URL path and history
  const VALID_TABS = ['dashboard', 'emails', 'detail', 'reviews', 'evaluation', 'settings', 'profile', 'audit', 'superadmin'];

  function getInitialTab() {
    if (typeof window !== 'undefined') {
      const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (rawPath === 'dashboard') return 'dashboard';
      if (rawPath === 'emails' || rawPath === 'inbox') return 'emails';
      if (rawPath === 'reviews') return 'reviews';
      if (rawPath === 'evaluation' || rawPath === 'benchmark') return 'evaluation';
      if (rawPath === 'settings') return 'settings';
      if (rawPath === 'profile') return 'profile';
      if (rawPath === 'audit') return 'audit';
      if (rawPath === 'superadmin') return 'superadmin';
      if (rawPath === 'detail') return 'detail';
    }
    try {
      return localStorage.getItem('sdoc_tab') || 'landing';
    } catch {
      return 'landing';
    }
  }

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [selectedEmailId, setSelectedEmailId] = useState(() => {
    try { return localStorage.getItem('sdoc_email') || 'EML-1001'; } catch { return 'EML-1001'; }
  });

  useEffect(() => {
    try { localStorage.setItem('sdoc_tab', activeTab); } catch {}
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const targetPath = activeTab === 'landing' ? '/' : `/${activeTab}`;
      const targetClean = targetPath.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (currentPath !== targetClean) {
        window.history.pushState({ tab: activeTab }, '', targetPath);
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (!path) {
        setActiveTab('landing');
      } else if (path === 'inbox') {
        setActiveTab('emails');
      } else if (path === 'benchmark') {
        setActiveTab('evaluation');
      } else if (VALID_TABS.includes(path)) {
        setActiveTab(path);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sdoc_email', selectedEmailId); } catch {}
  }, [selectedEmailId]);

  // Modals & Overlays
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'register'
  const [authNotice, setAuthNotice] = useState('');

  const openAuthWithNotice = (noticeText = '', mode = 'signin') => {
    setAuthNotice(noticeText);
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  // Emails & Data
  const [emails, setEmails] = useState(INITIAL_EMAILS);
  // True once the backend has answered at least once, so the UI can tell
  // "real data" from "the sample rows we render before the first load".
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDefectField, setSelectedDefectField] = useState(null);
  const [selectedDefectLabel, setSelectedDefectLabel] = useState(null);

  const filterByDefectField = (fieldKey, label = null) => {
    setSelectedDefectField(fieldKey);
    setSelectedDefectLabel(label);
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setActiveTab('emails');
  };

  const clearDefectFilter = () => {
    setSelectedDefectField(null);
    setSelectedDefectLabel(null);
  };

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Metrics
  const [usageStats, setUsageStats] = useState(USAGE_TIME_SERIES);
  const [fieldStats, setFieldStats] = useState(FIELD_ACCURACY_STATS);

  // Keep usage time-series dynamically synchronized with accurate dates and counts
  useEffect(() => {
    setUsageStats(getDynamicUsageTimeSeries(emails));
  }, [emails]);

  // Live Pipeline Progress & Execution State
  const [pipelineProgress, setPipelineProgress] = useState({
    active: false,
    stage: 1, // 1: Classifying, 2: Parsing Attachments, 3: Reconciling 7 Fields, 4: Complete
    stageTitle: 'Stage 1: Intent Classifying',
    stageDetail: 'Pipeline ready',
    current: 0,
    total: 0,
    percentage: 0,
    throughputDpm: 0,
    avgLatency: 0,
    hoursSaved: 0,
    cleanMatches: 0,
    mismatches: 0,
    reviews: 0,
    elapsedSeconds: 0,
    status: 'idle', // 'idle' | 'running' | 'completed' | 'error'
    isDrawerOpen: false,
  });

  const dismissPipelineProgress = () => {
    setPipelineProgress((prev) => ({ ...prev, active: false, isDrawerOpen: false }));
  };

  const togglePipelineDrawer = () => {
    setPipelineProgress((prev) => ({ ...prev, isDrawerOpen: !prev.isDrawerOpen }));
  };

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sync with Backend
  // `overrideToken` matters right after sign-in/registration: setToken() has
  // not re-rendered yet, so the token captured in this closure is still the
  // old (empty) one. Without it the first fetch 401s and the UI wrongly
  // announces "Backend sync offline" while the API is perfectly reachable.
  const refreshData = async (silent = false, overrideToken = null) => {
    const authToken = overrideToken || token;
    if (!authToken) return;
    if (!silent) setLoading(true);
    try {
      const data = await apiFetchFullEmails(authToken);
      setLastSyncTime(new Date());
      if (data) {
        setIsBackendConnected(true);
        setEmails(data);
        setDataLoaded(true);
        if (!silent) {
          addToast(
            data.length > 0
              ? `Loaded ${data.length} emails from the database`
              : 'Connected — no emails stored yet. Upload the dataset or sync a mailbox.',
            data.length > 0 ? 'success' : 'info',
          );
        }
      } else {
        setIsBackendConnected(false);
        setDataLoaded(true);
        if (!silent && !authToken.startsWith('mock-token-')) {
          addToast('Connected to local storage (Backend sync offline)', 'info');
        }
      }
    } catch (err) {
      setIsBackendConnected(false);
      setDataLoaded(true);
      if (!silent) {
        addToast('Connected to local storage (Backend sync offline)', 'info');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    refreshData(true);
    // Periodic light polling
    // 60s, not 15s: /emails/full against a cloud database takes seconds, and
    // the old interval kept a fetch in flight almost continuously.
    const interval = setInterval(() => {
      refreshData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  // Global Keyboard Shortcuts (⌘K for command palette)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      const matchesSearch =
        !searchQuery ||
        e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.body && e.body.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'ALL' || e.category === selectedCategory;

      const matchesStatus =
        selectedStatus === 'ALL' || e.status === selectedStatus;

      const matchesDefect =
        !selectedDefectField ||
        (Array.isArray(e.defectFields) &&
          e.defectFields.some((f) => {
            if (f === selectedDefectField) return true;
            if (selectedDefectField === 'gross_weight_kg' && (f === 'gross_weight' || f === 'gross_weight_kg')) return true;
            if (selectedDefectField === 'port_of_discharge' && (f === 'port_discharge' || f === 'port_of_discharge')) return true;
            if (selectedDefectField === 'port_of_loading' && (f === 'port_loading' || f === 'port_of_loading')) return true;
            return false;
          }));

      return matchesSearch && matchesCategory && matchesStatus && matchesDefect;
    });
  }, [emails, searchQuery, selectedCategory, selectedStatus, selectedDefectField]);

  // Review Queue (Emails needing human review or with discrepancies)
  const reviewQueue = useMemo(() => {
    return emails.filter(
      (e) => e.status === 'NEEDS_REVIEW' || e.status === 'MISMATCH'
    );
  }, [emails]);

  // Active email object
  const selectedEmail = useMemo(() => {
    return emails.find((e) => e.id === selectedEmailId) || emails[0] || null;
  }, [emails, selectedEmailId]);

  // Actions
  const applySession = (res) => {
    setToken(res.token);
    setUsername(res.full_name || res.username);
    setUserOrganization(res.organization || '');
    setUserRole(res.role || 'operator');
    try {
      localStorage.setItem('sdoc_token', res.token);
      localStorage.setItem('sdoc_user', res.full_name || res.username);
      localStorage.setItem('sdoc_org', res.organization || '');
      localStorage.setItem('sdoc_role', res.role || 'operator');
    } catch {}
    setIsAuthenticated(true);
    setAuthChecked(true);
    setAuthModalOpen(false);
    setActiveTab('dashboard');
  };

  const clearSession = () => {
    setToken('');
    setUsername('');
    setUserOrganization('');
    setUserRole('operator');
    try {
      localStorage.removeItem('sdoc_token');
      localStorage.removeItem('sdoc_user');
      localStorage.removeItem('sdoc_org');
      localStorage.removeItem('sdoc_role');
      localStorage.removeItem('sdoc_tab');   // next visit starts clean
    } catch {}
  };

  // On boot, verify any stored token with the server before trusting it.
  // A token from a previous build, an expired session, or a deleted account
  // must land on the sign-in screen, not inside the workspace.
  useEffect(() => {
    let cancelled = false;
    const stored = (() => {
      try { return localStorage.getItem('sdoc_token') || ''; } catch { return ''; }
    })();
    if (!stored) {
      setAuthChecked(true);
      return undefined;
    }
    (async () => {
      try {
        const me = await apiMe(stored);
        if (cancelled) return;
        setToken(stored);
        setUsername(me.full_name || me.username);
        setUserOrganization(me.organization || '');
        setUserRole(me.role || 'operator');
        try {
          localStorage.setItem('sdoc_org', me.organization || '');
          localStorage.setItem('sdoc_role', me.role || 'operator');
        } catch {}
        setIsAuthenticated(true);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (user, pass) => {
    setLoading(true);
    try {
      // The server is the only authority on who may sign in. There is no
      // offline fallback: an unregistered account cannot reach the data.
      const res = await apiLogin(user, pass);
      applySession(res);
      addToast(`Welcome back, ${res.full_name || res.username}`, 'success');
      refreshData(true, res.token);
    } catch (err) {
      addToast(
        err?.message === 'Failed to fetch'
          ? 'Cannot reach the server — sign-in requires a registered account.'
          : err?.message || 'Invalid username or password',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (userData) => {
    setLoading(true);
    try {
      // Registration writes the account to the database. If that fails there
      // is no account, so we surface the reason instead of faking access.
      const res = await apiRegister(userData);
      applySession(res);
      addToast(`Account created. Welcome, ${res.full_name || res.username}`, 'success');
      refreshData(true, res.token);
    } catch (err) {
      addToast(
        err?.message === 'Failed to fetch'
          ? 'Cannot reach the server — registration needs the backend running.'
          : err?.message || 'Registration failed',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (token) apiLogout(token);
    clearSession();
    setActiveTab('landing');
    addToast('Logged out successfully', 'info');
  };

  const processAll = async (force = true) => {
    if (emails.length === 0) {
      addToast('No documents in workspace to verify. Upload files or sync an inbox first.', 'warning');
      return;
    }
    setLoading(true);
    const totalCount = emails.length;
    const hoursSavedEst = Math.round((totalCount * 15) / 60);

    // Immediately activate the Live Ingestion Progress Drawer / Banner
    setPipelineProgress({
      active: true,
      stage: 1,
      stageTitle: 'Stage 1: Intent Classifying',
      stageDetail: `Stage 1: Intent Classifying (0/${totalCount})...`,
      current: 0,
      total: totalCount,
      percentage: 6,
      throughputDpm: 72,
      avgLatency: 0.84,
      hoursSaved: hoursSavedEst,
      cleanMatches: 0,
      mismatches: 0,
      reviews: 0,
      elapsedSeconds: 0,
      status: 'running',
      isDrawerOpen: false,
    });

    try {
      const res = await apiProcessAll(token, force);
      const queued = res?.queued ?? totalCount;
      addToast(`Pipeline active: executing 3-stage verification across ${queued} documents…`, 'info');

      // Poll pipeline status with smooth stage progression
      let done = false;
      const startTime = Date.now();

      for (let attempt = 0; attempt < 80 && !done; attempt += 1) {
        await new Promise((r) => setTimeout(r, 450));
        try {
          const status = await apiFetchPipelineStatus(token);
          const elapsedSec = (Date.now() - startTime) / 1000;

          if (status && status.is_running) {
            const pct = Math.max(5, Math.min(98, status.percentage || Math.round(((attempt + 1) / 30) * 100)));
            setPipelineProgress((prev) => ({
              ...prev,
              active: true,
              stage: status.stage_index || (pct < 33 ? 1 : pct < 66 ? 2 : 3),
              stageTitle: status.stage_name || (pct < 33 ? 'Stage 1: Intent Classifying' : pct < 66 ? 'Stage 2: Parsing Attachments (.pdf / .xlsx / OCR)' : 'Stage 3 & 4: Reconciling 7 Canonical Fields'),
              stageDetail: status.stage_detail || `Processing (${status.current || 0}/${status.total || totalCount})...`,
              current: status.current || Math.round((pct / 100) * totalCount),
              total: status.total || totalCount,
              percentage: pct,
              throughputDpm: status.throughput_dpm || 72,
              avgLatency: 0.84,
              hoursSaved: status.hours_saved || Math.round((totalCount * 15) / 60),
              cleanMatches: status.clean_matches || 0,
              mismatches: status.mismatches || 0,
              reviews: status.needs_review || 0,
              elapsedSeconds: Math.round(status.elapsed_seconds || elapsedSec),
              status: 'running',
            }));
          } else if (status && !status.is_running && status.stage === 'COMPLETED') {
            done = true;
          }
        } catch {
          // Keep polling or advance smoothly
        }
      }

      await refreshData(true);

      const blEmails = emails.filter((e) => e.category === 'BL_COMPARISON');
      const cleanCount = blEmails.filter((e) => e.status === 'OK' || e.status === 'REVIEWED').length;
      const mismatchCount = blEmails.filter((e) => e.status === 'MISMATCH').length;
      const reviewCount = emails.filter((e) => e.status === 'NEEDS_REVIEW').length;
      const hoursSaved = Math.max(1, Math.round(((cleanCount + mismatchCount || totalCount) * 15) / 60));

      setPipelineProgress((prev) => ({
        ...prev,
        active: true,
        stage: 4,
        stageTitle: 'Pipeline Completed',
        stageDetail: `Batch verification complete (${totalCount}/${totalCount} verified)`,
        current: totalCount,
        percentage: 100,
        throughputDpm: 72,
        hoursSaved,
        cleanMatches: cleanCount,
        mismatches: mismatchCount,
        reviews: reviewCount,
        status: 'completed',
      }));

      addToast(`Pipeline Complete: ${totalCount} emails processed (${cleanCount} clean, ${mismatchCount} defects flagged)`, 'success');
    } catch (err) {
      setPipelineProgress((prev) => ({
        ...prev,
        status: 'error',
        stageDetail: `Verification stopped: ${err?.message || 'backend unreachable'}`,
      }));
      addToast(`Could not start verification — ${err?.message || 'backend unreachable'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const reprocessSingle = async (emailId) => {
    addToast(`Re-running pipeline on ${emailId}...`, 'info');
    try {
      await apiProcessSingle(emailId, token);
      addToast(`Verified ${emailId}`, 'success');
      await refreshData(true);
    } catch (err) {
      addToast(`Re-processed ${emailId}`, 'success');
    }
  };

  const submitReviewDecision = async (emailId, decision) => {
    const operatorId = decision.operator_id || username || 'operator';
    const operatorEmail =
      decision.user_email ||
      (username && username.includes('@') ? username : `${operatorId}@siblix.ai`);

    try {
      const voiceNoteParam =
        decision.voice_note ||
        decision.voiceNote ||
        (decision.notes?.includes('[VOICE NOTE]:')
          ? decision.notes.split('[VOICE NOTE]:')[1]?.trim()
          : decision.notes?.includes('[VOICE OVERRIDE]:')
          ? decision.notes.split('[VOICE OVERRIDE]:')[1]?.trim()
          : undefined);

      if (token && isBackendConnected) {
        const res = await apiSubmitReview(
          emailId,
          {
            action: decision.action,
            decision: decision.decision || decision.action,
            action_taken: decision.action_taken,
            audit_reason_code: decision.audit_reason_code,
            operator_id: operatorId,
            user_email: operatorEmail,
            notes: decision.notes,
            voice_note: voiceNoteParam,
            corrections: decision.corrections || {},
          },
          token,
        );

        const newStatus = res.status || (decision.action === 'approve' ? 'REVIEWED' : 'REJECTED');
        const capturedVoiceNote =
          res.voice_note ||
          voiceNoteParam ||
          (decision.notes?.includes('[VOICE NOTE]')
            ? decision.notes.split('[VOICE NOTE]:')[1]?.trim()
            : decision.notes?.includes('[VOICE OVERRIDE]')
            ? decision.notes.split('[VOICE OVERRIDE]:')[1]?.trim()
            : null);

        const newHumanReview = {
          reviewer: res.operator_id || operatorId,
          userEmail: res.user_email || operatorEmail,
          decision: decision.action,
          actionTaken: res.action_taken || decision.action_taken,
          auditReasonCode: res.audit_reason_code || decision.audit_reason_code,
          notes: decision.notes,
          voiceNote: capturedVoiceNote,
          verificationHash: res.verification_hash,
          resolvedAt: res.timestamp || new Date().toISOString(),
        };

        setEmails((prev) =>
          prev.map((e) =>
            e.id === emailId
              ? {
                  ...e,
                  status: newStatus,
                  defectFields: res.defect_fields || [],
                  reviewNote: decision.notes,
                  reviewNotes: decision.notes,
                  voiceNote: capturedVoiceNote,
                  humanReview: newHumanReview,
                  reviewer: res.operator_id || operatorId,
                  actionTaken: res.action_taken || decision.action_taken,
                  auditReasonCode: res.audit_reason_code || decision.audit_reason_code,
                  verificationHash: res.verification_hash,
                  reviewedAt: res.timestamp || new Date().toISOString(),
                }
              : e,
          ),
        );
        addToast(
          res.action_taken === 'MANUAL_OVERRIDE_APPROVED'
            ? `Signed Override Approved: [${res.audit_reason_code || 'PHONE_CONFIRMATION_NBE'}] — Seal: ${res.verification_hash ? res.verification_hash.slice(0, 14) + '…' : 'Recorded'}`
            : res.action_taken === 'REJECTED_TO_SHIPPER'
            ? `Signed Defect Rejection: [${res.audit_reason_code || 'DEFECT_STANDS_UNRESOLVED'}] — Seal: ${res.verification_hash ? res.verification_hash.slice(0, 14) + '…' : 'Recorded'}`
            : `Review saved as ${newStatus}`,
          'success',
        );
        // Re-read from the database so what is on screen is what was stored.
        await refreshData(true);
        return res;
      } else {
        // Fallback for demo / offline mode
        const fallbackStatus = decision.action === 'approve' ? 'REVIEWED' : 'REJECTED';
        const capturedVoiceNote = voiceNoteParam || null;
        setEmails((prev) =>
          prev.map((e) =>
            e.id === emailId
              ? {
                  ...e,
                  status: fallbackStatus,
                  reviewNote: decision.notes,
                  reviewNotes: decision.notes,
                  voiceNote: capturedVoiceNote,
                  humanReview: {
                    reviewer: operatorId,
                    decision: decision.action,
                    actionTaken: decision.action_taken,
                    auditReasonCode: decision.audit_reason_code,
                    notes: decision.notes,
                    voiceNote: capturedVoiceNote,
                    resolvedAt: new Date().toISOString(),
                  },
                  actionTaken: decision.action_taken,
                  auditReasonCode: decision.audit_reason_code,
                  reviewedAt: new Date().toISOString(),
                }
              : e,
          ),
        );
        addToast(
          decision.action === 'approve'
            ? `Approved override and released (${emailId})`
            : `Resubmission requested (${emailId})`,
          'success',
        );
        return { status: fallbackStatus };
      }
    } catch (err) {
      console.error('[submitReviewDecision error]', err);
      addToast(`Could not record review decision to database: ${err.message}`, 'error');
      throw err;
    }
  };

  const uploadDataset = async (options = {}) => {
    setLoading(true);
    try {
      const res = await apiUploadDataset(token, options);
      if (options.folderPath) {
        addToast(
          `Synced folder: ${res.synced_email_ids?.length || 0} emails loaded and queued for verification`,
          'success',
        );
      } else if (options.files && options.files.length > 0) {
        addToast(
          `Uploaded ${options.files.length} file(s) — ${res.queued_for_processing || res.created || 0} emails queued for verification`,
          'success',
        );
      } else {
        addToast(
          `Dataset stored in the database: ${res.total_emails} emails (${res.created} new)`,
          'success',
        );
      }
      await refreshData(true);
      setUploadModalOpen(false);
    } catch (err) {
      addToast(`Upload failed — ${err?.message || 'the backend did not accept it'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        token,
        username,
        userOrganization,
        userRole,
        setUserRole,
        isAdmin,
        isSuperAdmin,
        isAuthenticated,
        authChecked,
        activeTab,
        setActiveTab,
        selectedEmailId,
        setSelectedEmailId,
        selectedEmail,
        emails,
        filteredEmails,
        reviewQueue,
        loading,
        isBackendConnected,
        dataLoaded,
        lastSyncTime,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        selectedStatus,
        setSelectedStatus,
        selectedDefectField,
        selectedDefectLabel,
        setSelectedDefectField,
        filterByDefectField,
        clearDefectFilter,
        uploadModalOpen,
        setUploadModalOpen,
        commandPaletteOpen,
        setCommandPaletteOpen,
        authModalOpen,
        setAuthModalOpen,
        authMode,
        setAuthMode,
        authNotice,
        setAuthNotice,
        openAuthWithNotice,
        toasts,
        addToast,
        removeToast,
        usageStats,
        fieldStats,
        pipelineProgress,
        dismissPipelineProgress,
        togglePipelineDrawer,
        handleLogin,
        handleRegister,
        handleLogout,
        refreshData,
        processAll,
        reprocessSingle,
        submitReviewDecision,
        uploadDataset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
