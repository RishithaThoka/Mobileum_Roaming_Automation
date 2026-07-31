import React, { useState } from 'react';
import { FileText, Search, Upload, Eye, ChevronDown, ChevronRight, Globe, Server, Folder } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { StatusBadge } from '../common/StatusBadge';
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

export const DocumentsView: React.FC = () => {
  const { documents, setSelectedDocId, setQuickUploadOpen, setActiveTab } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    'Europe': true,
    'Middle East': true,
    'Asia Pacific': true,
    'North America': true,
    'Global': true,
  });

  const [expandedOperators, setExpandedOperators] = useState<Record<string, boolean>>({});

  const toggleRegion = (region: string) => {
    setExpandedRegions((prev) => ({ ...prev, [region]: !prev[region] }));
  };

  const toggleOperator = (opKey: string) => {
    setExpandedOperators((prev) => ({ ...prev, [opKey]: !prev[opKey] }));
  };

  // Filter documents by search query
  const filteredDocs = documents.filter(
    (d) => {
      const opMatch = d.operatorName ? d.operatorName.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      const titleMatch = d.title ? d.title.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      const mccMatch = d.mccMnc ? d.mccMnc.includes(searchQuery) : false;
      return opMatch || titleMatch || mccMatch;
    }
  );

  // Group filtered documents by Region -> Operator
  const groupedData: Record<string, Record<string, typeof documents>> = {};

  filteredDocs.forEach((doc) => {
    const region = getRegionForCountry(doc.country);
    const operator = doc.operatorName || 'Unknown Operator';

    if (!groupedData[region]) {
      groupedData[region] = {};
    }
    if (!groupedData[region][operator]) {
      groupedData[region][operator] = [];
    }
    groupedData[region][operator].push(doc);
  });

  const regionsList = Object.keys(groupedData).sort();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Documents Ingest Repository</h1>
            <HelpTooltip
              title="Documents Ingest"
              explanation="Central repository of all ingested GSMA IR.21 XML, RAEX OpData, and TAP3 billing files parsed across Mail Repository, Auto RAEX, and Manual Upload sources."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Multi-channel telecom document intake & schema validation repository.</p>
        </div>

        <button
          onClick={() => setQuickUploadOpen(true)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all self-start"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* SEARCH AND GROUPED LIST */}
      <div className="space-y-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex items-center justify-between shadow-sm">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by operator or title..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <span className="text-xs text-slate-500 font-mono font-bold">{filteredDocs.length} Total Files</span>
        </div>

        {/* REGION ACCORDIONS */}
        {regionsList.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-500 text-xs">
            No documents found matching search criteria.
          </div>
        ) : (
          regionsList.map((region) => {
            const operatorsData = groupedData[region];
            const operatorNames = Object.keys(operatorsData).sort();
            const isRegionExpanded = !!expandedRegions[region];

            return (
              <div key={region} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                {/* Region Header */}
                <button
                  onClick={() => toggleRegion(region)}
                  className="w-full px-6 py-4 bg-slate-50/55 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-slate-900 dark:text-slate-100"
                >
                  <div className="flex items-center space-x-3">
                    <Globe className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                    <span className="font-extrabold text-sm tracking-tight">{region} Region</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-bold">
                      {operatorNames.length} Operators
                    </span>
                  </div>
                  {isRegionExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Operators inside Region */}
                {isRegionExpanded && (
                  <div className="p-4 space-y-4">
                    {operatorNames.map((operator) => {
                      const docs = operatorsData[operator];
                      const opKey = `${region}-${operator}`;
                      const isOpExpanded = expandedOperators[opKey] !== false; // expanded by default

                      return (
                        <div key={operator} className="border border-slate-150 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-slate-50/20 dark:bg-slate-950/20">
                          {/* Operator sub-header */}
                          <button
                            onClick={() => toggleOperator(opKey)}
                            className="w-full px-4 py-3 bg-slate-100/50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between text-slate-800 dark:text-slate-200"
                          >
                            <div className="flex items-center space-x-2.5">
                              <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                              <span className="font-bold text-xs">{operator}</span>
                              <span className="text-[10px] font-mono text-slate-400">({docs.length} docs)</span>
                            </div>
                            {isOpExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>

                          {/* Operator Documents Table */}
                          {isOpExpanded && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs bg-white dark:bg-slate-900">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[10px] bg-slate-50/30 dark:bg-slate-950/20">
                                    <th className="p-3 font-semibold">Document Title</th>
                                    <th className="p-3 font-semibold">MCC/MNC</th>
                                    <th className="p-3 font-semibold">Doc Type</th>
                                    <th className="p-3 font-semibold">Source</th>
                                    <th className="p-3 font-semibold">Version</th>
                                    <th className="p-3 font-semibold">Status</th>
                                    <th className="p-3 font-semibold text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[10px]">
                                  {docs.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                      <td className="p-3 font-sans font-bold text-slate-900 dark:text-slate-100 max-w-xs truncate">{doc.title}</td>
                                      <td className="p-3 text-blue-600 dark:text-cyan-400 font-bold">{doc.mccMnc}</td>
                                      <td className="p-3 text-slate-700 dark:text-slate-300">{doc.docType}</td>
                                      <td className="p-3 text-slate-500">{doc.source}</td>
                                      <td className="p-3 text-slate-500">{doc.version}</td>
                                      <td className="p-3">
                                        <StatusBadge status={doc.status} size="sm" />
                                      </td>
                                      <td className="p-3 text-right">
                                        <button
                                          onClick={() => setSelectedDocId(doc.id)}
                                          className="p-1.5 text-blue-600 dark:text-cyan-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                          title="Inspect Document Details"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
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
  );
};
