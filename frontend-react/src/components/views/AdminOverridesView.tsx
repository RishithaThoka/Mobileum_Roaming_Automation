import React, { useEffect, useState } from 'react';
import {
  Sliders, Plus, Search, Trash2, Edit2, CheckCircle2, Globe, Building2,
  AlertTriangle, Loader2, X, RefreshCw, Sparkles
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Override } from '../../types';

// @ts-ignore
const API_BASE = import.meta.env.VITE_API_URL || '';

const DOMAIN_OPTIONS = [
  'General', 'Routing (GT)', 'Security (IPsec)', 'Commercial (IOT)', 'Network (Core)',
];
const DOMAIN_COLORS: Record<string, string> = {
  'General':           'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Routing (GT)':      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Security (IPsec)':  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  'Commercial (IOT)':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  'Network (Core)':    'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
};
const domainColor = (d: string) => DOMAIN_COLORS[d] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

interface ToastMsg { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastMsg & { onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center space-x-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      <span>{message}</span>
      <button onClick={onClose}><X className="w-3.5 h-3.5" /></button>
    </div>
  );
};

// ── Carry-over badge ──────────────────────────────────────────────────────────
const CarryOverBadge: React.FC = () => (
  <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
    <Sparkles className="w-2.5 h-2.5" />
    <span>new vers</span>
  </span>
);

// ── Form state ────────────────────────────────────────────────────────────────
interface OverrideForm {
  field_path: string;
  domain: string;
  operator_id: string; // empty = global
}
const EMPTY_FORM: OverrideForm = { field_path: '', domain: 'General', operator_id: '' };

// ── Override table row ────────────────────────────────────────────────────────
interface OverrideRowProps {
  override: Override;
  onEdit: (o: Override) => void;
  onDelete: (id: string) => void;
  newVersionIds: Set<string>;
}
const OverrideRow: React.FC<OverrideRowProps> = ({ override, onEdit, onDelete, newVersionIds }) => {
  const isNew = newVersionIds.has(override.id);
  const isGlobal = !override.operator_id;

  return (
    <div className={`grid grid-cols-[3fr_2fr_2fr_1.5fr_1.5fr_auto] gap-3 px-4 py-3 items-center text-xs transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/20 ${isNew ? 'ring-1 ring-emerald-400/40 bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
      {/* Field path */}
      <div className="font-mono text-slate-700 dark:text-slate-300 truncate" title={override.field_path}>
        {override.field_path}
      </div>
      {/* Domain */}
      <div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${domainColor(override.domain)}`}>
          {override.domain}
        </span>
      </div>
      {/* Scope */}
      <div className="flex items-center space-x-1.5">
        {isGlobal
          ? <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-600 dark:text-slate-400"><Globe className="w-3 h-3" /><span>* (global)</span></span>
          : <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-600 dark:text-slate-400"><Building2 className="w-3 h-3" /><span>{override.operator_name || override.operator_id}</span></span>
        }
      </div>
      {/* Carry-over */}
      <div>
        <CarryOverBadge />
      </div>
      {/* Created */}
      <div className="font-mono text-slate-400 text-[10px]">
        {override.created_at ? override.created_at.slice(0, 10) : '—'}
      </div>
      {/* Actions */}
      <div className="flex items-center space-x-1 justify-end">
        <button onClick={() => onEdit(override)} className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(override.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ── Main AdminOverridesView ───────────────────────────────────────────────────
export const AdminOverridesView: React.FC = () => {
  const { adminOverrides, fetchAdminOverrides, operators } = useStore();
  const token = localStorage.getItem('admin_token') || '';

  const [activeTab, setActiveTab] = useState<'global' | 'operator'>('global');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OverrideForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  // Track recently-created override IDs for "new version" badge animation
  const [newVersionIds] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAdminOverrides(); }, []);

  const globalOverrides = adminOverrides.filter(o => !o.operator_id);
  const operatorOverrides = adminOverrides.filter(o => !!o.operator_id);

  const visibleOverrides = (activeTab === 'global' ? globalOverrides : operatorOverrides).filter(o => {
    const q = search.toLowerCase();
    return !q || o.field_path.toLowerCase().includes(q) || o.domain.toLowerCase().includes(q) || (o.operator_name || '').toLowerCase().includes(q);
  });

  const handleEdit = (o: Override) => {
    setEditingId(o.id);
    setForm({ field_path: o.field_path, domain: o.domain, operator_id: o.operator_id || '' });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.field_path.trim()) {
      setToast({ message: 'Field path is required.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        field_path: form.field_path.trim(),
        domain: form.domain,
        operator_id: form.operator_id || null,
      };
      const url = editingId
        ? `${API_BASE}/api/ownership/overrides/${editingId}`
        : `${API_BASE}/api/ownership/overrides`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast({ message: editingId ? 'Override updated.' : 'Override created.', type: 'success' });
        handleCancel();
        await fetchAdminOverrides();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Save failed.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this override?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/ownership/overrides/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setToast({ message: 'Override deleted.', type: 'success' });
        await fetchAdminOverrides();
      }
    } catch {
      setToast({ message: 'Delete failed.', type: 'error' });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/20">
            <Sliders className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Ownership Overrides</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Per-operator or global overrides — highest precedence in classification chain</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => fetchAdminOverrides()} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM, operator_id: activeTab === 'operator' ? '' : '' }); setShowForm(true); }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-500/20 transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>Add Override</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 w-fit">
        {([['global', 'Global Overrides', globalOverrides.length], ['operator', 'Operator-Scoped', operatorOverrides.length]] as const).map(([tab, label, count]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'global' ? <Globe className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
            <span>{label}</span>
            <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full ${activeTab === tab ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by field path, domain, or operator..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono font-bold">{visibleOverrides.length} entries</span>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700/40 rounded-2xl overflow-hidden shadow-lg shadow-amber-500/5">
          <div className="px-5 py-3.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-700/40 flex items-center justify-between">
            <span className="font-bold text-sm text-amber-800 dark:text-amber-300">{editingId ? 'Edit Override' : 'New Override'}</span>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Field Path <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.field_path}
                onChange={e => setForm(f => ({ ...f, field_path: e.target.value }))}
                placeholder="e.g. General.VPMN"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Domain Override</label>
              <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500">
                {DOMAIN_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Scope — Operator <span className="font-normal text-slate-400">(blank = global)</span>
              </label>
              <select
                value={form.operator_id}
                onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">* Global (all operators)</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name} ({op.mccMnc})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="px-5 pb-5 flex justify-end space-x-3">
            <button onClick={handleCancel} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button disabled={saving || !form.field_path.trim()} onClick={handleSave} className="flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{saving ? 'Saving...' : 'Save override'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3fr_2fr_2fr_1.5fr_1.5fr_auto] gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <div>Field Path</div>
          <div>Domain Override</div>
          <div>Scope</div>
          <div>Carry-over</div>
          <div>Created</div>
          <div className="text-right">Actions</div>
        </div>

        {visibleOverrides.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            {search
              ? 'No overrides match your search.'
              : `No ${activeTab === 'global' ? 'global' : 'operator-scoped'} overrides configured.`}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {visibleOverrides.map(override => (
              <OverrideRow
                key={override.id}
                override={override}
                onEdit={handleEdit}
                onDelete={handleDelete}
                newVersionIds={newVersionIds}
              />
            ))}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
