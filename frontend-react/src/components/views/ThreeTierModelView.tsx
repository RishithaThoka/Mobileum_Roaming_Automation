import React from 'react';
import { Layers, Eye, Bot, Cpu, CheckCircle2, Lock, ArrowRight, Zap } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

export const ThreeTierModelView: React.FC = () => {
  const { setActiveTab } = useStore();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-cyan-400 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Mobileum 3-Tier Productization Model</h1>
            <HelpTooltip
              title="3-Tier Model"
              explanation="Commercial deployment framework offering Tier 1 Read-Only Detection, Tier 2 AI Extraction & Auto-Parsing, and Tier 3 Advanced Closed-Loop Multi-System Provisioning."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Enterprise capability tiers for Tier-1 mobile network operators.</p>
        </div>
      </div>

      {/* 3 TIERS HIGHLIGHTED CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* TIER 1: ENTRY */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 rounded-3xl space-y-4 relative flex flex-col justify-between hover:border-slate-400 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-slate-500" />
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300">
                TIER 1 - ENTRY
              </span>
              <Eye className="w-5 h-5 text-slate-500" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white">Detection & Read-Only Governance</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Entry tier focused on non-intrusive monitoring, manual approval workflows, and discrepancy detection with zero direct switch write access.
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Read-Only Ingestion Hook</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Difference Detection Engine</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Manual Approval Chain</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Deviation Dashboard & Audit</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-400">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="line-through">No Switch Write Access</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('difference-checker')}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center space-x-1.5"
          >
            <span>Explore Read-Only Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* TIER 2: MID */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-blue-300 dark:border-blue-500/40 rounded-3xl space-y-4 relative flex flex-col justify-between shadow-md shadow-blue-500/10 hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-600 to-cyan-400" />
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-300">
                TIER 2 - MID
              </span>
              <Bot className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white">AI Extraction & Auto-Parsing</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Mid-level automation featuring AI OCR for legacy PDF IR.21 tables, automatic XML parsing, and automated updates to Mobileum master baseline.
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>AI OCR & Document Extraction</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>GSMA Table 14.2 Auto-Parsing</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Version Control & Git-like Diff</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Automatic Master Baseline Sync</span>
              </div>
              <div className="flex items-center space-x-2 text-amber-700 font-bold">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Human Stage Sign-off Required</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('master-repo')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-600/30 transition-colors flex items-center justify-center space-x-1.5"
          >
            <span>Launch Tier 2 Auto-Parse</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* TIER 3: ADVANCED */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-purple-300 dark:border-purple-500/40 rounded-3xl space-y-4 relative flex flex-col justify-between shadow-md shadow-purple-500/10 hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-purple-600 to-indigo-400" />
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-300">
                TIER 3 - ADVANCED
              </span>
              <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white">Closed-Loop Multi-System Write</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Full enterprise closed-loop automation with multi-system vendor provisioning, Digital Twin dry-runs, Risk Engine evaluation, and 1-click rollbacks.
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Closed-Loop Switch Automation</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Multi-Vendor Switch Integration</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Digital Twin & Simulation Dry-Run</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Risk Engine & Revenue Protection</span>
              </div>
              <div className="flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>1-Click Emergency Rollback</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('digital-twin')}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold shadow-md shadow-purple-600/30 transition-colors flex items-center justify-center space-x-1.5"
          >
            <span>Launch Tier 3 Closed-Loop</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
