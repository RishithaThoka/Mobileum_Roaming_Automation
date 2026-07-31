import React, { useState } from 'react';
import { CheckSquare, CheckCircle2, XCircle, Clock, Shield, Sparkles, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { RoleBadge } from '../common/RoleBadge';

export const ApprovalWorkflow: React.FC = () => {
  const { approvalChains, activeRole, approveItem, rejectItem } = useStore();
  const [activeModalChainId, setActiveModalChainId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleApprove = (chainId: string) => {
    approveItem(chainId, commentInput || 'Stage approved after parameter verification.');
    triggerConfetti();
    setActiveModalChainId(null);
    setCommentInput('');
  };

  const handleReject = (chainId: string) => {
    rejectItem(chainId, commentInput || 'Rejected due to technical routing mismatch.');
    setActiveModalChainId(null);
    setCommentInput('');
  };

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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Multi-stage digital sign-off pipeline for wholesale roaming parameters.</p>
        </div>

        <div className="flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-sm">
          <span className="text-slate-500">Your Signed Context:</span>
          <RoleBadge role={activeRole} />
        </div>
      </div>

      {/* APPROVAL CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {approvalChains.map((chain) => (
          <div
            key={chain.id}
            className="p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-purple-500/40 rounded-3xl transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between space-y-4 relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-500" />
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-base text-slate-900 dark:text-white">{chain.operator}</span>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                  chain.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300'
                }`}>
                  {chain.status}
                </span>
              </div>

              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{chain.docTitle}</p>

              {/* DYNAMIC PIPELINE VISUALIZER */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider">{chain.steps.length}-Stage Authorization Sequence</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {chain.steps.map((step, idx) => {
                    const isStepApproved = step.status === 'Approved';
                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-xl border text-[11px] font-mono flex items-center justify-between ${
                          isStepApproved
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        <span className="truncate">{step.label}</span>
                        {isStepApproved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" /> : <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />}
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
              >
                <Shield className="w-4 h-4" />
                <span>View Detailed Workflow</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SIGN-OFF MODAL WITH EXPLICIT CLOSE BUTTON (X) AND BACKDROP CLOSE */}
      {activeModalChainId && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModalChainId(null);
          }}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Header with Close X */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Detailed Authorization Workflow</h3>
              </div>
              <button
                onClick={() => setActiveModalChainId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You are viewing the workflow as <span className="font-bold text-purple-600 dark:text-purple-400">{activeRole}</span>.
                Admin users can override pending stages.
              </p>

              {/* Steps List */}
              <div className="space-y-4">
                {approvalChains.find(c => c.id === activeModalChainId)?.steps.map((step, idx) => (
                  <div key={idx} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50 dark:bg-slate-950 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${step.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : step.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{step.status}</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{step.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Role: {step.role}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400">
                      <div>
                        <strong>Approver:</strong> {step.approverName || 'Unassigned'}
                      </div>
                      <div>
                        <strong>Email:</strong> {step.approverEmail || 'No Email'}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-[10px] font-mono whitespace-pre-wrap text-slate-500 overflow-x-auto max-h-32">
                      <strong>Mail Sent:</strong><br />
                      {step.mailContent || 'No mail content available.'}
                    </div>

                    {step.status === 'Pending' && (activeRole === 'Admin' || activeRole === step.role) && (
                      <div className="pt-2 flex justify-end space-x-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          onClick={() => handleReject(activeModalChainId)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Admin Reject</span>
                        </button>
                        <button
                          onClick={() => handleApprove(activeModalChainId)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md rounded-lg text-xs font-semibold flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Admin Approve</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Buttons with Close Option */}
            <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setActiveModalChainId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Close Detailed View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
