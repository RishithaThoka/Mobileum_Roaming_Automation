import React from 'react';
import { useStore, canAccessTab } from './store/useStore';
import { Topbar } from './components/layout/Topbar';
import { Sidebar } from './components/layout/Sidebar';

// Views & Authentication
import { LandingPage } from './components/views/LandingPage';
import { Login } from './components/views/Login';
import { TokenApprovalView } from './components/views/TokenApprovalView';
import { Dashboard } from './components/views/Dashboard';
import { WorkflowVisualization } from './components/views/WorkflowVisualization';
import { DocumentsView } from './components/views/DocumentsView';
import { DocumentViewer } from './components/views/DocumentViewer';
import { MasterRepositoryView } from './components/views/MasterRepositoryView';
import { VersionControlView } from './components/views/VersionControlView';
import { DifferenceChecker } from './components/views/DifferenceChecker';
import { ApprovalWorkflow } from './components/views/ApprovalWorkflow';
import { RollbackCenter } from './components/views/RollbackCenter';
import { EmailCenter } from './components/views/EmailCenter';
import { AuditLogsView } from './components/views/AuditLogsView';
import { OperatorsView } from './components/views/OperatorsView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { SettingsView } from './components/views/SettingsView';
import { UsersView } from './components/views/UsersView';
import { NotificationsView } from './components/views/NotificationsView';
import { AdminRulesView } from './components/views/AdminRulesView';
import { AdminCatalogView } from './components/views/AdminCatalogView';
import { AdminOverridesView } from './components/views/AdminOverridesView';
import { RejectedItemsView } from './components/views/RejectedItemsView';

// Additional Workflow Step Views
import { AIRoadmapView } from './components/views/AIRoadmapView';
import { ExecutiveDashboardView } from './components/views/ExecutiveDashboardView';
import { GovernancePipelineView } from './components/views/GovernancePipelineView';
import { IntegrationMatrixView } from './components/views/IntegrationMatrixView';
import { DigitalTwinView } from './components/views/DigitalTwinView';

// Modals, Headers & Footers
import { QuickUploadModal } from './components/modals/QuickUploadModal';
import { DocumentDetailModal } from './components/modals/DocumentDetailModal';
import { NodeDetailModal } from './components/modals/NodeDetailModal';
import { AutoRedirectModal } from './components/modals/AutoRedirectModal';
import { WorkflowHeaderBar } from './components/workflow/WorkflowHeaderBar';
import { WorkflowFooter } from './components/workflow/WorkflowFooter';

const WORKFLOW_TABS = [
  'documents',
  'ai-roadmap',
  'version-control',
  'difference-checker',
  'executive-dashboard',
  'approval-workflow',
  'governance-pipeline',
  'integration-matrix',
  'digital-twin',
  'rollback-center',
  'audit-logs'
];

