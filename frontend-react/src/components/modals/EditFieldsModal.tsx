import React, { useState, useMemo } from 'react';
import {
  X, Edit3, ChevronRight, CheckCircle2, AlertTriangle, Zap,
  ArrowLeft, Send, Loader2, TriangleAlert, Info
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DocFieldEntry, OwnerSource } from '../../types';

// ── Domain colour ─────────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  'General':           'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Routing (GT)':      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Security (IPsec)':  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  'Commercial (IOT)':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  'Network (Core)':    'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
};
const domainColor = (d: string) => DOMAIN_COLORS[d] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

// ── Source label ──────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<OwnerSource, string> = {
  auto: 'auto',
  catalog: 'catalog ★',
  override: 'override',
  fallback: 'fallback',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldChange = { path: string; label: string; section: string; oldValue: string; newValue: string; domain: string; owner_source: OwnerSource; };
type Phase = 'edit' | 'review';
type ForbiddenSet = Set<string>;

interface EditFieldsModalProps {
  docId: string;
  entries: DocFieldEntry[];
  baseVersionId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Diff row (used in Review phase) ─────────────────────────────────────────
const DiffRow: React.FC<{ change: FieldChange; forbidden?: boolean }> = ({ change, forbidden }) => (
  <div className={`grid grid-cols-[2fr_2fr_2fr_1.5fr_1.5fr] gap-2 px-4 py-3 text-xs items-center border-b border-slate-100 dark:border-slate-800 ${
    forbidden ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
  }`}>
    <div className="font-mono text-slate-600 dark:text-slate-400 truncate" title={change.path}>{change.path}</div>
    <div className="text-slate-500 dark:text-slate-400 truncate line-through" title={change.oldValue}>{change.oldValue || '—'}</div>
    <div className="text-emerald-700 dark:text-emerald-400 font-semibold truncate" title={change.newValue}>{change.newValue}</div>
    <div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${domainColor(change.domain)}`}>
        {change.domain}
      </span>
    </div>
    <div className="flex items-center space-x-1">
      <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 rounded-full font-medium">
        {SOURCE_LABELS[change.owner_source]}
      </span>
      {change.owner_source === 'auto' && (
        <Zap className="w-3 h-3 text-amber-500" title="Auto-classified field" />
      )}
      {forbidden && (
        <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full font-bold">FORBIDDEN</span>
      )}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export const EditFieldsModal: React.FC<EditFieldsModalProps> = ({
  docId,
  entries,
  baseVersionId,
  onClose,
  onSuccess,
}) => {
  const { submitFieldEdit, activeRole } = useStore();

  // Only show editable, non-duplicate fields
  const editableEntries = useMemo(
    () => entries.filter(e => e.editable && !e.duplicate),
    [entries]
  );

  const [changes, setChanges] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<Phase>('edit');
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [forbiddenPaths, setForbiddenPaths] = useState<ForbiddenSet>(new Set());

  const changedEntries = useMemo<FieldChange[]>(() =>
    editableEntries
      .filter(e => changes[e.path] !== undefined && changes[e.path] !== e.value)
      .map(e => ({
        path: e.path,
        label: e.label,
        section: e.section,
        oldValue: e.value,
        newValue: changes[e.path],
        domain: e.domain,
        owner_source: e.owner_source,
      })),
    [editableEntries, changes]
  );

  const hasAutoTierFields = changedEntries.some(c => c.owner_source === 'auto');
  const commentValid = comment.trim().length >= 10;
  const canProceedToReview = changedEntries.length > 0 && commentValid;

  const handleFieldChange = (path: string, value: string) => {
    setChanges(prev => ({ ...prev, [path]: value }));
    // Clear forbidden highlight as user edits
    if (forbiddenPaths.has(path)) {
      setForbiddenPaths(prev => { const s = new Set(prev); s.delete(path); return s; });
    }
  };

  const handleSubmit = async () => {
    if (!canProceedToReview) return;
    setLoading(true);
    setErrorBanner(null);

    const payload = {
      base_version_id: baseVersionId,
      changes: Object.fromEntries(changedEntries.map(c => [c.path, c.newValue])),
      comment: comment.trim(),
    };

    const result = await submitFieldEdit(docId, payload);
    setLoading(false);

    if (result.ok) {
      onSuccess();
      return;
    }

    // Handle error cases
    if (result.status === 409) {
      if (result.body?.code === 'SELF_APPROVAL_ONLY_ADMIN') {
        setErrorBanner('You are the only Admin. Add a second Admin or disable the auto-tier policy before submitting.');
      } else {
        // Pending diff from someone else
        setErrorBanner('Someone else submitted a change — this document is now locked. Please refresh to see the updated state.');
      }
      setPhase('edit');
    } else if (result.status === 403) {
      // Forbidden fields — go back to edit and highlight
      const forbidden: string[] = result.body?.forbidden_fields || [];
      setForbiddenPaths(new Set(forbidden));
      setErrorBanner('Some fields are forbidden for your role. They have been highlighted below.');
      setPhase('edit');
    } else if (result.status === 400) {
      setErrorBanner(result.body?.error || 'Validation error. Please check your input.');
      setPhase('edit');
    } else {
      setErrorBanner(`Server error (HTTP ${result.status}). Please try again.`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-[680px] h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right">
        {/* Drawer header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center">
              <Edit3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {phase === 'edit' ? 'Edit Fields' : 'Review Changes'}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {phase === 'edit' ? `${editableEntries.length} editable fields` : `${changedEntries.length} changed`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Phase breadcrumb */}
            <div className="flex items-center space-x-1 text-[10px] font-semibold">
              <span className={phase === 'edit' ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}>① Edit</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={phase === 'review' ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}>② Review</span>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {errorBanner && (
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl flex items-start space-x-2 text-xs text-red-700 dark:text-red-400 flex-shrink-0">
            <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{errorBanner}</span>
            <button onClick={() => setErrorBanner(null)} className="ml-auto flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── PHASE 1: EDIT ────────────────────────────────────────────── */}
        {phase === 'edit' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {editableEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3 text-center p-8">
                  <Info className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">No editable fields available for your role.</p>
                </div>
              ) : (
                <div>
                  {/* Column headers */}
                  <div className="sticky top-0 grid grid-cols-[2fr_2fr_3fr] gap-3 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 z-10">
                    <div>Field</div>
                    <div>Current Value</div>
                    <div>New Value</div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {editableEntries.map(entry => {
                      const isForbidden = forbiddenPaths.has(entry.path);
                      const currentNew = changes[entry.path] ?? entry.value;
                      const isDirty = currentNew !== entry.value;

                      return (
                        <div
                          key={entry.path}
                          className={`grid grid-cols-[2fr_2fr_3fr] gap-3 px-6 py-3.5 items-start text-xs transition-colors ${
                            isForbidden
                              ? 'bg-red-50 dark:bg-red-900/10 border-l-2 border-red-400'
                              : isDirty
                              ? 'bg-blue-50/40 dark:bg-blue-900/10 border-l-2 border-blue-400'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/20'
                          }`}
                        >
                          {/* Field label */}
                          <div className="space-y-1 pt-0.5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                              <span className="truncate" title={entry.label}>{entry.label}</span>
                              {entry.owner_source === 'auto' && (
                                <span className="flex-shrink-0 inline-flex items-center" title="Auto-classified — change triggers Admin review">
                                  <Zap className="w-3 h-3 text-amber-500" />
                                </span>
                              )}
                              {isForbidden && (
                                <span className="flex-shrink-0 text-[9px] px-1 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded font-bold">FORBIDDEN</span>
                              )}
                            </div>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${domainColor(entry.domain)}`}>
                              {entry.domain}
                            </span>
                          </div>

