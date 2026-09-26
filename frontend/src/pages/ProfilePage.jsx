import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import { apiFetchProfile, apiUpdateProfile } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith?.('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <PhosphorIcon name={icon} size={16} weight="duotone" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
        <div className="text-[11px] text-slate-500 truncate">{label}</div>
      </div>
    </div>
  );
}

/**
 * The operator's own record: who they are, the organization they work under,
 * the mailboxes they connected and the datasets they imported.
 *
 * Imports are read from the server's provenance log rather than inferred
 * from the email rows — the inbox is shared, so no email "belongs" to a
 * user, and showing one as theirs would be inventing ownership.
 */
export function ProfilePage() {
  const { token, username, addToast, setActiveTab } = useApp();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', organization: '', job_title: '' });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const body = await apiFetchProfile(token);
      setData(body);
      setForm({
        full_name: body.user.full_name || '',
        email: body.user.email || '',
        organization: body.user.organization || '',
        job_title: body.user.job_title || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiUpdateProfile(form, token);
      addToast('Profile updated', 'success');
      setEditing(false);
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-400 text-xs py-16 justify-center">
        <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
        Loading your profile…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card title="Profile unavailable" icon="Warning">
        <p className="text-xs text-slate-600">{error || 'No profile data returned.'}</p>
        <div className="mt-3">
          <Button variant="outline" size="sm" icon="ArrowsClockwise" onClick={load}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  const { user, organization, mailboxes, uploads, activity, workspace } = data;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-white flex items-center justify-center text-xl font-bold shadow-sm shadow-brand-500/20 shrink-0">
          {(user.full_name || user.username || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 truncate">
            {user.full_name || user.username}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
            {user.username}
            {user.email ? ` · ${user.email}` : ''}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {[user.job_title, user.organization].filter(Boolean).join(' · ') ||
              'No organization recorded'}
            {' · joined '}{fmtDate(user.created_at)}
          </p>
        </div>
        <Button
          variant={editing ? 'ghost' : 'outline'}
          size="sm"
          icon={editing ? 'X' : 'Sliders'}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Cancel' : 'Edit details'}
        </Button>
      </div>

      {editing && (
        <Card title="Your details" subtitle="Only you can change these" icon="User">
          <form onSubmit={save} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['full_name', 'Full name', 'Jane Operator'],
                ['email', 'Work email', 'jane@company.com'],
                ['organization', 'Organization', 'Global Maritime Freight'],
                ['job_title', 'Job title', 'Documentation Officer'],
              ].map(([key, label, placeholder]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-700 block mb-1">{label}</label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={set(key)}
                    placeholder={placeholder}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Operators sharing an organization name are grouped together below.
            </p>
            <Button type="submit" variant="primary" size="sm" icon="FloppyDisk" loading={saving}>
              Save details
            </Button>
          </form>
        </Card>
      )}

      {/* Activity */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon="Files" label="Datasets imported" value={activity.datasets_imported} />
        <Stat icon="EnvelopeSimple" label="Mailboxes connected" value={activity.mailboxes_connected} />
        <Stat icon="Tray" label="Emails from your mailboxes" value={activity.emails_imported_from_mailboxes} />
        <Stat icon="UserFocus" label="Reviews resolved" value={activity.reviews_resolved} />
      </div>

      {/* Organization */}
      <Card
        title="Organization"
        subtitle={organization ? `${organization.member_count} member${organization.member_count === 1 ? '' : 's'} in ${organization.name}` : 'Not working under an organization'}
        icon="Buildings"
      >
        {organization ? (
          <ul className="space-y-2">
            {organization.members.map((m) => (
              <li
                key={m.username}
                className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                  m.is_you ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {(m.full_name || m.username).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-800 truncate">
                    {m.full_name || m.username}
                    {m.is_you && <span className="ml-1.5 text-[10px] text-brand-600 font-semibold">you</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {[m.job_title, m.role].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-5 border border-dashed border-slate-200 rounded-xl">
            <PhosphorIcon name="Buildings" size={22} weight="duotone" className="text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 mt-2">
              You aren’t recorded as working under an organization.
            </p>
            <Button
              variant="outline"
              size="sm"
              icon="Sliders"
              className="mt-3"
              onClick={() => setEditing(true)}
            >
              Add your organization
            </Button>
          </div>
        )}
      </Card>

      {/* Connected mailboxes */}
      <Card
        title="Connected mailboxes"
        subtitle="Live email sources you authorised"
        icon="EnvelopeSimple"
      >
        {mailboxes.length === 0 ? (
          <div className="text-center py-5 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs text-slate-500">No mailbox connected yet.</p>
            <Button
              variant="outline" size="sm" icon="PlugsConnected" className="mt-3"
              onClick={() => setActiveTab('settings')}
            >
              Connect one in Settings
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {mailboxes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                <PhosphorIcon name="EnvelopeSimple" size={16} weight="duotone" className="text-brand-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-800 truncate">{m.email_address}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {m.provider} · {m.folder} · {m.total_imported} imported · last sync {fmtDate(m.last_synced_at)}
                  </div>
                  {m.last_error && <div className="text-[11px] text-coral-600 mt-0.5">{m.last_error}</div>}
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                    m.status === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-coral-50 text-coral-700 border-coral-200'
                  }`}
                >
                  {m.status === 'CONNECTED' ? 'Connected' : 'Error'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Imports */}
      <Card
        title="Datasets you imported"
        subtitle={`The workspace currently holds ${workspace.total_emails} emails in total`}
        icon="Files"
      >
        {uploads.length === 0 ? (
          <div className="text-center py-5 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs text-slate-500">You haven’t imported anything yet.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Use <span className="font-medium">Upload</span> to load the bundled dataset,
              or sync a connected mailbox.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                <PhosphorIcon
                  name={u.source === 'mailbox' ? 'EnvelopeSimple' : 'Files'}
                  size={16} weight="duotone" className="text-slate-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-800 truncate">{u.label}</div>
                  <div className="text-[11px] text-slate-400">
                    {fmtDate(u.created_at)} · {u.emails_created} new
                    {' '}({u.emails_total} in the database afterwards)
                  </div>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-slate-100 text-slate-600 border-slate-200">
                  {u.source === 'mailbox' ? 'Mailbox sync' : 'Dataset'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default ProfilePage;
