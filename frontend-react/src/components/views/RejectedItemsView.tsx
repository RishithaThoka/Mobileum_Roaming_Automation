import React, { useState, useEffect } from 'react';
import {
  XCircle, AlertTriangle, ChevronDown, ChevronRight, User, Clock,
  FileText, GitCompare, MessageSquare, CheckCircle2, Shield, ArrowRight,
  RefreshCw, Filter, Search
} from 'lucide-react';

// @ts-ignore
const API_BASE = import.meta.env.VITE_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RejectedStep {
  id: string;
  stepOrder: number;
  category: string;
  roleTitle: string;
  assignedName: string | null;
  assignedEmail: string | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedByEmail: string | null;
  status: string; // approved | rejected | waiting | pending
  comment: string | null;
  decidedAt: string | null;
  notifiedAt: string | null;
  routingNote: string | null;
}

interface DiffItem {
  field_path: string;
  category: string;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  severity: string;
  domain: string | null;
}

interface RejectedWorkflow {
  workflowId: string;
  workflowCreatedAt: string | null;
  workflowCompletedAt: string | null;
  diffId: string;
  documentId: string;
  documentTitle: string;
  docType: string;
  operatorName: string;
  operatorCountry: string;
  totalChanges: number;
  highestSeverity: string;
  diffCreatedAt: string | null;
  steps: RejectedStep[];
  diffItems: DiffItem[];
}

const severityColor = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30';
    case 'major':    return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
    default:         return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30';
  }
};

const changeTypeColor = (t: string) => {
  switch (t?.toLowerCase()) {
    case 'added':    return 'text-emerald-600 dark:text-emerald-400';
    case 'removed':  return 'text-red-600 dark:text-red-400';
    default:         return 'text-amber-600 dark:text-amber-400';
  }
};

const changeTypeBadge = (t: string) => {
  switch (t?.toLowerCase()) {
    case 'added':    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
    case 'removed':  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20';
    default:         return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  }
};

function fmtTs(ts: string | null | undefined) {
  if (!ts) return '—';
  return ts.replace('T', ' ').slice(0, 16);
}