                          {/* Current value */}
                          <div className="pt-1 font-mono text-slate-400 dark:text-slate-500 text-[11px] break-all line-clamp-3" title={entry.value}>
                            {entry.value || <span className="italic">—</span>}
                          </div>

                          {/* New value input */}
                          <div>
                            <input
                              type="text"
                              value={currentNew}
                              onChange={e => handleFieldChange(entry.path, e.target.value)}
                              disabled={isForbidden}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-mono transition-colors focus:outline-none ${
                                isForbidden
                                  ? 'bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-400 cursor-not-allowed'
                                  : isDirty
                                  ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-400 text-slate-900 dark:text-slate-100 focus:border-blue-500'
                                  : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-blue-500 dark:focus:border-blue-400'
                              }`}
                            />
                            {entry.owner_source === 'auto' && (
                              <p className="mt-1 text-[9px] text-amber-600 dark:text-amber-500 flex items-center space-x-0.5">
                                <Zap className="w-2.5 h-2.5" />
                                <span>Auto-classified — change triggers Admin review</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Comment + proceed */}
            <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Comment <span className="text-red-500">*</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(min 10 chars)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Explain the reason for these changes..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{changedEntries.length} field{changedEntries.length !== 1 ? 's' : ''} changed</span>
                  <span className={comment.trim().length >= 10 ? 'text-emerald-600 dark:text-emerald-400' : ''}>{comment.trim().length}/10 min</span>
                </div>
              </div>
              <button
                disabled={!canProceedToReview}
                onClick={() => setPhase('review')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2"
              >
                <span>Review Changes</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {/* ── PHASE 2: REVIEW ──────────────────────────────────────────── */}
        {phase === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {/* Summary */}
              <div className="px-6 pt-5 pb-3 space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">{changedEntries.length}</span>
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">field{changedEntries.length !== 1 ? 's' : ''} changed</span>
                </div>

                {/* Auto-tier note */}
                {hasAutoTierFields && (
                  <div className="flex items-start space-x-2.5 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                    <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-bold">Auto-tier note</p>
                      <p className="mt-0.5">
                        {changedEntries.filter(c => c.owner_source === 'auto').length} field(s) use auto-classification.
                        An extra <strong>Admin Pre-Review</strong> step will be inserted before domain approval.
                      </p>
                    </div>
                  </div>
                )}

                {/* Comment display */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Comment</p>
                  <p className="text-xs text-slate-800 dark:text-slate-200 italic">"{comment}"</p>
                </div>
              </div>

              {/* Diff table */}
              <div className="border-t border-slate-200 dark:border-slate-800">
                {/* Table header */}
                <div className="grid grid-cols-[2fr_2fr_2fr_1.5fr_1.5fr] gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <div>Field</div>
                  <div>Before</div>
                  <div>After</div>
                  <div>Domain</div>
                  <div>Source</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {changedEntries.map(change => (
                    <DiffRow
                      key={change.path}
                      change={change}
                      forbidden={forbiddenPaths.has(change.path)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Action footer */}
            <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900 flex items-center space-x-3">
              <button
                onClick={() => setPhase('edit')}
                className="flex-1 flex items-center justify-center space-x-2 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Edit</span>
              </button>
              <button
                disabled={loading}
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-emerald-600/20"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{loading ? 'Submitting...' : 'Submit for Approval'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
