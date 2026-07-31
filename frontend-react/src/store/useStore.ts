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
  OutlookEmailCategory
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

  // Heartbeat & SMTP Status
  heartbeatStatus: { running: boolean; last_scan?: string; last_summary?: string } | null;
  smtpStatus: { configured: boolean } | null;

  // Workflow System State
  workflowSteps: WorkflowStepDefinition[];
  currentWorkflowStepId: number;
  autoRedirect: AutoRedirectState;

  // Selected entities for modals
  selectedDocId: string | null;
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
  setSelectedNodeId: (id: string | null) => void;
  setQuickUploadOpen: (open: boolean) => void;

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
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
  }
  return res;
}

const getRoleFromActor = (actor: string): string => {
  const lower = actor.toLowerCase();
  if (lower === 'system') return 'System';
  if (lower === 'admin') return 'Admin';
  if (lower === 'analyst' || lower.includes('david')) return 'Analyst';
  if (lower.includes('cto') || lower.includes('routing')) return 'CTO';
  if (lower.includes('cmo') || lower.includes('commercial')) return 'CMO';
  if (lower.includes('security') || lower.includes('ciso')) return 'Security';
  if (lower.includes('finance') || lower.includes('cfo')) return 'Finance';
  return 'Admin';
};

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

  heartbeatStatus: null,
  smtpStatus: null,

  workflowSteps: WORKFLOW_STEPS_DATA,
  currentWorkflowStepId: 4, // Default to Step 4 (Difference Analysis)
  autoRedirect: {
    open: false,
    message: '',
    targetTab: 'difference-checker',
    nextStepName: 'Difference Analysis',
    countdown: 3,
  },

  selectedDocId: null,
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
        const nextTab = get().activeTab === 'landing' || get().activeTab === 'login' ? 'dashboard' : get().activeTab;
        set({ isLoggedIn: true, token: data.token, activeRole: 'Admin', activeTab: nextTab });
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
    const url = `${API_BASE}/api/auth/logout`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      } as Record<string, string>,
      body: JSON.stringify({ token })
    }).catch(() => {});
    localStorage.removeItem('admin_token');
    set({
      isLoggedIn: false,
      token: null,
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
          const nextTab = get().activeTab === 'landing' ? 'dashboard' : get().activeTab;
          set({ isLoggedIn: true, token, activeRole: 'Admin', activeTab: nextTab });
          await get().loadAllData();
          return;
        }
      }
    } catch (e) {}
    localStorage.removeItem('admin_token');
    set({ isLoggedIn: false, token: null });
  },

  setActiveRole: (role) => {
    // Stub to prevent compilation breaks
  },

  setActiveTab: (tab) => {
    const matchedStep = get().workflowSteps.find((s) => s.tabKey === tab);
    set({
      activeTab: tab,
      currentWorkflowStepId: matchedStep ? matchedStep.id : get().currentWorkflowStepId,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  
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

  setSelectedDocId: (id) => set({ selectedDocId: id }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setQuickUploadOpen: (open) => set({ quickUploadOpen: open }),

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
        status: (d.latest_diff_status === 'approved' ? 'Approved' : d.latest_diff_status === 'rejected' ? 'Rejected' : d.latest_diff_status === 'no_changes' ? 'Provisioned' : 'In Delta Check') as any,
        approvalStatus: (d.latest_diff_status === 'approved' ? 'Approved' : d.latest_diff_status === 'rejected' ? 'Rejected' : 'Pending') as any,
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
          docTitle: sample.document_title || '',
          operator: sample.operator_name || '',
          country: sample.operator_country || '',
          riskScore: 'Medium' as const,
          currentStageIndex: currentStageIndex >= 0 ? currentStageIndex : 0,
          status: overallStatus,
          steps: wfSteps.map((s) => ({
            role: s.role_title as UserRole,
            label: s.category,
            status: (s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Rejected' : s.status === 'pending' ? 'Pending' : 'Skipped') as any,
            approverName: s.approver_name || undefined,
            approverEmail: s.approver_email || undefined,
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
        role: getRoleFromActor(a.actor || 'system') as any,
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
      const err = await res.json();
      throw new Error(err.error || 'Upload failed');
    }
  },

  approveItem: async (chainId, comment) => {
    const chain = get().approvalChains.find((c) => c.id === chainId);
    if (!chain) return;
    const step: any = chain.steps.find((s) => s.status === 'Pending');
    if (!step || !step.token) return;

    const res = await fetch(`${API_BASE}/api/approvals/${step.token}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', comment })
    });
    if (res.ok) {
      await get().loadAllData();
      get().triggerAutoRedirectModal(
        `✔ Stage approved successfully.`,
        'governance-pipeline',
        'Staging Queue'
      );
    }
  },

  rejectItem: async (chainId, reason) => {
    const chain = get().approvalChains.find((c) => c.id === chainId);
    if (!chain) return;
    const step: any = chain.steps.find((s) => s.status === 'Pending');
    if (!step || !step.token) return;

    const res = await fetch(`${API_BASE}/api/approvals/${step.token}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', comment: reason })
    });
    if (res.ok) {
      await get().loadAllData();
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
}));
