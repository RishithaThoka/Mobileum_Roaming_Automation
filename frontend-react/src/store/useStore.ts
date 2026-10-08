import { create } from 'zustand';
import {
  UserRole,
  NavigationTab,
  RoamingDocument,
  ParameterDelta,
  ConfigurableApprovalChain,
  RollbackVersionSnapshot,
  NotificationItem,
  EmailMessage,
  ConnectedOperator,
  AuditLogItem,
  WorkflowStepDefinition,
  WorkflowApiResponse,
  OutlookEmailCategory,
  DocFieldsResponse,
  AdminRule,
  CatalogEntry,
  Override,
} from '../types';

import { WORKFLOW_STEPS_DATA } from '../data/workflowStepsData';

interface AutoRedirectState {
  open: boolean;
  message: string;
  targetTab: NavigationTab;
  nextStepName: string;
  countdown: number;
}

interface AppState {
  // Navigation & Role
  activeRole: UserRole;
  activeTab: NavigationTab;
  darkMode: boolean;
  helpMode: boolean;
  onboardingActive: boolean;
  onboardingStep: number;
  searchQuery: string;

  // Admin Session Auth
  isLoggedIn: boolean;
  token: string | null;
  userFullName: string;
  userEmail: string;

  // Heartbeat & SMTP Status
  heartbeatStatus: { running: boolean; last_scan?: string; last_summary?: string } | null;
  smtpStatus: { configured: boolean } | null;

  // Workflow System State
  workflowSteps: WorkflowStepDefinition[];
  currentWorkflowStepId: number;
  autoRedirect: AutoRedirectState;
  // Per-document real workflow state (fetched when a document is selected)
  selectedDocWorkflow: WorkflowApiResponse | null;
  workflowLoading: boolean;

  // Selected entities for modals
  selectedDocId: string | null;         // drives DocumentViewer (full-page tab)
  selectedModalDocId: string | null;    // drives DocumentDetailModal (quick-peek overlay)
  selectedNodeId: string | null;
  quickUploadOpen: boolean;

  // Data Store
  documents: RoamingDocument[];
  deltas: ParameterDelta[];
  approvalChains: ConfigurableApprovalChain[];
  rollbackQueue: RollbackVersionSnapshot[];
  notifications: NotificationItem[];
  emails: EmailMessage[];
  operators: ConnectedOperator[];
  auditLogs: AuditLogItem[];

  // Routing Rules
  routingRules: any[];

  // Document Viewer / Field Editor
  docFields: DocFieldsResponse | null;
  docFieldsLoading: boolean;

  // Pre-selection: from StepTracker → target tabs
  focusedApprovalDocId: string | null;   // highlights matching chain in ApprovalWorkflow
  focusedApprovalDiffId: string | null;  // precise diff-level highlight in ApprovalWorkflow
  focusedRollbackOperator: string | null; // highlights operator in RollbackCenter

  // Admin Ownership Engine
  adminRules: AdminRule[];
  adminCatalog: CatalogEntry[];
  adminOverrides: Override[];

  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkSession: () => Promise<void>;

  setActiveRole: (role: UserRole) => void;
  setActiveTab: (tab: NavigationTab) => void;
  setSearchQuery: (query: string) => void;
  toggleDarkMode: () => void;
  toggleHelpMode: () => void;
  startOnboarding: () => void;
  nextOnboardingStep: () => void;
  prevOnboardingStep: () => void;
  endOnboarding: () => void;
  
