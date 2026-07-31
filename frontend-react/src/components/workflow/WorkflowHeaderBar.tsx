import React from 'react';
import { Layers, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface WorkflowHeaderBarProps {
  title: string;
  subtitle?: string;
}

export const WorkflowHeaderBar: React.FC<WorkflowHeaderBarProps> = ({ title, subtitle }) => {
  const { currentWorkflowStepId, workflowSteps, activeRole, documents } = useStore();

  const currentStep = workflowSteps.find((s) => s.id === currentWorkflowStepId) || workflowSteps[0];
  const activeDoc = documents[0] || { operatorName: 'Vodafone KSA', version: 'v14.3.0', title: 'IR.21 Table 14.3' };

  const getCompletedStepForDoc = (status: string): number => {
    switch (status) {
      case 'Received': return 1;
      case 'Pending Review': return 3;
      case 'In Delta Check': return 4;
      case 'Awaiting Sign-off': return 5;
      case 'Approved': return 6;
      case 'Provisioned': return 9;
      case 'Rolled Back': return 10;
      default: return 4;
    }
  };

  const completedStep = activeDoc ? getCompletedStepForDoc(activeDoc.status) : 4;
  let statusText = 'Upcoming';
  let badgeClasses = 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  let IconComponent = Clock;

  if (currentWorkflowStepId < completedStep) {
    statusText = `Step ${currentWorkflowStepId} Completed`;
    badgeClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
    IconComponent = CheckCircle2;
  } else if (currentWorkflowStepId === completedStep) {
    statusText = `Step ${currentWorkflowStepId} Active`;
    badgeClasses = 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-cyan-400 dark:border-blue-500/30 animate-pulse';
    IconComponent = Layers;
  } else {
    statusText = `Step ${currentWorkflowStepId} Upcoming`;
  }

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
            <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono flex items-center space-x-1 ${badgeClasses}`}>
              <IconComponent className="w-3.5 h-3.5" />
              <span>{statusText}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle || currentStep.subtitle}</p>
        </div>

        {/* Enterprise Context Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
            <span className="text-slate-400">Operator: </span>
            <span className="font-extrabold text-blue-600 dark:text-cyan-400">{activeDoc.operatorName}</span>
          </div>

          <div className="px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300">
            <span className="text-slate-400">Version: </span>
            <span className="font-extrabold text-slate-900 dark:text-white">{activeDoc.version}</span>
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
