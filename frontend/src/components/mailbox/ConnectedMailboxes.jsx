import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import {
  apiListMailboxes,
  apiConnectMailbox,
  apiTestMailbox,
  apiSyncMailbox,
  apiDisconnectMailbox,
} from '../../services/api';

const PROVIDERS = [
  {
    id: 'gmail',
    label: 'Gmail',
    hint: 'Gmail rejects your normal Google password over IMAP — use a 16-character App Password.',
    link: { href: 'https://myaccount.google.com/apppasswords', label: 'Create a Google App Password' },
  },
  {
    id: 'outlook',
    label: 'Outlook / M365',
    hint: 'Outlook.com with 2-step verification needs an app password. Many Microsoft 365 work accounts block IMAP entirely.',
    link: { href: 'https://account.microsoft.com/security', label: 'Microsoft security settings' },
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    hint: 'Yahoo requires an app password generated under Account Security.',
    link: { href: 'https://login.yahoo.com/account/security', label: 'Yahoo account security' },
  },
  {
    id: 'icloud',
    label: 'iCloud',
    hint: 'iCloud requires an Apple app-specific password.',
    link: { href: 'https://account.apple.com', label: 'Apple account security' },
  },
  {
    id: 'imap',
    label: 'Other IMAP',
    hint: 'Enter your provider’s IMAP host and port. Most providers need IMAP switched on first.',
    link: null,
  },
];

const BLANK = {
  provider: 'gmail',
  email_address: '',
  password: '',
  imap_host: '',
  imap_port: 993,
  folder: 'INBOX',
};