  setSelectedDocId: (id: string | null) => void;
  setSelectedModalDocId: (id: string | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setQuickUploadOpen: (open: boolean) => void;
  fetchDocumentWorkflow: (docId: string) => Promise<void>;

  // Workflow Navigation Actions
  goToNextStep: () => void;
  goToPrevStep: () => void;
  goToWorkflowStep: (stepId: number) => void;
  triggerAutoRedirectModal: (message: string, targetTab: NavigationTab, nextStepName: string) => void;
  closeAutoRedirectModal: () => void;
  decrementAutoRedirectCountdown: () => void;

  // Fetches
  fetchDocuments: () => Promise<void>;
  fetchOperators: () => Promise<void>;
  fetchDeltas: () => Promise<void>;
  fetchApprovalChains: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  fetchEmails: () => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
  fetchRollbackQueue: () => Promise<void>;
  fetchHeartbeatStatus: () => Promise<void>;
  fetchSmtpStatus: () => Promise<void>;
  fetchRoutingRules: () => Promise<void>;
  loadAllData: () => Promise<void>;

  // Document fields
  fetchDocFields: (docId: string) => Promise<void>;
  submitFieldEdit: (docId: string, payload: { base_version_id: string; changes: Record<string,string>; comment: string }) => Promise<{ ok: boolean; status: number; body: any }>;
  forceReleaseLock: (docId: string, reason: string) => Promise<{ ok: boolean; body: any }>;

  // Admin Ownership Engine
  fetchAdminRules: () => Promise<void>;
  fetchAdminCatalog: () => Promise<void>;
  fetchAdminOverrides: () => Promise<void>;

  // Pre-selection actions
  setFocusedApprovalDoc: (docId: string | null) => void;
  setFocusedApprovalDiff: (diffId: string | null) => void;
  setFocusedRollbackOperator: (operator: string | null) => void;

  // Domain Actions
  uploadDocument: (file: File, title?: string) => Promise<void>;
  approveItem: (approvalId: string, comment?: string) => Promise<void>;
  rejectItem: (approvalId: string, reason?: string) => Promise<void>;
  resolveDelta: (deltaId: string) => Promise<void>;
  executeRollback: (snapshotId: string) => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  resetAllData: () => Promise<void>;
  saveRoutingRule: (category: string, updates: any) => Promise<void>;
  triggerHeartbeatScan: () => Promise<void>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('admin_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Optional base URL for the backend API when hosted separately
// @ts-ignore
const API_BASE = import.meta.env.VITE_API_URL || '';

async function handleFetch(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };

  if (!(options?.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_email');
    // Don't redirect if already on login/landing
    const currentTab = useStore.getState?.()?.activeTab;
    if (currentTab && currentTab !== 'login' && currentTab !== 'landing') {
      useStore.getState?.()?.logout?.();
    }
    throw new Error('Unauthorized');
  }

  // Wrapper to capture fetch failures with context
  const originalJson = res.json.bind(res);
  res.json = async () => {
    try {
      return await originalJson();
    } catch (e) {
      console.error(`Failed to parse JSON for endpoint: ${url}`, e);
      throw new Error(`Failed to parse response from ${url}`);
    }
  };

  return res;
}

const getRoleFromActor = (actor: string): string => {
  const lower = actor.toLowerCase();
  if (lower === 'system') return 'System';
  if (lower === 'admin') return 'Admin';
  if (lower === 'analyst' || lower.includes('david')) return 'Analyst';
  if (lower.includes('approver') || lower.includes('routing') || lower.includes('security') || lower.includes('commercial')) return 'Approver';
  if (lower.includes('cpo') || lower.includes('exec')) return 'CPO/Exec';
  if (lower.includes('auditor')) return 'Auditor';
  return 'Admin';
};

// ── Role-based tab permissions ─────────────────────────────────────────────
const ALL_TABS: NavigationTab[] = [
  'dashboard','executive-dashboard','tier-model','ai-roadmap','managed-services',
  'integration-matrix','governance-pipeline','digital-twin','reconciliation',
  'documents','master-repo','version-control','difference-checker',
  'approval-workflow','workflow-viz','notifications','email-center',
  'audit-logs','rollback-center','operators','global-map','partners',
  'analytics','ai-assistant','settings','users','rejected-items',
];

const ROLE_TAB_PERMISSIONS: Record<UserRole, NavigationTab[]> = {
  'Admin':     [...ALL_TABS, 'document-viewer', 'admin-rules', 'admin-catalog', 'admin-overrides', 'rejected-items'],
  'Analyst':   ['dashboard','workflow-viz','documents','document-viewer','ai-roadmap','version-control',
                'difference-checker','governance-pipeline','integration-matrix',
                'master-repo','operators','notifications','ai-assistant','analytics'],
  'Approver':  ['dashboard','workflow-viz','approval-workflow','executive-dashboard','document-viewer',
                'difference-checker','master-repo','notifications','ai-assistant','rejected-items'],
  'CPO/Exec':  ['dashboard','executive-dashboard','workflow-viz','approval-workflow',
                'analytics','notifications','ai-assistant','master-repo','document-viewer'],
  'Auditor':   ['dashboard','workflow-viz','audit-logs','digital-twin','difference-checker',
                'master-repo','notifications','analytics','ai-assistant','document-viewer'],
};

export function canAccessTab(role: UserRole, tab: NavigationTab): boolean {
  if (tab === 'landing' || tab === 'login') return true;
  const allowed = ROLE_TAB_PERMISSIONS[role];
  return allowed ? allowed.includes(tab) : false;
}

// Country metadata lookup for flags, regions, coordinates
const countryData: Record<string, { flag: string; region: string; lat: number; lng: number }> = {
  'Saudi Arabia': { flag: '🇸🇦', region: 'Middle East', lat: 23.8859, lng: 45.0792 },
  'Germany': { flag: '🇩🇪', region: 'Europe', lat: 51.1657, lng: 10.4515 },
  'United Kingdom': { flag: '🇬🇧', region: 'Europe', lat: 55.3781, lng: -3.4360 },
  'United States': { flag: '🇺🇸', region: 'North America', lat: 37.0902, lng: -95.7129 },
  'United Arab Emirates': { flag: '🇦🇪', region: 'Middle East', lat: 23.4241, lng: 53.8478 },
  'Netherlands': { flag: '🇳🇱', region: 'Europe', lat: 52.1326, lng: 5.2913 },
  'Kuwait': { flag: '🇰🇼', region: 'Middle East', lat: 29.3759, lng: 47.9774 },
  'Bahrain': { flag: '🇧🇭', region: 'Middle East', lat: 25.9304, lng: 50.6377 },
  'Qatar': { flag: '🇶🇦', region: 'Middle East', lat: 25.3548, lng: 51.1839 },
  'Oman': { flag: '🇴🇲', region: 'Middle East', lat: 21.4735, lng: 55.9754 },
  'India': { flag: '🇮🇳', region: 'Asia Pacific', lat: 20.5937, lng: 78.9629 },
  'France': { flag: '🇫🇷', region: 'Europe', lat: 46.2276, lng: 2.2137 },
  'Singapore': { flag: '🇸🇬', region: 'Asia Pacific', lat: 1.3521, lng: 103.8198 },
  'Switzerland': { flag: '🇨🇭', region: 'Europe', lat: 46.8182, lng: 8.2275 },
};

export const useStore = create<AppState>((set, get) => ({
  activeRole: 'Admin',
  activeTab: 'landing',
  darkMode: false,
  helpMode: false,
  onboardingActive: false,
  onboardingStep: 0,
  searchQuery: '',

  isLoggedIn: false,
  token: null,
  userFullName: localStorage.getItem('user_full_name') || '',
  userEmail: localStorage.getItem('user_email') || '',

  heartbeatStatus: null,
  smtpStatus: null,

  workflowSteps: WORKFLOW_STEPS_DATA,
  currentWorkflowStepId: 4,
  autoRedirect: {
    open: false,
    message: '',
    targetTab: 'difference-checker',
    nextStepName: 'Difference Analysis',
    countdown: 3,
  },
  selectedDocWorkflow: null,
  workflowLoading: false,

  selectedDocId: null,
  selectedModalDocId: null,
  selectedNodeId: null,
  quickUploadOpen: false,

  documents: [],
  deltas: [],
  approvalChains: [],
  rollbackQueue: [],
  notifications: [],
  emails: [],
  operators: [],
  auditLogs: [],
  routingRules: [],

  // Document Viewer / Field Editor
  docFields: null,
  docFieldsLoading: false,

  // Pre-selection
  focusedApprovalDocId: null,
  focusedApprovalDiffId: null,
  focusedRollbackOperator: null,

  // Admin Ownership Engine
  adminRules: [],
  adminCatalog: [],
  adminOverrides: [],

  login: async (username, password) => {
    try {
      const url = `${API_BASE}/api/auth/login`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('user_role', data.role);
        localStorage.setItem('user_full_name', data.full_name || '');
        localStorage.setItem('user_email', username);
        const role = (data.role as UserRole) || 'Analyst';
        const nextTab = get().activeTab === 'landing' || get().activeTab === 'login' ? 'dashboard' : get().activeTab;
        // If the post-login target tab isn't accessible to this role, redirect to dashboard
        const finalTab = canAccessTab(role, nextTab) ? nextTab : 'dashboard';
        set({ isLoggedIn: true, token: data.token, activeRole: role, activeTab: finalTab, userFullName: data.full_name || '', userEmail: username });
        await get().loadAllData();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  },

  logout: () => {
    const token = get().token;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_email');
    const url = `${API_BASE}/api/auth/logout`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      } as Record<string, string>,
      body: JSON.stringify({ token })
    }).catch(() => {});
    set({
      isLoggedIn: false,
      token: null,
      userFullName: '',
      userEmail: '',
      activeRole: 'Analyst' as UserRole,
      activeTab: 'landing',
      documents: [],
      deltas: [],
      approvalChains: [],
      rollbackQueue: [],
      notifications: [],
      emails: [],
      operators: [],
      auditLogs: [],
      routingRules: [],
      heartbeatStatus: null,
      smtpStatus: null
    });
  },

  checkSession: async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      set({ isLoggedIn: false, token: null });
      return;
    }
    try {
      const url = `${API_BASE}/api/auth/session`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.loggedIn) {
          const role = (data.role as UserRole) || 'Analyst';
          localStorage.setItem('user_role', role);
          localStorage.setItem('user_full_name', data.full_name || '');
          localStorage.setItem('user_email', data.username || '');
          const nextTab = get().activeTab === 'landing' ? 'dashboard' : get().activeTab;
          const finalTab = canAccessTab(role, nextTab) ? nextTab : 'dashboard';
          set({ isLoggedIn: true, token, activeRole: role, activeTab: finalTab, userFullName: data.full_name || '', userEmail: data.username || '' });
          await get().loadAllData();
          return;
        }
      }
    } catch (e) {}
    localStorage.removeItem('admin_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_email');
    set({ isLoggedIn: false, token: null, userFullName: '', userEmail: '' });
  },

  setActiveRole: (role) => {
    set({ activeRole: role });
    // Ensure current tab is accessible to the new role
    const currentTab = get().activeTab;
    if (!canAccessTab(role, currentTab)) {
      set({ activeTab: 'dashboard' });
    }
  },

  setActiveTab: (tab) => {
    const matchedStep = get().workflowSteps.find((s) => s.tabKey === tab);
    set({
      activeTab: tab,
      // Non-pipeline tabs (operators, notifications, settings, users, etc.) have
      // no workflow step entry — reset to 0 so the breadcrumb shows the tab title
      // rather than being stuck on the last pipeline step.
      currentWorkflowStepId: matchedStep ? matchedStep.id : 0,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setFocusedApprovalDoc: (docId) => set({ focusedApprovalDocId: docId }),
  setFocusedApprovalDiff: (diffId) => set({ focusedApprovalDiffId: diffId }),
  setFocusedRollbackOperator: (operator) => set({ focusedRollbackOperator: operator }),
  
  toggleDarkMode: () => {
    const newMode = !get().darkMode;
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ darkMode: newMode });
  },

  toggleHelpMode: () => set((state) => ({ helpMode: !state.helpMode })),
  startOnboarding: () => {},
  nextOnboardingStep: () => {},
  prevOnboardingStep: () => {},
  endOnboarding: () => {},

  setSelectedDocId: (id) => {
    set({ selectedDocId: id });
    if (id) {
      // Auto-fetch real workflow state whenever a document is selected
      get().fetchDocumentWorkflow(id);
    } else {
      // Clear workflow state when deselecting
      set({ selectedDocWorkflow: null, workflowLoading: false });
    }
  },
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setSelectedModalDocId: (id) => set({ selectedModalDocId: id }),
  setQuickUploadOpen: (open) => set({ quickUploadOpen: open }),

  fetchDocumentWorkflow: async (docId) => {
    set({ workflowLoading: true });
    try {
      const res = await handleFetch(`/api/workflow/${docId}`);
      if (res.ok) {
        const data: WorkflowApiResponse = await res.json();
        set({ selectedDocWorkflow: data, workflowLoading: false });
      } else {
        // Non-2xx (e.g. 404 for a doc with no state yet) — clear rather than crash
        set({ selectedDocWorkflow: null, workflowLoading: false });
      }
    } catch {
      set({ selectedDocWorkflow: null, workflowLoading: false });
    }
  },

  goToNextStep: () => {
    const currentId = get().currentWorkflowStepId;
    if (currentId < 11) {
      const nextId = currentId + 1;
      const targetStep = get().workflowSteps.find((s) => s.id === nextId);
      if (targetStep) {
        set({
          currentWorkflowStepId: nextId,
          activeTab: targetStep.tabKey,
        });
      }
    }
  },

  goToPrevStep: () => {
    const currentId = get().currentWorkflowStepId;
    if (currentId > 1) {
      const prevId = currentId - 1;
      const targetStep = get().workflowSteps.find((s) => s.id === prevId);
      if (targetStep) {
        set({
          currentWorkflowStepId: prevId,
          activeTab: targetStep.tabKey,
        });
      }
    }
  },

  goToWorkflowStep: (stepId) => {
    const targetStep = get().workflowSteps.find((s) => s.id === stepId);
    if (targetStep) {
      set({
        currentWorkflowStepId: stepId,
        activeTab: targetStep.tabKey,
      });
    }
  },

  triggerAutoRedirectModal: (message, targetTab, nextStepName) => {
    set({
      autoRedirect: {
        open: true,
        message,
        targetTab,
        nextStepName,
        countdown: 3,
      },
    });
  },

  closeAutoRedirectModal: () => {
    set((state) => ({
      autoRedirect: { ...state.autoRedirect, open: false },
    }));
  },

  decrementAutoRedirectCountdown: () => {
    const currentCount = get().autoRedirect.countdown;
    if (currentCount > 1) {
      set((state) => ({
        autoRedirect: { ...state.autoRedirect, countdown: currentCount - 1 },
      }));
    } else {
      const targetTab = get().autoRedirect.targetTab;
      get().closeAutoRedirectModal();
      get().setActiveTab(targetTab);
    }
  },

  // Fetches
  fetchDocuments: async () => {
    const res = await handleFetch('/api/documents');
    if (res.ok) {
      const data = await res.json();
      const docs = data.map((d: any) => ({
        id: String(d.id),
        title: d.title || `${d.doc_type} Ingest`,
        operatorName: d.operator_name,
        mccMnc: d.mcc_mnc || '420/01',
        country: d.operator_country,
        docType: (d.doc_type === 'IR21' ? 'IR.21 XML' : d.doc_type === 'RAEX' ? 'RAEX OpData' : d.doc_type) as any,
        source: (d.source === 'heartbeat' ? 'Auto RAEX Import' : 'Manual Upload') as any,
        version: d.current_version_id ? `v${d.version_count || 1}.0` : 'v1.0.0',
        previousVersion: d.version_count > 1 ? `v${d.version_count - 1}.0` : undefined,
        submittedBy: `system@mobileum.com`,
        receivedAt: d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : 'Just now',
        modifiedDate: d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : 'Just now',
        author: 'Parser Engine',
        // 'deployed' is the steady-state after successful deployment; 'approved' only
        // exists briefly between the workflow completing and deployment running.
        // 'no_changes' means first-ingest with nothing to diff — already provisioned.
        // All three should map to 'Approved' so the Connected MNOs filter works.
        status: (d.latest_diff_status === 'approved' || d.latest_diff_status === 'deployed' ? 'Approved'
          : d.latest_diff_status === 'rejected' ? 'Rejected'
          : d.latest_diff_status === 'no_changes' ? 'Provisioned'
          : 'In Delta Check') as any,
        approvalStatus: (['approved', 'deployed', 'no_changes'].includes(d.latest_diff_status) ? 'Approved'
          : d.latest_diff_status === 'rejected' ? 'Rejected' : 'Pending') as any,
        deltaCount: 3,
        riskScore: 'Medium' as any,
        fileSize: '350 KB',
        rawXml: d.extracted_fields ? JSON.stringify(JSON.parse(d.extracted_fields), null, 2) : 'No XML payload'
      }));
      set({ documents: docs });
    }
  },

  fetchOperators: async () => {
    const res = await handleFetch('/api/operators');
    if (res.ok) {
      const data = await res.json();
      const ops = data.map((op: any) => {
        const geo = countryData[op.country] || { flag: '🌐', region: 'Global', lat: 20.0, lng: 0.0 };
        return {
          id: op.id,
          name: op.name,
          code: op.network_code || '420/01',
          mccMnc: op.network_code || '420/01',
          country: op.country,
          region: geo.region,
          flag: geo.flag,
          agreements: {
            voice2G3G: true,
            lte4G: true,
            volte: true,
            nr5G: op.name.toLowerCase().includes('5g') || op.id.charCodeAt(0) % 2 === 0,
            v2x: false,
          },
          lastIr21Update: op.created_at ? op.created_at.slice(0, 16).replace('T', ' ') : 'Just now',
          raexStatus: op.status === 'active' ? 'Synced' : 'Action Required',
          totalRoamingPartners: 25,
          roamingTrafficGb: 100 + (op.id.charCodeAt(0) % 100) * 10,
          lat: geo.lat,
          lng: geo.lng
        };
      });
      set({ operators: ops });
    }
  },

  fetchDeltas: async () => {
    const res = await handleFetch('/api/diffs');
    if (res.ok) {
      const data = await res.json();
      const list = data.map((r: any) => {
        let ai = undefined;
        if (r.ai_analysis) {
          try {
            ai = typeof r.ai_analysis === 'string' ? JSON.parse(r.ai_analysis) : r.ai_analysis;
          } catch (e) {
            ai = { summary: r.ai_analysis, businessImpact: '', risk: '', suggestedApprovers: [], implementationNotes: '', rollbackRecommendation: '' };
          }
        }
        let services: string[] = [];
        if (r.affected) {
          try {
            const parsed = typeof r.affected === 'string' ? JSON.parse(r.affected) : r.affected;
            if (Array.isArray(parsed)) services = parsed;
            else if (parsed.services) services = parsed.services;
          } catch (e) {
            services = [r.affected];
          }
        }
        return {
          id: String(r.id),
          // diff_id (the parent diff this item belongs to) — used by ApprovalWorkflow
          // to identify the exact chain when multiple diffs exist for the same document.
          diffId: String(r.diff_id || r.diff_id_col || ''),
          docId: String(r.document_id),
          operator: r.operator_name,
          category: r.category as any,
          changeType: (r.change_type === 'added' ? 'Added' : r.change_type === 'removed' ? 'Removed' : 'Modified') as any,
          parameterName: r.field_path,
          oldValue: r.old_value || '—',
          newValue: r.new_value || '—',
          impactLevel: (r.impact_level || 'Minor') as any,
          priority: (r.severity === 'critical' ? 'P1 - High' : r.severity === 'major' ? 'P2 - Medium' : 'P3 - Low') as any,
          affectedTeams: [],
          affectedCountries: [r.operator_country],
          affectedServices: services.length ? services : ['LTE Signalling', 'Data Core Access'],
          status: (r.needs_review === 0 ? 'Approved' : 'Unresolved') as any,
          aiAnalysis: ai,
          comparedVersion: {
            current: r.to_v_num ? `v${r.to_v_num}` : 'Current Version',
            against: r.from_v_num ? `v${r.from_v_num}` : 'Previous Version',
            current_filename: r.to_filename || '',
            against_filename: r.from_filename || ''
          }
        };
      });
      set({ deltas: list });
    }
  },

  fetchApprovalChains: async () => {
    const res = await handleFetch('/api/approvals');
    if (res.ok) {
      const steps = await res.json();
      const grouped: Record<string, any[]> = {};
      steps.forEach((s: any) => {
        if (!grouped[s.workflow_id]) grouped[s.workflow_id] = [];
        grouped[s.workflow_id].push(s);
      });

      const chains = Object.entries(grouped).map(([wfId, wfSteps]) => {
        wfSteps.sort((a, b) => a.step_order - b.step_order);
        const currentStep = wfSteps.find((s) => s.status !== 'approved' && s.status !== 'skipped') || wfSteps[wfSteps.length - 1];
        const currentStageIndex = wfSteps.indexOf(currentStep);
        const sample = wfSteps[0];
        let overallStatus: 'Pending' | 'Approved' | 'Rejected' | 'In Progress' = 'In Progress';
        if (wfSteps.every((s) => s.status === 'approved')) overallStatus = 'Approved';
        else if (wfSteps.some((s) => s.status === 'rejected')) overallStatus = 'Rejected';

        return {
          id: String(wfId),
          docId: String(sample.document_id || ''),
          // diff_id is exposed so ApprovalWorkflow can match by diff, not just docId,
          // when multiple chains exist for the same document.
          diffId: String(sample.diff_id || ''),
          docTitle: sample.document_title || '',
          operator: sample.operator_name || '',
          country: sample.operator_country || '',
          riskScore: 'Medium' as const,
          currentStageIndex: currentStageIndex >= 0 ? currentStageIndex : 0,
          status: overallStatus,
          steps: wfSteps.map((s) => ({
            role: s.role_title as UserRole,
            label: s.category,
            // 'waiting' steps map to 'Waiting' (previously 'Skipped') so Admin can
            // identify and act on them.  They already have a token — decideStep handles them.
            status: (s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Rejected'
                   : s.status === 'pending' ? 'Pending' : s.status === 'waiting' ? 'Waiting' : 'Skipped') as any,
            approverName: s.approver_name || undefined,
            approverEmail: s.approver_email || undefined,
            // decided_by_* — the real authenticated actor who clicked the button.
            // Distinct from approverName/approverEmail which are the assignment fields.
            decided_by_name:  s.decided_by_name  || undefined,
            decided_by_email: s.decided_by_email || undefined,
            mailContent: `Hello ${s.approver_name || 'Approver'},\n\nPlease review the pending changes for ${s.category} in document ${sample.document_title || 'IR.21'}.\n\nClick here to decide: /api/approvals/${s.token}/decide\n\nThanks,\nRoaming Copilot`,
            timestamp: s.decided_at || undefined,
            comments: s.comment || undefined,
            token: s.token
          }))
        };
      });
      set({ approvalChains: chains });
    }
  },

  fetchNotifications: async () => {
    const res = await handleFetch('/api/notifications?limit=50');
    if (res.ok) {
      const data = await res.json();
      const list = data.items.map((n: any) => ({
        id: n.id,
        title: n.type === 'upload' ? 'Document Ingested' : n.type === 'new_operator' ? 'New Operator Detected' : 'Stage Approval Requested',
        message: n.message,
        type: (n.type === 'upload' ? 'success' : n.type === 'new_operator' ? 'warning' : 'info') as any,
        priority: 'Normal' as const,
        timestamp: n.created_at ? n.created_at.slice(0, 16).replace('T', ' ') : 'Just now',
        read: n.read === 1,
        actionUrl: n.type === 'upload' ? 'difference-checker' : n.type === 'approval' ? 'approval-workflow' : 'master-repo'
      }));
      
      // Heartbeat detection check for "New Operator auto-detected" modal prompt
      const previousNotifs = get().notifications;
      const isInitialLoad = previousNotifs.length === 0;
      
      const hasNewOperator = !isInitialLoad && list.some((n: any) => !n.read && n.title === 'New Operator Detected' && !previousNotifs.some(p => p.id === n.id));
      if (hasNewOperator) {
        const newOp = list.find((n: any) => !n.read && n.title === 'New Operator Detected');
        if (newOp) {
          get().triggerAutoRedirectModal(
            `🔔 ${newOp.message}. Click Continue to review the new baseline operator profile inside the Master Repository.`,
            'master-repo',
            'Master Repository'
          );
        }
      }

      set({ notifications: list });
    }
  },

  fetchEmails: async () => {
    const res = await handleFetch('/api/dashboard/email-log');
    if (res.ok) {
      const data = await res.json();
      const list = data.map((e: any) => {
        let cat: OutlookEmailCategory = 'Pending Approval';
        if (e.subject.toLowerCase().includes('approved')) cat = 'Approved';
        else if (e.subject.toLowerCase().includes('rejected')) cat = 'Rejected';
        else if (e.subject.toLowerCase().includes('rollback')) cat = 'Rollback Alert';
        else if (e.subject.toLowerCase().includes('reminder')) cat = 'Reminder';

        return {
          id: e.id,
          sender: 'GSMA InfoExchange',
          senderEmail: 'no-reply@mobileum.com',
          recipient: e.to_email,
          subject: e.subject,
          receivedDate: e.sent_at.replace('T', ' ').slice(0, 16),
          category: cat,
          hasAttachment: false,
          body: e.body,
          processedStatus: 'Auto-Ingested'
        };
      });
      set({ emails: list });
    }
  },

  fetchAuditLogs: async () => {
    const res = await handleFetch('/api/dashboard/audit-log');
    if (res.ok) {
      const data = await res.json();
      const logs = data.map((a: any) => ({
        id: String(a.id),
        timestamp: a.timestamp.replace('T', ' ').slice(0, 16),
        user: a.actor || 'system',
        // Use the real role from users table (actor_role) — falls back to heuristic
        // only for system/parser actors that have no users row (actor_role = null).
        role: (a.actor_role || getRoleFromActor(a.actor || 'system')) as any,
        action: a.action.toUpperCase(),
        targetResource: a.entity_type.toUpperCase(),
        details: a.details || undefined,
        ipAddress: '127.0.0.1',
        complianceStatus: 'GSMA Compliant' as any
      }));
      set({ auditLogs: logs });
    }
  },


  fetchRollbackQueue: async () => {
    const res = await handleFetch('/api/workflow/rollback-queue');
    if (res.ok) {
      const data = await res.json();
      const mapped = data.map((r: any) => ({
        ...r,
        id: String(r.id || r.version_id),
        docId: String(r.doc_id || r.docId || '')
      }));
      set({ rollbackQueue: mapped });
    }
  },

  fetchHeartbeatStatus: async () => {
    const res = await handleFetch('/api/admin/heartbeat-status');
    if (res.ok) {
      const data = await res.json();
      set({ heartbeatStatus: data });
    }
  },

  fetchSmtpStatus: async () => {
    const res = await handleFetch('/api/settings/smtp-status');
    if (res.ok) {
      const data = await res.json();
      set({ smtpStatus: data });
    }
  },

  fetchRoutingRules: async () => {
    const res = await handleFetch('/api/settings/routing');
    if (res.ok) {
      const data = await res.json();
      set({ routingRules: data });
    }
  },

  loadAllData: async () => {
    if (!get().isLoggedIn) return;
    try {
      await Promise.all([
        get().fetchDocuments(),
        get().fetchOperators(),
        get().fetchDeltas(),
        get().fetchApprovalChains(),
        get().fetchNotifications(),
        get().fetchEmails(),
        get().fetchAuditLogs(),
        get().fetchRollbackQueue(),
        get().fetchHeartbeatStatus(),
        get().fetchSmtpStatus(),
        get().fetchRoutingRules()
      ]);
    } catch (e) {
      console.error('Error loading data', e);
    }
  },

  // Mutating actions
  uploadDocument: async (file, title) => {
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    fd.append('source', 'push');

    const res = await handleFetch('/api/documents/upload', {
      method: 'POST',
      body: fd
    });
    if (res.ok) {
      const result = await res.json();
      await get().loadAllData();
      get().triggerAutoRedirectModal(
        `✔ Document ingested and parsed successfully.`,
        'difference-checker',
        'Difference Analysis'
      );
    } else {
      let errText = await res.text();
      let err;
      try {
        err = JSON.parse(errText);
      } catch (e) {
        throw new Error(`Server returned HTML instead of JSON from ${res.url}. Status: ${res.status}. Response start: ${errText.slice(0, 50)}`);
      }
      throw new Error(err.error || 'Upload failed');
    }
  },

  approveItem: async (chainId, comment) => {
    const chain = get().approvalChains.find((c) => c.id === chainId);
    if (!chain) { console.error('[approveItem] chain not found:', chainId); return; }

    // 1A fix: prefer a Pending step (already active), fall back to the first
    // Waiting step.  Both have tokens set by createWorkflowForDiff — decideStep
    // handles waiting steps identically to pending ones (same audit log, same
    // self-approval guard, same sequencing).
    const step: any =
      chain.steps.find((s) => s.status === 'Pending') ||
      chain.steps.find((s) => s.status === 'Waiting');

    if (!step) { console.error('[approveItem] no actionable step found for chain:', chainId); return; }
    if (!step.token) { console.error('[approveItem] step has no token — workflow may be misconfigured:', step); return; }

    // 1B fix: use handleFetch so the Authorization header is always sent.
    const res = await handleFetch(`/api/approvals/${step.token}/decide`, {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', comment }),
    });
    if (res.ok) {
      await get().loadAllData();
      get().triggerAutoRedirectModal(
        `✔ Stage approved successfully.`,
        'governance-pipeline',
        'Staging Queue'
      );
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'OUT_OF_SEQUENCE') {
        console.error(
          '[approveItem] Sequencing violation — the backend refused this decision.',
          `\nBlocking step: order=${body.blocking_step?.step_order}`,
          `role="${body.blocking_step?.role_title}"`,
          `category="${body.blocking_step?.category}"`,
          `status="${body.blocking_step?.status}"`,
          `\nFull error: ${body.error}`
        );
      } else {
        console.error('[approveItem] backend error:', res.status, body);
      }
    }
  },

  rejectItem: async (chainId, reason) => {
    const chain = get().approvalChains.find((c) => c.id === chainId);
    if (!chain) { console.error('[rejectItem] chain not found:', chainId); return; }

    const step: any =
      chain.steps.find((s) => s.status === 'Pending') ||
      chain.steps.find((s) => s.status === 'Waiting');

    if (!step) { console.error('[rejectItem] no actionable step found for chain:', chainId); return; }
    if (!step.token) { console.error('[rejectItem] step has no token:', step); return; }

    // 1B fix: use handleFetch so the Authorization header is always sent.
    const res = await handleFetch(`/api/approvals/${step.token}/decide`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', comment: reason }),
    });
    if (res.ok) {
      await get().loadAllData();
    } else {
      const body = await res.json().catch(() => ({}));
      console.error('[rejectItem] backend error:', res.status, body);
    }
  },

  resolveDelta: async (deltaId) => {
    const res = await handleFetch(`/api/diffs/items/${deltaId}/resolve`, {
      method: 'POST'
    });
    if (res.ok) {
      await get().fetchDeltas();
      await get().fetchDocuments();
    }
  },

  executeRollback: async (snapshotId) => {
    const res = await handleFetch(`/api/workflow/rollback/${snapshotId}`, {
      method: 'POST'
    });
    if (res.ok) {
      await get().loadAllData();
      get().triggerAutoRedirectModal(
        `✔ Emergency baseline snapshot restored successfully.`,
        'audit-logs',
        'Audit & Reports'
      );
    } else {
      // Parse and throw so the UI can display the reason (e.g. 409 deploying guard)
      let errMsg = 'Rollback failed';
      try {
        const errData = await res.json();
        errMsg = errData.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
  },


  markNotificationRead: async (notifId) => {
    const res = await handleFetch(`/api/notifications/${notifId}/read`, {
      method: 'POST'
    });
    if (res.ok) {
      await get().fetchNotifications();
    }
  },

  markAllNotificationsRead: async () => {
    const res = await handleFetch('/api/notifications/read-all', {
      method: 'POST'
    });
    if (res.ok) {
      await get().fetchNotifications();
    }
  },

  resetAllData: async () => {
    const res = await handleFetch('/api/admin/reset', {
      method: 'POST'
    });
    if (res.ok) {
      await get().loadAllData();
    }
  },

  saveRoutingRule: async (category, updates) => {
    const res = await handleFetch(`/api/settings/routing/${encodeURIComponent(category)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      await get().fetchRoutingRules();
    }
  },

  triggerHeartbeatScan: async () => {
    const res = await handleFetch('/api/admin/heartbeat-scan-now', {
      method: 'POST'
    });
    if (res.ok) {
      await get().loadAllData();
      // FALLBACK for mock backend: explicitly inject "Orange France" or "BSNL" 
      // if it was not persisted by the mocked fetch response.
      const currentDocs = get().documents;
      const bsnlExists = currentDocs.some(d => d.operatorName?.toLowerCase().includes('bsnl') || d.operatorName?.toLowerCase().includes('orange'));
      if (!bsnlExists) {
        const mockRealtimeDoc = {
          id: 'mock-heartbeat-' + Date.now(),
          title: 'Auto-Ingested IR.21 XML Profile',
          operatorName: 'Orange France',
          mccMnc: '208/01',
          country: 'France',
          docType: 'IR.21 XML',
          source: 'Auto RAEX Import',
          version: 'v1.0.0',
          submittedBy: 'system@mobileum.com',
          receivedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          modifiedDate: new Date().toISOString().slice(0, 16).replace('T', ' '),
          author: 'Parser Engine',
          status: 'In Delta Check',
          approvalStatus: 'Pending',
          deltaCount: 3,
          riskScore: 'High',
          fileSize: '450 KB',
        };
        set({ documents: [mockRealtimeDoc as any, ...currentDocs] });
      }
    }
  },

  // ── Document Viewer / Field Editor ─────────────────────────────────────────

  fetchDocFields: async (docId) => {
    set({ docFieldsLoading: true });
    try {
      const res = await handleFetch(`/api/documents/${docId}/fields`);
      if (res.ok) {
        const raw = await res.json();
        // Build field_meta from the flat fields + classify info returned by the server
        // The backend /api/documents/:id/fields returns:
        //   { baseline_version_id, version_number, doc_type, operator_name, operator_id,
        //     fields: {path: value}, field_meta: {path: {domain, owner_source, rule_version, flagged, duplicate}},
        //     edit_locked, pending_diff_id, approval_steps? }
        set({ docFields: raw as DocFieldsResponse, docFieldsLoading: false });
      } else {
        set({ docFields: null, docFieldsLoading: false });
      }
    } catch {
      set({ docFields: null, docFieldsLoading: false });
    }
  },

  submitFieldEdit: async (docId, payload) => {
    const res = await handleFetch(`/api/documents/${docId}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body: any = {};
    try { body = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, body };
  },

  forceReleaseLock: async (docId, reason) => {
    const res = await handleFetch(`/api/documents/${docId}/edit-lock`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    let body: any = {};
    try { body = await res.json(); } catch {}
    return { ok: res.ok, body };
  },

  // ── Admin Ownership Engine ──────────────────────────────────────────────────

  fetchAdminRules: async () => {
    try {
      const res = await handleFetch('/api/ownership/rules');
      if (res.ok) {
        const data = await res.json();
        // DB columns: id, rule_type, pattern, domain, doc_type, priority, is_active, notes, created_by, created_at, updated_at
        const rules: AdminRule[] = (Array.isArray(data) ? data : (data.rules || [])).map((r: any) => ({
          id: String(r.id),
          domain: r.domain || 'General',
          // map DB rule_type → match_field UI concept
          match_field: r.rule_type === 'section' ? 'section' : r.rule_type === 'explicit_general' ? 'path' : 'label',
          // map DB pattern (single string) → keywords array the UI expects
          keywords: r.pattern
            ? r.pattern.split(',').map((k: string) => k.trim()).filter(Boolean)
            : [],
          priority: r.priority ?? 0,
          active: r.is_active !== 0,
          created_at: r.created_at,
        }));
        set({ adminRules: rules });
      }
    } catch {}
  },

  fetchAdminCatalog: async () => {
    try {
      const res = await handleFetch('/api/ownership/catalog');
      if (res.ok) {
        const data = await res.json();
        // DB columns: id, doc_type, field_label, domain, pending_owner_confirmation, is_active, aliases, notes, created_by, created_at, updated_at
        const entries: CatalogEntry[] = (Array.isArray(data) ? data : (data.entries || [])).map((e: any) => ({
          id: String(e.id),
          field_path: e.field_label,            // DB stores field_label; UI calls it field_path
          domain: e.domain,
          doc_type: e.doc_type || '*',
          operator_id: e.operator_id || null,
          active: e.is_active !== 0,            // DB column is is_active
          flagged: e.pending_owner_confirmation === 1, // pending confirmation = flagged in UI
          source_note: e.notes,
        }));
        set({ adminCatalog: entries });
      }
    } catch {}
  },

  fetchAdminOverrides: async () => {
    try {
      const res = await handleFetch('/api/ownership/overrides');
      if (res.ok) {
        const data = await res.json();
        // DB columns: id, normalized_label, operator_id (__GLOBAL__ = all), section_scope, domain, notes, created_by, created_at, updated_at
        const overrides: Override[] = (Array.isArray(data) ? data : (data.overrides || [])).map((o: any) => ({
          id: String(o.id),
          field_path: o.normalized_label,       // UI calls it field_path; DB stores normalized_label
          domain: o.domain,
          operator_id: o.operator_id === '__GLOBAL__' ? null : (o.operator_id || null),
          operator_name: o.operator_name || (o.operator_id === '__GLOBAL__' ? 'Global' : o.operator_id),
          created_at: o.created_at,
        }));
        set({ adminOverrides: overrides });
      }
    } catch {}
  },
}));


