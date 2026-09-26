import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';
import {
  apiFetchSuperAdminOverview,
  apiFetchSuperAdminUsers,
  apiCreateSuperAdminUser,
  apiUpdateSuperAdminUser,
  apiResetSuperAdminUserPassword,
  apiDeleteSuperAdminUser,
  apiFetchSuperAdminAuditLogs,
  apiRunSuperAdminMaintenance,
} from '../services/api';

const ROLE_COLORS = {
  superadmin: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20',
  admin: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20',
  lead: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
  operator: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
  auditor: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/20',
};

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Administrator',
  lead: 'Team Lead',
  operator: 'Operations Officer',
  auditor: 'Compliance Auditor',
};

export function SuperAdminPage() {
  const { token, username: currentUsername, isSuperAdmin, addToast, setActiveTab } = useApp();

  const [activeSection, setActiveSection] = useState('users'); // 'users' | 'tenants' | 'telemetry' | 'audit'
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    email: '',
    full_name: '',
    role: 'operator',
    organization: '',
    job_title: '',
  });

  const [editForm, setEditForm] = useState({
    role: 'operator',
    status: 'active',
    organization: '',
    job_title: '',
    full_name: '',
    email: '',
  });

  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState(null);

  // Redirect non-superadmins
  useEffect(() => {
    if (!isSuperAdmin) {
      addToast({
        title: 'Access Restricted',
        message: 'Super Administrator privileges are required to view this area.',
        type: 'error',
      });
      setActiveTab('dashboard');
    }
  }, [isSuperAdmin, addToast, setActiveTab]);

  // Load Overview & Users
  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewData, usersData] = await Promise.all([
        apiFetchSuperAdminOverview(token),
        apiFetchSuperAdminUsers(token, {
          search: searchQuery || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        }),
      ]);
      setOverview(overviewData);
      setUsers(usersData);
    } catch (err) {
      addToast({
        title: 'Error loading admin data',
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin && token) {
      loadData();
    }
  }, [isSuperAdmin, token, searchQuery, roleFilter, statusFilter]);

  // Load audit logs when switching to audit tab
  useEffect(() => {
    if (activeSection === 'audit' && token) {
      apiFetchSuperAdminAuditLogs(token, 100)
        .then((logs) => setAuditLogs(logs))
        .catch((err) =>
          addToast({ title: 'Failed to load audit stream', message: err.message, type: 'error' })
        );
    }
  }, [activeSection, token, addToast]);

  // Create User Handler
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createForm.username || !createForm.password) {
      addToast({ title: 'Validation error', message: 'Username and password are required', type: 'error' });
      return;
    }
    setActionLoading(true);
    try {
      await apiCreateSuperAdminUser(token, createForm);
      addToast({
        title: 'User provisioned',
        message: `Account '${createForm.username}' created successfully.`,
        type: 'success',
      });
      setCreateModalOpen(false);
      setCreateForm({
        username: '',
        password: '',
        email: '',
        full_name: '',
        role: 'operator',
        organization: '',
        job_title: '',
      });
      loadData();
    } catch (err) {
      addToast({ title: 'Provisioning failed', message: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Edit User Handler
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setActionLoading(true);
    try {
      await apiUpdateSuperAdminUser(token, editUser.id, editForm);
      addToast({
        title: 'Account updated',
        message: `User '${editUser.username}' updated successfully.`,
        type: 'success',
      });
      setEditUser(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Update failed', message: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Reset Password Handler
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!passwordModalUser || !newPassword) return;
    setActionLoading(true);
    try {
      await apiResetSuperAdminUserPassword(token, passwordModalUser.id, newPassword);
      addToast({
        title: 'Password Reset',
        message: `Credentials for '${passwordModalUser.username}' updated.`,
        type: 'success',
      });
      setPasswordModalUser(null);
      setNewPassword('');
    } catch (err) {
      addToast({ title: 'Reset failed', message: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Suspend / Activate
  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    try {
      await apiUpdateSuperAdminUser(token, user.id, { status: nextStatus });
      addToast({
        title: nextStatus === 'active' ? 'Account Activated' : 'Account Suspended',
        message: `User '${user.username}' is now ${nextStatus}.`,
        type: 'success',
      });
      loadData();
    } catch (err) {
      addToast({ title: 'Action failed', message: err.message, type: 'error' });
    }
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setActionLoading(true);
    try {
      await apiDeleteSuperAdminUser(token, deleteConfirmUser.id);
      addToast({
        title: 'Account Removed',
        message: `User '${deleteConfirmUser.username}' permanently deleted.`,
        type: 'success',
      });
      setDeleteConfirmUser(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Delete failed', message: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Maintenance Trigger
  const handleRunMaintenance = async () => {
    setActionLoading(true);
    try {
      const res = await apiRunSuperAdminMaintenance(token);
      setMaintenanceResult(res);
      addToast({
        title: 'Maintenance Completed',
        message: 'Database schema and pool verification passed.',
        type: 'success',
      });
      loadData();
    } catch (err) {
      addToast({ title: 'Maintenance failed', message: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm shadow-purple-600/20">
              <PhosphorIcon name="ShieldCheck" size={24} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Super Admin Command Center</h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  Global Control Plane
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized multi-tenant user governance, identity security, system telemetry, and audit compliance.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            icon={<PhosphorIcon name="ArrowClockwise" size={15} className={loading ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            icon={<PhosphorIcon name="UserPlus" size={16} weight="bold" />}
            className="bg-purple-600 hover:bg-purple-700 text-white border-transparent"
          >
            Provision User
          </Button>
        </div>
      </div>

      {/* KPI Tiles Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Users</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.total_users ?? users.length}
            </span>
            <span className="text-[11px] text-emerald-600 font-medium">
              {overview?.active_users ?? 0} active
            </span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tenants / Orgs</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.total_organizations ?? 0}
            </span>
            <span className="text-[10px] text-slate-400">Isolated</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Shipments</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.total_shipments ?? 0}
            </span>
            <span className="text-[10px] text-brand-600 font-medium">Indexed</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Parsed Documents</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.total_documents ?? 0}
            </span>
            <span className="text-[10px] text-slate-400">SI & BL</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Audit Trail Records</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.total_audit_events ?? 0}
            </span>
            <span className="text-[10px] text-emerald-600 font-medium">Tamper-Proof</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between bg-slate-900 text-white border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Database Status</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-white truncate">Neon Postgres</span>
          </div>
        </Card>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSection('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeSection === 'users'
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PhosphorIcon name="Users" size={16} weight={activeSection === 'users' ? 'duotone' : 'regular'} />
          <span>User Management</span>
          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-600">
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('tenants')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeSection === 'tenants'
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PhosphorIcon name="Buildings" size={16} weight={activeSection === 'tenants' ? 'duotone' : 'regular'} />
          <span>Organizations & Tenants</span>
          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-600">
            {overview?.total_organizations ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('telemetry')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeSection === 'telemetry'
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PhosphorIcon name="Cpu" size={16} weight={activeSection === 'telemetry' ? 'duotone' : 'regular'} />
          <span>System Telemetry</span>
        </button>

        <button
          onClick={() => setActiveSection('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeSection === 'audit'
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PhosphorIcon name="ShieldCheck" size={16} weight={activeSection === 'audit' ? 'duotone' : 'regular'} />
          <span>Security Audit Stream</span>
        </button>
      </div>

      {/* SECTION 1: USER MANAGEMENT */}
      {activeSection === 'users' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <PhosphorIcon name="MagnifyingGlass" size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username, email, name, or company..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-white border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm"
              >
                <option value="">All Roles</option>
                <option value="superadmin">Super Admin</option>
                <option value="admin">Administrator</option>
                <option value="lead">Team Lead</option>
                <option value="operator">Operations Officer</option>
                <option value="auditor">Auditor</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 text-xs rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <Card className="overflow-hidden border border-slate-200/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Organization & Title</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        {loading ? 'Loading user registry...' : 'No accounts match the selected filters.'}
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const roleKey = (u.role || 'operator').toLowerCase();
                      const isSelf = u.username === currentUsername;
                      const isSuspended = u.status === 'suspended';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                                {(u.full_name || u.username).substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-900">{u.username}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-medium">
                                      You
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block">{u.email || 'No email registered'}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                                ROLE_COLORS[roleKey] || 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {ROLE_LABELS[roleKey] || u.role}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-medium text-slate-800 block">
                                {u.organization || <span className="text-slate-400 italic">Global / Unassigned</span>}
                              </span>
                              <span className="text-[11px] text-slate-400">{u.job_title || 'Operator'}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                isSuspended
                                  ? 'bg-coral-50 text-coral-700 border border-coral-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSuspended ? 'bg-coral-500' : 'bg-emerald-500 animate-pulse'
                                }`}
                              />
                              {isSuspended ? 'Suspended' : 'Active'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit details */}
                              <button
                                onClick={() => {
                                  setEditUser(u);
                                  setEditForm({
                                    role: u.role || 'operator',
                                    status: u.status || 'active',
                                    organization: u.organization || '',
                                    job_title: u.job_title || '',
                                    full_name: u.full_name || '',
                                    email: u.email || '',
                                  });
                                }}
                                title="Edit Role & Organization"
                                className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              >
                                <PhosphorIcon name="PencilSimple" size={15} />
                              </button>

                              {/* Reset password */}
                              <button
                                onClick={() => {
                                  setPasswordModalUser(u);
                                  setNewPassword('');
                                }}
                                title="Reset User Password"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <PhosphorIcon name="Key" size={15} />
                              </button>

                              {/* Suspend / Activate */}
                              {!isSelf && (
                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  title={isSuspended ? 'Reactivate Account' : 'Suspend Account'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isSuspended
                                      ? 'text-emerald-600 hover:bg-emerald-50'
                                      : 'text-amber-600 hover:bg-amber-50'
                                  }`}
                                >
                                  <PhosphorIcon
                                    name={isSuspended ? 'CheckCircle' : 'Prohibit'}
                                    size={15}
                                  />
                                </button>
                              )}

                              {/* Delete */}
                              {!isSelf && (
                                <button
                                  onClick={() => setDeleteConfirmUser(u)}
                                  title="Permanently Delete Account"
                                  className="p-1.5 text-slate-400 hover:text-coral-600 hover:bg-coral-50 rounded-lg transition-colors"
                                >
                                  <PhosphorIcon name="Trash" size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 2: TENANTS & ORGANIZATIONS */}
      {activeSection === 'tenants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Registered Tenant Organizations</h2>
              <p className="text-xs text-slate-500">
                Multi-tenant data partitioning enforces strict cryptographic boundary separation for shipping dossiers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {overview?.organizations?.length === 0 ? (
              <Card className="p-6 text-center text-slate-400 col-span-3">
                No distinct organizations registered yet. Users will be automatically grouped as organizations are assigned.
              </Card>
            ) : (
              overview?.organizations?.map((org) => (
                <Card key={org.name} className="p-5 flex flex-col justify-between hover:border-purple-200 transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
                        {org.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Isolated Tenant
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 mt-3">{org.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Maritime Trade & Clearing Participant</p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>Provisioned Members:</span>
                    <span className="font-mono font-bold text-purple-700">{org.user_count}</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: SYSTEM TELEMETRY */}
      {activeSection === 'telemetry' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Database & Infrastructure Card */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PhosphorIcon name="Database" size={20} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Database Engine Architecture</h3>
                  <p className="text-[11px] text-slate-500">Managed Serverless PostgreSQL (Neon Instance)</p>
                </div>
              </div>

              <div className="space-y-2 text-xs divide-y divide-slate-100">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Connection URL Dialect</span>
                  <span className="font-mono text-slate-800">postgresql+psycopg (v3 universal)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">SSL Connection Mode</span>
                  <span className="font-mono text-emerald-600 font-semibold">sslmode=require</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Connection Pool Recycle</span>
                  <span className="font-mono text-slate-800">300 seconds (pre-ping enabled)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Serverless Runtime</span>
                  <span className="font-mono text-slate-800">Python 3.12 (CPython x86_64)</span>
                </div>
              </div>
            </Card>

            {/* Application & Edge Card */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <PhosphorIcon name="Globe" size={20} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Edge Gateway & Delivery</h3>
                  <p className="text-[11px] text-slate-500">Vercel Edge Network & Serverless Execution</p>
                </div>
              </div>

              <div className="space-y-2 text-xs divide-y divide-slate-100">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Application Version</span>
                  <span className="font-mono text-slate-800">SIBLIX v1.0.0 (Production)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">API Documentation Portal</span>
                  <a href="/docs" target="_blank" className="font-mono text-brand-600 underline">
                    /docs (Swagger UI)
                  </a>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Analytics Telemetry</span>
                  <span className="font-mono text-emerald-600 font-semibold">@vercel/analytics Enabled</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Speed Insights CWV</span>
                  <span className="font-mono text-emerald-600 font-semibold">@vercel/speed-insights Enabled</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Maintenance Action Row */}
          <Card className="p-5 bg-gradient-to-r from-purple-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <PhosphorIcon name="Sparkle" size={18} weight="duotone" className="text-purple-300" />
                Database Schema & Migration Health Scan
              </h3>
              <p className="text-xs text-purple-200/80 mt-1 max-w-xl">
                Executes additive schema verifications across all tables (`users`, `documents`, `audit_logs`, `shipments`)
                and confirms pool readiness.
              </p>
            </div>
            <Button
              onClick={handleRunMaintenance}
              disabled={actionLoading}
              className="bg-purple-500 hover:bg-purple-400 text-white font-semibold text-xs px-4 py-2 shrink-0 shadow-lg"
            >
              {actionLoading ? 'Running Scan...' : 'Trigger Maintenance Check'}
            </Button>
          </Card>

          {maintenanceResult && (
            <Card className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <div className="font-semibold flex items-center gap-1.5">
                <PhosphorIcon name="CheckCircle" size={16} className="text-emerald-600" />
                Maintenance Verification Success
              </div>
              <ul className="mt-2 list-disc list-inside space-y-1 text-emerald-800">
                {maintenanceResult.actions_completed?.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* SECTION 4: SECURITY AUDIT STREAM */}
      {activeSection === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Super Admin Security & Audit Stream</h2>
              <p className="text-xs text-slate-500">
                Cryptographically signed immutable events recording all role changes, user creations, and authentication overrides.
              </p>
            </div>
          </div>

          <Card className="divide-y divide-slate-100 overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No administrative audit records logged yet.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                    <PhosphorIcon name="Shield" size={17} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900 font-mono">{log.action}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                        {log.severity || 'INFO'}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{log.description}</p>
                    <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-2 font-mono">
                      <span>Operator: {log.operator_id || log.owner || 'system'}</span>
                      <span>Tenant: {log.organization || 'Global'}</span>
                      {log.verification_hash && (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <PhosphorIcon name="LockKey" size={12} />
                          {log.verification_hash}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {/* MODAL 1: PROVISION USER */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PhosphorIcon name="UserPlus" size={18} className="text-purple-600" />
                Provision New User Account
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <PhosphorIcon name="X" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="e.g. operator_john"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="john@company.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    System Role *
                  </label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none bg-white"
                  >
                    <option value="operator">Operations Officer</option>
                    <option value="lead">Team Lead</option>
                    <option value="auditor">Compliance Auditor</option>
                    <option value="admin">Administrator</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Organization / Tenant
                  </label>
                  <input
                    type="text"
                    value={createForm.organization}
                    onChange={(e) => setCreateForm({ ...createForm, organization: e.target.value })}
                    placeholder="e.g. Awash Bank"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={createForm.job_title}
                  onChange={(e) => setCreateForm({ ...createForm, job_title: e.target.value })}
                  placeholder="Senior Import/Export Specialist"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {actionLoading ? 'Creating...' : 'Provision User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT USER ROLE / ORG */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PhosphorIcon name="PencilSimple" size={18} className="text-purple-600" />
                Modify User: {editUser.username}
              </h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <PhosphorIcon name="X" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    System Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none bg-white"
                  >
                    <option value="operator">Operations Officer</option>
                    <option value="lead">Team Lead</option>
                    <option value="auditor">Compliance Auditor</option>
                    <option value="admin">Administrator</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Account Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Organization / Tenant
                </label>
                <input
                  type="text"
                  value={editForm.organization}
                  onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                  placeholder="e.g. Ethiopian Shipping Lines"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={editForm.job_title}
                  onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                  placeholder="Terminal Inspector"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditUser(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RESET PASSWORD */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PhosphorIcon name="Key" size={18} className="text-amber-500" />
                Reset Password
              </h3>
              <button onClick={() => setPasswordModalUser(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <PhosphorIcon name="X" size={16} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
              <p className="text-xs text-slate-600">
                Set a new password for <span className="font-semibold text-slate-900">{passwordModalUser.username}</span>.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPasswordModalUser(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {actionLoading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM DELETE */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-coral-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-coral-50 flex items-center justify-center shrink-0">
                <PhosphorIcon name="WarningCircle" size={24} weight="duotone" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Delete Account?</h3>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-slate-900 font-mono">{deleteConfirmUser.username}</span>?
              This action cannot be undone.
            </p>

            <div className="pt-4 mt-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteConfirmUser(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="bg-coral-600 hover:bg-coral-700 text-white"
              >
                {actionLoading ? 'Deleting...' : 'Permanently Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminPage;
