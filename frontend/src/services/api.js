import { FIELDS, dbKey, REASONS } from '../constants/taxonomy';

const getApiBase = () => {
  let base = (typeof window !== 'undefined' && window.API_BASE_URL)
    ? window.API_BASE_URL
    : (import.meta.env.VITE_API_BASE_URL || '');
  if (base.endsWith('/')) base = base.slice(0, -1);
  if (!base) return '/api';
  return base.endsWith('/api') ? base : `${base}/api`;
};

export const API_BASE = getApiBase();

export async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let detail = 'Invalid username or password';
    try {
      const data = await res.json();
      if (data.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json(); // { token, username, full_name, email, role, organization }
}

export function checkAuthExpiry(res) {
  if (res && res.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:session_expired'));
  }
}

/** Validate a stored token against the server. Returns the account, or
 *  throws if the session is stale/revoked — never assume a token is good. */
export async function apiMe(token) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    checkAuthExpiry(res);
    throw new Error('Session expired');
  }
  return res.json();
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
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    let detail = 'Registration failed';
    try {
      const data = await res.json();
      detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json(); // { token, username, full_name, email, role, organization }
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
  try {
    const res = await fetch(`${API_BASE}/upload/sync-bundled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        overwrite,
        run_pipeline: runPipeline,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  // Fallback to /upload
  const fallbackRes = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      overwrite,
      run_pipeline: runPipeline,
    }),
  });
  if (!fallbackRes.ok) {
    const err = await fallbackRes.json().catch(() => ({}));
    throw new Error(err.detail || 'Upload sync failed');
  }
  return fallbackRes.json();
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

// --------------------------------------------------------------------------
// Super Admin API Suite
// --------------------------------------------------------------------------
export async function apiFetchSuperAdminOverview(token) {
  const res = await fetch(`${API_BASE}/superadmin/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = 'Failed to fetch system overview';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiFetchSuperAdminUsers(token, filters = {}) {
  const qs = new URLSearchParams();
  if (filters.search) qs.set('search', filters.search);
  if (filters.role) qs.set('role', filters.role);
  if (filters.status) qs.set('status', filters.status);
  if (filters.organization) qs.set('organization', filters.organization);

  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/superadmin/users${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = 'Failed to load user directory';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiCreateSuperAdminUser(token, userData) {
  const res = await fetch(`${API_BASE}/superadmin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    let detail = 'Failed to create user';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiUpdateSuperAdminUser(token, userId, updates) {
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    let detail = 'Failed to update user';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiResetSuperAdminUserPassword(token, userId, newPassword) {
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    let detail = 'Failed to reset password';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiDeleteSuperAdminUser(token, userId) {
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = 'Failed to delete user';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiFetchSuperAdminAuditLogs(token, limit = 50) {
  const res = await fetch(`${API_BASE}/superadmin/audit-logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = 'Failed to fetch audit stream';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function apiRunSuperAdminMaintenance(token) {
  const res = await fetch(`${API_BASE}/superadmin/system/maintenance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = 'Maintenance task failed';
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