function relativeTime(iso) {
  if (!iso) return 'never';
  const then = new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/**
 * Connect a real mailbox as a live source of shipping email, alongside the
 * bundled dataset. Fetched messages run through the same verification
 * pipeline, so anything imported here shows up in the Inbox, the Review
 * Queue and the dashboard exactly like dataset email does.
 */
export function ConnectedMailboxes() {
  const { token, addToast, refreshData, isBackendConnected } = useApp();

  const [accounts, setAccounts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState('');          // '', 'test', 'connect', 'sync-<id>'
  const [testResult, setTestResult] = useState(null);

  const custom = form.provider === 'imap';
  const provider = PROVIDERS.find((p) => p.id === form.provider) || PROVIDERS[0];

  const load = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      setAccounts(await apiListMailboxes(token));
    } catch {
      setAccounts([]);   // backend down — the empty state explains itself
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const payload = () => ({
    provider: form.provider,
    email_address: form.email_address.trim(),
    password: form.password,
    folder: form.folder.trim() || 'INBOX',
    ...(custom ? { imap_host: form.imap_host.trim(), imap_port: Number(form.imap_port) || 993 } : {}),
  });

  const handleTest = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const res = await apiTestMailbox(payload(), token);
      setTestResult({ ok: true, text: `Connected — ${res.message_count} messages in ${res.folder}.` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setBusy('');
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setBusy('connect');
    try {
      const account = await apiConnectMailbox(payload(), token);
      addToast(`Connected ${account.email_address}`, 'success');
      setForm(BLANK);
      setTestResult(null);
      setShowForm(false);
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleSync = async (account) => {
    setBusy(`sync-${account.id}`);
    try {
      const res = await apiSyncMailbox(account.id, token);
      addToast(
        res.imported > 0
          ? `Imported ${res.imported} email${res.imported === 1 ? '' : 's'} — verification running`
          : 'No new email since the last sync',
        res.imported > 0 ? 'success' : 'info',
      );
      await load();
      if (res.imported > 0) setTimeout(() => refreshData(false), 1500);
    } catch (err) {
      addToast(err.message, 'error');
      await load();
    } finally {
      setBusy('');
    }
  };

  const handleDisconnect = async (account) => {
    setBusy(`sync-${account.id}`);
    try {
      await apiDisconnectMailbox(account.id, token);
      addToast(`Disconnected ${account.email_address}`, 'info');
      await load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card
      title="Connected Mailboxes"
      subtitle="Verify shipping email straight from a real inbox over IMAP"
      icon="EnvelopeSimple"
    >
      <div className="space-y-4">
        {!isBackendConnected && (
          <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <PhosphorIcon name="Warning" size={14} weight="duotone" className="mt-0.5" />
            <span>
              The backend looks unreachable. You can still try to connect — any
              failure will say exactly what went wrong.
            </span>
          </div>
        )}

        {/* Connected accounts */}
        {loadingList ? (
          <p className="text-[11px] text-slate-400">Loading mailboxes…</p>
        ) : accounts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
            <PhosphorIcon name="EnvelopeSimple" size={24} weight="duotone" className="text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 mt-2">No mailbox connected yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Connect one to verify live email instead of the bundled dataset.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  <PhosphorIcon name="EnvelopeSimple" size={16} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {a.email_address}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                        a.status === 'CONNECTED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-coral-50 text-coral-700 border-coral-200'
                      }`}
                    >
                      {a.status === 'CONNECTED' ? 'Connected' : 'Error'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {a.imap_host}:{a.imap_port} · {a.folder} · {a.total_imported} imported ·
                    {' '}synced {relativeTime(a.last_synced_at)}
                  </div>
                  {a.last_error && (
                    <div className="text-[11px] text-coral-600 mt-0.5">{a.last_error}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    icon="ArrowsClockwise"
                    loading={busy === `sync-${a.id}`}
                    onClick={() => handleSync(a)}
                  >
                    Sync
                  </Button>
                  <button
                    onClick={() => handleDisconnect(a)}
                    title={`Disconnect ${a.email_address}`}
                    aria-label={`Disconnect ${a.email_address}`}
                    className="p-2 rounded-xl text-slate-400 hover:text-coral-600 hover:bg-coral-50 transition-colors"
                  >
                    <PhosphorIcon name="X" size={14} weight="duotone" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Connect form */}
        {!showForm ? (
          <Button
            variant="outline"
            size="sm"
            icon="PlugsConnected"
            onClick={() => setShowForm(true)}
          >
            Connect a mailbox
          </Button>
        ) : (
          <form onSubmit={handleConnect} className="space-y-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Provider</label>
              <div className="flex flex-wrap gap-1.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, provider: p.id }))}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      form.provider === p.id
                        ? 'bg-brand-50 border-brand-200 text-brand-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">{provider.hint}</p>
              {provider.link && (
                <a
                  href={provider.link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 hover:underline mt-1"
                >
                  <PhosphorIcon name="ArrowUpRight" size={11} weight="duotone" />
                  {provider.link.label}
                </a>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Email address</label>
                <input
                  type="email"
                  required
                  value={form.email_address}
                  onChange={set('email_address')}
                  placeholder="operations@yourcompany.com"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  {form.provider === 'imap' ? 'Password' : 'App password'}
                </label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={set('password')}
                  placeholder={form.provider === 'imap' ? '••••••••••••' : 'abcd efgh ijkl mnop'}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                />
                {form.provider !== 'imap' && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Not your normal account password.
                  </p>
                )}
              </div>
            </div>

            {custom && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">IMAP host</label>
                  <input
                    type="text"
                    required
                    value={form.imap_host}
                    onChange={set('imap_host')}
                    placeholder="imap.yourcompany.com"
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Port</label>
                  <input
                    type="number"
                    value={form.imap_port}
                    onChange={set('imap_port')}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Folder</label>
              <input
                type="text"
                value={form.folder}
                onChange={set('folder')}
                placeholder="INBOX"
                className="w-full sm:w-52 text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
              />
            </div>

            {testResult && (
              <div
                className={`text-[11px] rounded-xl px-3 py-2 border ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-coral-50 text-coral-700 border-coral-200'
                }`}
              >
                {testResult.text}
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Credentials are sent to your own backend and stored encrypted. Only
              .txt, .pdf, .docx and .xlsx attachments are imported.
            </p>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" icon="PlugsConnected" loading={busy === 'connect'}>
                Connect
              </Button>
              <Button type="button" variant="outline" size="sm" loading={busy === 'test'} onClick={handleTest}>
                Test connection
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setTestResult(null); setForm(BLANK); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

export default ConnectedMailboxes;
