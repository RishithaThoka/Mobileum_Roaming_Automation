import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Position,
  Handle,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Mail,
  FileCode,
  Upload,
  Database,
  GitBranch,
  GitCompare,
  CheckSquare,
  Workflow,
  RotateCcw,
  FileCheck2,
  Maximize2,
  Bot,
  TrendingUp,
  Layers,
  Server
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';
import { NodeDetailModal } from '../modals/NodeDetailModal';

// Custom React Flow Node Component - Light Theme & High-Contrast Cards
const TelecomWorkflowNode = ({ data }: any) => {
  let borderStyle = 'border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md';
  let badgeStyle = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300';
  let topAccent = 'bg-slate-400';

  if (data.statusState === 'completed') {
    borderStyle = 'border-2 border-emerald-400 dark:border-emerald-500/50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md shadow-emerald-500/10';
    badgeStyle = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 font-bold';
    topAccent = 'bg-emerald-500';
  } else if (data.statusState === 'active') {
    borderStyle = 'border-2 border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-lg shadow-blue-500/20';
    badgeStyle = 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-cyan-300 border border-blue-300 dark:border-blue-500/40 font-bold';
    topAccent = 'bg-blue-500';
  } else if (data.statusState === 'pending') {
    borderStyle = 'border-2 border-amber-400 dark:border-amber-500/50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md shadow-amber-500/10';
    badgeStyle = 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 font-bold';
    topAccent = 'bg-amber-500';
  }

  const Icon = data.icon;

  return (
    <div
      className={`w-64 p-4 rounded-3xl ${borderStyle} transition-all duration-300 hover:scale-105 cursor-pointer relative group overflow-hidden`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${topAccent}`} />

      <Handle type="target" position={Position.Left} className="!bg-blue-600 !w-3 !h-3 !-left-1.5" />

      <div className="flex items-center justify-between mb-2 pt-1">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-blue-600 dark:text-cyan-400 font-bold">
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">STEP {data.stepNumber}</span>
        </div>
        <span className={`px-2.5 py-0.5 text-[10px] font-mono rounded-full ${badgeStyle}`}>
          {data.statusLabel}
        </span>
      </div>

      <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-1">{data.label}</h4>
      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight line-clamp-2">{data.description}</p>

      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>Click for live payload</span>
        <Maximize2 className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
      </div>

      <Handle type="source" position={Position.Right} className="!bg-blue-600 !w-3 !h-3 !-right-1.5" />
    </div>
  );
};

const nodeTypes = {
  telecomNode: TelecomWorkflowNode,
};

const INITIAL_NODES: Node[] = [
  {
    id: 'node-mail',
    type: 'telecomNode',
    position: { x: 30, y: 35 },
    data: {
      stepNumber: '01',
      label: 'Mail Repository Ingest',
      description: 'GSMA InfoExchange & partner email ingestion mailbox daemon',
      statusLabel: 'Completed',
      statusState: 'completed',
      icon: Mail,
    },
  },
  {
    id: 'node-upload',
    type: 'telecomNode',
    position: { x: 30, y: 235 },
    data: {
      stepNumber: '01',
      label: 'Manual Upload Portal',
      description: 'Direct NOC operator upload & emergency hotfix portal',
      statusLabel: 'Completed',
      statusState: 'completed',
      icon: Upload,
    },
  },
  {
    id: 'node-ai',
    type: 'telecomNode',
    position: { x: 310, y: 135 },
    data: {
      stepNumber: '02',
      label: 'AI Extraction & Parsing',
      description: 'OCR Parsing, GSMA Schema Inspection & Field Validation',
      statusLabel: 'Completed',
      statusState: 'completed',
      icon: Bot,
    },
  },
  {
    id: 'node-version',
    type: 'telecomNode',
    position: { x: 590, y: 135 },
    data: {
      stepNumber: '03',
      label: 'Version Comparison',
      description: 'Compare Ingested File with Master Repository Baseline',
      statusLabel: 'Completed',
      statusState: 'completed',
      icon: GitBranch,
    },
  },
  {
    id: 'node-diff',
    type: 'telecomNode',
    position: { x: 870, y: 135 },
    data: {
      stepNumber: '04',
      label: 'Difference Analysis',
      description: 'Identifies SCCP GT, APN, IMSI, and IOT rate discrepancies',
      statusLabel: 'Delta Alert',
      statusState: 'active',
      icon: GitCompare,
    },
  },
  {
    id: 'node-risk',
    type: 'telecomNode',
    position: { x: 1150, y: 135 },
    data: {
      stepNumber: '05',
      label: 'Risk Assessment',
      description: 'Evaluate Revenue Protection, Affected MNOs & Risk Matrix',
      statusLabel: 'Pending',
      statusState: 'pending',
      icon: TrendingUp,
    },
  },
  {
    id: 'node-approval',
    type: 'telecomNode',
    position: { x: 1430, y: 135 },
    data: {
      stepNumber: '06',
      label: 'Approval Chain',
      description: 'Stage-gated authorization for CMO, CTO, and Security Officer',
      statusLabel: 'Pending Sign-off',
      statusState: 'pending',
      icon: CheckSquare,
    },
  },
  {
    id: 'node-staging',
    type: 'telecomNode',
    position: { x: 1710, y: 135 },
    data: {
      stepNumber: '07',
      label: 'Staging Queue Buffer',
      description: 'NETCONF / RESTCONF Script Generation & Buffer Queue',
      statusLabel: 'Upcoming',
      statusState: 'pending',
      icon: Layers,
    },
  },
  {
    id: 'node-impl',
    type: 'telecomNode',
    position: { x: 1990, y: 135 },
    data: {
      stepNumber: '08',
      label: 'Production Provisioning',
      description: 'Closed-Loop Multi-System Switch Write Execution',
      statusLabel: 'Upcoming',
      statusState: 'pending',
      icon: Server,
    },
  },
  {
    id: 'node-recon',
    type: 'telecomNode',
    position: { x: 2270, y: 135 },
    data: {
      stepNumber: '09',
      label: 'SLA Reconciliation',
      description: 'Digital Twin Signalling SLA Verification & Diagnostics',
      statusLabel: 'Upcoming',
      statusState: 'pending',
      icon: Workflow,
    },
  },
  {
    id: 'node-rollback',
    type: 'telecomNode',
    position: { x: 2550, y: 135 },
    data: {
      stepNumber: '10',
      label: 'Rollback Safety Engine',
      description: 'Instant baseline snapshot restoration on SLA alert',
      statusLabel: 'Standby',
      statusState: 'pending',
      icon: RotateCcw,
    },
  },
  {
    id: 'node-audit',
    type: 'telecomNode',
    position: { x: 2830, y: 135 },
    data: {
      stepNumber: '11',
      label: 'Immutable Audit Log',
      description: 'GSMA regulatory compliance and audit trail recorder',
      statusLabel: 'Logging',
      statusState: 'completed',
      icon: FileCheck2,
    },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1a-2', source: 'node-mail', target: 'node-ai', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e1b-2', source: 'node-upload', target: 'node-ai', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e2-3', source: 'node-ai', target: 'node-version', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e3-4', source: 'node-version', target: 'node-diff', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e4-5', source: 'node-diff', target: 'node-risk', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e5-6', source: 'node-risk', target: 'node-approval', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e6-7', source: 'node-approval', target: 'node-staging', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e7-8', source: 'node-staging', target: 'node-impl', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e8-9', source: 'node-impl', target: 'node-recon', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e9-10', source: 'node-recon', target: 'node-rollback', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
  { id: 'e10-11', source: 'node-rollback', target: 'node-audit', animated: true, style: { stroke: '#94A3B8', strokeWidth: 3 } },
];

export const WorkflowVisualization: React.FC = () => {
  const { currentWorkflowStepId, documents } = useStore();
  const activeDoc = documents[0];

  const getCompletedStepForDoc = (status: string): number => {
    switch (status) {
      case 'Received': return 1;
      case 'Pending Review': return 3;
      case 'In Delta Check': return 4;
      case 'Awaiting Sign-off': return 5;
      case 'Approved': return 6;
      case 'Provisioned': return 9;
      case 'Rolled Back': return 10;
      default: return 4;
    }
  };

  const completedStep = activeDoc ? getCompletedStepForDoc(activeDoc.status) : 4;

  const dynamicNodes = INITIAL_NODES.map((node) => {
    const stepNum = parseInt(node.data.stepNumber, 10);
    let statusState = 'pending';
    let statusLabel = 'Upcoming';

    if (stepNum < completedStep) {
      statusState = 'completed';
      statusLabel = 'Completed';
    } else if (stepNum === completedStep) {
      statusState = 'active';
      statusLabel = 'Active';
    } else {
      statusState = 'pending';
      statusLabel = 'Upcoming';
    }

    // Give visual focus to the tab/step currently selected by the user
    const isCurrentTab = stepNum === currentWorkflowStepId;
    if (isCurrentTab && statusState !== 'completed') {
      statusState = 'active';
    }

    return {
      ...node,
      data: {
        ...node.data,
        statusState,
        statusLabel,
      },
    };
  });

  const dynamicEdges = INITIAL_EDGES.map((edge) => {
    // Color edges based on source node status
    const sourceNode = dynamicNodes.find(n => n.id === edge.source);
    let stroke = '#94A3B8'; // default slate-400
    if (sourceNode?.data.statusState === 'completed') {
      stroke = '#10B981'; // emerald-500
    } else if (sourceNode?.data.statusState === 'active') {
      stroke = '#3B82F6'; // blue-500
    }

    return {
      ...edge,
      style: {
        ...edge.style,
        stroke,
      }
    };
  });

  const [nodes, , onNodesChange] = useNodesState(dynamicNodes);
  const [edges, , onEdgesChange] = useEdgesState(dynamicEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Sync state with dynamic updates from store
  React.useEffect(() => {
    onNodesChange(dynamicNodes.map(n => ({ type: 'reset', item: n } as any)));
    onEdgesChange(dynamicEdges.map(e => ({ type: 'reset', item: e } as any)));
  }, [currentWorkflowStepId, completedStep]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onInit = useCallback((reactFlowInstance: any) => {
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.05 });
    }, 50);
  }, []);

  return (
    <div className="h-[395px] flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Sub-header Legend & Status Bar */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 shadow-sm text-xs">
        <div className="flex items-center space-x-2">
          <Workflow className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          <p className="text-slate-600 dark:text-slate-400">
            Powered by React Flow. Color legend: <span className="text-emerald-600 dark:text-emerald-400 font-bold">Green = Completed</span>, <span className="text-blue-600 dark:text-cyan-400 font-bold">Glowing Blue = Active</span>, <span className="text-amber-600 dark:text-amber-400 font-bold">Orange = Pending</span>.
          </p>
          <HelpTooltip
            title="React Flow Workflow Diagram"
            explanation="Visual representation of how IR.21/RAEX files traverse from ingestion down to core switch provisioning and audit logging."
            telecomContext="Click on any node to inspect raw JSON payloads, live parameters, and execute stage actions."
          />
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Ingestion OK</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-cyan-300 rounded-xl font-bold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-cyan-400" />
            <span>Delta Engine Active</span>
          </div>
        </div>
      </div>

      {/* React Flow Canvas Container */}
      <div className="flex-1 w-full relative bg-slate-50 dark:bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05 }}
          minZoom={0.15}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#cbd5e1" />
          <Controls />
        </ReactFlow>
      </div>

      {/* Node Detail Modal */}
      <NodeDetailModal nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
    </div>
  );
};
