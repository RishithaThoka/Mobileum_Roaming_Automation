export type UserRole =
  | 'Admin'
  | 'Analyst'
  | 'Approver'
  | 'CPO/Exec'
  | 'Auditor';

export type ProductTier = 'Tier 1 - Entry' | 'Tier 2 - Mid' | 'Tier 3 - Advanced';

export type StepStatus = 'completed' | 'current' | 'upcoming' | 'rejected' | 'waiting' | 'not_applicable';

export interface WorkflowStepDefinition {
  id: number;
  tabKey: NavigationTab;
  title: string;
  subtitle: string;
  status: StepStatus;
  owner: string;
  estimatedTime: string;
  prerequisiteStepIds: number[];
  isRequiredActionDone: boolean;
  validationErrorMessage?: string;
  nextStepName: string;
}

// ── Backend workflow API response shapes ───────────────────────────────────────

export interface BackendSubstage {
  id: 'extraction' | 'comparison' | 'diff' | 'risk';
  title: string;
  status: 'pending' | 'complete' | 'failed' | 'not_applicable';
  completed_at: string | null;
  error_message: string | null;
  reason: string | null;
  legacy_inferred: boolean;
}

export interface WorkflowApiResponse {
  state: {
    id: string;
    document_id: string;
    current_screen: number;
    // running | ready_for_approval | in_approval | approved | rejected
    // deploying | deployed | failed | rolled_back
    stage_status: string;
    updated_at: string;
  };
  subStages: BackendSubstage[];
  payloadData: {
    extraction: any;
    comparison: { baseline: string; latest: string };
    diff: any[];
    risk: { level: string; details: string };
  };
  domains: string[];
  approvalChain: Array<{
    domain: string;
    role: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    signature: any | null;
  }>;
  signatures: any[];
  deployment_logs: Array<{
    id: string;
    document_id: string;
    system: string;
    scope: string;
    order_executed: number;
    pass_fail: 'pass' | 'fail';
    rollback_triggered: number;
    timestamp: string;
  }>;
}

export interface RolePermission {
  role: UserRole;
  label: string;
  description: string;
  badgeColor: string;
  canApproveCommercial: boolean;
  canApproveTechnical: boolean;
  canApproveSecurity: boolean;
  canExecuteRollback: boolean;
  canEditMasterRepo: boolean;
  canUploadDocuments: boolean;
  visibleFields: string[];
}

export type DocumentSource = 'Mail Repository' | 'Auto RAEX Import' | 'Manual Upload';

export type DocumentType = 'IR.21 XML' | 'RAEX OpData' | 'RAEX IOT' | 'TAP/BEE Config' | 'Manual Override';

export type StatusType =
  | 'Received'
  | 'Pending Review'
  | 'In Delta Check'
  | 'Awaiting Sign-off'
  | 'Approved'
  | 'Rejected'
  | 'Provisioned'
  | 'Rolled Back';

export interface RoamingDocument {
  id: string;
  title: string;
  operatorName: string;
  mccMnc: string;
  country: string;
  docType: DocumentType;
  source: DocumentSource;
  version: string;
  previousVersion?: string;
  submittedBy: string;
  receivedAt: string;
  modifiedDate: string;
  author: string;
  status: StatusType;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected' | 'Changes Requested';
  deltaCount: number;
  riskScore: 'Low' | 'Medium' | 'High' | 'Critical';
  fileSize: string;
  rawXml?: string;
  commitComment?: string;
}

export interface ParameterDelta {
  id: string;
  docId: string;
  operator: string;
  category: string;
  changeType: 'Added' | 'Removed' | 'Modified';
  parameterName: string;
  oldValue: string;
  newValue: string;
  impactLevel: 'Minor' | 'Moderate' | 'Critical';
  priority: 'P1 - High' | 'P2 - Medium' | 'P3 - Low';
  affectedTeams: string[];
  affectedCountries: string[];
  affectedServices: string[];
  status: 'Unresolved' | 'Approved' | 'Overridden' | 'Flagged';
  aiAnalysis?: {
    summary: string;
    businessImpact: string;
    risk: string;
    suggestedApprovers: UserRole[];
    implementationNotes: string;
    rollbackRecommendation: string;
  };
  comparedVersion?: {
    current: string;
    against: string;
    current_filename: string;
    against_filename: string;
  };
}

export interface ApprovalChainStep {
  role: UserRole;
  label: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Skipped';
  approverName?: string;
  approverEmail?: string;
  mailContent?: string;
  timestamp?: string;
  comments?: string;
}

export interface ConfigurableApprovalChain {
  id: string;
  docId: string;
  docTitle: string;
  operator: string;
  country: string;
  riskScore: 'Low' | 'Medium' | 'High' | 'Critical';
  currentStageIndex: number;
  steps: ApprovalChainStep[];
  status: 'Pending' | 'Approved' | 'Rejected' | 'In Progress';
  submittedAt?: string;
  currentStage?: string;
  requiredRole?: UserRole;
  deltasSummary?: string;
  assignedTo?: string;
}

export interface RollbackVersionSnapshot {
  id: string;
  versionNumber: string;
  previousVersion: string;
  operator: string;
  mccMnc: string;
  timestamp: string;
  author: string;
  comment: string;
  activeConfiguration: string;
  restoredFromVersion?: string;
  rollbackRisk: 'Safe' | 'Moderate' | 'Requires Outage Window';
  status: 'Active Baseline' | 'Archived' | 'Pending Rollback';
  version?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  priority: 'Critical' | 'High' | 'Normal';
  timestamp: string;
  read: boolean;
  isEscalation?: boolean;
  actionUrl?: string;
}

