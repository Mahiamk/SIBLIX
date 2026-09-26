import { FIELDS, dbKey, REASONS } from '../constants/taxonomy';

const API_BASE = (typeof window !== 'undefined' && window.API_BASE_URL)
  ? window.API_BASE_URL
  : (import.meta.env.VITE_API_BASE_URL || '');

const DEMO_USERS_KEY = 'siblix_demo_registered_users';

function getStoredDemoUsers() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveDemoUser(userData) {
  try {
    const users = getStoredDemoUsers();
    users[userData.username.toLowerCase()] = userData;
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
  } catch {}
}

export function fallbackDemoLogin(username, password) {
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();

  // 1. Built-in Admin
  if (u === 'admin' && (p === 'admin123' || p === 'admin')) {
    return {
      token: 'mock-token-admin-' + Date.now(),
      username: 'admin',
      full_name: 'Admin Lead',
      email: 'admin@siblix.ai',
      role: 'admin',
      organization: 'Maritime Assurance Desk',
    };
  }

  // 2. Built-in Demo Operator
  if (u === 'demo' && (p === 'demo1234' || p === 'demo')) {
    return {
      token: 'mock-token-demo-' + Date.now(),
      username: 'demo',
      full_name: 'Demo Operator',
      email: 'operator@siblix.ai',
      role: 'operator',
      organization: 'Modjo Dry Port Operations',
    };
  }

  // 3. Registered demo accounts
  const storedUsers = getStoredDemoUsers();
  if (storedUsers[u]) {
    const user = storedUsers[u];
    if (user.password === p || !user.password) {
      return {
        token: 'mock-token-user-' + u + '-' + Date.now(),
        username: user.username,
        full_name: user.full_name || user.username,
        email: user.email || `${u}@siblix.ai`,
        role: user.role || 'operator',
        organization: user.organization || 'Maritime Desk',
      };
    } else {
      throw new Error('Invalid password for demo account ' + username);
    }
  }

  // 4. Flexible demo entry for any valid input in demo mode
  if (u.length >= 2 && p.length >= 3) {
    const newUser = {
      username: username.trim(),
      password: p,
      full_name: username.trim(),
      email: `${u}@siblix.ai`,
      role: 'operator',
      organization: 'Maritime Operations Desk',
    };
    saveDemoUser(newUser);
    return {
      token: 'mock-token-user-' + u + '-' + Date.now(),
      username: newUser.username,
      full_name: newUser.full_name,
      email: newUser.email,
      role: 'operator',
      organization: newUser.organization,
    };
  }

  throw new Error('Invalid credentials. Quick fill: admin / admin123 or demo / demo1234');
}

export function fallbackDemoRegister(userData) {
  const username = (userData.username || '').trim();
  if (!username) throw new Error('Username is required');
  const user = {
    username,
    password: userData.password,
    full_name: userData.full_name || username,
    email: userData.email || `${username.toLowerCase()}@siblix.ai`,
    organization: userData.organization || 'Maritime Logistics',
    role: 'operator',
  };
  saveDemoUser(user);
  return {
    token: 'mock-token-user-' + username.toLowerCase() + '-' + Date.now(),
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    organization: user.organization,
  };
}

export async function apiLogin(username, password) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      return res.json();
    }
    // HTTP 405 occurs on Vercel static deployment where POST is not handled by serverless function
    // HTTP 404 occurs when API endpoint is not deployed yet
    if (res.status === 405 || res.status === 404) {
      return fallbackDemoLogin(username, password);
    }
    let detail = 'Invalid username or password';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  } catch (err) {
    if (
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('Load failed') ||
      err.message?.includes('405')
    ) {
      return fallbackDemoLogin(username, password);
    }
    throw err;
  }
}

/** Validate a stored token against the server or fallback for demo sessions. */
export async function apiMe(token) {
  if (!token) throw new Error('Session expired');
  if (token.startsWith('mock-token-')) {
    if (token.includes('admin')) {
      return {
        username: 'admin',
        full_name: 'Admin Lead',
        email: 'admin@siblix.ai',
        role: 'admin',
        organization: 'Maritime Assurance Desk',
      };
    }
    if (token.includes('demo')) {
      return {
        username: 'demo',
        full_name: 'Demo Operator',
        email: 'operator@siblix.ai',
        role: 'operator',
        organization: 'Modjo Dry Port Operations',
      };
    }
    const storedUsers = getStoredDemoUsers();
    for (const [key, user] of Object.entries(storedUsers)) {
      if (token.includes(key)) {
        return {
          username: user.username,
          full_name: user.full_name || user.username,
          email: user.email,
          role: user.role || 'operator',
          organization: user.organization || 'Maritime Operations Desk',
        };
      }
    }
    return {
      username: 'operator',
      full_name: 'Maritime Operator',
      email: 'operator@siblix.ai',
      role: 'operator',
      organization: 'Maritime Operations Desk',
    };
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 405 || res.status === 404) {
        return {
          username: 'operator',
          full_name: 'Maritime Operator',
          role: 'operator',
          organization: 'Maritime Operations Desk',
        };
      }
      throw new Error('Session expired');
    }
    return res.json();
  } catch (err) {
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      return {
        username: 'operator',
        full_name: 'Maritime Operator',
        role: 'operator',
        organization: 'Maritime Operations Desk',
      };
    }
    throw err;
  }
}

