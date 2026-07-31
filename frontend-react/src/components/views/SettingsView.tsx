import React, { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Moon, Sun, Mail, RefreshCw, Trash2, CheckCircle, HelpCircle, Activity } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

export const SettingsView: React.FC = () => {
  const { 
    darkMode, 
    toggleDarkMode, 
    helpMode, 
    toggleHelpMode,
    routingRules,
    saveRoutingRule,
    triggerHeartbeatScan,
    resetAllData,
    smtpStatus,
    heartbeatStatus,
    fetchRoutingRules,
    fetchSmtpStatus,
    fetchHeartbeatStatus
  } = useStore();

  const [editedRules, setEditedRules] = useState<Record<string, { role_title: string; approver_name: string; approver_email: string; step_order: number }>>({});
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchRoutingRules();
    fetchSmtpStatus();
    fetchHeartbeatStatus();
  }, []);

  const handleFieldChange = (category: string, field: string, value: any) => {
    const original = routingRules.find(r => r.category === category);
    if (!original) return;
    const current = editedRules[category] || { 
      role_title: original.role_title, 
      approver_name: original.approver_name, 
      approver_email: original.approver_email,
      step_order: original.step_order 
    };
    setEditedRules({
      ...editedRules,
      [category]: {
        ...current,
        [field]: value
      }
    });
  };

  const handleSave = async (category: string) => {
    const updates = editedRules[category];
    if (!updates) {
      alert('No updates to save for this category.');
      return;
    }
    try {
      await saveRoutingRule(category, updates);
      alert(`Routing rules for category "${category}" updated!`);
    } catch (e: any) {
      alert(e.message || 'Failed to update rules');
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await triggerHeartbeatScan();
      alert('Background sync scan triggered successfully!');
    } catch (e: any) {
      alert(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleResetData = async () => {
    if (confirm('🚨 WARNING: This will permanently delete ALL operators, documents, baselines, and approval logs. This action CANNOT be undone. Are you sure you want to proceed?')) {
      try {
        await resetAllData();
        alert('All database tables successfully wiped.');
      } catch (e: any) {
        alert(e.message || 'Failed to reset database');
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Settings className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Platform Configuration & Governance Settings</h1>
            <HelpTooltip
              title="Settings"
              explanation="Manage platform theme, approval routing rules, SMTP email triggers, manual synchronization, and system resets."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Platform preferences & GSMA API endpoints.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: UI Settings & Systems */}
        <div className="lg:col-span-1 space-y-6">
          {/* General Preference Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
            <h3 className="text-xs font-mono font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-wider">.:: UI & Preference Settings</h3>
            
            {/* Appearance Settings */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Dark Mode</h4>
                <p className="text-[10px] text-slate-500">Toggle dark theme</p>
              </div>
              <button
                onClick={toggleDarkMode}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
              </button>
            </div>

            {/* Help Mode Settings */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Help Context</h4>
                <p className="text-[10px] text-slate-500">Explanatory tooltips</p>
              </div>
              <button
                onClick={toggleHelpMode}
                className={`px-3 py-1 rounded-xl text-[10px] font-bold border transition-colors ${
                  helpMode ? 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800'
                }`}
              >
                {helpMode ? 'Active' : 'Disabled'}
              </button>
            </div>

            {/* SMTP Config Status */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Email Server (SMTP)</h4>
                <p className="text-[10px] text-slate-500">Outbound approval delivery</p>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                smtpStatus?.configured 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                  : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800'
              }`}>
                {smtpStatus?.configured ? 'Configured' : 'Not Configured'}
              </span>
            </div>
          </div>

          {/* Sync Trigger Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-mono font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-wider">.:: Heartbeat & MNO Ingestion</h3>
            
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Background Poller Status:</span>
                <span className="font-bold text-slate-900 dark:text-white flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${heartbeatStatus?.running ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                  <span>{heartbeatStatus?.running ? 'Running' : 'Stopped'}</span>
                </span>
              </div>
              {heartbeatStatus?.last_scan && (
                <div className="text-[10px] text-slate-400 font-mono">
                  Last Scan: {heartbeatStatus.last_scan.replace('T', ' ').slice(0, 19)}
                </div>
              )}
              {heartbeatStatus?.last_summary && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl text-[10px] font-mono text-slate-500 border border-slate-100 dark:border-slate-800 leading-normal">
                  {heartbeatStatus.last_summary}
                </div>
              )}
            </div>

            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync MNO Watch Folders Now</span>
            </button>
          </div>

          {/* Danger Zone */}
          <div className="bg-rose-50/40 dark:bg-rose-950/10 border-2 border-rose-200 dark:border-rose-900/40 rounded-3xl p-6 space-y-3 shadow-sm">
            <h3 className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">.:: Danger Zone</h3>
            <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-normal">
              Permanently delete every operator, document, version baseline, difference checker item, and approval record. Settings above are kept.
            </p>
            <button
              onClick={handleResetData}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset all database data</span>
            </button>
          </div>
        </div>

        {/* Right Column: Routing Rules Manager */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <h3 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Category Governance Approver Routing Rules
              </h3>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 font-mono uppercase font-bold">
                    <th className="py-2.5">Domain Category</th>
                    <th className="py-2.5">Approval Role Title</th>
                    <th className="py-2.5">Approver Name</th>
                    <th className="py-2.5">Approver Email</th>
                    <th className="py-2.5 text-center">Order</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                  {routingRules.map((rule) => {
                    const changes = editedRules[rule.category] || {};
                    const role = changes.role_title !== undefined ? changes.role_title : rule.role_title;
                    const name = changes.approver_name !== undefined ? changes.approver_name : rule.approver_name;
                    const email = changes.approver_email !== undefined ? changes.approver_email : rule.approver_email;
                    const order = changes.step_order !== undefined ? changes.step_order : rule.step_order;

                    return (
                      <tr key={rule.category} className="hover:bg-slate-50/40 dark:hover:bg-slate-950/20">
                        <td className="py-3 font-sans font-bold text-slate-800 dark:text-slate-200">{rule.category}</td>
                        <td className="py-1">
                          <input
                            type="text"
                            value={role}
                            onChange={(e) => handleFieldChange(rule.category, 'role_title', e.target.value)}
                            className="bg-transparent border-0 hover:bg-slate-100 focus:bg-white dark:hover:bg-slate-800 dark:focus:bg-slate-950 p-1.5 rounded w-full focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => handleFieldChange(rule.category, 'approver_name', e.target.value)}
                            className="bg-transparent border-0 hover:bg-slate-100 focus:bg-white dark:hover:bg-slate-800 dark:focus:bg-slate-950 p-1.5 rounded w-full focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => handleFieldChange(rule.category, 'approver_email', e.target.value)}
                            className="bg-transparent border-0 hover:bg-slate-100 focus:bg-white dark:hover:bg-slate-800 dark:focus:bg-slate-950 p-1.5 rounded w-full focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-1 text-center">
                          <input
                            type="number"
                            value={order}
                            onChange={(e) => handleFieldChange(rule.category, 'step_order', parseInt(e.target.value) || 1)}
                            className="bg-transparent border-0 hover:bg-slate-100 focus:bg-white dark:hover:bg-slate-800 dark:focus:bg-slate-950 p-1.5 rounded w-12 text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => handleSave(rule.category)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-cyan-400 dark:hover:bg-blue-500/20 font-bold rounded-lg transition-colors"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
