import React, { useState, useEffect } from 'react';
import { GitCompare, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Filter, Search, Code, Check, Globe, Folder, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { ParameterDelta } from '../../types';

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

export const DifferenceChecker: React.FC = () => {
  const { deltas, resolveDelta, documents, routingRules } = useStore();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    'Europe': true,
    'Middle East': true,
    'Asia Pacific': true,
    'North America': true,
    'Global': true,
  });

  const [expandedOperators, setExpandedOperators] = useState<Record<string, boolean>>({});

  const categories = ['All', 'Network/Technical', 'Security', 'Commercial', 'Financial/Billing', 'Legal/Compliance', 'Operations'];
  const roles = ['All', ...Array.from(new Set(routingRules.map(r => r.role_title)))].filter(Boolean);

  // Group documents by Region -> Operator
  const groupedDocs: Record<string, Record<string, typeof documents>> = {};
  documents.forEach((doc) => {
    const region = getRegionForCountry(doc.country);
    const operator = doc.operatorName || 'Unknown Operator';
    if (!groupedDocs[region]) groupedDocs[region] = {};
    if (!groupedDocs[region][operator]) groupedDocs[region][operator] = [];
    groupedDocs[region][operator].push(doc);
  });

  const regionsList = Object.keys(groupedDocs).sort();

  // Set default active doc on mount or documents list load
  useEffect(() => {
    if (!activeDocId && documents.length > 0) {
      // Find the first document that has unresolved deltas if possible, or just the first doc
      const docWithDeltas = documents.find(doc => deltas.some(d => d.docId === doc.id && d.status !== 'Approved'));
      if (docWithDeltas) {
        setActiveDocId(docWithDeltas.id);
      } else {
        setActiveDocId(documents[0].id);
      }
    }
  }, [documents, deltas, activeDocId]);

  const activeDoc = documents.find(d => d.id === activeDocId);
  const activeDocDeltas = activeDoc ? deltas.filter(d => d.docId === activeDocId) : [];

  const filteredDeltas = activeDocDeltas.filter((d) => {
    const matchesCategory = selectedCategory === 'All' || d.category === selectedCategory;
    const matchesSearch = d.parameterName.toLowerCase().includes(searchQuery.toLowerCase());
    const rule = routingRules.find(r => r.category === d.category);
    const deltaRole = rule ? rule.role_title : 'Admin';
    const matchesRole = selectedRole === 'All' || deltaRole === selectedRole;
    return matchesCategory && matchesSearch && matchesRole;
  });

  const toggleRegion = (region: string) => {
    setExpandedRegions((prev) => ({ ...prev, [region]: !prev[region] }));
  };

  const toggleOperator = (opKey: string) => {
    setExpandedOperators((prev) => ({ ...prev, [opKey]: !prev[opKey] }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <GitCompare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Smart Delta Difference Engine</h1>
            <HelpTooltip
              title="Difference Checker"
              explanation="Compares incoming GSMA IR.21 XML & RAEX OpData updates line-by-line against your active Master Repository baseline to prevent network outages and billing leaks."
              telecomContext="Automatically highlights MCC/MNC changes, SCCP Global Title rerouting, APN updates, and wholesale tariff rate modifications."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Side-by-side parameter discrepancy identification & risk scoring matrix.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors flex items-center space-x-1 print:hidden"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-xl font-mono font-bold">
            {deltas.filter((d) => d.status === 'Unresolved').length} Unresolved Deltas
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Left Side: Regions / Operators / Documents tree */}
        <div className="w-full lg:w-80 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-4 shadow-sm self-start print:hidden">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider px-2">Operator Ingestion Tree</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {regionsList.map((region) => {
              const operators = groupedDocs[region];
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
                    <div className="pl-4 border-l border-slate-100 dark:border-slate-800 space-y-2 mt-1">
                      {operatorNames.map((operator) => {
                                  const docs = operators[operator];
                                  const opKey = `${region}-${operator}`;
                                  const isOpExpanded = expandedOperators[opKey] !== false;

                                  return (
                                    <div key={operator} className="space-y-1">
                                      <button
                                        onClick={() => toggleOperator(opKey)}
                                        className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-slate-600 dark:text-slate-400 font-bold text-[11px]"
                                      >
                                        <div className="flex items-center space-x-1.5">
                                          <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                                          <span className="truncate max-w-[160px]">{operator}</span>
                                        </div>
                                        {isOpExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                      </button>

                                      {isOpExpanded && (
                                        <div className="pl-3.5 border-l border-slate-100 dark:border-slate-800 space-y-1 mt-0.5">
                                          {docs.map((doc) => {
                                            const isActive = activeDocId === doc.id;
                                            const hasUnresolved = deltas.some(d => d.docId === doc.id && d.status !== 'Approved');

                                            return (
                                              <button
                                                key={doc.id}
                                                onClick={() => setActiveDocId(doc.id)}
                                      className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-[10px] font-mono transition-all ${
                                        isActive
                                          ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-cyan-300 font-bold border border-blue-100 dark:border-blue-500/30'
                                          : 'text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center space-x-1.5 truncate pr-2">
                                        <FileText className="w-3 h-3 shrink-0 text-slate-400" />
                                        <span className="truncate">{doc.title}</span>
                                      </div>
                                      {hasUnresolved && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="Has pending changes" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Differences Panel */}
        <div className="flex-1 space-y-4">
          {activeDoc ? (
            <>
              {/* Active Document Details */}
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                      <span>{activeDoc.operatorName}</span>
                      <span className="text-xs font-mono font-bold text-slate-400">({activeDoc.country})</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{activeDoc.title} • {activeDoc.docType}</p>
                    
                    {activeDocDeltas.length > 0 && activeDocDeltas[0].comparedVersion && (
                      <div className="mt-2 text-xs font-mono bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-cyan-300 px-3 py-2 rounded-xl inline-block border border-blue-100 dark:border-blue-500/30">
                        <strong>Comparing:</strong> {activeDocDeltas[0].comparedVersion.current} <span className="opacity-75">({activeDocDeltas[0].comparedVersion.current_filename})</span>
                        <span className="mx-2 text-blue-400">vs</span>
                        {activeDocDeltas[0].comparedVersion.against} <span className="opacity-75">({activeDocDeltas[0].comparedVersion.against_filename})</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-xs font-mono">
                    <div>
                      MCC/MNC: <span className="font-bold text-blue-600 dark:text-cyan-400">{activeDoc.mccMnc}</span>
                    </div>
                    <div>
                      Version: <span className="font-bold text-slate-900 dark:text-white">{activeDoc.version}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm print:hidden">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="bg-transparent text-[11px] font-bold text-emerald-700 dark:text-emerald-400 focus:outline-none"
                    >
                      {roles.map((role: string) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative w-full sm:w-56 shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search parameters..."
                    className="w-full pl-9 pr-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Diffs List */}
              <div className="space-y-4">
                {filteredDeltas.length === 0 ? (
                  <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-500 text-xs font-mono">
                    No discrepancies detected in this view.
                  </div>
                ) : (
                  filteredDeltas.map((delta) => {
                    const isResolved = delta.status === 'Approved';

                    return (
                      <div
                        key={delta.id}
                        className={`p-5 bg-white dark:bg-slate-900 border rounded-3xl transition-all shadow-sm space-y-4 ${
                          isResolved
                            ? 'border-slate-200 dark:border-slate-800 opacity-75'
                            : 'border-slate-200 dark:border-slate-800 hover:border-blue-500/50'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center space-x-2.5">
                            <span className="px-2.5 py-0.5 text-[10px] font-mono rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-cyan-300 dark:border-blue-500/40 font-bold">
                              {delta.category}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                                delta.impactLevel === 'Critical'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400'
                              }`}
                            >
                              {delta.impactLevel} Risk Impact
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 print:hidden">
                            {isResolved ? (
                              <span className="inline-flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 rounded-xl text-xs font-bold">
                                <Check className="w-3.5 h-3.5 mr-1" /> Resolved & Cleared
                              </span>
                            ) : (
                              <button
                                onClick={() => resolveDelta(delta.id)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-colors flex items-center space-x-1.5 animate-pulse"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Accept & Approve Delta</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Parameter Details */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Parameter: <span className="text-blue-600 dark:text-cyan-400 font-mono">{delta.parameterName}</span>
                          </h4>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {delta.affectedServices.map((srv, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-[10px] font-mono rounded-lg border border-slate-200 dark:border-slate-800">
                                {srv}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Visual Diffs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {/* Old Baseline */}
                          <div className="p-4 bg-rose-50/40 dark:bg-slate-950 border border-rose-200 dark:border-rose-500/30 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400 border-b border-rose-100 dark:border-slate-900 pb-2">
                              <span>MASTER REPOSITORY BASELINE</span>
                              <span className="font-mono text-[10px] text-slate-500">CURRENT ACTIVE</span>
                            </div>
                            <div className="font-mono text-xs text-rose-800 dark:text-rose-300 bg-white dark:bg-rose-500/5 p-3 rounded-xl border border-rose-250 dark:border-rose-500/20 overflow-x-auto whitespace-pre-wrap">
                              {delta.oldValue}
                            </div>
                          </div>

                          {/* New Incoming */}
                          <div className="p-4 bg-emerald-50/40 dark:bg-slate-950 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400 border-b border-emerald-100 dark:border-slate-900 pb-2">
                              <span>INCOMING CONFIG UPDATE</span>
                              <span className="font-mono text-[10px] text-slate-500">PROPOSED NEW</span>
                            </div>
                            <div className="font-mono text-xs text-emerald-800 dark:text-emerald-300 bg-white dark:bg-emerald-500/5 p-3 rounded-xl border border-emerald-250 dark:border-emerald-500/20 overflow-x-auto whitespace-pre-wrap">
                              {delta.newValue}
                            </div>
                          </div>
                        </div>

                        {/* AI Business Impact */}
                        {delta.aiAnalysis && (
                          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800/80 rounded-2xl text-[11px] space-y-2.5 font-sans">
                            <div className="flex items-center space-x-2 text-cyan-700 dark:text-cyan-400 font-bold font-mono">
                              <ShieldCheck className="w-4 h-4" />
                              <span>AI ANOMALY ASSESSMENT & CO-PILOT ANALYSIS</span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-350 leading-relaxed">
                              <strong>Risk Impact Summary:</strong> {delta.aiAnalysis.summary}
                            </div>
                            <div className="text-slate-600 dark:text-slate-350 leading-relaxed">
                              <strong>Wholesale Revenue Impact:</strong> {delta.aiAnalysis.businessImpact}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              <strong>Rollback Recommendation:</strong> {delta.aiAnalysis.rollbackRecommendation}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-500 text-xs font-mono">
              Please select a document from the Operator Ingestion Tree to view parameter discrepancies.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
