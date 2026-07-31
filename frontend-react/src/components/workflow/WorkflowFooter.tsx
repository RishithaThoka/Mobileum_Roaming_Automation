import React from 'react';
import { ArrowLeft, ArrowRight, Save, CheckCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const WorkflowFooter: React.FC = () => {
  const { currentWorkflowStepId, workflowSteps, goToNextStep, goToPrevStep } = useStore();

  const currentStep = workflowSteps.find((s) => s.id === currentWorkflowStepId) || workflowSteps[0];
  const nextStep = workflowSteps.find((s) => s.id === currentWorkflowStepId + 1);

  const isFirstStep = currentWorkflowStepId === 1;
  const isLastStep = currentWorkflowStepId === 11;

  return (
    <div className="sticky bottom-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 backdrop-blur-md shadow-2xl py-3.5 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Bottom-left: Previous Step */}
      <button
        onClick={goToPrevStep}
        disabled={isFirstStep}
        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 text-xs font-bold rounded-2xl transition-all flex items-center space-x-2 border border-slate-200 dark:border-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Previous Step</span>
      </button>

      {/* Middle: Save Draft */}
      <button
        onClick={() => alert('Workflow draft state saved successfully.')}
        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-2xl transition-all flex items-center space-x-2 border border-slate-200 dark:border-slate-800"
      >
        <Save className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        <span className="hidden sm:inline">Save Draft</span>
      </button>

      {/* Bottom-right: Large Primary Next Step Button */}
      <button
        onClick={goToNextStep}
        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-black rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl hover:scale-105 transition-all flex items-center space-x-2"
      >
        <span>
          {isLastStep ? 'Finish Workflow' : `Continue to ${nextStep?.title || 'Next Step'}`}
        </span>
        <ArrowRight className="w-4 h-4 stroke-[3]" />
      </button>
    </div>
  );
};
