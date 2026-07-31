import React, { useState } from 'react';
import { Bot, Sparkles, Cpu, Globe, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { HelpTooltip } from '../common/HelpTooltip';

interface RoadmapCard {
  id: string;
  tier: string;
  title: string;
  subtitle: string;
  icon: any;
  badgeColor: string;
  summary: string;
  detailedCapabilities: string[];
  mnoValue: string;
}

const ROADMAP_CARDS: RoadmapCard[] = [
  {
    id: 'card-analyst',
    tier: 'Tier 1 AI',
    title: 'Tier 1 AI Roaming Analyst',
    subtitle: 'Automated IR.21 XML Intake & GSMA Schema Inspection',
    icon: Bot,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30',
    summary: 'Ingests inbound GSMA InfoExchange XML feeds & legacy PDF tables. Identifies GT routing & APN anomalies in seconds.',
    detailedCapabilities: [
      'Automated IR.21 GSMA Table 14.2 Schema Validation',
      'Optical Character Recognition (OCR) for legacy PDF tables',
      'SCCP Global Title (GT) prefix anomaly flagging',
      '5G Standalone Security Edge Protection Proxy (SEPP) IP parsing',
      'Automated Risk Assessment Scoring (Low, Medium, High, Critical)'
    ],
    mnoValue: 'Reduces intake processing overhead by 92% across 600+ partner feeds.',
  },
  {
    id: 'card-drafter',
    tier: 'Tier 2 AI',
    title: 'Tier 2 AI Configuration Drafter',
    subtitle: 'NETCONF / RESTCONF Script Generation & Delta Comparison',
    icon: Sparkles,
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30',
    summary: 'Generates vendor-neutral NETCONF switch provisioning scripts & side-by-side Git diffs for Master Repository baselines.',
    detailedCapabilities: [
      'Vendor Switch CLI & NETCONF script generation (Ericsson, Huawei, Nokia, Cisco)',
      'Side-by-side Master Baseline configuration diff generation',
      'Wholesale IOT Tariff rate card impact forecasting',
      'Draft approval package assembly for CMO & CTO review',
      'Pre-check syntax validation against DRA (Diameter Routing Agent)'
    ],
    mnoValue: 'Accelerates parameter staging from 5 days down to 12 minutes.',
  },
  {
    id: 'card-governed',
    tier: 'Tier 3 AI',
    title: 'Tier 3 Governed AI Execution',
    subtitle: 'Closed-Loop Switch Provisioning & Digital Twin Simulation',
    icon: Cpu,
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
    summary: 'Orchestrates closed-loop switch updates with real-time KPI monitoring & single-click emergency rollback triggers.',
    detailedCapabilities: [
      'Digital Twin pre-deployment network simulation',
      'Stage-gated multi-role sign-off enforcement (CMO, CTO, Security)',
      'Real-time Diameter/SS7 signalling SLA monitoring post-provisioning',
      'Automated emergency rollback on packet loss detection',
      'Cryptographically sealed GSMA audit log generation'
    ],
    mnoValue: 'Guarantees 99.98% zero-defect network change execution.',
  },
  {
    id: 'card-global',
    tier: 'Tier 4 AI',
    title: 'Global Roaming Network AI',
    subtitle: 'Cross-Operator Alert Grid & Automated Revenue Protection',
    icon: Globe,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
    summary: 'Inter-operator intelligence grid predicting global roaming outages & wholesale billing leaks across connected MNOs.',
    detailedCapabilities: [
      'Cross-partner alert propagation for international GT outages',
      'Automated TAP3.12 wholesale billing mismatch detection',
      'Predictive roaming traffic congestion forecasting',
      'International 5G Standalone mTLS certificate expiry tracking',
      'Executive KPI dashboard reporting'
    ],
    mnoValue: 'Protects up to $2.4M in annual wholesale roaming revenue leaks.',
  }
];

export const AIRoadmapView: React.FC = () => {
  const [selectedCard, setSelectedCard] = useState<RoadmapCard | null>(null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Bot className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Interactive AI & Automation Roadmap</h1>
            <HelpTooltip
              title="AI Roadmap"
              explanation="Generative AI roadmap detailing progression from Tier 1 AI Analyst down to Tier 3 Governed Closed-Loop Automation and Global Network Intelligence."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Click on any AI capability card to inspect detailed enterprise feature specs.</p>
        </div>
      </div>

      {/* CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ROADMAP_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-3xl space-y-4 transition-all duration-300 cursor-pointer group hover:scale-[1.01] shadow-sm relative"
            >
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 text-xs font-mono font-bold rounded-full border ${card.badgeColor}`}>
                  {card.tier}
                </span>
                <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-blue-600 dark:text-cyan-400 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5" />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">{card.title}</h3>
                <p className="text-xs text-blue-600 dark:text-cyan-400 font-mono mt-0.5">{card.subtitle}</p>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{card.summary}</p>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Business ROI: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{card.mnoValue}</span></span>
                <span className="text-blue-600 dark:text-cyan-400 font-semibold flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
                  <span>Details</span>
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DETAILED CAPABILITIES DRAWER */}
      {selectedCard && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-cyan-600/20 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-cyan-500/30 flex items-center justify-center">
                  {React.createElement(selectedCard.icon, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{selectedCard.title}</h3>
                  <p className="text-xs text-blue-600 dark:text-cyan-400 font-mono">{selectedCard.subtitle}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCard(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selectedCard.summary}</p>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-slate-200 font-mono text-[11px]">ENTERPRISE CAPABILITIES</div>
                <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                  {selectedCard.detailedCapabilities.map((cap, idx) => (
                    <div key={idx} className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl text-emerald-800 dark:text-emerald-300 text-xs">
                <span className="font-bold">MNO Value Proposition: </span>
                {selectedCard.mnoValue}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedCard(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors"
              >
                Close Capability Spec
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
