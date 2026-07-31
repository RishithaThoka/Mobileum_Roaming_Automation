import React from 'react';
import { TrendingUp, Globe, AlertTriangle, Activity } from 'lucide-react';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area } from 'recharts';
import { HelpTooltip } from '../common/HelpTooltip';

const REVENUE_TREND_DATA = [
  { month: 'Jan', savedUsd: 85000, riskScore: 18 },
  { month: 'Feb', savedUsd: 110000, riskScore: 14 },
  { month: 'Mar', savedUsd: 125000, riskScore: 12 },
  { month: 'Apr', savedUsd: 142000, riskScore: 8 },
  { month: 'May', savedUsd: 168000, riskScore: 5 },
  { month: 'Jun', savedUsd: 195000, riskScore: 3 },
];

export const ExecutiveDashboardView: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Executive Roaming Command Center</h1>
            <HelpTooltip
              title="Executive Dashboard"
              explanation="C-level view summarizing total wholesale revenue protection, pending critical changes, country coverage, risk score trends, and network SLA health."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Executive KPIs, revenue impact protection & global SLA trends.</p>
        </div>

        <span className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-300 dark:bg-purple-500/10 dark:border-purple-500/30 dark:text-purple-300 rounded-xl text-xs font-mono font-bold shadow-sm">
          C-LEVEL EXECUTIVE VIEW
        </span>
      </div>

      {/* HIGHLIGHTED KPI TILE CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Tile 1: Revenue Impact Protected */}
        <div className="p-5 bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-500/40 rounded-3xl space-y-2 shadow-md shadow-emerald-500/5 hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Revenue Impact Protected</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">$ 195,000 / mo</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">+22% wholesale tariff leakage saved</div>
        </div>

        {/* Tile 2: Pending Critical Changes */}
        <div className="p-5 bg-white dark:bg-slate-900 border-2 border-amber-200 dark:border-amber-500/40 rounded-3xl space-y-2 shadow-md shadow-amber-500/5 hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-400" />
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Pending Critical Changes</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">2 Requests</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Awaiting CMO / CTO sign-off</div>
        </div>

        {/* Tile 3: Global Country Footprint */}
        <div className="p-5 bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-500/40 rounded-3xl space-y-2 shadow-md shadow-blue-500/5 hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400" />
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Global Country Footprint</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-cyan-400 tracking-tight">42 Countries</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">600+ operator interconnects</div>
        </div>

        {/* Tile 4: Overall Network Health */}
        <div className="p-5 bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-500/40 rounded-3xl space-y-2 shadow-md shadow-purple-500/5 hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-400" />
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">Overall Network Health</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">99.98%</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Zero packet loss in provisioning</div>
        </div>
      </div>

      {/* HIGHLIGHTED CHART SECTION TILE */}
      <div className="p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />
        <div className="flex items-center justify-between pt-1">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Monthly Wholesale Revenue Protected ($ USD)</h3>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-mono font-bold">
            + $195,000 / mo Avg
          </span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={REVENUE_TREND_DATA}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '0.75rem', fontSize: '12px', color: '#0f172a', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="savedUsd" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name="Protected Revenue ($)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
