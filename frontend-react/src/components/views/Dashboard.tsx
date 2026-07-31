import React from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  CheckCheck,
  GitBranch,
  Globe,
  Upload,
  GitCompare,
  Activity,
  RotateCcw,
  ShieldCheck,
  ArrowUpRight,
  Play
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { StatusBadge } from '../common/StatusBadge';
import { RoleBadge } from '../common/RoleBadge';

const PERFORMANCE_DATA = [
  { time: '08:00', ingested: 12, deltaCount: 3, autoApproved: 9 },
  { time: '10:00', ingested: 24, deltaCount: 8, autoApproved: 18 },
  { time: '12:00', ingested: 18, deltaCount: 4, autoApproved: 15 },
  { time: '14:00', ingested: 35, deltaCount: 11, autoApproved: 28 },
  { time: '16:00', ingested: 29, deltaCount: 6, autoApproved: 23 },
  { time: '18:00', ingested: 15, deltaCount: 2, autoApproved: 14 },
];

export const Dashboard: React.FC = () => {
  const {
    activeRole,
    setActiveTab,
    documents,
    deltas,
    approvalChains,
    rollbackQueue,
    notifications,
    operators,
    auditLogs,
    setQuickUploadOpen,
  } = useStore();

  const totalDocuments = documents.length;
  const pendingReviews = approvalChains.filter((a) => a.status === 'In Progress' || a.status === 'Pending').length;
  const totalApprovals = approvalChains.filter((a) => a.status === 'Approved').length;
  const totalRejected = approvalChains.filter((a) => a.status === 'Rejected').length;
  const totalCompleted = documents.filter((d) => d.status === 'Provisioned' || d.status === 'Approved').length;
  const totalDeltas = deltas.filter((d) => d.status === 'Unresolved').length;
  const activeRollbacks = rollbackQueue.length;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header & Role Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Telecom Operations Dashboard</h1>
            <HelpTooltip
              title="Operations Dashboard"
              explanation="Centralized command center for managing global roaming configurations, IR.21 XML parsing, difference detection, and stage-gated governance approvals."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time IR.21 XML & RAEX OpData workflow status for Tier-1 mobile network operators.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Active Role:</span>
            <RoleBadge role={activeRole} />
          </div>

          <button
            onClick={() => setQuickUploadOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* HIGHLIGHTED METRICS TILE GRID - 8 CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
        {/* Card 1: Documents Received */}
        <div
          onClick={() => setActiveTab('documents')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-500/30 hover:border-blue-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">+12%</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
            {totalDocuments}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Docs Ingested</div>
        </div>

        {/* Card 2: Pending Reviews */}
        <div
          onClick={() => setActiveTab('approval-workflow')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-amber-200 dark:border-amber-500/30 hover:border-amber-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {pendingReviews}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Pending Reviews</div>
        </div>

        {/* Card 3: Approvals */}
        <div
          onClick={() => setActiveTab('approval-workflow')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">100%</span>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            {totalApprovals}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Stage Approvals</div>
        </div>

        {/* Card 4: Rejected */}
        <div
          onClick={() => setActiveTab('approval-workflow')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-rose-200 dark:border-rose-500/30 hover:border-rose-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <span className="text-[10px] font-mono text-rose-500 dark:text-rose-400">Flagged</span>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {totalRejected}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Rejected</div>
        </div>

        {/* Card 5: Completed */}
        <div
          onClick={() => setActiveTab('master-repo')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-cyan-200 dark:border-cyan-500/30 hover:border-cyan-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <CheckCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">Live</span>
          </div>
          <div className="text-xl font-black text-cyan-600 dark:text-cyan-400">
            {totalCompleted}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Completed Baseline</div>
        </div>

        {/* Card 6: Delta Anomaly */}
        <div
          onClick={() => setActiveTab('difference-checker')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-500/30 hover:border-purple-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <GitCompare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold">High Risk</span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white group-hover:text-purple-600 transition-colors">
            {totalDeltas}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Difference Alerts</div>
        </div>

        {/* Card 7: Rollback Queue */}
        <div
          onClick={() => setActiveTab('rollback-center')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-orange-200 dark:border-orange-500/30 hover:border-orange-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <RotateCcw className="w-4 h-4 text-orange-500 dark:text-orange-400" />
            <span className="text-[10px] font-mono text-slate-400">Snapshots</span>
          </div>
          <div className="text-xl font-black text-orange-600 dark:text-orange-400">
            {activeRollbacks}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Rollback Queue</div>
        </div>

        {/* Card 8: System Health */}
        <div
          onClick={() => setActiveTab('audit-logs')}
          className="p-3.5 bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-500 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-slate-400 mb-1 pt-1">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">99.98%</span>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            GSMA
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold line-clamp-1">Audit Status</div>
        </div>
      </div>

      {/* MIDDLE SECTION: PERFORMANCE CHART & DIFFERENCE DETECTION ALERT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Performance Area Chart Tile */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl shadow-md relative overflow-hidden space-y-4">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-emerald-500" />
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Live Ingestion & Auto-Parsing Throughput</h3>
                <HelpTooltip
                  title="Ingestion Performance"
                  explanation="Real-time chart tracking IR.21 XML and RAEX OpData files ingested vs automatically processed deltas over time."
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Hourly throughput from GSMA InfoExchange API and Email Ingest</p>
            </div>
            <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-mono font-bold">
              24-Hour Metric
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PERFORMANCE_DATA}>
                <defs>
                  <linearGradient id="colorIngested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066FF" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0066FF" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorAuto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '0.75rem', fontSize: '12px', color: '#0f172a', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="ingested" stroke="#0066FF" strokeWidth={3} fillOpacity={1} fill="url(#colorIngested)" name="Ingested Files" />
                <Area type="monotone" dataKey="autoApproved" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorAuto)" name="Auto-Validated" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Difference Detection Live Widget Tile */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-500/30 rounded-3xl shadow-md relative overflow-hidden flex flex-col justify-between space-y-4">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-500" />
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 pt-1">
              <div className="flex items-center space-x-2">
                <GitCompare className="w-4 h-4 text-purple-600 dark:text-cyan-400" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Live Delta Anomaly Alert</h3>
              </div>
              <button
                onClick={() => setActiveTab('difference-checker')}
                className="text-xs font-bold text-purple-600 hover:text-purple-500 flex items-center space-x-1"
              >
                <span>View All ({deltas.length})</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {deltas.slice(0, 3).map((delta) => (
                <div key={delta.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-200">{delta.operator}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold border ${
                      delta.impactLevel === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {delta.impactLevel}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{delta.category}: <span className="text-slate-900 dark:text-slate-200 font-bold">{delta.parameterName}</span></div>
                  <div className="text-[10px] font-mono text-blue-600 dark:text-cyan-400 flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-900">
                    <span>Baseline: {delta.oldValue}</span>
                    <span>Incoming: {delta.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setActiveTab('difference-checker')}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition-all flex items-center justify-center space-x-2"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Launch Difference Checker Engine</span>
          </button>
        </div>
      </div>

      {/* LOWER SECTION: CONNECTED OPERATORS & RECENT ACTIVITY FEED TILES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Operators Table Tile */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl shadow-md relative overflow-hidden space-y-4">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400" />
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 pt-1">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Connected Mobile Network Operators (MNOs)</h3>
              <HelpTooltip
                title="Connected Operators"
                explanation="Global roaming partners with active IR.21 data synchronization and 2G/3G/4G/5G/VoLTE roaming agreements."
              />
            </div>
            <button
              onClick={() => setActiveTab('operators')}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Manage ({operators.length})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-mono text-[11px]">
                  <th className="pb-2 font-semibold">Operator</th>
                  <th className="pb-2 font-semibold">MCC/MNC</th>
                  <th className="pb-2 font-semibold">Roaming Specs</th>
                  <th className="pb-2 font-semibold">Last IR.21 Sync</th>
                  <th className="pb-2 font-semibold">RAEX Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {operators.slice(0, 5).map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-2.5 font-extrabold text-slate-900 dark:text-slate-200 flex items-center space-x-2">
                      <span>{op.flag}</span>
                      <span>{op.name}</span>
                    </td>
                    <td className="py-2.5 font-mono text-blue-600 dark:text-cyan-400 font-bold">{op.mccMnc}</td>
                    <td className="py-2.5">
                      <div className="flex space-x-1 font-mono text-[10px]">
                        {op.agreements.volte && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">VoLTE</span>}
                        {op.agreements.nr5G && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">5G SA</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-500 text-[11px] font-mono">{op.lastIr21Update}</td>
                    <td className="py-2.5">
                      <StatusBadge status={op.raexStatus} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Audit Activities Feed Tile */}
        <div className="p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl shadow-md relative overflow-hidden space-y-4">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-pink-500" />
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 pt-1">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Audit & Security Log</h3>
            </div>
            <button
              onClick={() => setActiveTab('audit-logs')}
              className="text-xs font-bold text-purple-600 hover:underline"
            >
              Full Log
            </button>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {auditLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 dark:text-slate-200">{log.action}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{log.timestamp.split(' ')[1]}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{log.details || log.whyReason}</p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-900 text-[10px] font-mono text-slate-500">
                  <span>By: {log.user}</span>
                  <span className="text-purple-600 dark:text-cyan-400 font-bold">{log.complianceStatus}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
