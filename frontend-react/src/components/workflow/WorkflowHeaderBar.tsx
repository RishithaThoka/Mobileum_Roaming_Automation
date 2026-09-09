import React from 'react';
import { Layers, ChevronRight, CheckCircle2, Clock, MinusCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { mapWorkflowSteps } from '../../utils/mapWorkflowSteps';
import { StepStatus } from '../../types';

interface WorkflowHeaderBarProps {
  title: string;
  subtitle?: string;
}

export const WorkflowHeaderBar: React.FC<WorkflowHeaderBarProps> = ({ title, subtitle }) => {
  const {
    currentWorkflowStepId,
    workflowSteps,
    activeRole,
    documents,
    selectedDocWorkflow,
    workflowLoading,
    selectedDocId,
  } = useStore();

  const computedSteps = mapWorkflowSteps(selectedDocWorkflow, workflowLoading);

  const currentStep = workflowSteps.find((s) => s.id === currentWorkflowStepId) || workflowSteps[0];
  const currentComputed = computedSteps.find((s) => s.id === currentWorkflowStepId);
  const currentStatus: StepStatus = currentComputed?.status ?? 'upcoming';

  // Context for the operator/version chips: prefer the selected doc's data.
  const selectedDoc = selectedDocId ? documents.find(d => d.id === selectedDocId) : null;
  const contextDoc  = selectedDoc || documents[0] || null;

  // Badge configuration per real status
  const badgeConfig: Record<StepStatus, { text: string; classes: string; Icon: React.ElementType }> = {
    completed:       { text: 'Completed',        classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', Icon: CheckCircle2 },
    not_applicable:  { text: 'Not Applicable',   classes: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30', Icon: MinusCircle },
    current:         { text: 'Active',           classes: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-cyan-400 dark:border-blue-500/30 animate-pulse', Icon: Layers },
    waiting:         { text: 'Awaiting Approval',classes: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', Icon: Clock },
    rejected:        { text: 'Rejected',         classes: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30', Icon: AlertTriangle },
    upcoming:        { text: 'Upcoming',         classes: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', Icon: Clock },
  };

  const badge = badgeConfig[currentStatus] ?? badgeConfig.upcoming;
  const BadgeIcon = badge.Icon;

  // Step 11 audit badge gets a distinguishing label
  const badgeText = (currentWorkflowStepId === 11 && currentStatus === 'completed')
    ? 'Live from ingest'
    : badge.text;

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sm:px-6 lg:px-8 space-y-3">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
        <span>Workflow Engine</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-blue-600 dark:text-cyan-400 font-bold">{currentStep.title}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-cyan-400 font-bold text-[10px]">
          Step {currentWorkflowStepId} of 11
        </span>
      </div>

      {/* Main Title Row & Context Chips */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{title}</h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono flex items-center space-x-1 ${badge.classes}`}
              title={currentWorkflowStepId === 11 && currentStatus === 'completed'
                ? 'Audit log is written continuously from the moment of ingest — this is not a one-time completed action'
                : undefined}
            >
              {workflowLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <BadgeIcon className="w-3.5 h-3.5" />
              }
              <span>{workflowLoading ? 'Loading…' : badgeText}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle || currentStep.subtitle}</p>
        </div>

        {/* Enterprise Context Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
            <span className="text-slate-400">Operator: </span>
            <span className="font-extrabold text-blue-600 dark:text-cyan-400">
              {contextDoc ? contextDoc.operatorName : '—'}
            </span>
          </div>

          <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
            <span className="text-slate-400">Version: </span>
            <span className="font-extrabold text-slate-900 dark:text-white">
              {contextDoc ? contextDoc.version : '—'}
            </span>
          </div>

          <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
            <span className="text-slate-400">Role Context: </span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400">{activeRole}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
