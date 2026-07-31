import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck, Mail } from 'lucide-react';

interface TokenApprovalViewProps {
  token: string;
}

export const TokenApprovalView: React.FC<TokenApprovalViewProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [signatureName, setSignatureName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetails = async () => {
    try {
      // @ts-ignore
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE}/api/approvals/token/${token}`);
      if (!res.ok) {
        throw new Error('This link is invalid or expired.');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load approval request.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [token]);

  const handleSubmit = async (action: 'approve' | 'reject') => {
    if (!signatureName.trim()) {
      alert('Please enter your signature name to authorize.');
      return;
    }
    if (!confirmed) {
      alert('Please check the confirmation box.');
      return;
    }
    setSubmitting(true);
    try {
      const commentWithSignature = `Approved by ${signatureName}. Comment: ${comment || 'None'}`;
      // @ts-ignore
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE}/api/approvals/${token}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: commentWithSignature })
      });
      if (res.ok) {
        alert(action === 'approve' ? 'Workflow stage successfully authorized!' : 'Workflow stage rejected and sent back.');
        await fetchDetails(); // reload to get read-only state
      } else {
        const errJson = await res.json();
        alert(errJson.error || 'Failed to submit decision');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 font-mono text-xs mt-3">Verifying Secure Access Token...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl animate-in fade-in zoom-in-95">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-white">Access Denied / Expired</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'The cryptographic token provided is either invalid, already signed, or has expired. Please check your notification link.'}
          </p>
        </div>
      </div>
    );
  }

  const { step, document, operator, diffItems } = data;
  const isDecided = step.status === 'approved' || step.status === 'rejected';

  // Retrieve country metadata
  const countryFlags: Record<string, string> = {
    'Saudi Arabia': '🇸🇦',
    'Germany': '🇩🇪',
    'United Kingdom': '🇬🇧',
    'United States': '🇺🇸',
    'United Arab Emirates': '🇦🇪',
    'Netherlands': '🇳🇱',
    'Kuwait': '🇰🇼',
    'Bahrain': '🇧🇭',
    'Qatar': '🇶🇦',
    'Oman': '🇴🇲',
    'India': '🇮🇳',
    'France': '🇫🇷',
    'Singapore': '🇸🇬',
    'Switzerland': '🇨🇭'
  };
  const flag = countryFlags[operator.country] || '🌐';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-900/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-900/10 blur-3xl" />

      <div className="max-w-4xl mx-auto space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white block">MOBILEUM</span>
              <span className="text-[9px] text-cyan-400 font-mono tracking-wider">STAGE GOVERNANCE PORTAL</span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
            SECURE ROUTE: SCOPED APPROVER
          </span>
        </div>

        {/* Info Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <span className="text-[10px] font-mono font-bold text-amber-500 block uppercase">Pending Action Request</span>
              <h2 className="text-lg font-black text-white mt-1">
                Authorize {step.category} Parameters
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Baseline updates for <strong className="text-slate-200">{flag} {operator.name} ({operator.country})</strong>
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] text-slate-500 font-mono block">REQUESTED AT</span>
              <span className="text-xs font-mono text-slate-300 font-bold">{step.notified_at.replace('T', ' ').slice(0, 16)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Target Document</div>
              <div className="font-extrabold text-white mt-0.5">{document.title}</div>
            </div>
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Approver Persona</div>
              <div className="font-extrabold text-blue-400 mt-0.5">{step.role_title}</div>
            </div>
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Review Priority</div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-block mt-1">
                Critical Check
              </span>
            </div>
          </div>
        </div>

        {/* DECISION SUMMARY (If Already Completed) */}
        {isDecided && (
          <div className={`p-6 border rounded-3xl flex items-start space-x-4 shadow-xl ${
            step.status === 'approved' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {step.status === 'approved' ? (
              <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
            )}
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">This Request has been Decided</h3>
              <p className="text-xs opacity-95 leading-relaxed">
                You successfully <strong className="uppercase">{step.status}</strong> this stage on <span className="font-mono">{step.decided_at.slice(0, 16).replace('T', ' ')}</span>. No further changes can be submitted via this token link.
              </p>
              {step.comment && (
                <div className="mt-3 p-3 bg-slate-950/60 rounded-xl text-xs font-mono text-slate-300 border border-slate-800">
                  <span className="font-bold block opacity-60 uppercase text-[9px]">Decision Signature Log:</span>
                  {step.comment}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scoped Parameters Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider text-slate-200">Scoped Parameters review ({step.category})</h3>
          </div>

          {diffItems.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              No parameter differences found matching the {step.category} domain.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-2.5">Parameter Field</th>
                    <th className="py-2.5">Original Baseline</th>
                    <th className="py-2.5">Restructured Update</th>
                    <th className="py-2.5 text-right">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {diffItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-950/20">
                      <td className="py-3 font-mono font-bold text-slate-200">{item.field_path}</td>
                      <td className="py-3 text-rose-400 font-mono line-through">{item.old_value || '—'}</td>
                      <td className="py-3 text-emerald-400 font-mono font-bold">{item.new_value || '—'}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                          item.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {item.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Emailed Alert Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
            <Mail className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider text-slate-200">Email Notification Alert Payload</h3>
          </div>
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs space-y-2 max-h-60 overflow-y-auto text-slate-300 scrollbar-thin">
            <div className="border-b border-slate-800 pb-2 text-[10px] text-slate-500 font-mono uppercase space-y-1">
              <div><strong>Recipient:</strong> {step.approver_email}</div>
              <div><strong>Subject:</strong> Action Required: Baseline Stage Governance Review</div>
            </div>
            <div className="pt-2 font-sans space-y-3 leading-relaxed text-xs">
              <p>Hello {step.approver_name || step.role_title},</p>
              <p>
                A new roaming document ingestion baselining action is pending your review. 
                Below are the details of the parameters isolation matching your domain authority checklist:
              </p>
              <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-cyan-400">
                <li>Operator Name: {operator.name}</li>
                <li>MCC/MNC: {operator.network_code}</li>
                <li>Document Class: {document.doc_type}</li>
                <li>Verification Token: {step.token.slice(0, 8)}...</li>
              </ul>
              <p>Please authorize or reject these changes using the secure decision controls below.</p>
            </div>
          </div>
        </div>

        {/* DECISION SIGN-OFF PANEL */}
        {!isDecided && (
          <div className="bg-slate-900 border-2 border-blue-900 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
              <ShieldCheck className="w-5 h-5 text-blue-400 animate-pulse" />
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider text-slate-200">Cryptographic Signature Attestation</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                  Add Decision Comments / Audit Log Details
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Enter comments about this parameter sign-off..."
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Type Full Name as Digital Signature
                  </label>
                  <input
                    type="text"
                    required
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    placeholder="Approver Full Name"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-start space-x-2.5 cursor-pointer select-none text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      I attest that I have reviewed the parameter differences isolated above and hereby commit my signature.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleSubmit('approve')}
                disabled={submitting}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-50 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Grant Stage Approval</span>
              </button>

              <button
                onClick={() => handleSubmit('reject')}
                disabled={submitting}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject & Rollback Stage</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
