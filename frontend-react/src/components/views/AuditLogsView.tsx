import React, { useState } from 'react';
import { FileCheck2, Search, ShieldAlert, Cpu, User, Users, Filter } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

export const AuditLogsView: React.FC = () => {
  const { auditLogs } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [logTypeTab, setLogTypeTab] = useState<'general' | 'role'>('general');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');

  // Filter logs by search query first
  const baseFilteredLogs = auditLogs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetResource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Separate logs into General and Role-Based
  const generalLogs = baseFilteredLogs.filter(
    (log) => (log.role as string) === 'System' || log.user.toLowerCase() === 'system' || log.user.toLowerCase() === 'parser engine'
  );

  const roleLogs = baseFilteredLogs.filter(
    (log) => (log.role as string) !== 'System' && log.user.toLowerCase() !== 'system' && log.user.toLowerCase() !== 'parser engine'
  );

  // Apply specific role sub-filters in the role-based tab
  const activeRoleFilters = ['All', 'Admin', 'Analyst', 'CTO', 'CMO', 'Security', 'Finance'];
  const finalRoleLogs = roleLogs.filter(
    (log) => selectedRoleFilter === 'All' || log.role === selectedRoleFilter
  );

  const displayedLogs = logTypeTab === 'general' ? generalLogs : finalRoleLogs;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <FileCheck2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Immutable GSMA & Regulatory Audit Logs</h1>
            <HelpTooltip
              title="Audit Logs"
              explanation="Cryptographically sealed regulatory audit trail documenting every document upload, stage approval decision, IP swap, and rollback execution with IP address stamps."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Full compliance logging for telecom auditors & regulatory inspectors.</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tabs for General vs Role-Based */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-fit border border-slate-200 dark:border-slate-750">
          <button
            onClick={() => setLogTypeTab('general')}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              logTypeTab === 'general'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-cyan-400 shadow-sm border border-slate-200/50 dark:border-slate-850'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>General System Logs</span>
            <span className="ml-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-950/40 text-slate-500 font-bold">
              {generalLogs.length}
            </span>
          </button>

          <button
            onClick={() => setLogTypeTab('role')}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              logTypeTab === 'role'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-cyan-400 shadow-sm border border-slate-200/50 dark:border-slate-850'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Role-Based Activity Logs</span>
            <span className="ml-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-950/40 text-slate-500 font-bold">
              {roleLogs.length}
            </span>
          </button>
        </div>

        {/* Dynamic Role Sub-Filters (only visible in Role-based tab) */}
        {logTypeTab === 'role' && (
          <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {activeRoleFilters.map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRoleFilter(role)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap transition-colors border ${
                  selectedRoleFilter === role
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-450 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {displayedLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs font-mono">
              No audit logs found matching the selected filters.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px] bg-slate-50 dark:bg-slate-950/80">
                  <th className="p-4 font-semibold">Timestamp</th>
                  <th className="p-4 font-semibold">User & Role</th>
                  <th className="p-4 font-semibold">Action</th>
                  <th className="p-4 font-semibold">Target Resource</th>
                  <th className="p-4 font-semibold">Audit Details</th>
                  <th className="p-4 font-semibold">IP Stamp</th>
                  <th className="p-4 font-semibold">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                {displayedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-4 text-slate-500">{log.timestamp}</td>
                    <td className="p-4">
                      <span className="font-sans font-bold text-slate-900 dark:text-slate-200 flex items-center space-x-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{log.user}</span>
                      </span>
                      <span className="block text-[10px] text-blue-600 dark:text-cyan-400 font-mono font-bold mt-0.5">{log.role}</span>
                    </td>
                    <td className="p-4 font-bold text-slate-900 dark:text-slate-100">{log.action}</td>
                    <td className="p-4 text-slate-700 dark:text-slate-300">{log.targetResource}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 font-sans max-w-xs">{log.details}</td>
                    <td className="p-4 text-slate-400">{log.ipAddress}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-[10px] font-bold">
                        {log.complianceStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
