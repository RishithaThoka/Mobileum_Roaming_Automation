import React from 'react';
import { Check, Clock, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const GlobalWorkflowTracker: React.FC = () => {
  const { workflowSteps, currentWorkflowStepId, goToWorkflowStep } = useStore();

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-16 z-30 overflow-x-auto scrollbar-thin">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center space-x-1 sm:space-x-2 min-w-max">
        {workflowSteps.map((step, idx) => {
          const isCurrent = step.id === currentWorkflowStepId;
          const isCompleted = step.id < currentWorkflowStepId || step.status === 'completed';
          const isWaiting = step.status === 'waiting';
          const isRejected = step.status === 'rejected';

          // Color & style mapping as specified:
          // Completed steps: Green
          // Current step: Blue Highlight
          // Upcoming steps: Gray
          // Rejected step: Red
          // Waiting for approval: Orange
          let badgeBg = 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
          let icon = <span className="font-mono text-[10px]">{step.id}</span>;

          if (isCurrent) {
            badgeBg = 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/30 font-bold scale-105';
            icon = <span className="font-mono text-[10px] font-bold">{step.id}</span>;
          } else if (isCompleted) {
            badgeBg = 'bg-emerald-500 text-white border-emerald-500 font-bold';
            icon = <Check className="w-3.5 h-3.5 stroke-[3]" />;
          } else if (isWaiting) {
            badgeBg = 'bg-amber-500 text-white border-amber-500 font-bold';
            icon = <Clock className="w-3.5 h-3.5 animate-pulse" />;
          } else if (isRejected) {
            badgeBg = 'bg-rose-600 text-white border-rose-600 font-bold';
            icon = <ShieldAlert className="w-3.5 h-3.5" />;
          }

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => goToWorkflowStep(step.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer whitespace-nowrap group ${badgeBg}`}
                title={`Step ${step.id}: ${step.title} (${step.subtitle})`}
              >
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-extrabold leading-tight">{step.title}</span>
                </div>
              </button>

              {idx < workflowSteps.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
