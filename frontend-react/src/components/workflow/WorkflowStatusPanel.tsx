import React from 'react';
import { Activity, Loader2, CheckCircle2, MinusCircle, Clock, AlertTriangle, Layers } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { mapWorkflowSteps } from '../../utils/mapWorkflowSteps';
import { StepStatus } from '../../types';

const STATUS_LABEL: Record<StepStatus, string> = {
  completed:      'Completed',
  not_applicable: 'Not Applicable',
  current:        'In Progress',
  waiting:        'Awaiting Approval',
  rejected:       'Rejected',
  upcoming:       'Upcoming',
};

const STATUS_CLASSES: Record<StepStatus, string> = {
  completed:      'text-emerald-600 dark:text-emerald-400',
  not_applicable: 'text-indigo-600 dark:text-indigo-400',
  current:        'text-blue-600 dark:text-cyan-400',
  waiting:        'text-amber-600 dark:text-amber-400',
  rejected:       'text-rose-600 dark:text-rose-400',
  upcoming:       'text-slate-400 dark:text-slate-500',
};

export const WorkflowStatusPanel: React.FC = () => {
  const { currentWorkflowStepId, workflowSteps, selectedDocWorkflow, workflowLoading } = useStore();

  const computedSteps = mapWorkflowSteps(selectedDocWorkflow, workflowLoading);

  const currentStep    = workflowSteps.find((s) => s.id === currentWorkflowStepId) || workflowSteps[0];
  const nextStep       = workflowSteps.find((s) => s.id === currentWorkflowStepId + 1);
  const currentComputed = computedSteps.find((s) => s.id === currentWorkflowStepId);
  const currentStatus: StepStatus = currentComputed?.status ?? 'upcoming';

  // Step 11 gets a distinguishing status label
  const displayStatus = (currentWorkflowStepId === 11 && currentStatus === 'completed')
    ? 'Live from ingest'
    : STATUS_LABEL[currentStatus];

  return (
    <div className="p-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 shadow-md relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400" />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Workflow Progress Status</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold">
          Step {currentWorkflowStepId} of 11
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-1">
        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">CURRENT STEP</div>
          <div className="font-extrabold text-blue-600 dark:text-cyan-400 mt-0.5 truncate">{currentStep.title}</div>
        </div>

        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">STATUS</div>
          <div className={`font-extrabold mt-0.5 flex items-center space-x-1 ${STATUS_CLASSES[currentStatus]}`}>
            {workflowLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>{workflowLoading ? 'Loading…' : displayStatus}</span>
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">NEXT STEP</div>
          <div className="font-extrabold text-slate-900 dark:text-slate-200 mt-0.5 truncate">
            {nextStep ? nextStep.title : 'Finish'}
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">OWNER / EST TIME</div>
          <div className="font-extrabold text-purple-600 dark:text-purple-400 mt-0.5 truncate">
            {currentStep.owner} ({currentStep.estimatedTime})
          </div>
        </div>
      </div>
    </div>
  );
};
