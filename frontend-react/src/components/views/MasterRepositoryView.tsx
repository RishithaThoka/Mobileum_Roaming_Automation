import React from 'react';
import { Database, ShieldCheck, GitBranch } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

export const MasterRepositoryView: React.FC = () => {
  const { documents, setActiveTab, setSelectedDocId } = useStore();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Master Configuration Baseline Repository</h1>
            <HelpTooltip
              title="Master Repository"
              explanation="Golden baseline repository storing active approved GSMA IR.21 configurations for all 600+ connected mobile network operators."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Single source of truth for global core network routing baselines.</p>
        </div>

        <button
          onClick={() => setActiveTab('version-control')}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all self-start"
        >
          <GitBranch className="w-4 h-4" />
          <span>View Version Control Tree</span>
        </button>
      </div>

      {/* BASELINE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map((doc) => (
          <div key={doc.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 shadow-sm hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-slate-900 dark:text-white">{doc.operatorName}</span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-cyan-300">
                {doc.version}
              </span>
            </div>

            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{doc.title}</div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
              <div>MCC/MNC: <span className="text-blue-600 dark:text-cyan-400 font-bold">{doc.mccMnc}</span></div>
              <div>Author: <span className="text-slate-800 dark:text-slate-200">{doc.author}</span></div>
              <div>Modified: <span className="text-slate-800 dark:text-slate-200">{doc.modifiedDate}</span></div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                <ShieldCheck className="w-4 h-4 mr-1" /> Active Baseline
              </span>
              <button
                onClick={() => setActiveTab('difference-checker')}
                className="text-blue-600 dark:text-cyan-400 hover:underline font-semibold text-[11px]"
              >
                Inspect Deltas
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