// Vertical timeline step component
function TimelineStep({ step, isLast }: { step: RejectedStep; isLast: boolean }) {
  const isApproved = step.status === 'approved';
  const isRejected = step.status === 'rejected';
  const isPending  = step.status === 'pending' || step.status === 'waiting';

  // The actual decider — prefer decided_by fields, fall back to assigned fields
  const actorName  = step.decidedByName  || step.assignedName  || '—';
  const actorEmail = step.decidedByEmail || step.assignedEmail || '—';
  // Is there a mismatch? (means someone other than the assignee decided)
  const wasOverridden = step.decidedByEmail && step.assignedEmail &&
    step.decidedByEmail !== step.assignedEmail;

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-sm flex-shrink-0 ${
          isApproved ? 'bg-emerald-50 border-emerald-400 dark:bg-emerald-500/20 dark:border-emerald-500' :
          isRejected ? 'bg-red-50 border-red-400 dark:bg-red-500/20 dark:border-red-500' :
          'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600'
        }`}>
          {isApproved && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          {isRejected && <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
          {isPending  && <Clock className="w-4 h-4 text-slate-400" />}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-1 min-h-[2rem] ${
            isApproved ? 'bg-emerald-200 dark:bg-emerald-500/30' : 'bg-slate-200 dark:bg-slate-700'
          }`} />
        )}
      </div>

      {/* Step content */}
      <div className={`flex-1 mb-4 pb-3 rounded-xl border p-3.5 ${
        isApproved ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20' :
        isRejected ? 'bg-red-50/60 border-red-200 dark:bg-red-500/10 dark:border-red-500/30' :
        'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800'
      }`}>
        {/* Step header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isApproved ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' :
              isRejected ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30' :
              'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}>
              {step.status.toUpperCase()}
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{step.category}</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Step {step.stepOrder + 1}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">{fmtTs(step.decidedAt)}</span>
        </div>

        {/* Role */}
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          <span>Role: <strong className="text-slate-700 dark:text-slate-200">{step.roleTitle}</strong></span>
        </div>

        {/* Actor info */}
        <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
          <div className="space-y-0.5">
            <div className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Assigned To</div>
            <div className="text-slate-600 dark:text-slate-300 font-medium">{step.assignedName || '—'}</div>
            <div className="text-slate-400 dark:text-slate-500 font-mono">{step.assignedEmail || '—'}</div>
          </div>
          {(isApproved || isRejected) && (
            <div className="space-y-0.5">
              <div className={`uppercase tracking-wider text-[9px] font-bold ${wasOverridden ? 'text-amber-500' : 'text-slate-400'}`}>
                {wasOverridden ? '⚡ Override — Actually Decided By' : 'Decided By'}
              </div>
              <div className="text-slate-700 dark:text-slate-100 font-semibold">{actorName}</div>
              <div className="text-slate-500 dark:text-slate-400 font-mono">{actorEmail}</div>
            </div>
          )}
        </div>

        {/* Routing note */}
        {step.routingNote && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{step.routingNote}</span>
          </div>
        )}

        {/* Comment */}
        {step.comment && (
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="italic">"{step.comment}"</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({ wf }: { wf: RejectedWorkflow }) {
  const [expanded, setExpanded] = useState(false);
  const [diffExpanded, setDiffExpanded] = useState(false);

  const rejectedStep = wf.steps.find(s => s.status === 'rejected');
  const actorName  = rejectedStep?.decidedByName  || rejectedStep?.assignedName  || 'Unknown';
  const actorEmail = rejectedStep?.decidedByEmail || rejectedStep?.assignedEmail || '';
  const actorRole  = rejectedStep?.roleTitle || '';

  // Group diff items by category
  const categories = [...new Set(wf.diffItems.map(d => d.category))];

  return (
    <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-2xl shadow-md hover:shadow-lg transition-all overflow-hidden">
      {/* Red top accent */}
      <div className="h-1 bg-gradient-to-r from-red-500 to-rose-600" />

      <div className="p-5">
        {/* Card header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white text-base truncate">{wf.operatorName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 font-bold flex-shrink-0">
                REJECTED
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate">{wf.documentTitle}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{wf.docType} · {wf.operatorCountry}</p>
          </div>

          <div className="flex-shrink-0 text-right text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
            <div className="font-mono">{fmtTs(wf.workflowCompletedAt)}</div>
            <div className={`px-2 py-0.5 rounded-full border text-[10px] font-bold inline-block ${severityColor(wf.highestSeverity)}`}>
              {wf.highestSeverity?.toUpperCase() || 'MINOR'}
            </div>
          </div>
        </div>

        {/* Rejection summary */}
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3.5 mb-4">
          <div className="text-[10px] text-red-500 dark:text-red-400 font-bold uppercase tracking-wider mb-2">Rejected By</div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{actorName}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{actorEmail}</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Role: <strong className="text-slate-600 dark:text-slate-300">{actorRole}</strong>
                {rejectedStep?.comment && (
                  <span className="ml-2">· "{rejectedStep.comment}"</span>
                )}
              </div>
            </div>
            <div className="ml-auto text-right text-[10px] text-slate-400">
              <div className="font-mono">{fmtTs(rejectedStep?.decidedAt)}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Category: {rejectedStep?.category}</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
            <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{wf.totalChanges}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">Changes</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
            <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{wf.steps.length}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">Steps</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
            <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
              {wf.steps.filter(s => s.status === 'approved').length}
            </div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">Approved</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            id={`rejected-timeline-toggle-${wf.workflowId}`}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>Decision Timeline</span>
          </button>
          <button
            onClick={() => setDiffExpanded(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            id={`rejected-diff-toggle-${wf.workflowId}`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>What Changed ({wf.diffItems.length})</span>
          </button>
        </div>
      </div>

      {/* Decision Timeline */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 pt-4 pb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Full Decision Timeline · {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
          </div>
          <div>
            {wf.steps.map((step, idx) => (
              <TimelineStep key={step.id} step={step} isLast={idx === wf.steps.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Diff / What Changed */}
      {diffExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 pt-4 pb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
            <GitCompare className="w-3 h-3" />
            Parameter Changes · {wf.diffItems.length} item{wf.diffItems.length !== 1 ? 's' : ''} across {categories.length} domain{categories.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
            {categories.map(cat => {
              const items = wf.diffItems.filter(d => d.category === cat);
              return (
                <div key={cat}>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-1">{cat}</div>
                  <div className="space-y-1.5">
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-[11px]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${changeTypeBadge(item.change_type)}`}>
                            {item.change_type.toUpperCase()}
                          </span>
                          <span className="font-mono text-slate-600 dark:text-slate-300 font-medium truncate flex-1">{item.field_path}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${severityColor(item.severity)}`}>
                            {item.severity}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          {item.old_value && (
                            <span className="text-red-500 dark:text-red-400 line-through max-w-[35%] truncate" title={item.old_value}>
                              {item.old_value}
                            </span>
                          )}
                          {item.old_value && item.new_value && (
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                          )}
                          {item.new_value && (
                            <span className="text-emerald-600 dark:text-emerald-400 max-w-[35%] truncate font-medium" title={item.new_value}>
                              {item.new_value}
                            </span>
                          )}
                          {!item.new_value && item.change_type === 'removed' && (
                            <span className="text-slate-400 italic">removed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const RejectedItemsView: React.FC = () => {
  const [items, setItems] = useState<RejectedWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/approvals/rejected`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load rejected items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(wf => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      wf.operatorName.toLowerCase().includes(q) ||
      wf.documentTitle.toLowerCase().includes(q) ||
      wf.operatorCountry.toLowerCase().includes(q) ||
      wf.steps.some(s =>
        (s.decidedByName || s.assignedName || '').toLowerCase().includes(q) ||
        (s.decidedByEmail || s.assignedEmail || '').toLowerCase().includes(q)
      );
    const matchesSeverity = severityFilter === 'all' || wf.highestSeverity?.toLowerCase() === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Rejected Workflows
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-10">
            Complete rejection history — who decided, when, why, and what changed.
            <span className="ml-1 text-amber-500 font-medium">
              Decided-By columns capture the real authenticated actor, not the assignment.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {filtered.length} of {items.length} rejection{items.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh"
            id="rejected-refresh-btn"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by operator, document, or decider name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-red-400 dark:focus:border-red-500"
            id="rejected-search-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none focus:border-red-400 dark:focus:border-red-500"
            id="rejected-severity-filter"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            <span className="text-sm text-slate-400">Loading rejected workflows…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">
              {items.length === 0 ? 'No rejected workflows' : 'No matches'}
            </div>
            <div className="text-sm text-slate-400">
              {items.length === 0
                ? 'All workflows have been approved or are still in progress.'
                : 'Try adjusting your search or filter.'}
            </div>
          </div>
        </div>
      )}

      {/* Rejected workflow grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map(wf => (
            <WorkflowCard key={wf.workflowId} wf={wf} />
          ))}
        </div>
      )}
    </div>
  );
};
