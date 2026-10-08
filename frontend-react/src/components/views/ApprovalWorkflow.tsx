import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare, CheckCircle2, XCircle, Clock, Shield, Sparkles, X,
  User, MessageSquare, AlertTriangle, ChevronDown, ChevronRight,
  Calendar, ArrowRight, Hourglass, Ban
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { RoleBadge } from '../common/RoleBadge';

// ─── Timeline step for the "View Detailed Workflow" modal ────────────────────
interface ModalStep {
  role: string;
  label: string;
  status: string; // Approved | Rejected | Pending | Waiting | Skipped
  approverName?: string;
  approverEmail?: string;
  mailContent?: string;
  timestamp?: string;
  comments?: string;
  token?: string;
  // decided_by fields (real authenticated actor)
  decided_by_name?: string;
  decided_by_email?: string;
}

function stepStatusIcon(status: string) {
  switch (status) {
    case 'Approved':
      return <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />;
    case 'Rejected':
      return <XCircle className="w-4.5 h-4.5 text-red-500" />;
    case 'Pending':
      return <Clock className="w-4.5 h-4.5 text-amber-500" />;
    case 'Waiting':
      return <Hourglass className="w-4.5 h-4.5 text-slate-400" />;
    default:
      return <Ban className="w-4.5 h-4.5 text-slate-300" />;
  }
}

function stepCircleClass(status: string) {
  switch (status) {
    case 'Approved': return 'bg-emerald-50 border-emerald-400 dark:bg-emerald-500/20 dark:border-emerald-500';
    case 'Rejected': return 'bg-red-50 border-red-400 dark:bg-red-500/20 dark:border-red-500';
    case 'Pending':  return 'bg-amber-50 border-amber-400 dark:bg-amber-500/20 dark:border-amber-500 animate-pulse';
    case 'Waiting':  return 'bg-slate-50 border-slate-300 dark:bg-slate-800 dark:border-slate-600';
    default:         return 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700';
  }
}

function stepSpineClass(status: string) {
  switch (status) {
    case 'Approved': return 'bg-emerald-200 dark:bg-emerald-500/40';
    case 'Rejected': return 'bg-red-200 dark:bg-red-500/40';
    default:         return 'bg-slate-200 dark:bg-slate-700';
  }
}

function stepBadgeClass(status: string) {
  switch (status) {
    case 'Approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
    case 'Rejected': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30';
    case 'Pending':  return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
    case 'Waiting':  return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    default:         return 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700';
  }
}

interface WorkflowTimelineStepProps {
  step: ModalStep;
  idx: number;
  isLast: boolean;
  activeRole: string;
  chainId: string;
  onApprove: (chainId: string) => void;
  onReject: (chainId: string) => void;
  commentInput: string;
  setCommentInput: (v: string) => void;
}

