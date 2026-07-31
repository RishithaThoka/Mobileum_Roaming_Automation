import React from 'react';
import { Users } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

export const PartnersView: React.FC = () => {
  const { operators } = useStore();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Partner Roaming Agreements Directory</h1>
            <HelpTooltip
              title="Partner Agreements"
              explanation="Tracks bilateral wholesale discount contracts, TAP/BEE settlement rules, and IOT tariff rate matrices."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Bilateral commercial & technical SLA contracts.</p>
        </div>
      </div>

      {/* WHITE THEME PARTNERS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {operators.map((op) => (
          <div
            key={op.id}
            className="p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-500" />
            <div className="flex items-center justify-between pt-1">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">{op.name} ({op.country})</span>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400">
                Agreed SLA
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono">Wholesale TAP3.12 Discount Matrix: Active 2026-Q3</p>
            <div className="text-[11px] text-slate-500 font-mono flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>Bilateral Contract ID: SLA-2026-9904</span>
              <span className="text-blue-600 dark:text-cyan-400 font-bold">Auto-Renewed</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
