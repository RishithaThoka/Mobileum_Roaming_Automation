import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Layers,
  Bot,
  Server,
  Cpu,
  Workflow,
  FileText,
  Database,
  GitBranch,
  GitCompare,
  CheckSquare,
  Bell,
  Mail,
  FileCheck2,
  RotateCcw,
  Globe,
  Users,
  BarChart3,
  Settings,
  Sparkles,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { NavigationTab } from '../../types';

interface SidebarItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
  category: 'Control Panel' | 'Baseline Pipeline (Steps 1-11)' | 'Network & Systems';
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, approvalChains, deltas, notifications, emails } = useStore();
  const [collapsed, setCollapsed] = React.useState(false);

  const pendingApprovalsCount = approvalChains.filter((a) => a.status === 'In Progress' || a.status === 'Pending').length;
  const unresolvedDeltasCount = deltas.filter((d) => d.status === 'Unresolved').length;
  const unreadNotifsCount = notifications.filter((n) => !n.read).length;
  const pendingEmailsCount = emails.filter((e) => e.processedStatus === 'Pending Ingestion').length;

  const SIDEBAR_ITEMS: SidebarItem[] = [
    // Control Panel
    { id: 'dashboard', label: 'Operations Dashboard', icon: LayoutDashboard, category: 'Control Panel' },
    { id: 'workflow-viz', label: 'Workflow Flowchart', icon: Workflow, badge: 'React Flow', badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400', category: 'Control Panel' },
    { id: 'master-repo', label: 'Master Repository', icon: Database, category: 'Control Panel' },

    // Baseline Pipeline (Steps 1-11)
    { id: 'documents', label: '01. Documents Ingest', icon: FileText, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'ai-roadmap', label: '02. AI Ingest Roadmap', icon: Bot, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'version-control', label: '03. Version Control Tree', icon: GitBranch, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'difference-checker', label: '04. Difference Checker', icon: GitCompare, badge: unresolvedDeltasCount > 0 ? unresolvedDeltasCount : undefined, badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400', category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'executive-dashboard', label: '05. Executive Risk Matrix', icon: TrendingUp, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'approval-workflow', label: '06. Approval Sign-offs', icon: CheckSquare, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined, badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400', category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'governance-pipeline', label: '07. Staging Script Buffer', icon: Layers, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'integration-matrix', label: '08. Switch Provisioning', icon: Server, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'digital-twin', label: '09. Digital Twin Diagnostics', icon: Activity, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'rollback-center', label: '10. Rollback Safety', icon: RotateCcw, category: 'Baseline Pipeline (Steps 1-11)' },
    { id: 'audit-logs', label: '11. Cryptographic Audit Logs', icon: FileCheck2, category: 'Baseline Pipeline (Steps 1-11)' },

    // Network & Systems
    { id: 'operators', label: 'Connected MNO Profiles', icon: Globe, category: 'Network & Systems' },
    { id: 'email-center', label: 'Email Ingestion Daemon', icon: Mail, badge: pendingEmailsCount > 0 ? pendingEmailsCount : undefined, badgeColor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400', category: 'Network & Systems' },
    { id: 'notifications', label: 'System Notifications', icon: Bell, badge: unreadNotifsCount > 0 ? unreadNotifsCount : undefined, badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400', category: 'Network & Systems' },
    { id: 'settings', label: 'Platform Configuration', icon: Settings, category: 'Network & Systems' },
  ];

  const categories: ('Control Panel' | 'Baseline Pipeline (Steps 1-11)' | 'Network & Systems')[] = [
    'Control Panel',
    'Baseline Pipeline (Steps 1-11)',
    'Network & Systems',
  ];

  return (
    <aside
      className={`bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col justify-between sticky top-0 h-screen z-40 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div
            onClick={() => setActiveTab('landing')}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-0.5 shadow-md shadow-blue-500/10 group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
              </div>
            </div>
            {!collapsed && (
              <div>
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white block leading-none">
                  MOBILEUM
                </span>
                <span className="text-[10px] text-blue-600 dark:text-cyan-400 font-mono tracking-wider">
                  ROAMING AUTOMATION
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors hidden sm:block"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {categories.map((cat) => {
            const items = SIDEBAR_ITEMS.filter((i) => i.category === cat);
            return (
              <div key={cat} className="space-y-1">
                {!collapsed && (
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    {cat}
                  </div>
                )}

                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center ${
                        collapsed ? 'justify-center px-2' : 'justify-between px-3'
                      } py-2 rounded-xl text-xs font-semibold transition-all group ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-white border border-blue-200 dark:border-blue-500/30 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon
                          className={`w-4 h-4 transition-colors ${
                            isActive ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'
                          }`}
                        />
                        {!collapsed && <span>{item.label}</span>}
                      </div>

                      {!collapsed && item.badge !== undefined && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full ${
                            item.badgeColor || 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      {!collapsed && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 text-xs">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">SYSTEM HEALTH</div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>99.98% Operational</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">v14.2-GSMA</span>
          </div>
        </div>
      )}
    </aside>
  );
};
