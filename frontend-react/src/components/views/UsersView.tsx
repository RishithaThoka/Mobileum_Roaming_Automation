import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit3, Shield, AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff, Copy, Check } from 'lucide-react';

// @ts-ignore
const API_BASE = import.meta.env.VITE_API_URL || '';

const VALID_ROLES = ['Admin', 'Analyst', 'Approver', 'CPO/Exec', 'Auditor'];
const VALID_DOMAINS = [
  'Security (IPsec)',
  'Routing (GT)',
  'Commercial (IOT)',
  'Packet Core (APN)',
  'Voice/SMS (IMSI)',
];

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  approved_domains: string[] | null;
  status: string;
  created_at: string;
}

const getHeaders = () => {
  const token = localStorage.getItem('admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create user state
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('Analyst');
  const [newDomains, setNewDomains] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDomains, setEditDomains] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body: any = { username: newUsername, full_name: newFullName, role: newRole };
      if (newRole === 'Approver') body.approved_domains = newDomains;

      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create user');
      }

      const data = await res.json();
      setTempPassword(data.temp_password);
      setNewUsername('');
      setNewFullName('');
      setNewRole('Analyst');
      setNewDomains([]);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    setError(null);
    try {
      const body: any = {};
      if (editFullName !== editingUser.full_name) body.full_name = editFullName;
      if (editRole !== editingUser.role) body.role = editRole;
      if (editStatus !== editingUser.status) body.status = editStatus;
      if (editRole === 'Approver') {
        body.approved_domains = editDomains;
      }

      const res = await fetch(`${API_BASE}/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update user');
      }

      const result = await res.json();
      setEditingUser(null);
      await fetchUsers();
      if (result.sessions_invalidated) {
        // Show a brief note
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.full_name);
    setEditRole(user.role);
    setEditDomains(user.approved_domains || []);
    setEditStatus(user.status);
  };

  const copyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleDomain = (domain: string, domains: string[], setDomains: (d: string[]) => void) => {
    if (domains.includes(domain)) {
      setDomains(domains.filter(d => d !== domain));
    } else {
      setDomains([...domains, domain]);
    }
  };

  const roleColors: Record<string, string> = {
    Admin: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    Analyst: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Approver: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'CPO/Exec': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    Auditor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">User Management</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage accounts, roles, and domain assignments</p>
          </div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setTempPassword(null); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create User</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center space-x-3 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Temp Password Display */}
      {tempPassword && (
        <div className="p-5 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-bold">New Account Created — Save This Password Now</span>
          </div>
          <p className="text-xs text-amber-300/80">
            This password will <strong>never be shown again</strong>. Copy it now and share it securely with the user.
          </p>
          <div className="flex items-center space-x-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <code className="text-sm font-mono text-emerald-400 flex-1">{tempPassword}</code>
            <button
              onClick={copyPassword}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
          <button
            onClick={() => setTempPassword(null)}
            className="text-xs text-amber-400 hover:text-amber-300 font-mono"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create User Panel */}
      {showCreate && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create New User</h3>
            <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-200">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Username (Email)</label>
                <input
                  type="email"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                {VALID_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {newRole === 'Approver' && (
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Approved Domains</label>
                <div className="flex flex-wrap gap-2">
                  {VALID_DOMAINS.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDomain(d, newDomains, setNewDomains)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                        newDomains.includes(d)
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {newDomains.includes(d) ? '✓ ' : ''}{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-300 font-semibold">Cancel</button>
              <button
                type="submit"
                disabled={creating || (newRole === 'Approver' && newDomains.length === 0)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit User Panel */}
      {editingUser && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit User: {editingUser.username}</h3>
            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-200">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  {VALID_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {editRole === 'Approver' && (
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Approved Domains</label>
                <div className="flex flex-wrap gap-2">
                  {VALID_DOMAINS.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDomain(d, editDomains, setEditDomains)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                        editDomains.includes(d)
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {editDomains.includes(d) ? '✓ ' : ''}{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Status</label>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setEditStatus('active')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors border ${
                    editStatus === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Active</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditStatus('inactive')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors border ${
                    editStatus === 'inactive'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Inactive</span>
                </button>
              </div>
              {editStatus === 'inactive' && editingUser.status === 'active' && (
                <p className="text-[10px] text-rose-400 mt-1">⚠ Setting to Inactive will immediately log this user out and block future logins.</p>
              )}
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-300 font-semibold">Cancel</button>
              <button
                type="submit"
                disabled={saving || (editRole === 'Approver' && editDomains.length === 0)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {users.length} Registered Account{users.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                  <th className="px-6 py-3">Username</th>
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Domain(s)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/30 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold text-slate-900 dark:text-white">{user.username}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.full_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleColors[user.role] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                      {user.approved_domains && user.approved_domains.length > 0
                        ? user.approved_domains.join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {user.status === 'active' ? (
                        <span className="flex items-center space-x-1 text-emerald-500 font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-rose-400 font-bold">
                          <XCircle className="w-3 h-3" />
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
