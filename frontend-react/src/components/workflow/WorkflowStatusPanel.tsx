import React from 'react';
import { Layers, Clock, UserCheck, ArrowRight, Activity } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const WorkflowStatusPanel: React.FC = () => {
  const { currentWorkflowStepId, workflowSteps } = useStore();

  const currentStep = workflowSteps.find((s) => s.id === currentWorkflowStepId) || workflowSteps[0];
  const nextStep = workflowSteps.find((s) => s.id === currentWorkflowStepId + 1);

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
          <div className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">Completed</div>
        </div>

        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">NEXT STEP</div>
          <div className="font-extrabold text-slate-900 dark:text-slate-200 mt-0.5 truncate">{nextStep ? nextStep.title : 'Finish'}</div>
        </div>

        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 font-bold">OWNER / EST TIME</div>
          <div className="font-extrabold text-purple-600 dark:text-purple-400 mt-0.5 truncate">{currentStep.owner} ({currentStep.estimatedTime})</div>
        </div>
      </div>
    </div>
  );
};
