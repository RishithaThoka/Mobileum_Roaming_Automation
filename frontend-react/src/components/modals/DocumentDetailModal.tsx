import React, { useState, useEffect } from 'react';
import { X, FileCode, CheckCircle2, AlertTriangle, ShieldCheck, Download, Code, Layers } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { StatusBadge } from '../common/StatusBadge';

interface DocumentDetailModalProps {
  docId: string | null;
  onClose: () => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({ docId, onClose }) => {
  const { documents, deltas, setSelectedNodeId } = useStore();
  const [activeTab, setActiveTab] = useState<'parsed' | 'xml' | 'deltas' | 'workflow'>('parsed');
  const [workflow, setWorkflow] = useState<any>(null);
  const [loadingWf, setLoadingWf] = useState(false);

  useEffect(() => {
    if (activeTab === 'workflow' && docId) {
      setLoadingWf(true);
      const API_BASE = (import.meta as any).env.VITE_API_URL || '';
      fetch(`${API_BASE}/api/workflow/${docId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }
      })
        .then(res => res.json())
        .then(data => {
          setWorkflow(data);
          setLoadingWf(false);
        })
        .catch(() => setLoadingWf(false));
    }
  }, [activeTab, docId]);

  if (!docId) return null;

  const doc = documents.find((d) => String(d.id) === String(docId));
  if (!doc) return null;

  const docDeltas = deltas.filter((d) => d.docId === docId || d.operator === doc.operatorName);

  // Construct workflow steps dynamically
  const workflowSteps: any[] = [];
  if (workflow) {
    if (workflow.subStages) {
      workflow.subStages.forEach((s: any) => {
        let nodeId = 'node-mail';
        if (s.id === 'comparison') nodeId = 'node-master';
        else if (s.id === 'diff') nodeId = 'node-diff';
        else if (s.id === 'risk') nodeId = 'node-approval';
        workflowSteps.push({
          id: nodeId,
          title: s.title,
          status: s.status
        });
      });
    }
    if (workflow.approvalChain) {
      workflow.approvalChain.forEach((s: any) => {
        workflowSteps.push({
          id: 'node-approval',
          title: `${s.category} (${s.role_title})`,
          status: s.status
        });
      });
    }
    const deployStages = [
      { key: 'staging', title: 'Staging Queue', id: 'node-impl' },
      { key: 'production', title: 'Production Core Switch', id: 'node-impl' },
      { key: 'reconciliation', title: 'SLA Reconciliation', id: 'node-impl' }
    ];
    deployStages.forEach(s => {
      const log = workflow.deployment_logs?.find((l: any) => l.stage === s.key);
      workflowSteps.push({
        id: s.id,
        title: s.title,
        status: log ? log.status : 'pending'
      });
    });
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-xs">
              XML
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-100">{doc.id}</h3>
                <StatusBadge status={doc.status} size="sm" />
              </div>
              <p className="text-xs text-slate-400">{doc.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 shrink-0">
          <button
            onClick={() => setActiveTab('parsed')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'parsed'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Parsed Parameters</span>
          </button>

          <button
            onClick={() => setActiveTab('deltas')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'deltas'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Deltas ({docDeltas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('workflow')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'workflow'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Workflow Pipeline</span>
          </button>

          <button
            onClick={() => setActiveTab('xml')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'xml'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Raw GSMA IR.21 XML</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
          {activeTab === 'parsed' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-mono">OPERATOR</div>
                  <div className="font-bold text-slate-200 mt-0.5">{doc.operatorName}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-mono">MCC / MNC</div>
                  <div className="font-bold text-cyan-400 mt-0.5">{doc.mccMnc}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-mono">RISK RATING</div>
                  <div className="font-bold text-amber-400 mt-0.5">{doc.riskScore}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-200">GSMA IR.21 Ingestion Attributes</div>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div><span className="text-slate-500">Submitted By:</span> {doc.submittedBy}</div>
                  <div><span className="text-slate-500">Ingested Date:</span> {doc.receivedAt}</div>
                  <div><span className="text-slate-500">Document Type:</span> {doc.docType}</div>
                  <div><span className="text-slate-500">File Size:</span> {doc.fileSize}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-slate-200 mb-2">Network Routing Highlights</div>
                <div className="font-mono text-[11px] text-slate-300 space-y-1">
                  <div>Primary GT Prefix: <span className="text-cyan-400">447782000000 / 447782000199</span></div>
                  <div>IMS APN: <span className="text-emerald-400">ims.mnc015.mcc234.gprs</span></div>
                  <div>SEPP FQDN: <span className="text-purple-400">sepp01.vodafone.co.uk</span></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'deltas' && (
            <div className="space-y-3">
              {docDeltas.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No delta anomalies detected in this document.</div>
              ) : (
                docDeltas.map((delta) => (
                  <div key={delta.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{delta.parameterName}</span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                        {delta.impactLevel} Impact
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300">
                        <span className="text-[10px] text-rose-400 block font-sans">OLD BASELINE:</span>
                        {delta.oldValue}
                      </div>
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
                        <span className="text-[10px] text-emerald-400 block font-sans">NEW INCOMING:</span>
                        {delta.newValue}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">End-to-End Baselining Lifecycle Progress</h4>
              
              {loadingWf ? (
                <div className="text-center py-6 text-slate-500">Loading workflow state...</div>
              ) : !workflow ? (
                <div className="text-center py-6 text-slate-500">No active workflow records.</div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center space-x-2 overflow-x-auto py-2 scrollbar-thin">
                    {workflowSteps.map((step, idx) => {
                      const isCompleted = step.status === 'completed' || step.status === 'approved';
                      const isWaiting = step.status === 'pending' || step.status === 'waiting';
                      const isRejected = step.status === 'rejected';

                      let badgeBg = 'bg-slate-950 text-slate-500 border-slate-800';
                      if (isCompleted) {
                        badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                      } else if (isWaiting) {
                        badgeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                      } else if (isRejected) {
                        badgeBg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                      }

                      return (
                        <React.Fragment key={idx}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(step.id);
                            }}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${badgeBg}`}
                            title={`Click to view details for ${step.title}`}
                          >
                            <span>{step.title}</span>
                          </button>
                          {idx < workflowSteps.length - 1 && (
                            <span className="text-slate-800 font-bold font-mono">➔</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-slate-200">Active Workflow Signatures Ledger</div>
                    <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                      {!workflow.signatures || workflow.signatures.length === 0 ? (
                        <div className="text-slate-500">No cryptographic signatures recorded yet.</div>
                      ) : (
                        workflow.signatures.map((sig: any, sidx: number) => (
                          <div key={sidx} className="flex justify-between border-b border-slate-900 pb-1">
                            <span>Role: <strong className="text-slate-300">{sig.role_title}</strong></span>
                            <span>Signed: <strong className="text-slate-300">{sig.signer}</strong> ({sig.decided_at.slice(0, 16).replace('T', ' ')})</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'xml' && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300/90 leading-relaxed overflow-x-auto">
              <pre>{doc.rawXml || `<?xml version="1.0" encoding="UTF-8"?>\n<GSMA_IR21_Document version="${doc.version}">\n  <Operator name="${doc.operatorName}">\n    <MCC>${doc.mccMnc.split('/')[0]}</MCC>\n    <MNC>${doc.mccMnc.split('/')[1]}</MNC>\n  </Operator>\n</GSMA_IR21_Document>`}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 shrink-0 flex items-center justify-between">
          <button
            onClick={() => {
              const element = document.createElement('a');
              const file = new Blob([doc.rawXml || 'IR.21 GSMA payload'], { type: 'text/plain' });
              element.href = URL.createObjectURL(file);
              element.download = `${doc.id}_${doc.operatorName}.xml`;
              document.body.appendChild(element);
              element.click();
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Source File</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