export function App() {
  const { 
    activeTab, 
    selectedDocId, 
    setSelectedDocId,
    selectedModalDocId,
    setSelectedModalDocId,
    selectedNodeId,
    setSelectedNodeId,
    isLoggedIn,
    activeRole,
    checkSession,
    setActiveTab,
    loadAllData
  } = useStore();

  const [approverToken, setApproverToken] = React.useState<string | null>(null);
  const [pendingApprovalToken, setPendingApprovalToken] = React.useState<string | null>(null);

  // Hash-routing listener for /approve/:token magic links
  React.useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/approve/')) {
        const token = hash.replace('#/approve/', '');
        setApproverToken(token);
      } else {
        setApproverToken(null);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Check admin session status on mount
  React.useEffect(() => {
    if (!approverToken) {
      checkSession();
    }
  }, [approverToken]);

  // Polling interval for operational dashboard lists (15s)
  React.useEffect(() => {
    if (!isLoggedIn || approverToken) return;
    const interval = setInterval(() => {
      loadAllData();
    }, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, approverToken]);

  // Case 1: Approval token link — requires login first
  if (approverToken) {
    if (!isLoggedIn) {
      // Store the pending token and show login
      if (!pendingApprovalToken) setPendingApprovalToken(approverToken);
      return <Login />;
    }
    return <TokenApprovalView token={approverToken} />;
  }

  // After successful login, check if there's a pending approval to redirect to
  React.useEffect(() => {
    if (isLoggedIn && pendingApprovalToken && !approverToken) {
      setApproverToken(pendingApprovalToken);
      setPendingApprovalToken(null);
    }
  }, [isLoggedIn, pendingApprovalToken]);

  // Tab guard: if current tab isn't accessible to current role, redirect to dashboard
  React.useEffect(() => {
    if (isLoggedIn && activeTab !== 'landing' && activeTab !== 'login' && !canAccessTab(activeRole, activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeRole, activeTab, isLoggedIn]);

  // Case 2: Landing Page (always full screen)
  if (activeTab === 'landing') {
    return <LandingPage />;
  }

  // Case 3: Unauthenticated admin user
  if (!isLoggedIn) {
    return <Login />;
  }

  // Case 4: Authenticated admin user portal
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Telecom Operations Dashboard';
      case 'workflow-viz': return 'Interactive Roaming Automation Flowchart';
      case 'documents': return 'Document Ingest & Mail Repository';
      case 'ai-roadmap': return 'AI Extraction, GSMA Parsing & OCR';
      case 'version-control': return 'Git-like Version Control Tree';
      case 'difference-checker': return 'Difference Detection Engine';
      case 'executive-dashboard': return 'Executive Risk Matrix & Assessment';
      case 'approval-workflow': return '6-Stage Multi-Role Governance Sign-offs';
      case 'governance-pipeline': return 'NETCONF / RESTCONF Script Buffer';
      case 'integration-matrix': return 'Switch Connection Provisioning Matrix';
      case 'digital-twin': return 'Digital Twin Signalling SLA Reconciliation';
      case 'rollback-center': return 'Automated Rollback & Baseline Restore';
      case 'audit-logs': return 'Cryptographic GSMA & Compliance Logs';
      case 'operators': return 'Connected Mobile Network Operators (MNOs)';
      case 'analytics': return 'Analytics & SLA Performance';
      case 'settings': return 'Platform Settings';
      case 'document-viewer': return 'Document Field Viewer';
      case 'admin-rules': return 'Ownership Engine — Classification Rules';
      case 'admin-catalog': return 'Ownership Engine — Field Catalog';
      case 'admin-overrides': return 'Ownership Engine — Field Overrides';
      case 'rejected-items': return 'Rejected Workflows — Decision History';
      default: return 'Mobileum Automation Console';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <div className="flex flex-1 min-h-screen">
        {/* Left Navigation Sidebar */}
        <Sidebar />

        {/* Right Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
          <Topbar />

          {/* Workflow Header Bar */}
          <WorkflowHeaderBar title={getTabTitle(activeTab)} />

          <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 pb-8">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'workflow-viz' && <WorkflowVisualization />}
            {activeTab === 'documents' && <DocumentsView />}
            {activeTab === 'ai-roadmap' && <AIRoadmapView />}
            {activeTab === 'version-control' && <VersionControlView />}
            {activeTab === 'difference-checker' && <DifferenceChecker />}
            {activeTab === 'executive-dashboard' && <ExecutiveDashboardView />}
            {activeTab === 'approval-workflow' && <ApprovalWorkflow />}
            {activeTab === 'governance-pipeline' && <GovernancePipelineView />}
            {activeTab === 'integration-matrix' && <IntegrationMatrixView />}
            {activeTab === 'digital-twin' && <DigitalTwinView />}
            {activeTab === 'rollback-center' && <RollbackCenter />}
            {activeTab === 'email-center' && <EmailCenter />}
            {activeTab === 'audit-logs' && <AuditLogsView />}
            {activeTab === 'operators' && <OperatorsView />}
            {activeTab === 'analytics' && <AnalyticsView />}
            {activeTab === 'settings' && <SettingsView />}
            {activeTab === 'users' && <UsersView />}
            {activeTab === 'notifications' && <NotificationsView />}
            {activeTab === 'master-repo' && <MasterRepositoryView />}
            {activeTab === 'document-viewer' && <DocumentViewer />}
            {activeTab === 'admin-rules' && <AdminRulesView />}
            {activeTab === 'admin-catalog' && <AdminCatalogView />}
            {activeTab === 'admin-overrides' && <AdminOverridesView />}
            {activeTab === 'rejected-items' && <RejectedItemsView />}
          </main>

          {/* Sequential Next/Prev footer navigation */}
          {WORKFLOW_TABS.includes(activeTab) && <WorkflowFooter />}
        </div>
      </div>

      {/* Global Modals */}
      <QuickUploadModal />
      <DocumentDetailModal docId={selectedModalDocId} onClose={() => setSelectedModalDocId(null)} />
      <NodeDetailModal nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
      <AutoRedirectModal />

      {/* Floating AI Copilot Widget */}
      <FloatingAICopilot />
    </div>
  );
}

// Minimal inline floating AI Copilot component for App.tsx
import { Bot, X, Send } from 'lucide-react';
import { useState as useReactState, useRef, useEffect as useReactEffect } from 'react';

const FloatingAICopilot = () => {
  const [isOpen, setIsOpen] = useReactState(false);
  const [inputStr, setInputStr] = useReactState('');
  const [loading, setLoading] = useReactState(false);
  const [messages, setMessages] = useReactState([
    { sender: 'ai', text: 'Hello! I am your Mobileum AI Roaming Copilot. Ask me about any operator, document, diff, or pending approval currently in the portal.' }
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useReactEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputStr.trim() || loading) return;
    const userMsg = inputStr.trim();
    setInputStr('');
    const nextMessages = [...messages, { sender: 'user', text: userMsg }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      // @ts-ignore
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: userMsg, history: nextMessages.slice(0, -1) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { sender: 'ai', text: `Sorry, I couldn't reach the AI service: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 z-50"
        title="Open AI Copilot"
      >
        <Bot className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden">
          <div className="bg-emerald-600 p-4 flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5" />
              <span className="font-bold">AI Roaming Copilot</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-emerald-500 p-1 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 h-80 p-4 overflow-y-auto space-y-3 bg-slate-50 dark:bg-slate-950">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 text-xs max-w-[85%] rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              value={inputStr}
              onChange={e => setInputStr(e.target.value)}
              placeholder="Ask about an operator or document…"
              disabled={loading}
              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <button type="submit" disabled={loading} className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default App;
