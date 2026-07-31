import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { ConfigurableApprovalChain } from '../../types';
import { ROLE_PERMISSIONS } from '../../data/mockData';

interface ApprovalModalProps {
  approvalItem: ConfigurableApprovalChain | null;
  onClose: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ approvalItem, onClose }) => {
  const { activeRole, approveItem, rejectItem } = useStore();
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!approvalItem) return null;

  const currentRolePerm = ROLE_PERMISSIONS[activeRole];

  // Check permissions
  let canApproveThisStage = false;
  if (activeRole === 'Admin' || activeRole === 'CTO') {
    canApproveThisStage = true;
  } else if (approvalItem.steps && approvalItem.steps[approvalItem.currentStageIndex]?.role === activeRole) {
    canApproveThisStage = true;
  } else if (currentRolePerm.canApproveCommercial || currentRolePerm.canApproveTechnical) {
    canApproveThisStage = true;
  }

  const handleApprove = () => {
    approveItem(approvalItem.id, comment);
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // ignore
    }
    onClose();
  };

  const handleReject = () => {
    rejectItem(approvalItem.id, rejectReason || 'Stage sign-off declined by user');
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 space-y-4">
        {/* Header with Close X button */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">Stage Governance Sign-off</h3>
              <p className="text-xs text-slate-500 font-mono">Chain ID: {approvalItem.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="my-4 space-y-4 text-xs">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-200">{approvalItem.operator}</span>
              <span className="text-[11px] text-slate-500 font-mono">{approvalItem.country}</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-cyan-400 font-bold mt-1">{approvalItem.docTitle}</p>
          </div>

          {/* Configurable Stage Steps */}
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-slate-400 font-bold uppercase">6-STAGE APPROVAL PIPELINE</div>
            <div className="space-y-1 text-xs">
              {approvalItem.steps?.map((step, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="font-semibold text-slate-800 dark:text-slate-300">{step.label}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                    step.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                  }`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!canApproveThisStage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Role Permission Warning: </span>
                Your active role (<span className="underline font-semibold">{activeRole}</span>) does not have authorization for this stage.
              </div>
            </div>
          )}

          {!showRejectForm ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Approval Notes / Sign-off Comments
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., Validated GT routing tables against GSMA IR.21 v14.2 schema. Cleared for NOC provisioning."
                rows={3}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">
                Rejection Reason (Required)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Specify exact parameter mismatch or GSMA compliance breach..."
                rows={3}
                required
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-rose-300 dark:border-rose-500/50 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:border-rose-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer Actions with Close Button */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex space-x-3 items-center">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setShowRejectForm(!showRejectForm)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
            >
              {showRejectForm ? 'Back to Approval' : 'Reject Request'}
            </button>
          </div>

          <div className="flex space-x-2">
            {!showRejectForm ? (
              <button
                onClick={handleApprove}
                disabled={!canApproveThisStage}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-md transition-colors flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Grant Stage Approval</span>
              </button>
            ) : (
              <button
                onClick={handleReject}
                disabled={!canApproveThisStage || !rejectReason}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-md transition-colors flex items-center space-x-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm Rejection</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
