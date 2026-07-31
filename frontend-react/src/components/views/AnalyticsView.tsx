import React from 'react';
import { BarChart3, TrendingUp, Activity, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { HelpTooltip } from '../common/HelpTooltip';

const SLA_METRICS = [
  { month: 'Jan', slaPercent: 99.95, diffCount: 14 },
  { month: 'Feb', slaPercent: 99.96, diffCount: 19 },
  { month: 'Mar', slaPercent: 99.98, diffCount: 22 },
  { month: 'Apr', slaPercent: 99.98, diffCount: 18 },
  { month: 'May', slaPercent: 99.99, diffCount: 28 },
  { month: 'Jun', slaPercent: 99.98, diffCount: 31 },
];

export const AnalyticsView: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Analytics & Roaming SLA Metrics</h1>
            <HelpTooltip
              title="Analytics & SLAs"
              explanation="Performance dashboard tracking IR.21 XML parsing speeds, delta resolution turnaround times, and 99.98% GSMA SLA compliance metrics."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Interconnect SLA compliance performance & delta resolution speed.</p>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">GSMA IR.21 SLA Compliance</span>
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">99.98%</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Zero signalling downtime during updates</div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Average Delta Resolution</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-blue-600 dark:text-cyan-400">12.4 Mins</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Accelerated from 5 days down to minutes</div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Auto-Validated Parameters</span>
            <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">1,420 / mo</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">AI auto-parsing accuracy: 99.9%</div>
        </div>
      </div>

      {/* SLA BAR CHART */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Parameter Deltas Processed</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SLA_METRICS}>
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', fontSize: '12px', color: '#0f172a' }} />
              <Bar dataKey="diffCount" fill="#0066FF" radius={[6, 6, 0, 0]} name="Deltas Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
