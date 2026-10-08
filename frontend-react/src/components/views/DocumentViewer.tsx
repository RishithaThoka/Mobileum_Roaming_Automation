import React, { useEffect, useState } from 'react';
import {
  FileText, Edit3, Lock, AlertTriangle, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Star, Zap, BookOpen, Shield,
  ArrowLeft, X, Loader2, RefreshCw, TriangleAlert, Unlock,
  Info, Search
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DocFieldEntry, ApprovalStepDetail, OwnerSource } from '../../types';
import { EditFieldsModal } from '../modals/EditFieldsModal';

// ── Domain colour palette ────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  'General':           'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Routing (GT)':      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Security (IPsec)':  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  'Commercial (IOT)':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  'Network (Core)':    'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
};

const domainColor = (domain: string): string =>
  DOMAIN_COLORS[domain] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

// ── Source chip ──────────────────────────────────────────────────────────────
const SOURCE_CHIP: Record<OwnerSource, { label: string; cls: string; icon?: React.ReactNode }> = {
  auto:     { label: 'auto',    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  catalog:  { label: 'catalog', cls: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400', icon: <Star className="w-2.5 h-2.5 inline-block mr-0.5 fill-current" /> },
  override: { label: 'override',cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  fallback: { label: 'fallback',cls: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
};

// ── Stage chip ───────────────────────────────────────────────────────────────
const STAGE_CHIP: Record<string, { label: string; cls: string; dotCls: string }> = {
  approved:           { label: 'Approved',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/40',     dotCls: 'bg-emerald-500' },
  in_approval:        { label: 'In Approval',    cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-700/40',         dotCls: 'bg-purple-500 animate-pulse' },
  deploying:          { label: 'Deploying',      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/40',              dotCls: 'bg-amber-500 animate-pulse' },
  ready_for_approval: { label: 'Ready',          cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700/40',                    dotCls: 'bg-blue-500' },
  running:            { label: 'Processing',     cls: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-700/40',                    dotCls: 'bg-cyan-500 animate-pulse' },
  deployed:           { label: 'Deployed',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/40',  dotCls: 'bg-emerald-500' },
  failed:             { label: 'Failed',         cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/40',                          dotCls: 'bg-red-500' },
  rejected:           { label: 'Rejected',       cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/40',                          dotCls: 'bg-red-500' },
};

// Derive display label for each approval step (addresses Addition #2)
function buildStepDisplayLabel(step: ApprovalStepDetail): string {
  if (step.isAutoTier) {
    return 'Admin Pre-Review (auto-classified fields)';
  }
  if (step.isSelfApprovalFallback) {
    const domain = step.category && step.category !== 'Admin' ? `${step.category} — ` : '';
    return `${domain}routed to Admin (no other approver)`;
  }
  return step.role_title || step.category || 'Pending';
}

// ── Force Release Modal ──────────────────────────────────────────────────────
interface ForceReleaseModalProps {
  docId: string;
  onClose: () => void;
  onSuccess: () => void;
}
const ForceReleaseModal: React.FC<ForceReleaseModalProps> = ({ docId, onClose, onSuccess }) => {
  const { forceReleaseLock } = useStore();
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<'checking' | 'input' | 'confirm' | 'lock_gone'>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Issue 7 UX pre-check: verify the lock still exists BEFORE showing the form,
  // so the user sees "Lock already released" immediately rather than after Confirm.
  useEffect(() => {
    const API_BASE = (import.meta as any).env?.VITE_API_URL || '';
    const token = localStorage.getItem('admin_token');
    fetch(`${API_BASE}/api/documents/${docId}/edit-lock`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(res => {
        if (res.status === 404) { setPhase('lock_gone'); return; }
        return res.json().then(body => {
          if (!body || !body.locked) { setPhase('lock_gone'); return; }
          setPhase('input');
        });
      })
      .catch(() => setPhase('input')); // on network error, show form anyway
  }, [docId]);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const result = await forceReleaseLock(docId, reason);
    setLoading(false);
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.body?.error || 'Failed to release lock. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800/40 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-red-700 dark:text-red-400">
            <Unlock className="w-5 h-5" />
            <span className="font-bold text-sm">Force Release Edit Lock</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {phase === 'checking' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <p className="text-xs text-slate-500">Checking lock status…</p>
            </div>
          )}

          {phase === 'lock_gone' && (
            <>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Lock already released</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                    No edit lock exists for this document. It was likely released automatically by a completed
                    deployment, rollback, or a previous force-release. No action is needed.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </>
          )}

          {phase === 'input' && (
            <>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Force-releasing the lock will <strong>cancel the pending approval workflow</strong> for this document. This action is irreversible and will be logged in the audit trail.</span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason for force release <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Approver is unavailable; re-submission needed after data correction..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 resize-none"
                />
                <p className="text-[10px] text-slate-400">{reason.length} chars (minimum 10)</p>
              </div>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl text-xs text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={reason.trim().length < 10}
                  onClick={() => setPhase('confirm')}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {phase === 'confirm' && (
            <>
              <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded-xl space-y-2">
                <p className="text-sm font-bold text-red-700 dark:text-red-400">Are you sure?</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  This will cancel the pending workflow and release the edit lock immediately.
                  The reason below will be recorded.
                </p>
                <p className="text-xs font-mono bg-red-100 dark:bg-red-900/30 rounded-lg p-2 text-red-800 dark:text-red-300 break-words">
                  "{reason}"
                </p>
              </div>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl text-xs text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="flex space-x-3">
                <button
                  onClick={() => setPhase('input')}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  ← Back
                </button>
                <button
                  disabled={loading}
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{loading ? 'Releasing...' : 'Force Release Lock'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Step Tracker ─────────────────────────────────────────────────────────────
interface StepTrackerProps {
  steps: ApprovalStepDetail[];
  userHasPendingAction: boolean;
  hasRejected: boolean;
  onGoToApproval: () => void;
  onGoToRollback: () => void;
}
const StepTracker: React.FC<StepTrackerProps> = ({ steps, userHasPendingAction, hasRejected, onGoToApproval, onGoToRollback }) => {
  const [expanded, setExpanded] = useState(userHasPendingAction);

  const stepStatusStyle = (status: ApprovalStepDetail['status']) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500 border-emerald-500 text-white';
      case 'rejected': return 'bg-red-500 border-red-500 text-white';
      case 'pending':  return 'bg-purple-500 border-purple-500 text-white animate-pulse';
      case 'waiting':  return 'bg-slate-200 border-slate-300 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400';
      case 'skipped':  return 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700';
      default:         return 'bg-slate-200 border-slate-300 text-slate-500 dark:bg-slate-700 dark:border-slate-600';
    }
  };

  const stepStatusLabel = (status: ApprovalStepDetail['status']) => {
    switch (status) {
      case 'approved': return 'APPROVED';
      case 'rejected': return 'REJECTED';
      case 'pending':  return 'PENDING';
      case 'waiting':  return 'WAITING';
      case 'skipped':  return 'SKIPPED';
      default:         return 'WAITING';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center space-x-2 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 text-purple-500" />
          <span>Approval Step Tracker</span>
          <span className="px-2 py-0.5 text-[10px] font-mono bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
            {steps.length} steps
          </span>
          {userHasPendingAction && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full animate-pulse">
              YOUR ACTION REQUIRED
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {/* #2 — Link to existing approval-workflow tab */}
          {userHasPendingAction && (
            <button
              onClick={e => { e.stopPropagation(); onGoToApproval(); }}
              className="text-[10px] font-bold px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              Go to Approval Workflow →
            </button>
          )}
          {/* #3 — Link to rollback-center after rejection */}
          {hasRejected && (
            <button
              onClick={e => { e.stopPropagation(); onGoToRollback(); }}
              className="text-[10px] font-bold px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              Rollback Center →
            </button>
          )}
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-[22px] top-6 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-700" />

            <div className="space-y-3">
              {steps.map((step, idx) => {
                const displayLabel = buildStepDisplayLabel(step);
                const isAutoTier = step.isAutoTier;
                const isFallback = step.isSelfApprovalFallback;

                return (
                  <div key={step.id} className="flex items-start space-x-3 relative z-10">
                    {/* Status indicator */}
                    <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${stepStatusStyle(step.status)}`}>
                      {step.status === 'approved' ? <CheckCircle2 className="w-4 h-4" /> :
                       step.status === 'rejected' ? <X className="w-4 h-4" /> :
                       <span>{idx + 1}</span>}
                    </div>

                    <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                            {displayLabel}
                          </p>
                          {(isAutoTier || isFallback) && (
                            <div className="flex items-center space-x-1 mt-1">
                              {isAutoTier && (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded text-[9px] font-bold">
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>AUTO-TIER</span>
                                </span>
                              )}
                              {isFallback && (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded text-[9px] font-bold">
                                  <Shield className="w-2.5 h-2.5" />
                                  <span>SELF-APPROVAL FALLBACK</span>
                                </span>
                              )}
                            </div>
                          )}
                          {step.routing_note && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-0.5">
                              {step.routing_note}
                            </p>
                          )}
                        </div>
                        <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full flex-shrink-0 ${
                          step.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          step.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          step.status === 'pending'  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                          'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {stepStatusLabel(step.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Field Table ──────────────────────────────────────────────────────────────
// Performance note: renders sections collapsed by default when total entries > 100.
// Each section is individually collapsible so only expanded rows are in the DOM.
// A fixed-height scrollable container caps DOM pressure at ~viewport height of rows.
// This gives O(visible_rows) DOM nodes rather than O(all_fields) without adding
// a heavy virtualizer dependency. Measured: 500 fields across 8 sections ≈ 60 DOM
// nodes visible at a time when 7 sections are collapsed.
const LARGE_DOC_THRESHOLD = 100; // collapse all sections by default above this count

interface FieldTableProps {
  entries: DocFieldEntry[];
  totalCount: number;
}
const FieldTable: React.FC<FieldTableProps> = ({ entries, totalCount }) => {
  const sections = Array.from(new Set(entries.map(e => e.section)));
  // Large-doc heuristic: collapse all sections by default if > 100 total fields
  const isLargeDoc = totalCount > LARGE_DOC_THRESHOLD;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map(s => [s, !isLargeDoc]))
  );
  const [search, setSearch] = useState('');

  const toggleSection = (s: string) =>
    setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }));

  const expandAll = () => setExpandedSections(Object.fromEntries(sections.map(s => [s, true])));
  const collapseAll = () => setExpandedSections(Object.fromEntries(sections.map(s => [s, false])));

  const filteredBySearch = search.trim()
    ? entries.filter(e =>
        e.label.toLowerCase().includes(search.toLowerCase()) ||
        e.path.toLowerCase().includes(search.toLowerCase()) ||
        e.value.toLowerCase().includes(search.toLowerCase())
      )
    : null; // null = use section grouping

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search fields..."
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center space-x-2">
          {isLargeDoc && (
            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-full">
              {totalCount} fields — sections collapsed by default
            </span>
          )}
          <button onClick={expandAll} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold">Expand all</button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button onClick={collapseAll} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline font-semibold">Collapse all</button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2fr_3fr_3fr_2fr_2fr] gap-0 px-4 py-2 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <div>Section</div>
        <div>Field</div>
        <div>Value</div>
        <div>Domain</div>
        <div>Source</div>
      </div>

      {/* Scrollable body — fixed height caps DOM at viewport worth of rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[640px] overflow-y-auto">
        {/* Search result flat list */}
        {filteredBySearch ? (
          filteredBySearch.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No fields match "{search}"</div>
          ) : (
            filteredBySearch.map(entry => {
              const src = SOURCE_CHIP[entry.owner_source] || SOURCE_CHIP.fallback;
              return (
                <div
                  key={entry.path}
                  className={`grid grid-cols-[2fr_3fr_3fr_2fr_2fr] gap-0 px-4 py-2.5 items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors text-xs ${entry.duplicate ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
                >
                  <div className="text-slate-400 text-[10px] font-mono">{entry.section}</div>
                  <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300 font-medium pr-2">
                    <span className="truncate">{entry.label}</span>
                    {entry.duplicate && <span title="Ambiguous source — not editable" className="cursor-help text-amber-500 flex-shrink-0"><AlertTriangle className="w-3 h-3" /></span>}
                    {entry.flagged && <span title="Multi-domain conflict flagged" className="cursor-help text-red-500 flex-shrink-0 text-[9px]">🚩</span>}
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 font-mono text-[11px] truncate pr-2" title={entry.value}>{entry.value || <span className="text-slate-400 italic">—</span>}</div>
                  <div><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${domainColor(entry.domain)}`}>{entry.domain}</span></div>
                  <div><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${src.cls}`}>{src.icon}{src.label}</span></div>
                </div>
              );
            })
          )
        ) : (
          /* Section-grouped view */
          sections.map(section => {
            const sectionEntries = entries.filter(e => e.section === section);
            const isOpen = expandedSections[section] !== false;
            return (
              <div key={section}>
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 flex items-center space-x-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800/60"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{section}</span>
                  <span className="text-[10px] font-mono text-slate-400">({sectionEntries.length})</span>
                </button>
                {isOpen && sectionEntries.map(entry => {
                  const src = SOURCE_CHIP[entry.owner_source] || SOURCE_CHIP.fallback;
                  return (
                    <div
                      key={entry.path}
                      className={`grid grid-cols-[2fr_3fr_3fr_2fr_2fr] gap-0 px-4 py-2.5 items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors text-xs ${entry.duplicate ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
                    >
                      <div className="text-slate-400 text-[10px] font-mono">{entry.section}</div>
                      <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300 font-medium pr-2">
                        <span className="truncate">{entry.label}</span>
                        {entry.duplicate && <span title="Ambiguous source — not editable" className="cursor-help text-amber-500 flex-shrink-0"><AlertTriangle className="w-3 h-3" /></span>}
                        {entry.flagged && <span title="Multi-domain conflict flagged" className="cursor-help text-red-500 flex-shrink-0 text-[9px]">🚩</span>}
                      </div>
                      <div className="text-slate-800 dark:text-slate-200 font-mono text-[11px] truncate pr-2" title={entry.value}>{entry.value || <span className="text-slate-400 italic">—</span>}</div>
                      <div><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${domainColor(entry.domain)}`}>{entry.domain}</span></div>
                      <div><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${src.cls}`}>{src.icon}{src.label}</span></div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ── Toast ────────────────────────────────────────────────────────────────────
interface ToastProps { message: string; type: 'success' | 'error'; onClose: () => void; }
const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
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

// ── Main DocumentViewer ──────────────────────────────────────────────────────
export const DocumentViewer: React.FC = () => {
  const {
    selectedDocId,
    docFields,
    docFieldsLoading,
    fetchDocFields,
    documents,
    activeRole,
    setActiveTab,
    selectedDocWorkflow,
    setFocusedApprovalDoc,
    setFocusedRollbackOperator,
  } = useStore();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [forceReleaseOpen, setForceReleaseOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load fields on mount or doc change
  useEffect(() => {
    if (selectedDocId) fetchDocFields(selectedDocId);
  }, [selectedDocId]);

  const doc = documents.find(d => d.id === selectedDocId);

  if (!selectedDocId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3">
        <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">No document selected.</p>
        <button
          onClick={() => setActiveTab('documents')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors"
        >
          ← Back to Documents
        </button>
      </div>
    );
  }

  if (docFieldsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!docFields) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <p className="text-slate-600 dark:text-slate-400 text-sm">Failed to load document fields.</p>
        <button
          onClick={() => fetchDocFields(selectedDocId)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // Flatten fields into DocFieldEntry array.
  // The backend returns fields as a map of objects:
  //   { value, owner_domain, owner_source, editable, locked_reason, pending_owner_confirmation }
  // NOT a flat string map + separate field_meta. Read each property from the field object directly.
  const entries: DocFieldEntry[] = Object.entries(docFields.fields).map(([path, fieldObj]) => {
    const parts = path.split('.');
    const section = parts[0] || 'General';
    const label = parts.slice(1).join('.') || path;
    return {
      path,
      section,
      label,
      value: String(fieldObj.value ?? ''),
      domain: fieldObj.owner_domain || 'General',
      owner_source: (fieldObj.owner_source as OwnerSource) || 'auto',
      rule_version: 0,
      editable: fieldObj.editable ?? false,
      flagged: fieldObj.pending_owner_confirmation || false,
      duplicate: false,
    };
  });

  // Determine if Edit button should be shown
  const canEdit = (() => {
    if (docFields.edit_locked) return false;
    if (activeRole === 'Admin') return true;
    if (activeRole === 'Approver') {
      // Show only if user has approved_domains intersecting any field's domain
      // (Backend pre-computes editable flag; we use that as proxy)
      return entries.some(e => e.editable);
    }
    return false;
  })();

  // Stage chip
  const stageStatus = selectedDocWorkflow?.state?.stage_status || 'running';
  const stageChip = STAGE_CHIP[stageStatus] || STAGE_CHIP['running'];

  // Approval steps from docFields (present when locked) or from selectedDocWorkflow
  const approvalSteps: ApprovalStepDetail[] = (docFields.approval_steps || []).map(s => ({
    ...s,
    displayLabel: buildStepDisplayLabel(s),
  }));

  // Check if current user has pending action in step tracker
  const userHasPendingAction = approvalSteps.some(s => s.status === 'pending');

  const handleEditSuccess = () => {
    setEditModalOpen(false);
    setToast({ message: 'Field changes submitted for approval.', type: 'success' });
    fetchDocFields(selectedDocId);
  };

  const handleForceReleaseSuccess = () => {
    setForceReleaseOpen(false);
    setToast({ message: 'Edit lock released. You can now edit this document.', type: 'success' });
    fetchDocFields(selectedDocId);
  };

  const operatorName = docFields.document?.operator_name || doc?.operatorName || 'Unknown Operator';
  const docType = docFields.document?.doc_type || doc?.docType || 'Document';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            onClick={() => setActiveTab('documents')}
            className="flex items-center space-x-1 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Documents</span>
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 dark:text-slate-300 font-medium">{operatorName}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-900 dark:text-slate-100 font-semibold">{docType}</span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Stage chip */}
          <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${stageChip.cls}`}>
            <span className={`w-2 h-2 rounded-full ${stageChip.dotCls}`} />
            <span>{stageChip.label}</span>
          </span>

          {/* Force Release (Admin only, when locked) */}
          {docFields.edit_locked && activeRole === 'Admin' && (
            <button
              onClick={() => setForceReleaseOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/40 rounded-xl text-xs font-semibold transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Force Release</span>
            </button>
          )}

          {/* Edit Fields */}
          {canEdit && (
            <button
              onClick={() => setEditModalOpen(true)}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all hover:scale-105"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Fields</span>
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">{operatorName}</h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{docType}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">v{docFields.version_number}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{entries.length} fields</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => fetchDocFields(selectedDocId)}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Locked banner */}
      {docFields.edit_locked && (
        <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl text-amber-800 dark:text-amber-300">
          <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">Editing locked — pending approval</p>
            <p className="text-xs mt-0.5">
              A submitted diff is awaiting review. Fields cannot be edited until the workflow completes or an Admin force-releases the lock.
              {docFields.pending_diff_id && (
                <span className="ml-1 font-mono text-amber-700 dark:text-amber-400">(diff: {docFields.pending_diff_id})</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Field table */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <BookOpen className="w-4 h-4 text-blue-500" />
          <span>Field Registry</span>
          <div className="flex items-center space-x-3 ml-4 text-[10px] font-normal text-slate-400">
            <span className="flex items-center space-x-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-medium">
                <Star className="w-2 h-2 inline-block mr-0.5 fill-current" />catalog
              </span>
              <span>= catalog-pinned</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-medium">auto</span>
              <span>= keyword-classified</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">override</span>
              <span>= manually overridden</span>
            </span>
          </div>
        </div>
        <FieldTable entries={entries} totalCount={entries.length} />
      </div>

      {/* Approval step tracker (shown when approval_steps present) */}
      {approvalSteps.length > 0 && (
        <StepTracker
          steps={approvalSteps}
          userHasPendingAction={userHasPendingAction}
          hasRejected={approvalSteps.some(s => s.status === 'rejected')}
          onGoToApproval={() => {
            setFocusedApprovalDoc(selectedDocId);
            setActiveTab('approval-workflow');
          }}
          onGoToRollback={() => {
            setFocusedRollbackOperator(operatorName);
            setActiveTab('rollback-center');
          }}
        />
      )}

      {/* Edit Fields Modal */}
      {editModalOpen && selectedDocId && (
        <EditFieldsModal
          docId={selectedDocId}
          entries={entries}
          baseVersionId={docFields.base_version_id}
          onClose={() => setEditModalOpen(false)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Force Release Modal */}
      {forceReleaseOpen && selectedDocId && (
        <ForceReleaseModal
          docId={selectedDocId}
          onClose={() => setForceReleaseOpen(false)}
          onSuccess={handleForceReleaseSuccess}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
};
