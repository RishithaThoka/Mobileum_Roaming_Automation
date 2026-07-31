import React, { useState } from 'react';
import { Globe, ArrowRight, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { ConnectedOperator } from '../../types';
import { HelpTooltip } from '../common/HelpTooltip';

export const GlobalMapView: React.FC = () => {
  const { operators, setActiveTab } = useStore();
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [activeOperator, setActiveOperator] = useState<ConnectedOperator | null>(null);

  // Default to first operator if not set
  React.useEffect(() => {
    if (operators.length > 0 && !activeOperator) {
      setActiveOperator(operators[0]);
    }
  }, [operators, activeOperator]);

  const regions = ['All', 'Middle East', 'Europe', 'Asia Pacific', 'North America', 'Africa'];

  const filteredOperators = operators.filter(
    (op) => selectedRegion === 'All' || op.region === selectedRegion
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Globe className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Global Roaming Network Grid & Traffic Map</h1>
            <HelpTooltip
              title="Global Network Grid"
              explanation="Interactive interconnect topology map displaying international roaming node connectivity across Middle East, Europe, Asia Pacific, and Americas."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time interconnect topology & international roaming traffic throughput.</p>
        </div>

        {/* REGION FILTER BAR */}
        <div className="flex items-center space-x-1.5 overflow-x-auto bg-white dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          {regions.map((reg) => (
            <button
              key={reg}
              onClick={() => setSelectedRegion(reg)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedRegion === reg
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* MAP GRID CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Operator Grid */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[480px] shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 text-xs font-mono">
              <span className="text-blue-600 dark:text-cyan-400 font-bold">.:: LIVE MNO NETWORK GRID</span>
              <span className="text-slate-500">{filteredOperators.length} Active Nodes</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 my-6">
              {filteredOperators.map((op) => {
                const isSelected = activeOperator && op.id === activeOperator.id;
                return (
                  <div
                    key={op.id}
                    onClick={() => setActiveOperator(op)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-600/20 border-blue-500 shadow-md'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                      <span className="flex items-center space-x-2">
                        <span>{op.flag}</span>
                        <span>{op.name}</span>
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-blue-600 dark:text-cyan-400">{op.mccMnc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono text-slate-500">
            {/* Real metrics would go here */}
          </div>
        </div>

        {/* Selected Operator Detail Drawer */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4 shadow-sm">
          {activeOperator ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-2xl">{activeOperator.flag}</span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeOperator.name}</h3>
                    <p className="text-xs text-slate-500">{activeOperator.country} • {activeOperator.region}</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">TADIG CODE / MCC-MNC</div>
                    <div className="text-sm font-extrabold text-blue-600 dark:text-cyan-400 font-mono mt-0.5">{activeOperator.code} ({activeOperator.mccMnc})</div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Active Routing Agreements</div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1 flex space-x-2">
                      {activeOperator.agreements.lte4G && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">LTE</span>}
                      {activeOperator.agreements.volte && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">VoLTE</span>}
                      {activeOperator.agreements.nr5G && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">5G SA</span>}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('master-repo')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-1.5"
              >
                <span>Inspect Master Baseline Config</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 font-mono">
              Select an operator node from the grid
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
