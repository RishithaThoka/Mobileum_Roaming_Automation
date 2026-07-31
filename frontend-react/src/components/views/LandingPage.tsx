import React from 'react';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  Globe,
  Database,
  Network,
  Cpu,
  Layers,
  CheckCircle2,
  Lock,
  BarChart3,
  Bot,
  Play,
  FileCode,
  Activity,
  Server
} from 'lucide-react';
import { useStore } from '../../store/useStore';

export const LandingPage: React.FC = () => {
  const { setActiveTab, startOnboarding } = useStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white font-sans overflow-x-hidden">
      {/* Landing Header / Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('landing')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-400 to-emerald-400 p-0.5 shadow-glow-blue">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white block">MOBILEUM</span>
              <span className="text-[10px] text-cyan-400 font-mono tracking-wider">INTELLIGENT ROAMING PLATFORM</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-300">
            <a href="#overview" className="hover:text-cyan-400 transition-colors">Overview</a>
            <a href="#architecture" className="hover:text-cyan-400 transition-colors">3-Tier Architecture</a>
            <a href="#workflow" className="hover:text-cyan-400 transition-colors">Workflow Engine</a>
            <a href="#ai-roadmap" className="hover:text-cyan-400 transition-colors">AI Roadmap</a>
            <a href="#vision" className="hover:text-cyan-400 transition-colors">Global Network</a>
          </nav>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                startOnboarding();
              }}
              className="hidden sm:inline-flex items-center space-x-2 text-xs font-bold text-slate-300 hover:text-white px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-900 transition-all"
            >
              <span>Onboarding Tour</span>
            </button>

            <button
              onClick={() => setActiveTab('login')}
              className="flex items-center space-x-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl font-bold text-xs transition-all"
            >
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Login</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl font-bold text-xs shadow-glow-blue transition-all"
            >
              <span>Launch Enterprise App</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-72 h-72 bg-cyan-400/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Mobileum Roaming Process Automation 2026 Edition</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Intelligent Telecom Roaming <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-400">
              Workflow Automation Platform
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Eliminate 14-day manual IR.21/RAEX backlogs, GT routing errors, and billing discrepancies for Tier-1 MNOs like Airtel, Mobily, Vodafone, AT&T, and Orange.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center space-x-2"
            >
              <span>Access Live Console</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab('workflow-viz')}
              className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-2xl font-bold text-sm transition-all flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4 text-cyan-400" />
              <span>Interactive Workflow Engine</span>
            </button>
          </div>

          {/* Trusted Telecom Operator Badges */}
          <div className="pt-12 border-t border-slate-900">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-6">
              TRUSTED BY WORLD-LEADING MOBILE NETWORK OPERATORS
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 opacity-80 text-sm font-bold text-slate-400">
              <span className="hover:text-white transition-colors">Airtel India</span>
              <span className="hover:text-white transition-colors">Mobily KSA</span>
              <span className="hover:text-white transition-colors">Vodafone Group</span>
              <span className="hover:text-white transition-colors">AT&T Mobility</span>
              <span className="hover:text-white transition-colors">Orange France</span>
              <span className="hover:text-white transition-colors">Singtel</span>
              <span className="hover:text-white transition-colors">Etisalat UAE</span>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT OVERVIEW */}
      <section id="overview" className="py-20 bg-slate-900/60 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400">PRODUCT OVERVIEW</h2>
            <h3 className="text-3xl font-bold text-white">Why Tier-1 Operators Choose Mobileum RPA</h3>
            <p className="text-slate-400 text-sm">
              Modern mobile networks require zero-defect roaming configuration. Mobileum replaces manual spreadsheet exchanges with automated GSMA schema parsing and stage-gated governance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <FileCode className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Automated IR.21 & RAEX Ingest</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ingest GSMA IR.21 XML tables, RAEX OpData 3.1, and IOT rate tables directly via email hooks or direct manual upload.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
                <Zap className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Smart Delta Difference Engine</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Instant side-by-side delta identification for SCCP Global Titles, 5G SEPP IP addresses, IMSI ranges, and wholesale IOT discount rates.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">10-Role Governance Pipeline</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Stage-gated sign-off enforcing CTO technical review, CMO commercial authorization, and Security officer IPsec validation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THREE TIER ARCHITECTURE */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400">ENTERPRISE DESIGN</h2>
          <h3 className="text-3xl font-bold text-white">Three-Tier Architecture Model</h3>
          <p className="text-slate-400 text-sm">
            Decoupled data collection, automated difference detection, and core network provisioning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 relative">
            <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wider block mb-2">TIER 1: INGESTION</span>
            <h4 className="text-lg font-bold text-white mb-2">Multi-Channel Ingestion Tier</h4>
            <p className="text-xs text-slate-400 mb-4">
              Connects to GSMA InfoExchange API, SMTP mailboxes, and partner upload portals. Accepts IR.21 v14 XML, RAEX OpData, and TAP3.12 files.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300">
              SMTP / GSMA API ➔ Schema Validator
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-blue-500/40 shadow-glow-blue relative">
            <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider block mb-2">TIER 2: INTELLIGENCE</span>
            <h4 className="text-lg font-bold text-white mb-2">Automated Delta Engine</h4>
            <p className="text-xs text-slate-400 mb-4">
              Parses 1,400+ XML parameters against the Master Baseline. Generates color-coded diffs and assigns automated risk scores.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-blue-500/30 text-[11px] font-mono text-cyan-300">
              Master Repo ↔ Delta Engine
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 relative">
            <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-wider block mb-2">TIER 3: GOVERNANCE</span>
            <h4 className="text-lg font-bold text-white mb-2">Stage Approval & Provisioning</h4>
            <p className="text-xs text-slate-400 mb-4">
              Executes role-gated approvals (CMO, CTO, Security) before deploying NETCONF/RESTCONF commands to live core routing switches.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300">
              Stage Approval ➔ Core Switch Provisioning
            </div>
          </div>
        </div>
      </section>

      {/* ANIMATED WORKFLOW PREVIEW */}
      <section id="workflow" className="py-20 bg-slate-900/60 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="space-y-6 max-w-xl">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">REACT FLOW ENGINE</span>
              <h3 className="text-3xl font-bold text-white">Visual End-to-End Workflow Automation</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Watch roaming parameters flow seamlessly from incoming mail packages into live core network switches with full audit trail compliance.
              </p>
              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-center space-x-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Completed Steps: Green Status Indicator</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                  <span>Current Active Step: Glowing Blue Indicator</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Pending Stage Sign-off: Orange Warning Indicator</span>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('workflow-viz')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center space-x-2"
              >
                <span>Launch Interactive Flowchart</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Workflow Card Mock */}
            <div className="w-full max-w-lg p-6 bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <span className="text-[11px] font-mono text-cyan-400">Mobileum Workflow Engine v14.2</span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="p-3 bg-slate-900 border border-emerald-500/40 text-emerald-400 rounded-xl flex justify-between items-center">
                  <span>1. Mail Repository & Exchange Ingest</span>
                  <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">Completed</span>
                </div>
                <div className="p-3 bg-slate-900 border border-emerald-500/40 text-emerald-400 rounded-xl flex justify-between items-center">
                  <span>2. RAEX OpData / IOT Parser</span>
                  <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">Completed</span>
                </div>
                <div className="p-3 bg-slate-900 border border-blue-500 shadow-glow-blue text-cyan-300 rounded-xl flex justify-between items-center animate-pulse">
                  <span>3. Difference Checker (Delta Alert)</span>
                  <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full text-blue-400">Active Stage</span>
                </div>
                <div className="p-3 bg-slate-900 border border-amber-500/40 text-amber-400 rounded-xl flex justify-between items-center">
                  <span>4. Stage Approval Chain (CTO / CMO)</span>
                  <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full">Pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI ROADMAP & GLOBAL VISION */}
      <section id="ai-roadmap" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400">FUTURE INNOVATION</h2>
          <h3 className="text-3xl font-bold text-white">AI Roadmap & Global Network Vision</h3>
          <p className="text-slate-400 text-sm">
            Leveraging GenAI & predictive analytics for zero-touch 5G Standalone roaming orchestration.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center space-x-3 text-emerald-400">
              <Bot className="w-6 h-6" />
              <h4 className="text-lg font-bold text-white">GenAI Anomaly Detection</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Mobileum AI Copilot predicts wholesale revenue risk by cross-referencing past TAP billing records against incoming RAEX IOT tariff changes.
            </p>
          </div>

          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center space-x-3 text-cyan-400">
              <Globe className="w-6 h-6" />
              <h4 className="text-lg font-bold text-white">Global 5G SA Roaming Grid</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Automates Security Edge Protection Proxy (SEPP) mutual TLS certificate exchanges and N9 interface setup across 600+ operator networks worldwide.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-white">Mobileum Intelligent Roaming Platform © 2026</span>
          </div>

          <div className="flex space-x-6 text-slate-400">
            <button onClick={() => setActiveTab('dashboard')} className="hover:text-white transition-colors">Dashboard</button>
            <button onClick={() => setActiveTab('workflow-viz')} className="hover:text-white transition-colors">Workflow Engine</button>
            <button onClick={() => setActiveTab('difference-checker')} className="hover:text-white transition-colors">Delta Engine</button>
            <button onClick={() => setActiveTab('audit-logs')} className="hover:text-white transition-colors">Audit Logs</button>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            GSMA IR.21 v14.2 & RAEX OpData 3.1 Compliant
          </div>
        </div>
      </footer>
    </div>
  );
};
