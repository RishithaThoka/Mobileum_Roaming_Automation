import React from 'react';
import { Globe } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { StatusBadge } from '../common/StatusBadge';

export const OperatorsView: React.FC = () => {
  const { operators } = useStore();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-cyan-400 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Connected Mobile Network Operators (MNOs)</h1>
            <HelpTooltip
              title="Connected MNOs"
              explanation="Directory of international mobile operators with active roaming interconnects, 2G/3G/4G/5G SA roaming agreements, and live IR.21 XML feeds."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage global partner operator specifications and roaming agreements.</p>
        </div>
      </div>

      {/* HIGHLIGHTED OPERATOR CARDS GRID - WHITE THEME */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {operators.map((op) => (
          <div
            key={op.id}
            className="p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400" />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-3">
                <span className="text-3xl">{op.flag}</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{op.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{op.country} • TADIG: <span className="font-mono text-blue-600 dark:text-cyan-400 font-bold">{op.code}</span></p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('admin_token');
                      const API_BASE = import.meta.env.VITE_API_URL || '';
                      const res = await fetch(`${API_BASE}/api/reports/operators/${op.id}/daily`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (!res.ok) throw new Error('Failed to download');
                      const blob = await res.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${op.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_daily_report.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error(e);
                      alert('Failed to download report. Ensure you are logged in as admin.');
                    }
                  }}
                  className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-cyan-400 dark:hover:bg-blue-800/50 rounded-lg transition-colors border border-blue-200 dark:border-blue-800 flex items-center justify-center group"
                  title="Download Daily Report"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
                <StatusBadge status={op.raexStatus} size="sm" />
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>MCC / MNC:</span>
                <span className="text-blue-600 dark:text-cyan-400 font-extrabold">{op.mccMnc}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Partner Networks:</span>
                <span className="text-slate-900 dark:text-white font-extrabold">{op.totalRoamingPartners} MNOs</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Last IR.21 Update:</span>
                <span className="text-slate-700 dark:text-slate-300 font-bold">{op.lastIr21Update}</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">ACTIVE ROAMING SPECS</div>
              <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                {op.agreements.voice2G3G && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold">2G/3G Voice</span>}
                {op.agreements.lte4G && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-bold">4G LTE</span>}
                {op.agreements.volte && <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-700 border border-cyan-200 font-bold">VoLTE HD</span>}
                {op.agreements.nr5G && <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 font-bold">5G Standalone</span>}
                {op.agreements.v2x && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">C-V2X IoT</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
