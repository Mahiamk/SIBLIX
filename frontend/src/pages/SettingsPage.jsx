import React from 'react';
import { ConnectedMailboxes } from '../components/mailbox/ConnectedMailboxes';

/**
 * Settings.
 *
 * Deliberately only what a user can actually change. Earlier versions also
 * carried a backend URL field, pipeline toggles and a Save button that
 * persisted nothing, plus a panel restating the signed-in user and API
 * status already shown in the sidebar. All removed — the page holds one
 * real setting.
 */
export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Connect live email sources to verify alongside the bundled dataset
        </p>
      </div>

      <ConnectedMailboxes />
    </div>
  );
}

export default SettingsPage;
