import React from 'react';
import { X, Play, CheckCircle2, AlertTriangle, FileText, Database, ShieldCheck, RotateCcw } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface NodeDetailModalProps {
  nodeId: string | null;
  onClose: () => void;
}

const NODE_DETAILS: Record<string, { title: string; subtitle: string; description: string; icon: any; samplePayload: string; status: string }> = {
  'node-mail': {
    title: '1. Mail Repository & Exchange Auto-Ingest',
    subtitle: 'GSMA InfoExchange Email Ingestion Daemon',
    description: 'Monitors inbound SMTP mailboxes from global roaming partners (Vodafone, Mobily, AT&T). Automatically extracts IR.21 XML & RAEX attachments.',
    icon: FileText,
    status: 'Completed (Green)',
    samplePayload: `{
  "protocol": "IMAPS / OAuth2",
  "mailbox": "ir21-ingest@mobileum.com",
  "active_watchers": 14,
  "daily_throughput": "142 files/day",
  "last_check": "2026-07-22 14:15:02"
}`,
  },
  'node-raex': {
    title: '2. RAEX OpData / IOT Parser',
    subtitle: 'Automated GSMA Schema Validation',
    description: 'Validates RAEX OpData Table 3.1 & IOT rate files against GSMA official XML schemas. Flags malformed XML headers.',
    icon: Database,
    status: 'Completed (Green)',
    samplePayload: `{
  "parser_engine": "Mobileum XML-v14.2",
  "validation_status": "PASSED_SCHEMA_V14.2",
  "parsed_nodes": 1420,
  "schema_checksum": "SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}`,
  },
  'node-upload': {
    title: '3. Manual Upload & Hotfix Portal',
    subtitle: 'NOC & Partner Portal Override Endpoint',
    description: 'Allows Network Operations or Partner Operators to directly upload IR.21 tables or emergency routing hotfixes with digital signature verification.',
    icon: Play,
    status: 'Completed (Green)',
    samplePayload: `{
  "portal_auth": "Bearer RSA2048-JWT",
  "allowed_roles": ["Admin", "Analyst", "Partner Operator"],
  "hotfix_policy": "Strict Digital Signature Required"
}`,
  },
  'node-master': {
    title: '4. Master Roaming Repository',
    subtitle: 'Golden Baseline Telecom Database',
    description: 'Centralized active configuration repository containing baseline GT routing, APN core specs, and active IOT discount agreements.',
    icon: Database,
    status: 'Active Baseline (Blue)',
    samplePayload: `{
  "total_mno_baselines": 412,
  "database": "PostgreSQL + Prisma Replication",
  "sync_state": "IN_SYNC",
  "active_version": "v2026.7.22"
}`,
  },
  'node-diff': {
    title: '5. Delta Difference Engine',
    subtitle: 'Automated Anomaly & Discrepancy Detection',
    description: 'Compares incoming IR.21 XML with Master Baseline. Automatically isolates GT, APN, IMSI range, and IOT rate differences.',
    icon: AlertTriangle,
    status: 'Active Glow (Delta Alert)',
    samplePayload: `{
  "delta_engine": "Mobileum SmartDiff v4",
  "detected_deltas": [
    {"param": "SEPP IP", "old": "195.219.124.10", "new": "195.219.124.88", "impact": "CRITICAL"},
    {"param": "Primary GT", "old": "447782000100", "new": "447782000199", "impact": "MODERATE"}
  ]
}`,
  },
  'node-approval': {
    title: '6. Stage Governance Approval Chain',
    subtitle: 'Multi-Role Sign-Off Gatekeeper',
    description: 'Routes delta alerts to designated role reviewers (CMO for commercial, CTO for technical architecture, Security for IPsec).',
    icon: ShieldCheck,
    status: 'Pending Sign-Off (Orange)',
    samplePayload: `{
  "current_stage": "CTO Sign-off",
  "stage_1_reviewer": "Document Reviewer (PASSED)",
  "stage_2_cmo": "CMO Office (PASSED)",
  "stage_3_cto": "CTO Office (PENDING)",
  "stage_4_sec": "Security Officer (QUEUED)"
}`,
  },
  'node-impl': {
    title: '7. Core Network Provisioning',
    subtitle: 'Automated Routing Table Deployment',
    description: 'Deploys approved GT routing, Diameter routing agent (DRA) specs, and APN parameters into live core telecom switches.',
    icon: CheckCircle2,
    status: 'Queued (Pending)',
    samplePayload: `{
  "provisioning_target": "DRA Cluster Alpha / Ericsson HLR",
  "execution_method": "NETCONF / RESTCONF API",
  "dry_run": "SUCCESSFUL",
  "scheduled_window": "IMMEDIATE_UPON_APPROVAL"
}`,
  },
  'node-rollback': {
    title: '8. Automated Rollback Center',
    subtitle: 'Instant Snapshot Restoration Engine',
    description: 'Monitors network KPI alarms post-provisioning. Enables 1-click restoration to previous baseline snapshot if degradation occurs.',
    icon: RotateCcw,
    status: 'Standby / Ready',
    samplePayload: `{
  "snapshot_active": "SNAP-2026-0719 (v14.1.9)",
  "kpi_monitor": "SS7/Diameter SLA > 99.9%",
  "auto_rollback": "ENABLED"
}`,
  },
  'node-audit': {
    title: '9. Immutable Audit Trail',
    subtitle: 'GSMA Regulatory Compliance & Logging',
    description: 'Logs every parameter change, approval signature, and rollback event into an immutable compliance ledger.',
    icon: FileText,
    status: 'Active Logging',
    samplePayload: `{
  "compliance_framework": "GSMA IR.21 v14 / SOC2 Type II",
  "audit_integrity": "CRYPTOGRAPHICALLY_VERIFIED",
  "retention_period": "7 Years"
}`,
  }
};

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ nodeId, onClose }) => {
  const { setActiveTab } = useStore();

  if (!nodeId) return null;

  const nodeInfo = NODE_DETAILS[nodeId] || NODE_DETAILS['node-master'];
  const Icon = nodeInfo.icon;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{nodeInfo.title}</h3>
              <p className="text-xs text-blue-600 dark:text-cyan-400 font-mono">{nodeInfo.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 space-y-4 text-xs">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 font-mono font-bold">STATUS STATE</div>
            <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{nodeInfo.status}</div>
            <p className="text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">{nodeInfo.description}</p>
          </div>

          <div>
            <div className="text-[10px] font-mono text-slate-500 mb-1 font-bold">LIVE TELECOM JSON PAYLOAD</div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 font-mono text-[11px] text-cyan-300 overflow-x-auto shadow-inner">
              <pre>{nodeInfo.samplePayload}</pre>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              if (nodeId === 'node-diff') setActiveTab('difference-checker');
              else if (nodeId === 'node-approval') setActiveTab('approval-workflow');
              else if (nodeId === 'node-rollback') setActiveTab('rollback-center');
              else if (nodeId === 'node-mail') setActiveTab('email-center');
              else setActiveTab('master-repo');
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-colors"
          >
            Launch Module View
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Close Node Details
          </button>
        </div>
      </div>
    </div>
  );
};
