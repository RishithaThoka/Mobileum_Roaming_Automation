import React, { useState, useEffect } from 'react';
import { GitBranch, GitCommit, RotateCcw, Globe, Folder, ChevronDown, ChevronRight, FileText } from 'lucide-react';
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

export const VersionControlView: React.FC = () => {
  const { rollbackQueue, executeRollback, setActiveTab, documents } = useStore();
  const [activeOperator, setActiveOperator] = useState<string | null>(null);

  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    'Europe': true,
    'Middle East': true,
    'Asia Pacific': true,
    'North America': true,
    'Global': true,
  });

  // Map each snapshot in the queue to its Region & Operator
  const snapshotsWithRegion = rollbackQueue.map(snap => {
    const doc = documents.find(d => d.operatorName === snap.operator);
    const country = doc ? doc.country : 'Global';
    const region = getRegionForCountry(country);
    return { ...snap, region, country };
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

  // Set default active operator on load
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
            <GitBranch className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Enterprise Version Control Tree</h1>
            <HelpTooltip
              title="Version Control"
              explanation="Git-like version history tree maintaining historical configuration snapshots with commit logs, author timestamps, compare diffs, and rollback triggers."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Git-like baseline configuration commit timeline.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Left Side: Tree Navigation */}
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

        {/* Right Side: Tree Log Timeline */}
        <div className="flex-1 space-y-4">
          {activeOperator ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <Folder className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  <span>Version Timeline for {activeOperator}</span>
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-slate-100 dark:bg-slate-850 text-slate-500">
                  {activeSnapshots.length} Snapshots
                </span>
              </div>

              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-6 mt-4">
                {activeSnapshots.map((item) => (
                  <div key={item.id} className="relative space-y-2 group">
                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-white dark:border-slate-900 shadow-sm" />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white">{item.operator}</span>
                        <span className="px-2.5 py-0.5 text-[9px] font-mono font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-cyan-300 dark:border-blue-500/35">
                          {item.versionNumber}
                        </span>
                        {item.status && (
                          <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-full border ${
                            item.status === 'Active Baseline'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-950 dark:text-slate-400'
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{item.timestamp}</span>
                    </div>

                    <p className="text-[11px] text-slate-650 dark:text-slate-300 flex items-center space-x-1.5 font-mono">
                      <GitCommit className="w-3.5 h-3.5 text-slate-450 shrink-0" />
                      <span>{item.comment}</span>
                    </p>

                    <div className="p-3 bg-slate-50/75 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-450 flex items-center justify-between">
                      <div>Author: <span className="text-slate-800 dark:text-slate-200 font-bold">{item.author}</span></div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => setActiveTab('difference-checker')}
                          className="text-blue-600 dark:text-cyan-400 hover:underline font-bold"
                        >
                          Compare Baseline Diff
                        </button>
                        <button
                          onClick={() => executeRollback(item.id)}
                          className="text-orange-600 dark:text-orange-400 hover:underline font-bold flex items-center"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Restore Snapshot
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-500 text-xs font-mono">
              Please select an operator from the left to view version history timeline.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
