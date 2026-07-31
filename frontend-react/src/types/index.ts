export type UserRole =
  | 'Admin'
  | 'Analyst'
  | 'Document Reviewer'
  | 'CMO'
  | 'CTO'
  | 'Security'
  | 'Finance'
  | 'Network Operations'
  | 'Partner Operator'
  | 'Read Only Auditor';

export type ProductTier = 'Tier 1 - Entry' | 'Tier 2 - Mid' | 'Tier 3 - Advanced';

export type StepStatus = 'completed' | 'current' | 'upcoming' | 'rejected' | 'waiting';

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
  category: 'Network/Technical' | 'Security' | 'Commercial' | 'Financial/Billing' | 'Legal/Compliance' | 'Operations';
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
  | 'settings';
