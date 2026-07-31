import React, { useState } from 'react';
import { CheckCircle2, Cpu } from 'lucide-react';
import { SystemIntegrationItem } from '../../types';
import { HelpTooltip } from '../common/HelpTooltip';

const MOCK_INTEGRATIONS: SystemIntegrationItem[] = [
  { systemName: 'Core Switch Routing (DRA / HLR / HSS)', type: 'Network', readSupport: true, writeSupport: true, vendorWriteSupport: true, notApplicable: false, protocol: 'NETCONF / RESTCONF', status: 'Active' },
  { systemName: 'Roaming Steering of Roaming (SoR)', type: 'Steering', readSupport: true, writeSupport: true, vendorWriteSupport: false, notApplicable: false, protocol: 'REST API / MAP', status: 'Active' },
  { systemName: 'Wholesale TAP3 / BEE Billing System', type: 'Billing', readSupport: true, writeSupport: true, vendorWriteSupport: false, notApplicable: false, protocol: 'SFTP / ASN.1', status: 'Configured' },
  { systemName: 'Digital Partner Portal & Self-Service', type: 'Digital', readSupport: true, writeSupport: true, vendorWriteSupport: true, notApplicable: false, protocol: 'GraphQL / OAuth2', status: 'Active' },
  { systemName: 'Wholesale SMS Gateway (WSMS)', type: 'WSMS', readSupport: true, writeSupport: false, vendorWriteSupport: false, notApplicable: false, protocol: 'SMPP v3.4', status: 'Configured' },
  { systemName: 'Third Party Vendor Provisioning Engine', type: 'Third Party Vendor', readSupport: true, writeSupport: false, vendorWriteSupport: true, notApplicable: false, protocol: 'SOAP / REST', status: 'Standby' },
  { systemName: 'GSMA RAEX OpData / IOT Server', type: 'RAEX', readSupport: true, writeSupport: true, vendorWriteSupport: false, notApplicable: false, protocol: 'XML / InfoExchange API', status: 'Active' },
  { systemName: 'SMTP Ingestion Mailbox Hook', type: 'SMTP', readSupport: true, writeSupport: false, vendorWriteSupport: false, notApplicable: false, protocol: 'IMAPS / OAuth2', status: 'Active' },
];

export const IntegrationMatrixView: React.FC = () => {
  const [integrations] = useState<SystemIntegrationItem[]>(MOCK_INTEGRATIONS);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Enterprise System Integration Matrix</h1>
            <HelpTooltip
              title="Integration Matrix"
              explanation="Interactive grid mapping read, write, and vendor write capabilities across Network Core, Steering of Roaming, Billing, WSMS, RAEX, and SMTP systems."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Multi-vendor system capabilities & protocol support breakdown.</p>
        </div>
      </div>

      {/* MATRIX TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px] bg-slate-50 dark:bg-slate-950/80">
                <th className="p-4 font-semibold">Target System</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold text-center">Read Support</th>
                <th className="p-4 font-semibold text-center">Mobileum Write</th>
                <th className="p-4 font-semibold text-center">Vendor Write</th>
                <th className="p-4 font-semibold">Protocol</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
              {integrations.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-sans font-bold text-slate-900 dark:text-slate-100">{item.systemName}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 text-[10px]">
                      {item.type}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {item.readSupport ? (
                      <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold"><CheckCircle2 className="w-4 h-4 mr-1" /> Yes</span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {item.writeSupport ? (
                      <span className="inline-flex items-center text-blue-600 dark:text-cyan-400 font-bold"><CheckCircle2 className="w-4 h-4 mr-1" /> Supported</span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {item.vendorWriteSupport ? (
                      <span className="inline-flex items-center text-purple-600 dark:text-purple-400 font-bold"><CheckCircle2 className="w-4 h-4 mr-1" /> Vendor Write</span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-700 dark:text-slate-300">{item.protocol}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-bold">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
