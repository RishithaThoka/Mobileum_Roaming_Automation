import React, { useEffect, useState } from 'react';
import {
  Shield, Plus, Search, Trash2, ToggleLeft, ToggleRight,
  Play, Save, AlertTriangle, CheckCircle2, Loader2, X,
  Edit2, RefreshCw, Info, ChevronDown
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { AdminRule } from '../../types';

// @ts-ignore
const API_BASE = import.meta.env.VITE_API_URL || '';

const DOMAIN_OPTIONS = [
  'General',
  'Routing (GT)',
  'Security (IPsec)',
  'Commercial (IOT)',
  'Network (Core)',
];

const DOMAIN_COLORS: Record<string, string> = {
  'General':           'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Routing (GT)':      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Security (IPsec)':  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  'Commercial (IOT)':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  'Network (Core)':    'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
};
const domainColor = (d: string) => DOMAIN_COLORS[d] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

// ── Toast ─────────────────────────────────────────────────────────────────────
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

// ── Dry-run preview modal ─────────────────────────────────────────────────────
interface DryRunPreview {
  preview_token: string;
  affected_fields_count: number;
  sample_matches: Array<{ field_path: string; doc_type: string; operator_name: string }>;
}

interface DryRunModalProps {
  preview: DryRunPreview;
  onConfirm: (token: string) => void;
  onCancel: () => void;
  loading: boolean;
}
const DryRunModal: React.FC<DryRunModalProps> = ({ preview, onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
      <div className="px-6 py-4 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800/40 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-400">
          <Play className="w-4 h-4" />
          <span className="font-bold text-sm">Dry-Run Preview</span>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Dry-run complete</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
              {preview.affected_fields_count} field(s) would be reclassified
            </p>
          </div>
        </div>

        {preview.sample_matches.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Sample matches:</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {preview.sample_matches.map((m, i) => (
                <div key={i} className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs">
                  <p className="font-mono text-slate-700 dark:text-slate-300">{m.field_path}</p>
                  <p className="text-slate-400 text-[10px]">{m.doc_type} · {m.operator_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex space-x-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={() => onConfirm(preview.preview_token)}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{loading ? 'Saving...' : 'Save Rule'}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ── Inline Add/Edit Form ──────────────────────────────────────────────────────
interface RuleFormState {
  domain: string;
  match_field: 'label' | 'path' | 'section';
  keywords: string;
  priority: string;
}
const EMPTY_FORM: RuleFormState = { domain: 'General', match_field: 'label', keywords: '', priority: '0' };

// ── Rule Card ─────────────────────────────────────────────────────────────────
interface RuleCardProps {
  rule: AdminRule;
  onEdit: (rule: AdminRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}
const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit, onDelete, onToggle }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 hover:shadow-md hover:shadow-blue-500/5 transition-shadow">
    {/* Header row */}
    <div className="flex items-start justify-between gap-2">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${domainColor(rule.domain)}`}>
        {rule.domain}
      </span>
      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => onToggle(rule.id, !rule.active)}
          title={rule.active ? 'Deactivate' : 'Activate'}
          className={`transition-colors ${rule.active ? 'text-emerald-500 hover:text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}
        >
          {rule.active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
        </button>
        <button
          onClick={() => onEdit(rule)}
          className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    {/* Keywords */}
    <div className="flex flex-wrap gap-1">
      {rule.keywords.map(kw => (
        <span key={kw} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-[11px] font-mono">
          {kw}
        </span>
      ))}
    </div>

    {/* Meta */}
    <div className="flex items-center space-x-3 text-[10px] font-mono text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
      <span>Priority: <strong className="text-slate-600 dark:text-slate-300">{rule.priority}</strong></span>
      <span>Pattern: <strong className="text-slate-600 dark:text-slate-300">{rule.match_field}</strong></span>
      {rule.created_at && (
        <span>Created: <strong className="text-slate-600 dark:text-slate-300">{rule.created_at.slice(0, 10)}</strong></span>
      )}
      {!rule.active && (
        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-400 rounded-full text-[9px] font-bold uppercase">INACTIVE</span>
      )}
    </div>
  </div>
);

// ── Main AdminRulesView ───────────────────────────────────────────────────────
export const AdminRulesView: React.FC = () => {
  const { adminRules, fetchAdminRules } = useStore();
  const token = localStorage.getItem('admin_token') || '';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);

  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [dryRunPreview, setDryRunPreview] = useState<DryRunPreview | null>(null);

  const [toast, setToast] = useState<ToastMsg | null>(null);

  useEffect(() => { fetchAdminRules(); }, []);

  const filtered = adminRules.filter(r => {
    const q = search.toLowerCase();
    return !q || r.domain.toLowerCase().includes(q) || r.keywords.some(k => k.toLowerCase().includes(q));
  });

  const handleEdit = (rule: AdminRule) => {
    setEditingId(rule.id);
    setForm({
      domain: rule.domain,
      match_field: rule.match_field,
      keywords: rule.keywords.join(', '),
      priority: String(rule.priority),
    });
    setShowForm(true);
    setDryRunPreview(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDryRunPreview(null);
  };

  const buildBody = () => ({
    domain: form.domain,
    match_field: form.match_field,
    keywords: form.keywords,
    priority: parseInt(form.priority, 10) || 0,
  });

  const handleDryRun = async () => {
    setDryRunLoading(true);
    try {
      const endpoint = editingId
        ? `${API_BASE}/api/ownership/rules/${editingId}?dry_run=1`
        : `${API_BASE}/api/ownership/rules/dry-run`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildBody()),
      });
      if (res.ok) {
        const data = await res.json();
        setDryRunPreview({
          preview_token: data.preview_token || '',
          affected_fields_count: data.affected_fields_count ?? data.matched ?? 0,
          sample_matches: data.sample_matches || [],
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Dry-run failed. Please check the form.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error during dry-run.', type: 'error' });
    }
    setDryRunLoading(false);
  };

  const handleSave = async (previewToken: string) => {
    setSaveLoading(true);
    try {
      const endpoint = editingId
        ? `${API_BASE}/api/ownership/rules/${editingId}`
        : `${API_BASE}/api/ownership/rules`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...buildBody(), preview_token: previewToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setToast({ message: `Ruleset updated${data.ruleset_version ? ` — ruleset_version ${data.ruleset_version}` : ''}.`, type: 'success' });
        setDryRunPreview(null);
        handleCancel();
        await fetchAdminRules();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Save failed.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error during save.', type: 'error' });
    }
    setSaveLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/ownership/rules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setToast({ message: 'Rule deleted.', type: 'success' });
        await fetchAdminRules();
      }
    } catch {
      setToast({ message: 'Delete failed.', type: 'error' });
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/ownership/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        await fetchAdminRules();
      }
    } catch {}
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Ownership Rules</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Keyword-based domain classification engine</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchAdminRules()}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setDryRunPreview(null); setShowForm(true); }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-600/20 transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by domain or keyword..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono font-bold">{filtered.length} rules</span>
      </div>

      {/* Inline Add/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/40 rounded-2xl overflow-hidden shadow-lg shadow-violet-500/5">
          <div className="px-5 py-3.5 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-700/40 flex items-center justify-between">
            <span className="font-bold text-sm text-violet-800 dark:text-violet-300">
              {editingId ? 'Edit Rule' : 'New Rule'}
            </span>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Domain</label>
              <select
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
              >
                {DOMAIN_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Match Field</label>
              <select
                value={form.match_field}
                onChange={e => setForm(f => ({ ...f, match_field: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
              >
                <option value="label">label</option>
                <option value="path">path</option>
                <option value="section">section</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Keywords <span className="font-normal text-slate-400">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={form.keywords}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
                placeholder="e.g. global title, gt address, e.164"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="px-5 pb-5 flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 dark:text-slate-400 flex-1">
              <Info className="w-3.5 h-3.5" />
              <span>Dry-run required before saving</span>
            </div>
            <button
              disabled={!form.keywords.trim() || dryRunLoading}
              onClick={handleDryRun}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors"
            >
              {dryRunLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{dryRunLoading ? 'Running...' : 'Run Dry-Run'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Dry-run modal */}
      {dryRunPreview && (
        <DryRunModal
          preview={dryRunPreview}
          onConfirm={handleSave}
          onCancel={() => setDryRunPreview(null)}
          loading={saveLoading}
        />
      )}

      {/* Rule card grid */}
      {filtered.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-400 text-sm">
          {search ? 'No rules match your filter.' : 'No rules configured yet. Add your first rule.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
