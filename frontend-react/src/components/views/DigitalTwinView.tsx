import React, { useState } from 'react';
import { Cpu, ShieldCheck } from 'lucide-react';
import { HelpTooltip } from '../common/HelpTooltip';

export const DigitalTwinView: React.FC = () => {
  const [simulationActive, setSimulationActive] = useState(true);
  const [reconciliationState, setReconciliationState] = useState<'Synced (Success)' | 'Mismatch Detected' | 'Rollback Triggered'>('Synced (Success)');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Digital Twin & Simulation Dry-Run Sandbox</h1>
            <HelpTooltip
              title="Digital Twin Sandbox"
              explanation="Simulates core network switch parameter updates in a sandboxed Digital Twin environment before touching production DRA switches."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Preview changes before deployment & verify signalling reconciliation.</p>
        </div>

        {/* Simulation Mode Toggle */}
        <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2 rounded-2xl text-xs shadow-sm">
          <span className="text-slate-700 dark:text-slate-300 font-semibold">Simulation Mode (Dry Run):</span>
          <button
            onClick={() => setSimulationActive(!simulationActive)}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
              simulationActive ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-800'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                simulationActive ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* DIGITAL TWIN BEFORE VS AFTER COMPARISON */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BEFORE DEPLOYMENT */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-3xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-rose-600 dark:text-rose-400 font-bold text-xs">
            <span>PRODUCTION STATE (BEFORE DEPLOYMENT)</span>
            <span className="font-mono text-[10px] text-slate-400">LIVE ROUTING SWITCH</span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-mono text-xs text-rose-800 dark:text-rose-300/90 leading-relaxed space-y-1">
            <div>GlobalTitle: <span className="text-slate-900 dark:text-white font-bold">447782000100</span></div>
            <div>SCCPTranslator: <span className="text-slate-900 dark:text-white font-bold">447782000100</span></div>
            <div>SEPP_Endpoint_IP: <span className="text-slate-900 dark:text-white font-bold">195.219.124.10</span></div>
            <div>IMS_APN: <span className="text-slate-900 dark:text-white font-bold">ims.mnc015.mcc234.gprs</span></div>
            <div>Encryption: <span className="text-slate-900 dark:text-white font-bold">AES-128-CBC</span></div>
          </div>
        </div>

        {/* AFTER DEPLOYMENT (DIGITAL TWIN SIMULATION) */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 rounded-3xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
            <span>DIGITAL TWIN SIMULATION (AFTER PROPOSED WRITE)</span>
            <span className="font-mono text-[10px] text-blue-600 dark:text-cyan-400 font-bold">SIMULATED OK</span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-mono text-xs text-emerald-800 dark:text-emerald-300/90 leading-relaxed space-y-1">
            <div>GlobalTitle: <span className="text-slate-900 dark:text-white font-bold">447782000100</span></div>
            <div>SCCPTranslator: <span className="text-emerald-600 dark:text-emerald-400 font-bold">447782000199 (~ MODIFIED)</span></div>
            <div>SEPP_Endpoint_IP: <span className="text-emerald-600 dark:text-emerald-400 font-bold">195.219.124.88 (~ MODIFIED)</span></div>
            <div>IMS_APN: <span className="text-slate-900 dark:text-white font-bold">ims.mnc015.mcc234.gprs</span></div>
            <div>Encryption: <span className="text-emerald-600 dark:text-emerald-400 font-bold">AES-256-GCM (+ UPGRADED)</span></div>
          </div>
        </div>
      </div>

      {/* RECONCILIATION TEST ENGINE */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <span>Reconciliation Verification & Signalling Monitor</span>
          </h3>

          <div className="flex space-x-2">
            <button
              onClick={() => setReconciliationState('Synced (Success)')}
              className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
                reconciliationState === 'Synced (Success)'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Verify Success
            </button>
            <button
              onClick={() => setReconciliationState('Mismatch Detected')}
              className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
                reconciliationState === 'Mismatch Detected'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Simulate Mismatch
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
          <div>RECONCILIATION RESULT: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reconciliationState}</span></div>
          <div className="text-slate-500 dark:text-slate-400">Diameter SLA: <span className="text-blue-600 dark:text-cyan-400">99.99%</span></div>
        </div>
      </div>
    </div>
  );
};
