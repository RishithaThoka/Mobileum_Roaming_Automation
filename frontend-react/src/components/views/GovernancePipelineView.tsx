import React from 'react';
import { Workflow } from 'lucide-react';
import { HelpTooltip } from '../common/HelpTooltip';

const PIPELINE_STEPS = [
  { step: '01', title: 'Human Approval', subtitle: 'Analyst & Reviewer Sign-off', status: 'Completed', color: 'border-emerald-300 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
  { step: '02', title: 'Risk Check', subtitle: 'Automated Risk Engine Score', status: 'Completed', color: 'border-emerald-300 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
  { step: '03', title: 'Dual Approval', subtitle: 'CMO & CTO Dual Authorization', status: 'Active Stage', color: 'border-blue-500 text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-500/20 animate-pulse' },
  { step: '04', title: 'Staging', subtitle: 'DRA Buffer Queue Staging', status: 'Pending', color: 'border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950' },
  { step: '05', title: 'Dry Run', subtitle: 'Digital Twin Network Simulation', status: 'Pending', color: 'border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950' },
  { step: '06', title: 'Production Write', subtitle: 'NETCONF Core Switch Commit', status: 'Pending', color: 'border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950' },
  { step: '07', title: 'Reconciliation', subtitle: 'Signalling SLA Verification', status: 'Pending', color: 'border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950' },
  { step: '08', title: 'Rollback if Failed', subtitle: 'Instant Snapshot Restoration', status: 'Standby Safety', color: 'border-orange-300 dark:border-orange-500/40 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10' },
  { step: '09', title: 'Audit Complete', subtitle: 'Cryptographic GSMA Log', status: 'Queued', color: 'border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10' },
];

export const GovernancePipelineView: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Workflow className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Closed-Loop Governance Pipeline</h1>
            <HelpTooltip
              title="Governance Pipeline"
              explanation="End-to-end stage pipeline orchestrating change authorization down to switch production write, reconciliation, and automated rollback."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Human Approval ➔ Risk Check ➔ Dual Approval ➔ Staging ➔ Dry Run ➔ Production Write ➔ Reconciliation ➔ Rollback ➔ Audit.</p>
        </div>
      </div>

      {/* PIPELINE PROGRESS FLOW */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-3">
          {PIPELINE_STEPS.map((item, idx) => (
            <div key={idx} className={`p-3 rounded-2xl border ${item.color} space-y-1.5 flex flex-col justify-between`}>
              <div>
                <span className="text-[10px] font-mono font-bold block opacity-70">STEP {item.step}</span>
                <h4 className="text-xs font-bold leading-tight">{item.title}</h4>
                <p className="text-[10px] opacity-80 mt-1">{item.subtitle}</p>
              </div>
              <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-950/80 border border-current font-bold self-start mt-2">
                {item.status}
              </span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-mono text-blue-600 dark:text-cyan-300 flex items-center justify-between">
          <span>PIPELINE ENGINE: Closed-Loop NETCONF Orchestrator v14.2</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">DRY-RUN READY</span>
        </div>
      </div>
    </div>
  );
};