const WorkflowTimelineStep: React.FC<WorkflowTimelineStepProps> = ({
  step, idx, isLast, activeRole, chainId, onApprove, onReject, commentInput, setCommentInput
}) => {
  const canAct = step.status === 'Pending' && (activeRole === 'Admin' || activeRole === step.role);

  // Detect if the real decider differs from the assigned approver
  const wasDecidedByOther = (step.decided_by_email && step.approverEmail &&
    step.decided_by_email !== step.approverEmail);

  const displayActorName  = step.decided_by_name  || step.approverName  || '—';
  const displayActorEmail = step.decided_by_email || step.approverEmail || '—';

  return (
    <div className="flex gap-3">
      {/* Timeline spine column */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-sm ${stepCircleClass(step.status)}`}>
          {stepStatusIcon(step.status)}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-1 min-h-[1.5rem] ${stepSpineClass(step.status)}`} />
        )}
      </div>

      {/* Step card */}
      <div className={`flex-1 mb-5 rounded-xl border p-4 transition-all ${
        step.status === 'Approved' ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-500/20' :
        step.status === 'Rejected' ? 'bg-red-50/60 dark:bg-red-500/10 border-red-200 dark:border-red-500/30' :
        step.status === 'Pending'  ? 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-100 dark:border-amber-500/20' :
        'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
      }`}>
        {/* Step header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stepBadgeClass(step.status)}`}>
              {step.status.toUpperCase()}
            </span>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{step.label}</span>
            <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
          </div>
          {step.timestamp && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Calendar className="w-3 h-3" />
              <span>{step.timestamp.replace('T', ' ').slice(0, 16)}</span>
            </div>
          )}
        </div>

        {/* Role badge */}
        <div className="flex items-center gap-1.5 mb-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Shield className="w-3 h-3 text-slate-400" />
          <span>Role: <strong className="text-slate-700 dark:text-slate-200">{step.role}</strong></span>
        </div>

        {/* Actor info — two columns: Assigned vs Decided By */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-slate-200 dark:border-slate-800">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Assigned To</div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <User className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">{step.approverName || '—'}</div>
                <div className="text-[10px] text-slate-400 font-mono leading-tight truncate max-w-[120px]" title={step.approverEmail}>{step.approverEmail || '—'}</div>
              </div>
            </div>
          </div>

          {(step.status === 'Approved' || step.status === 'Rejected') && (
            <div className={`rounded-lg p-2.5 border ${wasDecidedByOther
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
              <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${wasDecidedByOther ? 'text-amber-500' : 'text-slate-400'}`}>
                {wasDecidedByOther ? '⚡ Decided By (Override)' : 'Decided By'}
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  wasDecidedByOther ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-slate-100 dark:bg-slate-800'
                }`}>
                  <User className={`w-2.5 h-2.5 ${wasDecidedByOther ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">{displayActorName}</div>
                  <div className="text-[10px] text-slate-400 font-mono leading-tight truncate max-w-[120px]" title={displayActorEmail}>{displayActorEmail}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comment */}
        {step.comments && (
          <div className="flex items-start gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 mb-3 text-[11px] text-slate-600 dark:text-slate-300">
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="italic">"{step.comments}"</span>
          </div>
        )}

        {/* Action area for pending steps */}
        {canAct && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <textarea
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder="Add a comment (optional)…"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-purple-400 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onReject(chainId)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-rose-200 dark:border-rose-500/30 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject Step</span>
              </button>
              <button
                onClick={() => onApprove(chainId)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Step</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main ApprovalWorkflow Component ─────────────────────────────────────────
export const ApprovalWorkflow: React.FC = () => {
  const {
    approvalChains, activeRole, approveItem, rejectItem,
    focusedApprovalDocId, setFocusedApprovalDoc,
    focusedApprovalDiffId, setFocusedApprovalDiff,
  } = useStore();
  const [activeModalChainId, setActiveModalChainId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Auto-scroll to the focused chain ──────────────────────────────────────
  useEffect(() => {
    const matchId =
      (focusedApprovalDiffId
        ? approvalChains.find(c => (c as any).diffId === focusedApprovalDiffId)
        : null) ??
      (focusedApprovalDocId
        ? approvalChains.find(c => c.docId === focusedApprovalDocId)
        : null);

    if (matchId && cardRefs.current[matchId.id]) {
      cardRefs.current[matchId.id]!.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedApprovalDiffId, focusedApprovalDocId, approvalChains]);

  const triggerConfetti = () => {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
  };

  const handleApprove = async (chainId: string) => {
    await approveItem(chainId, commentInput || 'Stage approved after parameter verification.');
    triggerConfetti();
    setActiveModalChainId(null);
    setCommentInput('');
  };

  const handleReject = (chainId: string) => {
    rejectItem(chainId, commentInput || 'Rejected due to technical routing mismatch.');
    setActiveModalChainId(null);
    setCommentInput('');
  };

  const activeChain = approvalChains.find(c => c.id === activeModalChainId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Dynamic Multi-Stage Approval Chain</h1>
            <HelpTooltip
              title="Approval Workflow"
              explanation="Enforces multi-role governance sign-off based on categories modified prior to network switch provisioning."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Multi-stage digital sign-off pipeline for wholesale roaming parameters.
            <span className="ml-2 text-amber-500 font-medium">Rejected workflows are shown on the Rejected Items page.</span>
          </p>
        </div>
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-sm">
          <span className="text-slate-500">Your Signed Context:</span>
          <RoleBadge role={activeRole} />
        </div>
      </div>

      {/* Empty state */}
      {approvalChains.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">All caught up</div>
            <div className="text-sm text-slate-400">No active or approved workflows to display. Rejected workflows appear under Rejected Items in the sidebar.</div>
          </div>
        </div>
      )}

      {/* APPROVAL CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {approvalChains.map((chain) => {
          const isFocused =
            (focusedApprovalDiffId && (chain as any).diffId
              ? (chain as any).diffId === focusedApprovalDiffId
              : focusedApprovalDocId === chain.docId);

          return (
            <div
              key={chain.id}
              ref={el => { cardRefs.current[chain.id] = el; }}
              id={`approval-chain-${chain.id}`}
              className={`p-5 bg-white dark:bg-slate-900 border-2 rounded-3xl transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between space-y-4 relative overflow-hidden group ${
                isFocused
                  ? 'border-purple-500 ring-2 ring-purple-400/40'
                  : 'border-slate-200 dark:border-slate-800 hover:border-purple-500/40'
              }`}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-500" />
              {isFocused && (
                <div className="absolute top-2.5 right-3 flex items-center space-x-1 px-2 py-1 bg-purple-600 text-white text-[9px] font-bold rounded-full shadow-md shadow-purple-600/30">
                  <span>↩ Jump from Diff Checker</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFocusedApprovalDoc(null); setFocusedApprovalDiff(null); }}
                    className="ml-1 hover:text-purple-200 transition-colors"
                    title="Dismiss highlight"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-base text-slate-900 dark:text-white">{chain.operator}</span>
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                    chain.status === 'Approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300'
                  }`}>
                    {chain.status}
                  </span>
                </div>

                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{chain.docTitle}</p>

                {/* DYNAMIC PIPELINE VISUALIZER */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider">{chain.steps.length}-Stage Authorization Sequence</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {chain.steps.map((step: any, idx: number) => {
                      const isApproved = step.status === 'Approved';
                      const isRejected = step.status === 'Rejected';
                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded-xl border text-[11px] font-mono flex items-center justify-between ${
                            isApproved
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold'
                              : isRejected
                              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="truncate">{step.label}</span>
                          {isApproved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                           : isRejected ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 ml-1" />
                           : <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setActiveModalChainId(chain.id)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-purple-600/20 transition-all flex items-center space-x-1.5"
                  id={`view-workflow-btn-${chain.id}`}
                >
                  <Shield className="w-4 h-4" />
                  <span>View Detailed Workflow</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── TIMELINE MODAL ──────────────────────────────────────────────────── */}
      {activeModalChainId && activeChain && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModalChainId(null); }}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Authorization Timeline</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {activeChain.operator} · {activeChain.docTitle} · {activeChain.steps.length} step{activeChain.steps.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalChainId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title="Close modal"
                id="workflow-modal-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable timeline body */}
            <div className="flex-1 overflow-y-auto px-6 pt-5 pb-4">
              {/* Context banner */}
              <div className="mb-4 px-3 py-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-xl text-[11px] text-purple-600 dark:text-purple-300 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Viewing as <strong>{activeRole}</strong>. 
                  The <em>Assigned To</em> column shows the original routing; <em>Decided By</em> shows the real authenticated actor.
                </span>
              </div>

              {/* Vertical timeline */}
              <div>
                {activeChain.steps.map((step: any, idx: number) => (
                  <WorkflowTimelineStep
                    key={idx}
                    step={step}
                    idx={idx}
                    isLast={idx === activeChain.steps.length - 1}
                    activeRole={activeRole}
                    chainId={activeModalChainId}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    commentInput={commentInput}
                    setCommentInput={setCommentInput}
                  />
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setActiveModalChainId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
