import React, { useState, useEffect } from 'react';
import { RotateCcw, AlertTriangle, ShieldCheck, Globe, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

const REGION_MAPPING: Record<string, string> = {
  'Saudi Arabia': 'Middle East',
  'Kuwait': 'Middle East',
  'Bahrain': 'Middle East',
  'Qatar': 'Middle East',
  'Oman': 'Middle East',
  'United Arab Emirates': 'Middle East',
  'Germany': 'Europe',
  'United Kingdom': 'Europe',
  'Netherlands': 'Europe',
  'France': 'Europe',
  'Switzerland': 'Europe',
  'United States': 'North America',
  'Canada': 'North America',
  'India': 'Asia Pacific',
  'Singapore': 'Asia Pacific',
  'Australia': 'Asia Pacific',
};

const getRegionForCountry = (country: string): string => {
  return REGION_MAPPING[country] || 'Global';
};

export const RollbackCenter: React.FC = () => {
  const { rollbackQueue, executeRollback, documents } = useStore();
  const [activeOperator, setActiveOperator] = useState<string | null>(null);

  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    'Europe': true,
    'Middle East': true,
    'Asia Pacific': true,
    'North America': true,
    'Global': true,
  });

  // Map each snapshot to its region
  const snapshotsWithRegion = rollbackQueue.map(snap => {
    const doc = documents.find(d => d.operatorName === snap.operator);
    const country = doc ? doc.country : 'Global';
    const region = getRegionForCountry(country);
    return { ...snap, region };
  });

  // Group by Region -> Operator
  const groupedTree: Record<string, Record<string, typeof snapshotsWithRegion>> = {};
  snapshotsWithRegion.forEach(snap => {
    const region = snap.region;
    const operator = snap.operator || 'Unknown Operator';
    if (!groupedTree[region]) groupedTree[region] = {};
    if (!groupedTree[region][operator]) groupedTree[region][operator] = [];
    groupedTree[region][operator].push(snap);
  });

  const regionsList = Object.keys(groupedTree).sort();

  // Set default active operator
  useEffect(() => {
    if (!activeOperator && rollbackQueue.length > 0) {
      setActiveOperator(rollbackQueue[0].operator);
    }
  }, [rollbackQueue, activeOperator]);

  const activeSnapshots = activeOperator
    ? rollbackQueue.filter(snap => snap.operator === activeOperator)
    : [];

  const toggleRegion = (region: string) => {
    setExpandedRegions((prev) => ({ ...prev, [region]: !prev[region] }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Automated Rollback Engine</h1>
            <HelpTooltip
              title="Rollback Center"
              explanation="1-click emergency snapshot restoration engine allowing operators to safely revert misconfigured GT, APN, or SEPP parameters within 30 seconds."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">1-click baseline snapshot restoration & emergency outage recovery.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Left Side: Tree Selector */}
        <div className="w-full lg:w-80 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-4 shadow-sm self-start">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider px-2">Operator Directory</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {regionsList.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-[11px] font-mono">No operators found.</div>
            ) : (
              regionsList.map((region) => {
                const operators = groupedTree[region];
                const operatorNames = Object.keys(operators).sort();
                const isRegionExpanded = !!expandedRegions[region];

                return (
                  <div key={region} className="space-y-1">
                    <button
                      onClick={() => toggleRegion(region)}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-slate-700 dark:text-slate-300 font-extrabold text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                        <span>{region}</span>
                      </div>
                      {isRegionExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {isRegionExpanded && (
                      <div className="pl-4 border-l border-slate-100 dark:border-slate-800 space-y-1 mt-1">
                        {operatorNames.map((operator) => {
                          const isActive = activeOperator === operator;

                          return (
                            <button
                              key={operator}
                              onClick={() => setActiveOperator(operator)}
                              className={`w-full flex items-center space-x-2 p-2 rounded-lg text-left text-xs font-bold transition-all ${
                                isActive
                                  ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-cyan-300 border border-blue-100 dark:border-blue-500/30'
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                            >
                              <Folder className={`w-3.5 h-3.5 ${isActive ? 'text-blue-500' : 'text-slate-400'}`} />
                              <span className="truncate">{operator}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Rollback Cards */}
        <div className="flex-1 space-y-4">
          {activeOperator ? (
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <RotateCcw className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <span>Restore Snapshots for {activeOperator}</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeSnapshots.map((snap) => (
                  <div key={snap.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 shadow-sm hover:border-orange-500/40 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">{snap.operator}</span>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 text-[9px] font-mono font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-350 dark:border-orange-500/30">
                          {snap.versionNumber}
                        </span>
                        {snap.status && (
                          <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-full border ${
                            snap.status === 'Active Baseline'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-950 dark:text-slate-400'
                          }`}>
                            {snap.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-650 dark:text-slate-350 font-mono leading-relaxed">{snap.comment}</p>

                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-450 space-y-1">
                      <div>Active Config: <span className="text-slate-800 dark:text-slate-200 font-bold">{snap.activeConfiguration}</span></div>
                      <div>Rollback Risk: <span className="text-emerald-600 dark:text-emerald-450 font-bold">{snap.rollbackRisk}</span></div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => executeRollback(snap.id)}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center space-x-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Execute Emergency Rollback</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-500 text-xs font-mono">
              Please select an operator from the left to view active rollback restore options.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
