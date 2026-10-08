import React from 'react';
import { Check, Clock, AlertTriangle, ArrowRight, ShieldAlert, MinusCircle, Lock } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { mapWorkflowSteps } from '../../utils/mapWorkflowSteps';

export const GlobalWorkflowTracker: React.FC = () => {
  const { workflowSteps, currentWorkflowStepId, goToWorkflowStep, selectedDocWorkflow, workflowLoading } = useStore();

  // Real per-document statuses. Falls back to all-upcoming when nothing is selected.
  const computedSteps = mapWorkflowSteps(selectedDocWorkflow, workflowLoading);

  // A step is "resolved" when its status is complete, not_applicable, completed, or rejected.
  // Used to enforce frontend gating on unresolved prerequisites.
  const isResolved = (stepId: number) => {
    const s = computedSteps.find(x => x.id === stepId);
    if (!s) return false;
    return s.status === 'completed' || s.status === 'not_applicable' || s.status === 'rejected';
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-16 z-30 overflow-x-auto scrollbar-thin">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center space-x-1 sm:space-x-2 min-w-max">
        {computedSteps.map((step, idx) => {
          const isCurrent       = step.id === currentWorkflowStepId;
          const isCompleted     = step.status === 'completed';
          const isWaiting       = step.status === 'waiting';
          const isRejected      = step.status === 'rejected';
          const isNotApplicable = step.status === 'not_applicable';

          // Prerequisite gating: a step with unresolved prerequisites is locked.
          const prereqsMet = step.prerequisiteStepIds.every(id => isResolved(id));
          const isLocked   = step.status === 'upcoming' && !prereqsMet;

          let badgeBg = 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
          let icon: React.ReactNode = <span className="font-mono text-[10px]">{step.id}</span>;

          if (isCurrent) {
            badgeBg = 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/30 font-bold scale-105';
            icon = <span className="font-mono text-[10px] font-bold">{step.id}</span>;
          } else if (isCompleted) {
            badgeBg = 'bg-emerald-500 text-white border-emerald-500 font-bold';
            icon = <Check className="w-3.5 h-3.5 stroke-[3]" />;
          } else if (isNotApplicable) {
            // Distinct visual: indigo/purple, MinusCircle icon.
            // Step 11 (Audit) gets extra tooltip text "Live from ingest".
            badgeBg = 'bg-indigo-500 text-white border-indigo-500 font-bold opacity-90';
            icon = <MinusCircle className="w-3.5 h-3.5" />;
          } else if (isWaiting) {
            badgeBg = 'bg-amber-500 text-white border-amber-500 font-bold';
            icon = <Clock className="w-3.5 h-3.5 animate-pulse" />;
          } else if (isRejected) {
            badgeBg = 'bg-rose-600 text-white border-rose-600 font-bold';
            icon = <ShieldAlert className="w-3.5 h-3.5" />;
          } else if (isLocked) {
            badgeBg = 'bg-slate-200 dark:bg-slate-700 text-slate-400 border-slate-300 dark:border-slate-600 opacity-60';
            icon = <Lock className="w-3 h-3" />;
          }

          // Step 11 "Live from ingest" label distinction
          const tooltipSuffix = step.id === 11 && isCompleted
            ? ' — Live from ingest'
            : isNotApplicable && step.id === 10
            ? ' — Standing capability, always available'
            : isNotApplicable
            ? ` — ${
                step.id === 3 ? 'No prior version to compare' :
                step.id === 4 ? 'No prior version to diff' :
                step.id === 5 ? 'No diff to assess risk for' : 'Not applicable'
              }`
            : '';

          const statusLabel = isLocked ? 'Locked (prerequisites pending)' : step.status;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => !isLocked && goToWorkflowStep(step.id)}
                disabled={isLocked}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs transition-all whitespace-nowrap group ${badgeBg} ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                title={`Step ${step.id}: ${step.title}${tooltipSuffix} (${statusLabel})`}
              >
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-extrabold leading-tight">{step.title}</span>
                  {step.id === 11 && isCompleted && (
                    <span className="text-[9px] opacity-75 leading-tight">Live from ingest</span>
                  )}
                  {isNotApplicable && step.id === 10 && (
                    <span className="text-[9px] opacity-75 leading-tight">Always available</span>
                  )}
                </div>
              </button>

              {idx < computedSteps.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
