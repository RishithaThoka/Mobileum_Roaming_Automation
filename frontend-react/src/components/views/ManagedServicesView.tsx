import React from 'react';
import { ShieldCheck, Server, Workflow, Globe } from 'lucide-react';
import { HelpTooltip } from '../common/HelpTooltip';

export const ManagedServicesView: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Mobileum Managed Service Packages</h1>
            <HelpTooltip
              title="Managed Services"
              explanation="Turnkey managed service offerings for Tier-1 operators, ranging from Control Tower monitoring down to full 24/7 Global NOC Governance."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Managed service tier packages & quantifiable business ROI.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Package 1 */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 hover:border-blue-500/40 shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
              PACKAGE 1
            </span>
            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tier 1 Control Tower</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            24/7 non-intrusive monitoring of GSMA IR.21 XML feeds, automated deviation dashboards, and real-time email escalation alerts.
          </p>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-bold text-blue-600 dark:text-cyan-400 font-mono text-[11px]">BUSINESS VALUE</div>
            <div>• Eliminates 100% of missed GT routing changes from partner MNOs</div>
            <div>• Zero impact on existing core network topology</div>
          </div>
        </div>

        {/* Package 2 */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 hover:border-cyan-500/40 shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
              PACKAGE 2
            </span>
            <Workflow className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tier 2 Extraction Operations</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Fully managed AI OCR & document parsing operations. Mobileum engineers validate legacy PDFs & RAEX OpData tables before staging.
          </p>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-bold text-cyan-600 dark:text-cyan-400 font-mono text-[11px]">BUSINESS VALUE</div>
            <div>• 95% SLA speedup in staging partner roaming agreements</div>
            <div>• Complete offloading of manual spreadsheet data entry</div>
          </div>
        </div>

        {/* Package 3 */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 hover:border-purple-500/40 shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
              PACKAGE 3
            </span>
            <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tier 3 Governance & Provisioning</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Stage-gated authorization enforcement across CMO, CTO, and Security offices with Digital Twin pre-checks and 1-click rollback guarantees.
          </p>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-bold text-purple-600 dark:text-cyan-400 font-mono text-[11px]">BUSINESS VALUE</div>
            <div>• 99.98% zero-defect core network changes</div>
            <div>• Complete SOC2 & GSMA IR.21 regulatory audit readiness</div>
          </div>
        </div>

        {/* Package 4 */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/40 rounded-3xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              PACKAGE 4
            </span>
            <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Global Network Operations</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Turnkey end-to-end roaming operations. Mobileum NOC specialists manage 600+ interconnects, wholesale TAP rate cards, and 5G SEPP setups.
          </p>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">BUSINESS VALUE</div>
            <div>• $2.4M saved annually in prevented wholesale tariff leaks</div>
            <div>• 24/7/365 global SLA guarantee</div>
          </div>
        </div>
      </div>
    </div>
  );
};