export type OutlookEmailCategory =
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Rollback Alert'
  | 'Reminder'
  | 'Escalation'
  | 'Completion';

export interface EmailMessage {
  id: string;
  sender: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  receivedDate: string;
  category: OutlookEmailCategory;
  hasAttachment: boolean;
  attachmentName?: string;
  attachmentType?: DocumentType;
  body: string;
  processedStatus: 'Auto-Ingested' | 'Pending Ingestion' | 'Failed Schema Validation';
}

export interface ConnectedOperator {
  id: string;
  name: string;
  code: string;
  mccMnc: string;
  country: string;
  region: string;
  flag: string;
  agreements: {
    voice2G3G: boolean;
    lte4G: boolean;
    volte: boolean;
    nr5G: boolean;
    v2x: boolean;
  };
  lastIr21Update: string;
  raexStatus: 'Synced' | 'Pending Delta' | 'Action Required';
  totalRoamingPartners: number;
  roamingTrafficGb: number;
  lat: number;
  lng: number;
}

export interface SystemIntegrationItem {
  systemName: string;
  type: 'Network' | 'Steering' | 'Billing' | 'Digital' | 'WSMS' | 'Third Party Vendor' | 'RAEX' | 'SMTP';
  readSupport: boolean;
  writeSupport: boolean;
  vendorWriteSupport: boolean;
  notApplicable: boolean;
  protocol: string;
  status: 'Active' | 'Configured' | 'Standby';
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: string;
  targetResource: string;
  details?: string;
  oldValue?: string;
  newValue?: string;
  whyReason?: string;
  ipAddress: string;
  comments?: string;
  approvalDecision?: 'Approved' | 'Rejected' | 'Overridden' | 'Pending';
  complianceStatus: 'GSMA Compliant' | 'Manual Override Audit' | 'Security Checked';
}

export type NavigationTab =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'executive-dashboard'
  | 'tier-model'
  | 'ai-roadmap'
  | 'managed-services'
  | 'integration-matrix'
  | 'governance-pipeline'
  | 'digital-twin'
  | 'reconciliation'
  | 'documents'
  | 'document-viewer'
  | 'master-repo'
  | 'version-control'
  | 'difference-checker'
  | 'approval-workflow'
  | 'workflow-viz'
  | 'notifications'
  | 'email-center'
  | 'audit-logs'
  | 'rollback-center'
  | 'operators'
  | 'global-map'
  | 'partners'
  | 'analytics'
  | 'ai-assistant'
  | 'settings'
  | 'users'
  | 'admin-rules'
  | 'admin-catalog'
  | 'admin-overrides'
  | 'rejected-items';


// ── Document Viewer / Field Editor ────────────────────────────────────────────

export type OwnerSource = 'auto' | 'catalog' | 'override' | 'fallback';

export interface DocFieldEntry {
  path: string;          // e.g. "General.Operator Name"
  section: string;       // e.g. "General"
  label: string;         // e.g. "Operator Name"
  value: string;
  domain: string;        // e.g. "Commercial (IOT)"
  owner_source: OwnerSource;
  rule_version: number;
  editable: boolean;     // pre-computed by server based on user's role/domains
  flagged?: boolean;     // multi-domain conflict
  duplicate?: boolean;   // ambiguous label in source doc
}

export interface ApprovalStepDetail {
  id: string;
  step_order: number;
  category: string;
  role_title: string;
  status: 'pending' | 'approved' | 'rejected' | 'waiting' | 'skipped';
  routing_note: string | null;
  self_approval_excluded_user_id: string | null;
  // derived label (computed in viewer from routing_note + category)
  displayLabel: string;
  isAutoTier: boolean;            // true = Admin Pre-Review from auto_tier policy
  isSelfApprovalFallback: boolean; // true = rerouted because editor was only approver
}

export interface DocFieldValue {
  value: string;
  owner_domain: string;
  owner_source: OwnerSource;
  pending_owner_confirmation: boolean;
  editable: boolean;
  locked_reason: string | null;
}

export interface DocFieldsResponse {
  document: {
    id: string;
    title: string;
    doc_type: string;
    operator_name: string | null;
    operator_country: string | null;
  };
  base_version_id: string;
  base_version_number: number;
  fields: Record<string, DocFieldValue>;  // each value is an object, NOT a raw string
  edit_locked: boolean;
  pending_diff_id: string | null;
  // approval steps for the active diff (only present when edit_locked=true)
  approval_steps?: ApprovalStepDetail[];
}

// ── Admin Ownership Engine ─────────────────────────────────────────────────────

export interface AdminRule {
  id: string;
  domain: string;
  match_field: 'label' | 'path' | 'section';
  keywords: string[];   // parsed from comma-separated DB column
  priority: number;
  active: boolean;
  created_at?: string;
}

export interface CatalogEntry {
  id: string;
  field_path: string;
  domain: string;
  doc_type: string;      // '*' = any
  operator_id: string | null; // null = any
  active: boolean;
  flagged?: boolean;     // e.g. multi-domain conflict noted at seed time
  source_note?: string;  // e.g. 'GSMA TS.34 §4.2'
}

export interface Override {
  id: string;
  field_path: string;
  domain: string;
  operator_id: string | null; // null = global
  operator_name?: string;     // resolved for display
  created_at: string;
}
