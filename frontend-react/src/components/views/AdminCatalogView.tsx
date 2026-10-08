import React, { useEffect, useState } from 'react';
import {
  BookOpen, Plus, Search, Trash2, Edit2, CheckCircle2,
  AlertTriangle, Loader2, X, RefreshCw, ToggleLeft, ToggleRight, Info, ShieldCheck
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { CatalogEntry } from '../../types';

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

// ── Inline form state ──────────────────────────────────────────────────────────
interface EntryForm {
  field_path: string;
  domain: string;
  doc_type: string;
  operator_id: string;
  active: boolean;
  source_note: string;
}
const EMPTY_FORM: EntryForm = {
  field_path: '', domain: 'General', doc_type: '*', operator_id: '', active: true, source_note: '',
};

export const AdminCatalogView: React.FC = () => {
  const { adminCatalog, fetchAdminCatalog } = useStore();
  const token = localStorage.getItem('admin_token') || '';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  useEffect(() => { fetchAdminCatalog(); }, []);

  const filtered = adminCatalog.filter(e => {
    const q = search.toLowerCase();
    return !q || e.field_path.toLowerCase().includes(q) || e.domain.toLowerCase().includes(q) || (e.doc_type || '').toLowerCase().includes(q);
  });

  const handleEdit = (entry: CatalogEntry) => {
    setEditingId(entry.id);
    setForm({
      field_path: entry.field_path,
      domain: entry.domain,
      doc_type: entry.doc_type || '*',
      operator_id: entry.operator_id || '',
      active: entry.active,
      source_note: entry.source_note || '',
    });
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
        doc_type: form.doc_type || '*',
        operator_id: form.operator_id || null,
        active: form.active,
        source_note: form.source_note || null,
      };
      const url = editingId
        ? `${API_BASE}/api/ownership/catalog/${editingId}`
        : `${API_BASE}/api/ownership/catalog`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast({ message: editingId ? 'Catalog entry updated.' : 'Catalog entry created.', type: 'success' });
        handleCancel();
        await fetchAdminCatalog();
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
    if (!confirm('Delete this catalog entry?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/ownership/catalog/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setToast({ message: 'Entry deleted.', type: 'success' });
        await fetchAdminCatalog();
      }
    } catch {
      setToast({ message: 'Delete failed.', type: 'error' });
    }
  };

  // Clears pending_owner_confirmation (flagged status) for an entry
  const handleConfirmFlag = async (entry: CatalogEntry) => {
    try {
      const res = await fetch(`${API_BASE}/api/ownership/catalog/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pending_owner_confirmation: 0 }),
      });
      if (res.ok) {
        setToast({ message: `Confirmed: ownership for "${entry.field_path}" is no longer flagged.`, type: 'success' });
        await fetchAdminCatalog();
      } else {
        setToast({ message: 'Confirm failed.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
    }
  };

  const handleToggleActive = async (entry: CatalogEntry) => {
    try {
      const res = await fetch(`${API_BASE}/api/ownership/catalog/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !entry.active }),
      });
      if (res.ok) await fetchAdminCatalog();
    } catch {}
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Ownership Catalog</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Explicit field-path → domain assignments (overrides keyword engine)</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => fetchAdminCatalog()} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start space-x-2.5 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-xl text-xs text-blue-700 dark:text-blue-400">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Anything not backed by a golden field or cited GSMA name should stay <strong>inactive</strong> — inactive rows shown with ⚠ inactive chip and are not granting edit rights.
        </span>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by field path, domain, or doc type..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono font-bold">{filtered.length} entries</span>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700/40 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/5">
          <div className="px-5 py-3.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-700/40 flex items-center justify-between">
            <span className="font-bold text-sm text-blue-800 dark:text-blue-300">{editingId ? 'Edit Catalog Entry' : 'New Catalog Entry'}</span>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Field Path <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.field_path}
                onChange={e => setForm(f => ({ ...f, field_path: e.target.value }))}
                placeholder="e.g. General.HLR Global Title"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Domain</label>
              <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
                {DOMAIN_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Doc Type <span className="text-slate-400 font-normal">(* = any)</span></label>
              <input type="text" value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} placeholder="* or IR.21 XML" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Operator ID <span className="text-slate-400 font-normal">(blank = any)</span></label>
              <input type="text" value={form.operator_id} onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))} placeholder="Leave blank for wildcard" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Source Note <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" value={form.source_note} onChange={e => setForm(f => ({ ...f, source_note: e.target.value }))} placeholder="e.g. GSMA TS.34 §4.2" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                {form.active ? <ToggleRight className="w-7 h-7 text-emerald-500" /> : <ToggleLeft className="w-7 h-7 text-slate-300 dark:text-slate-600" />}
              </button>
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active</p>
                <p className="text-[10px] text-slate-400">{form.active ? 'Grants edit rights' : 'Does NOT grant edit rights'}</p>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5 flex justify-end space-x-3">
            <button onClick={handleCancel} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button disabled={saving || !form.field_path.trim()} onClick={handleSave} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{saving ? 'Saving...' : 'Save catalog entry'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3fr_2fr_1.5fr_1.5fr_1fr_auto] gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <div>Field Path</div>
          <div>Domain</div>
          <div>Doc Type</div>
          <div>Operator</div>
          <div>Active</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            {search ? 'No entries match your search.' : 'No catalog entries yet. Add your first entry.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filtered.map(entry => (
              <div
                key={entry.id}
                className={`grid grid-cols-[3fr_2fr_1.5fr_1.5fr_1fr_auto] gap-3 px-4 py-3 items-center text-xs transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/20 ${!entry.active ? 'opacity-60' : ''}`}
              >
                {/* Field path */}
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate" title={entry.field_path}>{entry.field_path}</span>
                  {entry.flagged && (
                    <span title="Multi-domain conflict — click Confirm to acknowledge" className="flex-shrink-0">
                      <button
                        onClick={() => handleConfirmFlag(entry)}
                        className="flex items-center space-x-0.5 text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full font-bold hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors border border-amber-300 dark:border-amber-700/40"
                        title="Click to confirm ownership and clear this flag"
                      >
                        <ShieldCheck className="w-2.5 h-2.5" />
                        <span>🚩 flagged — Confirm</span>
                      </button>
                    </span>
                  )}
                </div>
                {/* Domain */}
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${domainColor(entry.domain)}`}>{entry.domain}</span>
                </div>
                {/* Doc type */}
                <div className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">{entry.doc_type || '*'}</div>
                {/* Operator */}
                <div className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">{entry.operator_id || '* (any)'}</div>
                {/* Active */}
                <div className="flex items-center space-x-1.5">
                  <button onClick={() => handleToggleActive(entry)}>
                    {entry.active
                      ? <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1"><span>★</span><span>active</span></span>
                      : <span className="inline-flex items-center space-x-1 text-[9px] font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-1.5 py-0.5 rounded-full"><AlertTriangle className="w-2.5 h-2.5" /><span>inactive</span></span>
                    }
                  </button>
                </div>
                {/* Actions */}
                <div className="flex items-center space-x-1 justify-end">
                  <button onClick={() => handleEdit(entry)} className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(entry.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