export async function apiLogout(token) {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* best effort — the client clears its own state regardless */
  }
}

export async function apiRegister(userData) {
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (res.ok) {
      return res.json();
    }
    if (res.status === 405 || res.status === 404) {
      return fallbackDemoRegister(userData);
    }
    let detail = 'Registration failed';
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {}
    throw new Error(detail);
  } catch (err) {
    if (
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('Load failed') ||
      err.message?.includes('405')
    ) {
      return fallbackDemoRegister(userData);
    }
    throw err;
  }
}

// --- the signed-in operator's own profile ---------------------------------

export async function apiFetchProfile(token) {
  const res = await fetch(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not load your profile');
  return res.json();
}

export async function apiUpdateProfile(patch, token) {
  const res = await fetch(`${API_BASE}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let detail = 'Could not save your details';
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// --- connected mailboxes (live IMAP ingestion) ----------------------------

async function mailboxRequest(path, token, options = {}) {
  const res = await fetch(`${API_BASE}/email-accounts${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) {
        detail = typeof data.detail === 'string'
          ? data.detail
          : data.detail?.[0]?.msg || detail;
      }
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

export const apiListMailboxes = (token) => mailboxRequest('', token);

export const apiMailboxProviders = (token) => mailboxRequest('/providers', token);

/** Verify credentials without storing them. */
export const apiTestMailbox = (payload, token) =>
  mailboxRequest('/test', token, { method: 'POST', body: JSON.stringify(payload) });

export const apiConnectMailbox = (payload, token) =>
  mailboxRequest('', token, { method: 'POST', body: JSON.stringify(payload) });

/** Pull new mail and queue it through the verification pipeline. */
export const apiSyncMailbox = (id, token, limit = 25) =>
  mailboxRequest(`/${id}/sync?limit=${limit}`, token, { method: 'POST' });

export const apiDisconnectMailbox = (id, token) =>
  mailboxRequest(`/${id}`, token, { method: 'DELETE' });

export async function apiFetchFullEmails(token) {
  try {
    const res = await fetch(`${API_BASE}/emails/full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return null;
    }
    const rows = await res.json();
    return rows.map(mapBackendEmailToUi);
  } catch {
    return null;
  }
}

export async function apiFetchDashboard(token) {
  const res = await fetch(`${API_BASE}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard: ${res.statusText}`);
  }
  return res.json();
}

export async function apiProcessAll(token, force = true) {
  const res = await fetch(`${API_BASE}/emails/process-all?force=${force ? 'true' : 'false'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to process emails: ${res.statusText}`);
  }
  return res.json();
}

export async function apiFetchPipelineStatus(token) {
  const res = await fetch(`${API_BASE}/emails/pipeline-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch pipeline status: ${res.statusText}`);
  }
  return res.json();
}

export async function apiProcessSingle(emailId, token) {
  const res = await fetch(`${API_BASE}/emails/${emailId}/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to reprocess ${emailId}`);
  }
  return res.json();
}

/** Record a human review decision.
 *  The email id belongs in the path — posting to /reviews (no id) hit a route
 *  that does not exist, so every decision silently failed. */
export async function apiSubmitReview(emailId, decision, token) {
  const res = await fetch(`${API_BASE}/reviews/${encodeURIComponent(emailId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(decision),
  });
  if (!res.ok) {
    let detail = `Failed to save the review for ${emailId}`;
    try {
      const data = await res.json();
      if (data.detail) {
        detail = typeof data.detail === 'string'
          ? data.detail
          : data.detail?.[0]?.msg || detail;
      }
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiReviewHistory(emailId, token) {
  const res = await fetch(
    `${API_BASE}/reviews/${encodeURIComponent(emailId)}/history`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('Could not load review history');
  return res.json();
}

export async function apiGenerateSubmission(token) {
  const res = await fetch(`${API_BASE}/evaluation/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Evaluation generation failed`);
  }
  return res.json();
}

export async function apiUploadDataset(token, options = {}) {
  const { files, folderPath, overwrite = true, runPipeline = true } = options;

  // 1. If syncing from a custom folder path on disk:
  if (folderPath && folderPath.trim()) {
    const res = await fetch(`${API_BASE}/upload/sync-folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        folder_path: folderPath.trim(),
        overwrite,
        run_pipeline: runPipeline,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Folder sync failed');
    }
    return res.json();
  }

  // 2. If uploading files via multipart form:
  if (files && files.length > 0) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('overwrite', String(overwrite));
    formData.append('run_pipeline', String(runPipeline));

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'File upload failed');
    }
    return res.json();
  }

  // 3. Default: sync bundled disk dataset
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Upload sync failed`);
  }
  return res.json();
}

function findDocByType(documents, type) {
  if (!documents) return null;
  return (
    documents.find((d) => d.document_type === type) ||
    documents.find((d) => (d.filename || '').toUpperCase().includes(`_${type}`))
  );
}

function mapFieldsToSiBl(fields) {
  if (!fields) return null;
  const out = {};
  FIELDS.forEach((f) => {
    out[f.key] = fields[dbKey(f.key)] ?? null;
  });
  return out;
}

function mapAttachment(d) {
  const fieldEntries = d.fields
    ? Object.entries(d.fields).filter(([, v]) => v !== null && v !== undefined)
    : [];
  const excerpt = fieldEntries.map(([k, v]) => `${k.toUpperCase()}: ${v}`);
  return {
    name: d.filename || 'Document.pdf',
    type: d.document_type || 'DOC',
    size: '340 KB',
    fields: fieldEntries.length,
    status: d.readable ? 'extracted' : 'failed',
    excerpt,
  };
}

function buildEvidence(defectFields, siDoc, blDoc) {
  const evidence = [];
  (defectFields || []).forEach((f) => {
    const fieldObj = FIELDS.find((x) => x.key === f) || { label: f };
    if (siDoc && siDoc.fields) {
      evidence.push({
        field: f,
        doc: 'SI',
        text: `${fieldObj.label.toUpperCase()}: ${siDoc.fields[dbKey(f)] ?? '—'}`,
      });
    }
    if (blDoc && blDoc.fields) {
      evidence.push({
        field: f,
        doc: 'BL',
        text: `${fieldObj.label.toUpperCase()}: ${blDoc.fields[dbKey(f)] ?? '—'}`,
      });
    }
  });
  return evidence;
}

export function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return {
        date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
    }
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  } catch {
    const now = new Date();
    return {
      date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }
}

export function mapBackendEmailToUi(e) {
  const { date, time } = fmtDateTime(e.created_at);
  const documents = e.documents || [];
  const siDoc = findDocByType(documents, 'SI');
  const blDoc = findDocByType(documents, 'BL');
  const cmp = e.comparison;
  const defectFields = (cmp && cmp.defect_fields) || [];
  const isPending = e.status === 'PENDING' || e.status === 'PROCESSING';

  // If the email is explicitly resolved or cleared, its status takes precedence
  const isExplicitlyResolved =
    e.status === 'REVIEWED' || e.status === 'REJECTED' || e.status === 'OK';

  const status =
    isExplicitlyResolved
      ? e.status
      : e.category === 'BL_COMPARISON'
      ? cmp
        ? cmp.status
        : isPending
        ? 'PROCESSING'
        : (e.status || 'NEEDS_REVIEW')
      : isPending
      ? 'PROCESSING'
      : (e.status || 'PROCESSED');

  const hr = e.human_review;
  const voiceNote =
    hr?.voice_note ||
    (hr?.notes && hr.notes.includes('[VOICE NOTE]')
      ? hr.notes.split('[VOICE NOTE]:')[1]?.trim()
      : hr?.notes && hr.notes.includes('[VOICE OVERRIDE]')
      ? hr.notes.split('[VOICE OVERRIDE]:')[1]?.trim()
      : null);

  return {
    id: e.email_id,
    subject: e.subject || 'No Subject',
    sender: e.from || 'unknown@domain.com',
    from: e.from || 'Unknown Sender',
    category: e.category || 'GENERAL',
    status,
    conf: e.classification_confidence ?? 0.95,
    date,
    time,
    createdAt: e.created_at,
    body: e.body || '',
    atts: documents.map(mapAttachment),
    defectFields,
    reviewReason: cmp ? cmp.review_reason : null,
    si: mapFieldsToSiBl(siDoc && siDoc.fields),
    bl: mapFieldsToSiBl(blDoc && blDoc.fields),
    evidence: buildEvidence(defectFields, siDoc, blDoc),
    humanReview: hr,
    voiceNote: voiceNote,
    reviewNotes: hr?.notes,
    reviewer: hr?.reviewer,
    reviewedAt: hr?.resolved_at,
    actionTaken: hr?.action_taken,
    auditReasonCode: hr?.audit_reason_code,
    verificationHash: hr?.verification_hash || e.verification_hash,
  };
}

export async function apiFetchAudits(token, params = {}) {
  const qs = new URLSearchParams();
  if (params.organization) qs.set('organization', params.organization);
  if (params.action) qs.set('action', params.action);
  if (params.action_taken) qs.set('action_taken', params.action_taken);
  if (params.audit_reason_code) qs.set('audit_reason_code', params.audit_reason_code);
  if (params.severity) qs.set('severity', params.severity);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.limit) qs.set('limit', params.limit);
  if (params.offset) qs.set('offset', params.offset);

  const res = await fetch(`${API_BASE}/audit?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = `Failed to load audits: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server returned an invalid response (non-JSON). Please verify backend connectivity.');
  }
}

export async function apiRecordAudit(payload, token) {
  const res = await fetch(`${API_BASE}/audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `Failed to record audit: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiExportAudits(token, organization) {
  const qs = organization ? `?organization=${encodeURIComponent(organization)}` : '';
  const res = await fetch(`${API_BASE}/audit/export${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = `Failed to export audit report: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

