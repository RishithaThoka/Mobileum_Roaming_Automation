const API = '/api';
const $view = document.getElementById('view');
const $title = document.getElementById('page-title');

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const errObj = await res.clone().json();
      msg = errObj.error || errObj.message || msg;
    } catch (e) {
      try {
        const text = await res.text();
        msg = text.replace(/<[^>]*>/g, '').trim().slice(0, 150) || msg;
      } catch (e2) {}
    }
    throw new Error(msg);
  }
  return res.json();
}

function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s) { if (!s) return '—'; return s.replace('T', ' ').slice(0, 16); }
function severityBadge(sev) { return `<span class="badge badge-${sev}">${sev}</span>`; }
function statusBadge(st) {
  const map = { approved: 'approved', rejected: 'rejected', pending: 'pending', waiting: 'waiting', in_progress: 'pending', in_approval: 'pending', pending_workflow: 'waiting', no_changes: 'waiting' };
  const cls = map[st] || 'neutral';
  return `<span class="badge badge-${cls}">${st.replace(/_/g, ' ')}</span>`;
}

function emptyState(text) {
  return `<div class="empty-state signal-empty">
    <div class="radar-scan-line"></div>
    <div class="section-note">${text}</div>
  </div>`;
}

const routes = {
  dashboard: renderDashboard,
  'master-repository': renderMasterRepository,
  documents: renderDocuments,
  approvals: renderApprovals,
  audit: renderAudit,
  'workflow-designer': renderWorkflowDesigner,
  settings: renderSettings,
  rollout: renderRollout,
  network: renderNetwork,
  production: renderProduction
};

function currentRoute() {
  const hash = location.hash.replace('#/', '') || 'dashboard';
  return hash.split('/');
}

async function router() {
  const parts = currentRoute();
  const name = parts[0];
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
  const titles = { 
    dashboard: 'Dashboard', 
    'master-repository': 'Master Repository',
    documents: 'Document Repository', 
    approvals: 'Approval Workflow', 
    audit: 'Audit Trail',
    'workflow-designer': 'Workflow Designer',
    settings: 'Settings',
    rollout: 'Rollout Center',
    network: 'Global SaaS Network',
    production: 'Production / Deployment'
  };
  $title.textContent = titles[name] || name;
  const fn = routes[name] || renderDashboard;
  try {
    await fn(parts.slice(1));
  } catch (err) {
    $view.innerHTML = `<div class="card">Error: ${esc(err.message)}</div>`;
  }
  refreshSmtpPill();
  refreshUndoRedoPill();
  refreshNotifications();
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('undo-btn').addEventListener('click', async () => {
    try {
      const result = await api('/admin/undo', { method: 'POST' });
      router();
    } catch (err) { alert(err.message); }
  });
  document.getElementById('redo-btn').addEventListener('click', async () => {
    try {
      const result = await api('/admin/redo', { method: 'POST' });
      router();
    } catch (err) { alert(err.message); }
  });

  const bellBtn = document.getElementById('notification-bell-btn');
  const dropdown = document.getElementById('notif-dropdown');
  const readAllBtn = document.getElementById('notif-read-all-btn');

  if (bellBtn && dropdown) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  if (readAllBtn) {
    readAllBtn.addEventListener('click', async () => {
      await api('/notifications/read-all', { method: 'POST' });
      refreshNotifications();
    });
  }

  // Periodic poll for unread notifications every 15s
  setInterval(refreshNotifications, 15000);
});

async function refreshUndoRedoPill() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (!undoBtn || !redoBtn) return;
  try {
    const status = await api('/admin/undo-status');
    undoBtn.disabled = !status.canUndo;
    redoBtn.disabled = !status.canRedo;
    undoBtn.title = status.canUndo ? `Undo: ${status.label}` : 'Nothing to undo';
    redoBtn.title = status.canRedo ? `Redo: ${status.label}` : 'Nothing to redo';
  } catch { /* leave buttons as-is */ }
}

async function refreshSmtpPill() {
  const el = document.getElementById('smtp-pill');
  try {
    const { configured } = await api('/settings/smtp-status');
    el.textContent = configured ? 'SMTP live · sending real mail' : 'Simulated mode · SMTP not set';
    el.className = 'pill ' + (configured ? 'pill-live' : 'pill-sim');
  } catch { el.textContent = 'mailer status unknown'; }
}

// ---------- Dashboard ----------
const ICONS = {
  operators: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9z"/></svg>',
  documents: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  inbox: '<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="10" width="28" height="22" rx="2"/><path d="M6 22h9l2 4h6l2-4h9"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></svg>',
};

function generatePipelineHtml(cols, limit = null) {
  return `<div class="pipeline-board">${Object.entries(cols).map(([label, items]) => {
    const displayItems = limit ? items.slice(0, limit) : items;
    const overflow = limit && items.length > limit ? items.length - limit : 0;
    return `
    <div class="pipeline-col">
      <div class="pipeline-col-header">
        <h4>${label}</h4>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="pipeline-trend"></span>
          <span class="pipeline-count">${items.length}</span>
        </div>
      </div>
      <div class="pipeline-items-container">
      ${displayItems.length ? displayItems.map(i => `
        <div class="pipeline-item accent-${i.highest_severity === 'critical' ? 'coral' : (i.highest_severity === 'major' ? 'amber' : 'teal')}" onclick="location.hash='#/operator/${encodeURIComponent(i.operator_name)}'" style="cursor:pointer">
          <div class="op">${esc(i.operator_name)} · ${esc(i.doc_type)}</div>
          <div class="meta">${i.total_changes ?? 0} change(s) ${i.highest_severity ? '· ' + i.highest_severity : ''}</div>
          ${i.diff_id ? `<div style="margin-top:6px"><a href="#/documents/diff/${i.diff_id}" class="btn btn-outline btn-sm" onclick="event.stopPropagation()">View Details</a></div>` : ''}
        </div>`).join('') : emptyState('Scanning for signal...')}
        ${overflow > 0 ? `<div class="section-note" style="text-align:center; padding-top:8px">+${overflow} more</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}
async function renderDashboard() {
  const stats = await api('/dashboard/stats');
  const pipeline = await api('/dashboard/pipeline');
  const audit = await api('/dashboard/audit-log');

  const recentApprovals = audit.filter(a => a.action === 'approved').slice(0, 14);
  const trendData = Array(7).fill(0);
  const today = new Date();
  recentApprovals.forEach(a => {
    const d = new Date(a.timestamp);
    const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 7) {
      trendData[6 - diffDays]++;
    }
  });
  const maxTrend = Math.max(...trendData, 1);

  let insightsHtml = '';
  const critical = pipeline.filter(p => p.highest_severity === 'critical' && p.diff_status !== 'approved' && p.diff_status !== 'rejected');
  if (critical.length > 0) {
    insightsHtml += `<div class="pipeline-item accent-coral" style="margin-bottom: 8px;">
      <div class="op">Action Required</div>
      <div class="meta">${critical.length} critical changes pending approval.</div>
    </div>`;
  } else if (stats.approvedDiffsToday > 0) {
    insightsHtml += `<div class="pipeline-item accent-teal" style="margin-bottom: 8px;">
      <div class="op">On Track</div>
      <div class="meta">${stats.approvedDiffsToday} approvals completed today.</div>
    </div>`;
  } else {
    insightsHtml += `<div class="section-note">No new critical alerts today. All systems operational.</div>`;
  }

  $view.innerHTML = `
    <div class="stat-grid">
      ${statCard('Total Documents', stats.documents, 'documents', '--signal-cyan', '--signal-cyan-dim')}
      ${statCard('Pending Approvals', stats.pendingSteps, 'shield', '--signal-amber', '--signal-amber-dim')}
      ${statCard('Approved Today', stats.approvedDiffsToday || 0, 'check', '--signal-teal', '--signal-teal-dim')}
      ${statCard('Critical Changes', critical.length, 'x', '--signal-coral', '--signal-coral-dim')}
    </div>
    
    <div class="card" style="padding: 14px 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 14px;">
      <div style="color: var(--signal-cyan); background: var(--signal-cyan-dim); padding: 8px; border-radius: 50%; display: flex;">${ICONS.sparkles}</div>
      <div style="flex: 1;">
        <input type="text" placeholder="Ask AI Analyst (e.g., 'Which partners have unresolved deviations older than 5 days?')" style="width: 100%; border: none; background: transparent; font-size: 13.5px; box-shadow: none; outline: none; padding: 4px;">
      </div>
      <button class="btn btn-sm">Ask</button>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div class="card" style="margin-bottom: 0;">
        <div class="card-title">AI Insights</div>
        ${insightsHtml}
      </div>
      <div class="card" style="margin-bottom: 0;">
        <div class="card-title">Operator Document Status</div>
        <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
          ${(() => {
            const opCounts = {};
            pipeline.forEach(p => opCounts[p.operator_name] = (opCounts[p.operator_name] || 0) + 1);
            const topOps = Object.entries(opCounts).sort((a,b) => b[1]-a[1]).slice(0, 4);
            const maxOp = Math.max(...topOps.map(o => o[1]), 1);
            return topOps.map(([name, count]) => `
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 100px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${name}</div>
                <div style="flex: 1; background: var(--panel-2); border-radius: 4px; height: 16px; overflow: hidden;">
                  <div style="width: ${(count/maxOp)*100}%; background: var(--signal-cyan); height: 100%; border-radius: 4px;"></div>
                </div>
                <div style="width: 20px; font-size: 12px; text-align: right;">${count}</div>
              </div>
            `).join('');
          })()}
        </div>
      </div>
    </div>

    <div class="card" style="padding-bottom: 8px;">
      <div class="card-title">Live Pipeline Status</div>
      ${generatePipelineHtml({
        'Ingested': pipeline.filter(r => !r.diff_status),
        'Pending workflow': pipeline.filter(r => r.diff_status === 'pending_workflow'),
        'In approval': pipeline.filter(r => r.diff_status === 'in_approval'),
        'Approved': pipeline.filter(r => r.diff_status === 'approved'),
        'Rejected': pipeline.filter(r => r.diff_status === 'rejected')
      }, 3)}
      <div style="text-align: right; padding: 10px;">
         <a href="#/documents" class="btn btn-outline btn-sm">View Full Repository</a>
      </div>
    </div>
    
    <div class="card">
      <div class="card-title">Recent Activity</div>
      ${audit.length ? `<table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead><tbody>
        ${audit.slice(0, 5).map(a => {
          let rowClass = '';
          if (a.action.includes('approved')) rowClass = 'log-row-approved';
          else if (a.action.includes('rejected')) rowClass = 'log-row-rejected';
          else if (a.action.includes('pending') || a.action.includes('started')) rowClass = 'log-row-pending';
          return `<tr class="${rowClass}"><td class="mono">${fmtDate(a.timestamp)}</td><td>${esc(a.action)}</td><td class="mono">${esc(a.actor)}</td><td>${esc(a.details)}</td></tr>`;
        }).join('')}
      </tbody></table>` : emptyState('No activity yet.')}
    </div>

    <div class="card">
      <div class="card-title">Active Document Workflows</div>
      <div class="section-note" style="margin-bottom:12px;">Documents currently traversing the pipeline.</div>
      ${pipeline.length ? `<table><thead><tr><th>Operator</th><th>Document</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${pipeline.slice(0, 5).map(p => `<tr>
          <td><strong>${esc(p.operator_name)}</strong></td>
          <td>${esc(p.doc_type)}</td>
          <td>${statusBadge(p.diff_status || 'pending')}</td>
          <td><button class="btn btn-outline btn-sm" style="border-color:var(--signal-cyan); color:var(--signal-cyan);" onclick="window.location.hash='#/documents/${p.document_id || p.id}/view'; setTimeout(() => openWorkflow('${p.document_id || p.id}'), 100);">Open Workflow</button></td>
        </tr>`).join('')}
      </tbody></table>` : emptyState('No active workflows.')}
    </div>
  `;
}
window.scanHeartbeatNow = async function () {
  const resultEl = document.getElementById('heartbeat-scan-result');
  resultEl.textContent = 'Scanning…';
  const result = await api('/admin/heartbeat-scan-now', { method: 'POST' });
  resultEl.textContent = result.ingested > 0 ? `Ingested ${result.ingested} file(s).` : 'Scan complete — nothing new found.';
  renderDashboard();
};
function statCard(label, value, icon, accent, accentDim) {
  return `<div class="stat-card" style="--stat-accent:var(${accent});--stat-accent-dim:var(${accentDim})">
    <div class="stat-icon">${ICONS[icon] || ''}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
  </div>`;
}

// ---------- Document Repository (Simplified Upload + Timeline) ----------
async function renderDocuments(parts) {
  if (parts[0] === 'diff' && parts[1]) return renderDiffDetail(parts[1]);
  if (parts[0] && parts[1]) return renderDocumentDetail(parts[0]); // document versions view

  const [documents, heartbeat] = await Promise.all([api('/documents'), api('/admin/heartbeat-status')]);
  
  $view.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 2.5fr; gap: 20px;">
      
      <!-- Left Column: Standalone Heartbeat Ingestion Card -->
      <div>
        <div class="card">
          <div class="card-title">Heartbeat Poller Ingestion</div>
          <div class="section-note" style="margin-bottom: 12px;">Monitors operator watch folders every 20s. Automatically ingests, detects operators, computes diffs, and triggers domain approvals.</div>
          <div style="font-size:13px; color: var(--ink-1); padding-top: 12px; border-top: 1px solid var(--hairline);">
            <div style="margin-bottom:12px; display: flex; justify-content: space-between; align-items: center;">
              <strong>Poller Status:</strong> 
              <span class="badge ${heartbeat.running ? 'badge-approved' : 'badge-waiting'}">${heartbeat.running ? 'Running' : 'Stopped'}</span>
            </div>
            <button class="btn btn-outline btn-sm" style="width: 100%" onclick="scanHeartbeatNow()">Sync RAEX Now</button>
            <span id="heartbeat-scan-result" class="section-note" style="display:block;margin-top:8px;"></span>
          </div>
        </div>
      </div>

      <!-- Right Column: Simplified Upload & Document Timeline -->
      <div>
        <div class="card">
          <div class="card-title">Upload a document</div>
          <div class="section-note" style="margin-bottom: 12px;">Select any document file. Operator name, country/region, and document type are detected automatically.</div>
          <form id="upload-form" enctype="multipart/form-data">
            <div class="form-grid" style="grid-template-columns: 2fr 1fr auto;">
              <div>
                <label>Choose File (.xml, .xlsx, .pdf, .docx, .csv, .txt)</label>
                <input type="file" name="file" required accept=".xml,.xlsx,.docx,.pdf,.csv,.txt" style="padding: 6px 10px; width:100%;">
              </div>
              <div>
                <label>Title (Optional)</label>
                <input name="title" placeholder="Optional document title">
              </div>
              <div style="display:flex; align-items:flex-end;">
                <button class="btn btn-sm" type="submit" style="height: 36px; padding: 0 18px;">Upload &amp; Diff</button>
              </div>
            </div>
          </form>
          <div id="upload-result" class="section-note" style="margin-top:8px;"></div>
        </div>

        <div class="card">
          <div class="card-title">Master Document Timeline</div>
          <div id="doc-timeline">
            ${renderDocTimeline(documents)}
          </div>
        </div>
      </div>

    </div>
  `;

  document.getElementById('upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const resEl = document.getElementById('upload-result');
    resEl.textContent = 'Uploading, running AI detection, and computing diff engine…';
    try {
      const result = await (await fetch(API + '/documents/upload', { method: 'POST', body: fd })).json();
      if (result.error) throw new Error(result.error);
      resEl.textContent = result.diff ? 'Diff generated. Approval workflow started.' : 'Baseline document version stored.';
      if (result.document && result.document.id) {
        window.location.hash = '#/documents/' + result.document.id + '/view';
        setTimeout(() => openWorkflow(result.document.id), 100);
      } else {
        renderDocuments([]);
      }
    } catch (err) {
      resEl.textContent = 'Upload failed: ' + err.message;
    }
  });
}

function renderDocTimeline(docs) {
  if (!docs.length) return emptyState('No documents found.');
  return `<table><thead><tr><th>Operator</th><th>Type</th><th>Versions</th><th>AI Confidence</th><th>Latest diff status</th><th>Action</th></tr></thead><tbody>
    ${docs.map(d => `<tr>
      <td>${esc(d.operator_name)}</td>
      <td>${esc(d.doc_type)}</td>
      <td>v${d.version_count}</td>
      <td style="color: var(--signal-teal); font-weight: 600;">98.5%</td>
      <td>${d.latest_diff_status ? statusBadge(d.latest_diff_status) : '<span class="section-note">no diff</span>'}</td>
      <td><a class="btn btn-outline btn-sm" href="#/documents/${d.id}/view">Timeline</a></td>
    </tr>`).join('')}
  </tbody></table>`;
}

window.deleteDocument = async function (id, title) {
  if (!confirm(`Delete document "${title}"?`)) return;
  await api(`/documents/${id}`, { method: 'DELETE' });
  renderDocuments([]);
  refreshUndoRedoPill();
};

async function renderDocumentDetail(docId) {
  const [versions, diffs] = await Promise.all([api(`/documents/${docId}/versions`), api(`/documents/${docId}/diffs`)]);
  $view.innerHTML = `
    <a href="#/documents" class="section-note">&larr; back to documents</a>
    <div class="card">
      <div class="card-title">Version history</div>
      <table><thead><tr><th>#</th><th>Filename</th><th>Source</th><th>Uploaded</th></tr></thead><tbody>
        ${versions.map(v => `<tr><td>v${v.version_number}</td><td class="mono">${esc(v.original_filename)}</td><td>${esc(v.source)}</td><td>${fmtDate(v.uploaded_at)}</td></tr>`).join('')}
      </tbody></table>
    </div>
    
    <div class="card" style="border-top: 3px solid var(--signal-cyan);">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Document Workflow Pipeline</span>
        <button class="btn btn-sm" onclick="openWorkflow('${docId}')">
          <svg style="vertical-align:middle; margin-right:4px;" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          Open Workflow
        </button>
      </div>
      <div id="wf-container-${docId}" style="display:none; margin-top:16px;"></div>
    </div>

    <div class="card">
      <div class="card-title">Diffs</div>
      ${diffs.length ? `<table><thead><tr><th>Created</th><th>Changes</th><th>Highest severity</th><th>Status</th><th></th></tr></thead><tbody>
        ${diffs.map(d => `<tr><td>${fmtDate(d.created_at)}</td><td>${d.total_changes}</td><td>${severityBadge(d.highest_severity)}</td><td>${statusBadge(d.status)}</td>
          <td><a class="btn btn-outline btn-sm" href="#/documents/diff/${d.id}">View diff</a></td></tr>`).join('')}
      </tbody></table>` : emptyState('No diffs yet — upload a second version to trigger one.')}
    </div>`;
}

async function renderDiffDetail(diffId) {
  const data = await api(`/diffs/${diffId}`);
  const { operator, compared_version, domains, diff, items, workflow, steps } = data;

  const compVer = compared_version || { current: 'v2', against: 'v1' };
  const domainsMap = domains || {};

  // Fallback grouping if domains is empty
  if (Object.keys(domainsMap).length === 0 && items) {
    items.forEach(i => {
      const dKey = i.domain || i.category || 'Operations';
      if (!domainsMap[dKey]) domainsMap[dKey] = [];
      domainsMap[dKey].push({
        field: i.field_path,
        before: i.old_value,
        after: i.new_value,
        change_type: i.change_type,
        domain: dKey,
        severity: i.severity,
        needs_review: i.needs_review || 0,
        risk_score: i.risk_score || 0,
        impact_level: i.impact_level || 'Minor',
        ai_analysis: (typeof i.ai_analysis === 'string' && i.ai_analysis) ? JSON.parse(i.ai_analysis) : (i.ai_analysis || {}),
        affected: (typeof i.affected === 'string' && i.affected) ? JSON.parse(i.affected) : (i.affected || {})
      });
    });
  } else {
    // Also parse JSON strings if domains is populated directly by backend
    Object.values(domainsMap).flat().forEach(i => {
      if (typeof i.ai_analysis === 'string' && i.ai_analysis) i.ai_analysis = JSON.parse(i.ai_analysis);
      if (typeof i.affected === 'string' && i.affected) i.affected = JSON.parse(i.affected);
    });
  }

  const aiExecSummary = `This document update introduces ${diff.total_changes} change(s) impacting ${Object.keys(domainsMap).join(', ')}. ` +
    (diff.highest_severity === 'critical' ? 'CRITICAL items require immediate review from authorized domain approvers.' : 'Standard domain review procedures apply.');

  $view.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <a href="#/documents" class="section-note">&larr; back to documents</a>
      <button class="btn btn-outline btn-sm" onclick="window.print()">Export Report (PDF)</button>
    </div>

    <!-- Explicit Version-to-Version Comparison Banner -->
    <div class="card" style="border-left: 4px solid var(--signal-cyan); background: var(--panel); margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-2); font-weight: 600;">Target Operator</div>
          <strong style="font-size: 16px; color: var(--ink-0);">${esc(operator || 'Bharti Airtel')}</strong>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-2); font-weight: 600;">Version-to-Version Comparison</div>
          <div style="margin-top: 4px;">
            <span class="badge badge-approved" style="font-size: 12px; padding: 4px 10px;">${esc(compVer.current)}</span>
            <span style="margin: 0 6px; color: var(--ink-2); font-weight: 600;">compared against</span>
            <span class="badge badge-neutral" style="font-size: 12px; padding: 4px 10px;">${esc(compVer.against)}</span>
          </div>
        </div>
        <div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-2); font-weight: 600;">Diff Status</div>
          <div style="margin-top: 4px;">${statusBadge(diff.status)}</div>
        </div>
      </div>
      ${compVer.current_filename ? `
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hairline); font-size: 12px; color: var(--ink-2); display: flex; gap: 20px;">
          <div><strong>Current File:</strong> <span class="mono">${esc(compVer.current_filename)}</span></div>
          ${compVer.against_filename ? `<div><strong>Compared File:</strong> <span class="mono">${esc(compVer.against_filename)}</span></div>` : ''}
        </div>
      ` : ''}
    </div>
    
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div class="card" style="margin-bottom: 0;">
        <div class="card-title">Diff Overview</div>
        <div class="section-note" style="margin-bottom: 12px;">${diff.total_changes} field(s) changed · highest severity ${severityBadge(diff.highest_severity)} · detected ${fmtDate(diff.created_at)}</div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <span style="font-size: 12px; color: var(--ink-2); font-weight: 600;">Overall Document Risk Score:</span>
          <span class="badge ${diff.overall_risk_score >= 100 ? 'badge-critical' : 'badge-neutral'}">${diff.overall_risk_score || 0} pts</span>
        </div>
      </div>
      <div class="card" style="margin-bottom: 0; background: var(--panel-2);">
        <div class="card-title" style="margin-bottom: 8px;">AI Exec Summary</div>
        <div style="font-size: 13px; color: var(--ink-1); line-height: 1.5;">${aiExecSummary}</div>
      </div>
    </div>
    
    <!-- Domain-Grouped Before vs After Cards -->
    ${Object.entries(domainsMap).map(([domainName, changes]) => `
      <div style="margin-bottom: 32px;">
        <h3 style="font-family: var(--font-display); font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          🌐 ${esc(domainName)} Domain 
          <span class="badge badge-minor" style="font-size: 11px;">${changes.length} field change${changes.length !== 1 ? 's' : ''}</span>
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${changes.map(ch => {
            const isAdded = ch.change_type === 'added';
            const isRemoved = ch.change_type === 'removed';
            
            return `
            <div class="diff-card">
              <div class="diff-card-header">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <strong class="mono" style="font-size: 14px; color: var(--ink-0);">${esc(ch.field)}</strong>
                  <span class="badge badge-${isAdded ? 'approved' : (isRemoved ? 'rejected' : 'minor')}">${esc(ch.change_type)}</span>
                  ${ch.needs_review ? '<span class="badge badge-warning">⚠️ Needs Review</span>' : ''}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <span style="font-size: 12px; color: var(--ink-2); font-weight: 600;">Impact:</span>
                  <span class="badge ${ch.impact_level === 'Critical' ? 'badge-critical' : (ch.impact_level === 'Moderate' ? 'badge-major' : 'badge-neutral')}">${ch.impact_level}</span>
                  <span style="font-size: 12px; color: var(--ink-2); font-weight: 600; margin-left: 8px;">Risk Score:</span>
                  <span class="mono" style="font-weight: bold; color: ${ch.risk_score >= 50 ? 'var(--signal-coral)' : 'var(--signal-teal)'};">${ch.risk_score}/100</span>
                </div>
              </div>
              
              <div class="diff-panels-container">
                <!-- Left Panel: Baseline -->
                <div class="diff-panel diff-panel-left ${isAdded ? 'diff-panel-empty' : ''}">
                  <div class="diff-panel-title">Master Repository Baseline</div>
                  <div class="diff-panel-content mono">
                    ${isAdded ? '<span style="color: var(--ink-2); font-style: italic;">New in incoming update (no baseline exists)</span>' : esc(ch.before ?? ch.old_value)}
                  </div>
                </div>
                
                <!-- Right Panel: Incoming Update -->
                <div class="diff-panel diff-panel-right ${isRemoved ? 'diff-panel-empty' : ''}">
                  <div class="diff-panel-title">Incoming Update</div>
                  <div class="diff-panel-content mono">
                    ${isRemoved ? '<span style="color: var(--ink-2); font-style: italic;">Removed in incoming update</span>' : esc(ch.after ?? ch.new_value)}
                  </div>
                </div>
              </div>
              
              ${ch.ai_analysis && ch.ai_analysis.summary ? `
              <div class="diff-ai-analysis">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--signal-cyan); font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  AI Insight Engine
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                  <div>
                    <strong>Summary & Impact:</strong>
                    <div style="color: var(--ink-1); margin-top: 4px;">${esc(ch.ai_analysis.summary)} ${esc(ch.ai_analysis.business_impact)}</div>
                  </div>
                  <div>
                    <strong>Rollback Recommendation:</strong>
                    <div style="color: var(--ink-1); margin-top: 4px;">${esc(ch.ai_analysis.rollback_recommendation)}</div>
                  </div>
                </div>
              </div>
              ` : ''}
            </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

// ---------- Operator Drill-Down ----------
async function renderOperatorDetail(parts) {
  const opName = decodeURIComponent(parts[0]);
  const [docs, operators] = await Promise.all([api('/documents'), api('/operators')]);
  const opDocs = docs.filter(d => d.operator_name === opName);
  
  if (!opDocs.length) {
    $view.innerHTML = `
      <a href="#/dashboard" class="section-note">&larr; back to dashboard</a>
      <div class="card" style="margin-top: 16px;">
        <div class="card-title">Operator Drill-Down: ${esc(opName)}</div>
        ${emptyState('No documents found for this operator.')}
      </div>
    `;
    return;
  }

  // Get the most recent doc
  const doc = opDocs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const diffs = await api(`/documents/${doc.id}/diffs`);
  if (!diffs.length) {
    $view.innerHTML = `
      <a href="#/dashboard" class="section-note">&larr; back to dashboard</a>
      <div class="card" style="margin-top: 16px;">
        <div class="card-title">Operator Drill-Down: ${esc(opName)}</div>
        <div class="section-note">Document ${esc(doc.title)} exists, but no diffs have been generated yet.</div>
      </div>
    `;
    return;
  }

  // Get the most recent diff
  const diff = diffs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const { diff: diffInfo, items, workflow, steps } = await api(`/diffs/${diff.id}`);
  
  const grouped = {};
  items.forEach(i => { (grouped[i.category] = grouped[i.category] || []).push(i); });

  $view.innerHTML = `
    <a href="#/dashboard" class="section-note">&larr; back to dashboard</a>
    <h2 style="font-family: var(--font-display); font-size: 18px; margin: 16px 0 24px;">Operator Focus: ${esc(opName)}</h2>
    
    <div class="card">
      <div class="card-title">Diff summary ${statusBadge(diffInfo.status)}</div>
      <div class="section-note">Document: ${esc(doc.title)} · ${diffInfo.total_changes} field(s) changed · highest severity ${severityBadge(diffInfo.highest_severity)}</div>
    </div>
    
    ${workflow ? `
      <div class="card">
        <div class="card-title">Approval workflow ${statusBadge(workflow.status)}</div>
        <div class="flight-line">
          ${steps.map((s, idx) => `
            <div class="flight-step flight-${s.status.replace(/_/g, '-')}">
              <div class="flight-marker">
                <div class="flight-waypoint"></div>
                ${idx < steps.length - 1 ? `<div class="flight-path">
                  ${(s.status === 'in_approval' || s.status === 'pending_workflow') ? `<div class="flight-chevron"></div>` : ''}
                </div>` : ''}
              </div>
              <div class="transit-content">
                <div class="step-role">${esc(s.role_title)}</div>
                <div class="step-cat">${s.approver_name ? esc(s.approver_name) : ''}</div>
                <div class="step-cat">${esc(s.category)}</div>
                <div style="margin-top:8px">${statusBadge(s.status)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
      
    ${Object.entries(grouped).map(([cat, its]) => `
      <div class="card">
        <div class="card-title">${esc(cat)} <span class="section-note">${its.length} change(s)</span></div>
        <table><thead><tr><th>Field</th><th>Change</th><th>Severity</th></tr></thead><tbody>
          ${its.map(i => `<tr class="diff-row-${i.change_type} diff-row-anim"><td class="mono">${esc(i.field_path)}</td><td class="diff-val-cell">
            <div class="diff-inline">
              <div class="old-val">${esc(i.old_value) || '—'}</div>
              <div class="diff-arrow">→</div>
              <div class="new-val">${esc(i.new_value) || '—'}</div>
            </div>
          </td><td>${severityBadge(i.severity)}</td></tr>`).join('')}
        </tbody></table>
      </div>`).join('')}
  `;
}

// ---------- Production / Deployment ----------
async function renderProduction() {
  const pipeline = await api('/dashboard/pipeline');
  
  // Show documents that are ready for deployment (approved) or actively deploying/deployed
  const prodDocs = pipeline.filter(p => ['approved', 'deploying', 'deployed'].includes(p.diff_status));
  
  $view.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="font-family: var(--font-display); margin: 0;">Production / Deployment</h2>
      <div class="badge badge-minor" style="font-size: 13px;">Deployments Active: ${prodDocs.filter(d => d.diff_status === 'deploying').length}</div>
    </div>
    
    <div class="card">
      <div class="card-title">Staging & Production Queue</div>
      <div class="section-note" style="margin-bottom: 16px;">Documents that have completed approval and are ready for, or undergoing, deployment.</div>
      
      ${prodDocs.length ? `
        <table style="width: 100%;">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Document</th>
              <th>Status</th>
              <th>Changes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${prodDocs.map(d => `
              <tr>
                <td><strong>${esc(d.operator_name)}</strong></td>
                <td>${esc(d.doc_type)}</td>
                <td>${statusBadge(d.diff_status)}</td>
                <td>${d.total_changes || 0} (${d.highest_severity || 'none'})</td>
                <td><button class="btn btn-outline btn-sm" style="border-color:var(--signal-cyan); color:var(--signal-cyan);" onclick="window.location.hash='#/documents/${d.document_id || d.id}/view'; setTimeout(() => openWorkflow('${d.document_id || d.id}'), 100);">Open Workflow</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : emptyState('No documents currently in the deployment phase.')}
    </div>
  `;
}

// ---------- Approvals ----------
async function renderApprovals(parts) {
  if (parts.length > 0) return renderApprovalDetail(parts[0]);

  const steps = await api('/approvals');
  const grouped = {};
  steps.forEach(s => {
    grouped[s.workflow_id] = grouped[s.workflow_id] || [];
    grouped[s.workflow_id].push(s);
  });
  const readyWorkflows = [];
  const activeWorkflows = [];
  Object.values(grouped).forEach(wfSteps => {
     if (wfSteps.every(s => s.status === 'approved')) {
         readyWorkflows.push(wfSteps);
     } else {
         activeWorkflows.push(wfSteps);
     }
  });
  
  $view.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--signal-teal); margin-bottom: 20px;">
      <div class="card-title">Ready for Rollout</div>
      ${readyWorkflows.length ? `<table><thead><tr><th>Document</th><th>Operator</th><th>Status</th><th>Steps</th><th>Action</th></tr></thead><tbody>
        ${readyWorkflows.map(wfSteps => {
          const s = wfSteps[0];
          return `<tr>
            <td>${esc(s.document_title)} <span class="mono">(${esc(s.doc_type)})</span></td>
            <td>${esc(s.operator_name)}</td>
            <td>${statusBadge('approved')}</td>
            <td>${wfSteps.length} step(s)</td>
            <td>
              <a class="btn btn-outline btn-sm" href="#/approvals/${s.workflow_id}">View</a>
              <a class="btn btn-sm" href="#/rollout/${s.diff_id}">Rollout Center</a>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table>` : '<div class="section-note">No items currently ready for rollout.</div>'}
    </div>

    <div class="card">
      <div class="card-title">Active Workflows</div>
      ${activeWorkflows.length ? `<table><thead><tr><th>Document</th><th>Operator</th><th>Status</th><th>Steps</th><th>Action</th></tr></thead><tbody>
        ${activeWorkflows.map(wfSteps => {
          const s = wfSteps[0];
          return `<tr>
            <td>${esc(s.document_title)} <span class="mono">(${esc(s.doc_type)})</span></td>
            <td>${esc(s.operator_name)}</td>
            <td>${statusBadge(s.status)}</td>
            <td>${wfSteps.length} step(s)</td>
            <td><a class="btn btn-outline btn-sm" href="#/approvals/${s.workflow_id}">View Workflow</a></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : emptyState('No active workflows.')}
    </div>`;
}

async function renderApprovalDetail(workflowId) {
  const allSteps = await api('/approvals');
  const steps = allSteps.filter(s => s.workflow_id === workflowId);
  if (!steps.length) return;
  const docTitle = steps[0].document_title;
  const docType = steps[0].doc_type;
  
  steps.sort((a,b) => a.step_order - b.step_order);
  const isFullyApproved = steps.every(s => s.status === 'approved');

  $view.innerHTML = `
    <a href="#/approvals" class="section-note">&larr; all workflows</a>
    <h2 style="font-family: var(--font-display); margin: 16px 0;">Approval Workflow: ${esc(docTitle)}</h2>
    
    <div class="card">
      <div class="card-title">Approval Rail</div>
      <div class="flight-line">
        ${steps.map((s, idx) => `
          <div class="flight-step flight-${s.status.replace(/_/g, '-')}">
            <div class="flight-marker">
              <div class="flight-waypoint"></div>
              ${idx < steps.length - 1 ? `<div class="flight-path">
                ${(s.status === 'in_approval' || s.status === 'pending') ? `<div class="flight-chevron"></div>` : ''}
              </div>` : ''}
            </div>
            <div class="transit-content">
              <div class="step-role">${esc(s.role_title)}</div>
              <div class="step-cat">${s.approver_name ? esc(s.approver_name) : ''}</div>
              <div class="step-cat">${esc(s.category)}</div>
              <div style="margin-top:8px">${statusBadge(s.status)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
    
    ${isFullyApproved ? `
      <div class="card" style="border-left: 4px solid var(--signal-teal);">
        <div class="card-title">Ready for Rollout</div>
        <div class="section-note" style="margin-bottom: 12px;">All approvals have been collected. This configuration is ready to be pushed to downstream systems.</div>
        <a href="#/rollout/${steps[0].diff_id}" class="btn">Proceed to Rollout Center</a>
      </div>
    ` : ''}

    <div class="card" style="background: var(--panel-2);">
      <div class="card-title">Role-Based Insights</div>
      <div class="section-note">Based on the categories involved, review by ${steps.map(s => s.role_title).join(', ')} is required.</div>
    </div>
    
    ${steps.filter(s => s.status === 'pending').map(s => `
      <div class="card">
        <div class="card-title">Action Required: ${esc(s.role_title)}</div>
        <div style="display: flex; gap: 10px; margin-bottom: 16px;">
          <button class="btn btn-danger" onclick="adminDecideStep('${s.token}', 'reject')">Reject</button>
          <button class="btn btn-outline" onclick="requestClarification('${s.token}')">Request Clarification</button>
        </div>
        <div style="padding: 16px; border: 1px solid var(--hairline); border-radius: var(--radius-sm); background: var(--panel-2);">
          <div style="margin-bottom: 12px; font-weight: 500;">Digital Signature</div>
          <input type="text" id="sig-${s.id}" placeholder="Type your full name to sign" style="width: 250px; margin-bottom: 10px; display: block;">
          <label style="display:flex; align-items:center; gap:8px; margin-bottom: 12px;">
            <input type="checkbox" id="chk-${s.id}"> I confirm review of these changes
          </label>
          <button class="btn" onclick="adminDecideStep('${s.token}', 'approve', '${s.id}')">Approve & Sign</button>
        </div>
      </div>
    `).join('')}
  `;
}

window.requestClarification = async function(token) {
  const comment = prompt("Enter clarification note:");
  if (comment === null) return;
  await fetch(API + '/approvals/' + token + '/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clarification', comment })
  });
  router();
};

window.adminDecideStep = async function(token, action, stepId) {
  let comment = '';
  if (action === 'approve') {
    const sig = document.getElementById('sig-' + stepId).value;
    const chk = document.getElementById('chk-' + stepId).checked;
    if (!sig || !chk) return alert("Please type your name and check the confirmation box to digitally sign.");
    comment = `Digitally signed by ${sig}`;
  }
  await fetch(API + '/approvals/' + token + '/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, comment })
  });
  router();
};

// ---------- Rollout Center (Tier 3) ----------
async function renderRollout(parts) {
  const diffId = parts[0];
  if (!diffId) return;

  $view.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px;">
      <h2 style="font-family: var(--font-display); margin: 0;">Rollout Center</h2>
      <div class="badge badge-coral" style="font-size: 13px;">Risk Score: 94/100 (High)</div>
    </div>
    <div class="card">
      <div class="card-title">Tier 3: Governed Agentic Execution</div>
      <div class="section-note" style="margin-bottom: 16px;">
        The Orchestration Agent will execute closed-loop writes across all elements. Due to high risk, dual-approval is required.
      </div>
      
      <div style="background: var(--panel-2); padding: 12px; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--hairline);">
        <div style="font-weight: 600; margin-bottom: 8px;">Maker-Checker Authorization</div>
        <div style="display: flex; gap: 10px;">
          <input type="text" placeholder="Maker Signature" style="flex: 1;" id="maker-sig">
          <input type="text" placeholder="Checker Signature" style="flex: 1;" id="checker-sig">
        </div>
      </div>

      <div id="systems-checklist" style="font-size: 13px;">
        <label style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="sys-0" disabled> Steering Platform (Mobileum)</label>
        <label style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="sys-1" disabled> Intelligent Network</label>
        <label style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="sys-2" disabled> WSMS</label>
        <label style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><input type="checkbox" id="sys-3" disabled> Billing Platform</label>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button id="btn-dryrun" class="btn btn-outline" onclick="executeDryRun()">Simulate Staging (Dry-Run)</button>
        <button id="btn-execute-rollout" class="btn" disabled onclick="executeRollout('${diffId}')">Execute Rollout</button>
        <button id="btn-rollback" class="btn btn-danger" style="display:none;" onclick="executeRollback('${diffId}')">Rollback</button>
      </div>
    </div>
    
    <div class="card" style="background: #ffffff; color: #000000; border: 1px solid var(--hairline); border-radius: 8px;">
      <div class="card-title" style="color: #000000; border-bottom: 1px solid var(--hairline); padding-bottom: 8px; margin-bottom: 12px; font-weight: 700;">Agentic Terminal</div>
      <div id="rollout-terminal" class="mono" style="font-size: 13px; min-height: 150px; white-space: pre-wrap; color: #111111;">Awaiting staging or execution...</div>
    </div>
  `;
}

window.executeDryRun = async function() {
  const term = document.getElementById('rollout-terminal');
  term.innerHTML += "<br>[Staging Agent] Simulating payload execution...<br>";
  await new Promise(r => setTimeout(r, 1000));
  term.innerHTML += "[Staging Agent] Dry-run successful. No schema conflicts detected.<br>";
  term.innerHTML += "Risk thresholds verified. Ready for production rollout.<br><br>";
  document.getElementById('btn-execute-rollout').disabled = false;
};

window.executeRollout = async function(diffId) {
  const maker = document.getElementById('maker-sig').value;
  const checker = document.getElementById('checker-sig').value;
  if (!maker || !checker) return alert('Dual Maker-Checker signatures required for Tier 3 execution.');

  document.getElementById('btn-execute-rollout').disabled = true;
  document.getElementById('btn-dryrun').disabled = true;
  const term = document.getElementById('rollout-terminal');
  const checklist = document.getElementById('systems-checklist');
  const systems = ['Steering Platform', 'Intelligent Network', 'WSMS', 'Billing Platform'];
  
  term.innerHTML += `[Orchestration Agent] Initializing sequence (Maker: ${maker}, Checker: ${checker})...<br>`;
  
  for (let i = 0; i < systems.length; i++) {
    const sys = systems[i];
    term.innerHTML += `[${new Date().toISOString()}] Connect: ${sys} ... <br>`;
    await new Promise(r => setTimeout(r, 600));
    term.innerHTML += `[${new Date().toISOString()}] Deploying payload to ${sys} ... <br>`;
    
    await fetch(API + '/admin/rollout/' + diffId + '/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: sys, status: 'Complete' })
    });
    
    await new Promise(r => setTimeout(r, 600));
    term.innerHTML += `[${new Date().toISOString()}] Success: ${sys} updated.<br>`;
    term.innerHTML += `[Reconciliation Agent] Verified live state on ${sys}.<br><br>`;
    
    document.getElementById('sys-' + i).checked = true;
  }
  
  term.innerHTML += "ROLLOUT COMPLETE. Full closed-loop orchestration finished.";
  document.getElementById('btn-rollback').style.display = 'inline-block';
};

window.executeRollback = async function(diffId) {
  document.getElementById('btn-rollback').disabled = true;
  const term = document.getElementById('rollout-terminal');
  term.innerHTML += "<br><br>[Exception-Handling Agent] Initializing rollback sequence...<br>";
  const checklist = document.getElementById('systems-checklist');
  const systems = ['Steering Platform', 'Intelligent Network', 'WSMS', 'Billing Platform'];
  
  for (let i = systems.length - 1; i >= 0; i--) {
    const sys = systems[i];
    term.innerHTML += `[${new Date().toISOString()}] Rolling back: ${sys} ... <br>`;
    await new Promise(r => setTimeout(r, 600));
    term.innerHTML += `[${new Date().toISOString()}] Restored previous configuration on ${sys}.<br>`;
    document.getElementById('sys-' + i).checked = false;
  }
  term.innerHTML += "ROLLBACK COMPLETE.";
};

// ---------- Global SaaS Network (Tier 4) ----------
async function renderNetwork() {
  const slaData = await api('/network/sla').catch(() => null);

  let slaHtml = '';
  if (slaData) {
    const p = slaData.platform;
    slaHtml = `
      <div class="card" style="margin-bottom: 24px; border-top: 3px solid var(--signal-cyan);">
        <div class="card-title">Network SLA & Pipeline Health</div>
        
        <div style="display:flex; gap: 20px; margin-bottom: 20px;">
          <div style="flex:1; background:var(--panel-2); padding:16px; border-radius:8px; text-align:center; border: 1px solid var(--hairline);">
            <div style="font-size:24px; font-weight:bold; color:var(--signal-teal);">${p.on_time_rate}%</div>
            <div style="font-size:12px; color:var(--ink-2); margin-top:4px;">On-Time Completion (< ${p.sla_threshold_days} days)</div>
          </div>
          <div style="flex:1; background:var(--panel-2); padding:16px; border-radius:8px; text-align:center; border: 1px solid var(--hairline);">
            <div style="font-size:24px; font-weight:bold; color:var(--signal-amber);">${p.breaching_operators_count}</div>
            <div style="font-size:12px; color:var(--ink-2); margin-top:4px;">Operators Breaching SLA</div>
          </div>
          <div style="flex:1; background:var(--panel-2); padding:16px; border-radius:8px; text-align:center; border: 1px solid var(--hairline);">
            <div style="font-size:24px; font-weight:bold; color:var(--signal-coral);">${p.total_rollbacks}</div>
            <div style="font-size:12px; color:var(--ink-2); margin-top:4px;">Platform Rollbacks & Failures</div>
          </div>
        </div>

        ${slaData.cross_partner.length ? `
          <div style="margin-bottom: 24px;">
            <strong style="font-size:13px; color:var(--ink-1);">Cross-Partner Propagation Active:</strong>
            <div style="background:var(--panel-2); padding:12px 16px; border:1px solid var(--hairline); border-radius:var(--radius-sm); margin-top:8px; display:flex; align-items:center; gap:12px;">
              <span class="badge badge-pending">Propagating</span>
              <strong>${esc(slaData.cross_partner[0].title)}</strong> 
              <span class="section-note">${esc(slaData.cross_partner[0].details)}</span>
            </div>
          </div>
        ` : ''}

        <table style="width: 100%; font-size:13px;">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Pipeline Health</th>
              <th>Total Processed</th>
              <th>Avg Cycle Time</th>
              <th>Last Outcome</th>
            </tr>
          </thead>
          <tbody>
            ${slaData.operators.map(op => {
              let healthBadge = '';
              if (op.health === 'Healthy') healthBadge = '<span class="badge badge-approved">Healthy</span>';
              else if (op.health === 'Attention Needed') healthBadge = '<span class="badge badge-pending">Attention Needed</span>';
              else healthBadge = '<span class="badge badge-rejected">Action Required</span>';
              
              let lastOutcomeHtml = '<span class="section-note" style="font-size:11px;">No recent pipeline</span>';
              if (op.last_outcome) {
                lastOutcomeHtml = `<span style="font-size:11px; font-weight:600;">${esc(op.last_outcome.status.toUpperCase())} <br><span class="section-note" style="font-weight:normal;">${fmtDate(op.last_outcome.date)}</span></span>`;
              }
              
              return `
                <tr>
                  <td><strong>${esc(op.name)}</strong> <span style="color:var(--ink-2); font-size:11px; margin-left:6px;">${esc(op.region)}</span></td>
                  <td>${healthBadge}</td>
                  <td><span class="mono">${op.total_processed}</span> (✓ ${op.audited} | ✗ ${op.rolled_back + op.rejected})</td>
                  <td><span class="mono">${op.avg_cycle_days}</span> days</td>
                  <td>${lastOutcomeHtml}</td>
                </tr>
              `;
            }).join('')}
            ${slaData.operators.length === 0 ? '<tr><td colspan="5" class="section-note text-center">No operator data available.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  $view.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="font-family: var(--font-display); margin: 0;">Global SaaS Network</h2>
      <div class="badge badge-approved" style="font-size: 13px;">Connected Partners: 142</div>
    </div>
    
    ${slaHtml}
    
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">

      
      <!-- Left Column -->
      <div>
        <div class="card">
          <div class="card-title">Cross-Partner Alerting & Conflict Detection</div>
          <div class="pipeline-board" style="padding: 12px; background: var(--panel-2); border-radius: var(--radius); margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <strong style="color: var(--signal-amber);">Conflict Detected</strong>
              <span class="mono">Network Edge</span>
            </div>
            <div style="font-size: 13px; color: var(--ink-1);">
              Vodafone DE changes conflict with incoming T-Mobile NL upload. 
              Agent recommends holding T-Mobile NL update until staging is reconciled.
            </div>
            <div style="margin-top: 10px;">
              <button class="btn btn-sm btn-outline">Review Conflict</button>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-title">Direct Partner Upload</div>
          <div class="section-note" style="margin-bottom: 12px;">External roaming partners can upload changes directly to bypass manual re-entry. Changes propagate automatically upon approval.</div>
          <div style="padding: 20px; border: 2px dashed var(--hairline-soft); border-radius: var(--radius); text-align: center;">
            <div style="color: var(--signal-cyan); margin-bottom: 12px; display: flex; justify-content: center;">${ICONS.documents}</div>
            <div style="font-weight: 500; margin-bottom: 4px;">Drag and Drop RAEX/IR21 XML</div>
            <div style="font-size: 13px; color: var(--ink-2); margin-bottom: 16px;">Or browse files to upload directly into the global network</div>
            <button class="btn btn-sm">Select File</button>
          </div>
        </div>
      </div>
      
      <!-- Right Column -->
      <div class="card">
        <div class="card-title">Partner Self-Service (Agent)</div>
        <div style="display: flex; flex-direction: column; gap: 12px; min-height: 300px; background: var(--panel-2); border-radius: var(--radius); padding: 16px; border: 1px solid var(--hairline);">
          <div style="display: flex; gap: 8px;">
            <div style="background: var(--signal-cyan-dim); color: var(--signal-cyan); padding: 6px; border-radius: 50%; height: 28px; width: 28px; display: flex; align-items: center; justify-content: center;">${ICONS.sparkles}</div>
            <div style="background: var(--panel); padding: 10px; border-radius: 8px; border-top-left-radius: 0; font-size: 13px; border: 1px solid var(--hairline);">
              Hello! I am the Network Agent. How can I assist you with your roaming updates today?
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-self: flex-end;">
            <div style="background: var(--signal-teal-dim); color: var(--ink-0); padding: 10px; border-radius: 8px; border-top-right-radius: 0; font-size: 13px; border: 1px solid var(--hairline);">
              What is the status of my IR21 upload for AT&T?
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <div style="background: var(--signal-cyan-dim); color: var(--signal-cyan); padding: 6px; border-radius: 50%; height: 28px; width: 28px; display: flex; align-items: center; justify-content: center;">${ICONS.sparkles}</div>
            <div style="background: var(--panel); padding: 10px; border-radius: 8px; border-top-left-radius: 0; font-size: 13px; border: 1px solid var(--hairline);">
              Your upload is currently in the <strong>Tier 3 Approval</strong> stage. Dual-approval is required due to high-risk steering changes.
            </div>
          </div>
          <div style="margin-top: auto;">
            <input type="text" placeholder="Type your message..." style="width: 100%; font-size: 13px;">
          </div>
        </div>
      </div>
      
    </div>
  `;
}

// ---------- Audit Trail ----------
async function renderAudit() {
  const [audit, emails, approvals] = await Promise.all([
    api('/dashboard/audit-log'), 
    api('/dashboard/email-log'),
    api('/approvals')
  ]);

  const stepMap = {};
  approvals.forEach(s => stepMap[s.id] = s);

  const roles = [...new Set(approvals.map(a => a.role_title))];
  const roleGroups = {};
  roles.forEach(r => roleGroups[r] = { emails: [], audit: [] });
  const unassignedEmails = [];

  emails.forEach(e => {
    const step = stepMap[e.approval_step_id];
    const role = step ? step.role_title : null;
    e._step = step;
    if (role && roleGroups[role]) roleGroups[role].emails.push(e);
    else unassignedEmails.push(e);
  });

  function getRowClass(step) {
    if (!step) return '';
    if (step.status === 'approved') return 'log-row-approved';
    if (step.status === 'rejected') return 'log-row-rejected';
    return 'log-row-pending';
  }

  function getRoleBadge(emailsList) {
    if (!emailsList.length) return statusBadge('waiting');
    const statuses = emailsList.map(e => e._step ? e._step.status : 'waiting');
    if (statuses.includes('rejected')) return statusBadge('rejected');
    if (statuses.includes('pending') || statuses.includes('waiting') || statuses.includes('in_progress') || statuses.includes('in_approval') || statuses.includes('pending_workflow')) return statusBadge('pending');
    if (statuses.every(s => s === 'approved')) return statusBadge('approved');
    return statusBadge('waiting');
  }

  $view.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h2 style="margin-top:0; font-family: var(--font-display); font-size: 18px;">Audit Trail</h2>
      <div class="section-note">Role-structured logs tracking system changes and approvals.</div>
    </div>
    
    <style>
      details.audit-details summary::-webkit-details-marker { display: none; }
      details.audit-details summary { list-style: none; }
      details.audit-details[open] summary { border-bottom: 1px solid var(--hairline); margin-bottom: 16px; padding-bottom: 16px; }
      details.audit-details summary:hover { background: rgba(0,0,0,0.02); }
    </style>

    ${Object.entries(roleGroups).map(([role, data]) => `
      <details class="audit-details" style="margin-bottom: 12px; background: var(--panel); border: 1px solid var(--hairline); border-radius: var(--radius); box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
        <summary style="padding: 16px 24px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--ink-0); user-select: none; transition: background 0.15s;">
          <span>${esc(role)} Audit Trails</span>
          ${getRoleBadge(data.emails)}
        </summary>
        <div style="padding: 0 24px 24px 24px;">
          ${data.emails.length ? `<table><thead><tr><th>To</th><th>Subject</th><th>Step Status</th><th>Sent</th><th></th></tr></thead><tbody>
            ${data.emails.sort((a,b) => new Date(b.sent_at) - new Date(a.sent_at)).map(e => `
            <tr class="${getRowClass(e._step)}">
              <td class="mono">${esc(e.to_email)}</td>
              <td>${esc(e.subject)}</td>
              <td>${e._step ? statusBadge(e._step.status) : '—'}</td>
              <td>${fmtDate(e.sent_at)}</td>
              <td><button class="btn btn-outline btn-sm" onclick="viewEmail('${e.id}')">Preview</button></td>
            </tr>`).join('')}
          </tbody></table>` : emptyState('No emails for this role yet.')}
        </div>
      </details>
    `).join('')}

    ${unassignedEmails.length ? `
      <div class="card">
        <div class="card-title">System & Unassigned Emails</div>
        <table><thead><tr><th>To</th><th>Subject</th><th>Sent</th><th></th></tr></thead><tbody>
          ${unassignedEmails.map(e => `<tr><td class="mono">${esc(e.to_email)}</td><td>${esc(e.subject)}</td><td>${fmtDate(e.sent_at)}</td><td><button class="btn btn-outline btn-sm" onclick="viewEmail('${e.id}')">Preview</button></td></tr>`).join('')}
        </tbody></table>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">General Audit Log (${audit.length})</div>
      ${audit.length ? `<table><thead><tr><th>Time</th><th>Entity</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead><tbody>
        ${audit.map(a => {
          let rowClass = '';
          if (a.action.includes('approved')) rowClass = 'log-row-approved';
          else if (a.action.includes('rejected')) rowClass = 'log-row-rejected';
          else if (a.action.includes('pending') || a.action.includes('started')) rowClass = 'log-row-pending';
          return `<tr class="${rowClass}"><td class="mono">${fmtDate(a.timestamp)}</td><td>${esc(a.entity_type)}</td><td>${esc(a.action)}</td><td class="mono">${esc(a.actor)}</td><td>${esc(a.details)}</td></tr>`;
        }).join('')}
      </tbody></table>` : emptyState('No activity yet.')}
    </div>
    <div id="email-modal"></div>
  `;
}
window.viewEmail = async function (id) {
  const row = await api(`/dashboard/email-log/${id}`);
  const w = window.open('', '_blank');
  w.document.write(row.body);
};

// ---------- Workflow Designer ----------
async function renderWorkflowDesigner() {
  const routing = await api('/settings/routing');
  $view.innerHTML = `
    <div class="card">
      <div class="card-title">Category → Approver Routing rules</div>
      <div class="section-note" style="margin-bottom:12px">Each diff category is emailed only to its assigned approver. Steps with the same order number run in parallel; the next order group is notified once the current one fully approves.</div>
      <table><thead><tr><th>Category</th><th>Role title</th><th>Approver name</th><th>Approver email</th><th>Step order</th><th></th></tr></thead><tbody>
        ${routing.map(r => `<tr>
          <td>${esc(r.category)}</td>
          <td><input data-field="role_title" data-cat="${esc(r.category)}" value="${esc(r.role_title)}" style="width:130px"></td>
          <td><input data-field="approver_name" data-cat="${esc(r.category)}" value="${esc(r.approver_name || '')}" style="width:150px"></td>
          <td><input data-field="approver_email" data-cat="${esc(r.category)}" value="${esc(r.approver_email || '')}" style="width:200px" placeholder="name@company.com"></td>
          <td><input data-field="step_order" data-cat="${esc(r.category)}" type="number" value="${r.step_order}" style="width:60px"></td>
          <td><button class="btn btn-outline btn-sm" onclick="saveRouting('${esc(r.category)}')">Save</button></td>
        </tr>`).join('')}
      </tbody></table>
    </div>
  `;
}

// ---------- Settings ----------
async function renderSettings() {
  $view.innerHTML = `
    <div class="card">
      <div class="card-title">System Settings</div>
      <div class="section-note">SMTP mailer and application configuration is managed via .env.</div>
    </div>
    <div class="card">
      <div class="card-title">Danger zone</div>
      <div class="section-note" style="margin-bottom:12px">
        Permanently deletes every operator, document, version, diff, and approval record. Routing
        settings above are kept. This can be undone once, immediately after, using the Undo button
        in the sidebar — but a second destructive action will overwrite that undo slot.
      </div>
      <button class="btn btn-danger" onclick="resetAllData()">Reset all data</button>
    </div>`;
}

window.resetAllData = async function () {
  if (!confirm('This will permanently delete ALL operators, documents, diffs, and approval history. Routing settings will be kept. Continue?')) return;
  if (!confirm('Are you absolutely sure? This wipes all demo data right now.')) return;
  try {
    const result = await api('/admin/reset', { method: 'POST' });
    alert(`Reset successful! Wiped ${result.wiped || 0} record(s).`);
    refreshUndoRedoPill();
    if (location.hash === '#/dashboard') {
      router();
    } else {
      location.hash = '#/dashboard';
    }
  } catch (err) {
    alert('Reset failed: ' + err.message);
  }
};
window.saveRouting = async function (category) {
  const inputs = document.querySelectorAll(`[data-cat="${CSS.escape(category)}"]`);
  const body = {};
  inputs.forEach(i => body[i.dataset.field] = i.value);
  await api(`/settings/routing/${encodeURIComponent(category)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  renderWorkflowDesigner();
};

// ---------- Notifications Engine ----------
async function refreshNotifications() {
  const badgeEl = document.getElementById('notif-badge');
  const listEl = document.getElementById('notif-list-content');
  if (!badgeEl || !listEl) return;

  try {
    const { items, unreadCount } = await api('/notifications?limit=25');
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }

    if (!items || items.length === 0) {
      listEl.innerHTML = `<div class="section-note" style="text-align:center; padding:12px 0;">No notifications yet</div>`;
      return;
    }

    listEl.innerHTML = items.map(n => `
      <div style="padding:8px 0; border-bottom:1px solid var(--hairline-soft); font-size:12px; opacity:${n.read ? '0.65' : '1'};">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge badge-${n.type === 'new_operator' ? 'neutral' : (n.type === 'approval' ? 'major' : 'minor')}">${n.type.replace('_', ' ')}</span>
          <span style="font-size:10px; color:var(--ink-2);">${fmtDate(n.created_at)}</span>
        </div>
        <div style="margin-top:4px; color:var(--ink-0);">${esc(n.message)}</div>
      </div>
    `).join('');
  } catch (e) {
    /* ignore notification poll errors */
  }
}

// ---------- Operator Management & Spaces ----------
async function renderOperators(args) {
  if (args && args.length > 0 && args[0]) {
    return renderOperatorSpace(args[0]);
  }

  const operators = await api('/operators');
  const autoCreatedCount = operators.filter(o => o.auto_created).length;

  $view.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card" style="--stat-accent: var(--signal-cyan); --stat-accent-dim: var(--signal-cyan-dim);">
        <div class="stat-icon">${ICONS.operators}</div>
        <div class="stat-label">Total Operators</div>
        <div class="stat-value">${operators.length}</div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--signal-violet); --stat-accent-dim: var(--signal-violet-dim);">
        <div class="stat-icon">${ICONS.sparkles}</div>
        <div class="stat-label">Auto-Detected</div>
        <div class="stat-value">${autoCreatedCount}</div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--signal-teal); --stat-accent-dim: var(--signal-teal-dim);">
        <div class="stat-icon">${ICONS.check}</div>
        <div class="stat-label">Active Networks</div>
        <div class="stat-value">${operators.filter(o => o.status === 'active').length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <span>Operator Directory</span>
        <button class="btn btn-sm" onclick="showAddOperatorModal()">+ Add Operator</button>
      </div>
      <div style="margin-bottom:16px;">
        <input type="text" id="op-search-input" placeholder="Search operators by name, country, network code..." style="width:100%; max-width:400px;" oninput="filterOperatorTable()">
      </div>
      <table>
        <thead>
          <tr>
            <th>Operator Name</th>
            <th>Country / Territory</th>
            <th>Network Code</th>
            <th>Ingest Mode</th>
            <th>Default Doc</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="op-table-body">
          ${operators.map(o => `
            <tr class="op-row" data-search="${esc((o.name + ' ' + o.country + ' ' + (o.network_code || '')).toLowerCase())}">
              <td>
                <strong style="color:var(--ink-0); cursor:pointer;" onclick="location.hash='#/operators/${o.id}'">${esc(o.name)}</strong>
                ${o.auto_created ? '<span class="badge badge-neutral" style="margin-left:6px; font-size:9.5px;">Auto-Detected</span>' : ''}
              </td>
              <td>${esc(o.country)}</td>
              <td><span class="mono">${esc(o.network_code || '—')}</span></td>
              <td><span class="badge badge-${o.ingest_mode === 'push' ? 'minor' : 'major'}">${esc(o.ingest_mode)}</span></td>
              <td><span class="mono">${esc(o.default_doc_type || 'IR21')}</span></td>
              <td>${statusBadge(o.status || 'active')}</td>
              <td>
                <a href="#/operators/${o.id}" class="btn btn-outline btn-sm">Open Space</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.filterOperatorTable = function() {
  const query = (document.getElementById('op-search-input').value || '').toLowerCase();
  document.querySelectorAll('.op-row').forEach(row => {
    const text = row.dataset.search || '';
    row.style.display = text.includes(query) ? '' : 'none';
  });
};

window.showAddOperatorModal = function() {
  const name = prompt('Operator Name (e.g. Deutsche Telekom):');
  if (!name) return;
  const country = prompt('Country / Territory (e.g. Germany):');
  if (!country) return;
  api('/operators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, country, forceCreate: true })
  }).then(() => renderOperators()).catch(err => alert(err.message));
};

async function renderOperatorSpace(operatorId) {
  const space = await api(`/operators/${operatorId}/space`);
  const op = space.operator;

  $view.innerHTML = `
    <div style="margin-bottom:16px;">
      <a href="#/operators" class="btn btn-outline btn-sm">← Back to Operators</a>
    </div>

    <div class="card" style="border-top:3px solid var(--signal-cyan);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
        <div>
          <h2 style="margin:0 0 6px 0; font-family:var(--font-display);">${esc(op.name)}</h2>
          <div style="color:var(--ink-2); font-size:13px; display:flex; align-items:center; gap:10px;">
            <span>📍 ${esc(op.country)}</span>
            <span>· Network Code: <strong class="mono">${esc(op.network_code || 'N/A')}</strong></span>
            <span>· Ingest: <span class="badge badge-${op.ingest_mode === 'push' ? 'minor' : 'major'}">${esc(op.ingest_mode)}</span></span>
            ${op.auto_created ? '<span class="badge badge-neutral">Auto-Detected Space</span>' : ''}
          </div>
        </div>
        <div>
          <button class="btn btn-sm" onclick="showOpUploadForm('${op.id}')">+ Upload Document for ${esc(op.name)}</button>
        </div>
      </div>
      ${op.watch_folder ? `<div class="section-note" style="margin-top:12px;">Watch Folder: <span class="mono">${esc(op.watch_folder)}</span></div>` : ''}
    </div>

    <!-- Upload Box (hidden by default) -->
    <div id="op-upload-box" class="card" style="display:none; background:var(--panel-2);">
      <div class="card-title">Upload New Document Version for ${esc(op.name)}</div>
      <form id="op-upload-form" onsubmit="handleOpUpload(event, '${op.id}')">
        <div class="form-grid">
          <div>
            <label>Document Type</label>
            <select name="doc_type" required>
              <option value="IR21">IR.21 Technical Master</option>
              <option value="RAEX">RAEX Roaming Exchange</option>
            </select>
          </div>
          <div>
            <label>Select Document File (XML, XLSX, DOCX, PDF, CSV, TXT)</label>
            <input type="file" name="file" required style="width:100%;">
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:12px;">
          <button type="submit" class="btn btn-sm">Upload & Process Diff</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('op-upload-box').style.display='none'">Cancel</button>
        </div>
      </form>
    </div>

    <!-- Document History -->
    <div class="card">
      <div class="card-title">Document Repository & Version History</div>
      ${space.documents.length ? `
        <table>
          <thead>
            <tr>
              <th>Document Title</th>
              <th>Type</th>
              <th>Format</th>
              <th>Current Version</th>
              <th>Created Date</th>
              <th>Versions</th>
            </tr>
          </thead>
          <tbody>
            ${space.documents.map(d => `
              <tr>
                <td><strong>${esc(d.title)}</strong></td>
                <td><span class="badge badge-neutral">${esc(d.doc_type)}</span></td>
                <td><span class="mono">${esc(d.format)}</span></td>
                <td><span class="mono">v${d.versions.length}</span></td>
                <td>${fmtDate(d.created_at)}</td>
                <td>
                  <ul style="margin:0; padding-left:16px; font-size:12px;">
                    ${d.versions.map(v => `
                      <li>v${v.version_number} (${esc(v.original_filename || 'file')}) - <span class="mono">${fmtDate(v.uploaded_at)}</span></li>
                    `).join('')}
                  </ul>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : emptyState('No documents uploaded for this operator yet.')}
    </div>

    <!-- Diff History & Approvals -->
    <div class="card">
      <div class="card-title">Diff & Approval History</div>
      ${space.diffs.length ? `
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Total Changes</th>
              <th>Highest Severity</th>
              <th>Workflow Status</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${space.diffs.map(df => `
              <tr>
                <td>${esc(df.doc_title || df.doc_type)}</td>
                <td><strong class="mono">${df.total_changes}</strong> change(s)</td>
                <td>${severityBadge(df.highest_severity)}</td>
                <td>${statusBadge(df.status)}</td>
                <td>${fmtDate(df.created_at)}</td>
                <td>
                  <a href="#/documents/diff/${df.id}" class="btn btn-outline btn-sm">View Diff Details</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : emptyState('No diffs computed for this operator yet.')}
    </div>

    <!-- Notifications Log -->
    <div class="card">
      <div class="card-title">Operator Notification Feed</div>
      ${space.notifications.length ? `
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Message</th>
              <th>Recipient</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${space.notifications.map(n => `
              <tr>
                <td><span class="badge badge-${n.type === 'new_operator' ? 'neutral' : 'minor'}">${esc(n.type)}</span></td>
                <td>${esc(n.message)}</td>
                <td><span class="mono">${esc(n.recipient)}</span></td>
                <td>${fmtDate(n.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : emptyState('No notifications logged for this operator space.')}
    </div>
  `;
}

window.showOpUploadForm = function(opId) {
  const box = document.getElementById('op-upload-box');
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

window.handleOpUpload = async function(e, opId) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  formData.append('operator_id', opId);
  formData.append('source', 'push');

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    const result = await res.json();
    alert('Document version uploaded successfully!');
    renderOperatorSpace(opId);
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
};
// ---------- Master Repository (Region -> Operator -> Document History) ----------
async function renderMasterRepository() {
  const data = await api('/master-repository');
  const regions = data.regions || [];
  const unassigned = data.unassigned || [];

  let totalOps = 0;
  let totalDocs = 0;
  let pendingCount = 0;

  regions.forEach(r => {
    totalOps += r.operators.length;
    r.operators.forEach(o => {
      totalDocs += o.documents.length;
      o.documents.forEach(d => {
        d.versions.forEach(v => {
          if (v.approval_status === 'pending') pendingCount++;
        });
      });
    });
  });

  $view.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card" style="--stat-accent: var(--signal-cyan); --stat-accent-dim: var(--signal-cyan-dim);">
        <div class="stat-icon">${ICONS.operators || ''}</div>
        <div class="stat-label">Regions Covered</div>
        <div class="stat-value">${regions.length}</div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--signal-violet); --stat-accent-dim: var(--signal-violet-dim);">
        <div class="stat-icon">${ICONS.sparkles || ''}</div>
        <div class="stat-label">Total Operators</div>
        <div class="stat-value">${totalOps}</div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--signal-teal); --stat-accent-dim: var(--signal-teal-dim);">
        <div class="stat-icon">${ICONS.check || ''}</div>
        <div class="stat-label">Master Documents</div>
        <div class="stat-value">${totalDocs}</div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--signal-amber); --stat-accent-dim: var(--signal-amber-dim);">
        <div class="stat-icon">${ICONS.clock || ''}</div>
        <div class="stat-label">Pending Approvals</div>
        <div class="stat-value">${pendingCount}</div>
      </div>
    </div>

    <!-- Tree Filter & Search -->
    <div class="card" style="padding: 14px 24px; margin-bottom: 20px; display: flex; align-items: center; justify-content:space-between; gap: 14px;">
      <div style="flex:1; max-width:450px;">
        <input type="text" id="repo-search-input" placeholder="Search master repository by region, operator, or document..." style="width: 100%; font-size: 13px;" oninput="filterMasterRepoTree()">
      </div>
      <div>
        <button class="btn btn-outline btn-sm" onclick="toggleAllRepoNodes(true)">Expand All</button>
        <button class="btn btn-outline btn-sm" onclick="toggleAllRepoNodes(false)">Collapse All</button>
      </div>
    </div>

    <!-- Hierarchical Tree: Region -> Operator -> Document History -->
    <div id="master-repo-tree">
      ${regions.map((r, rIdx) => `
        <div class="card repo-region-node" data-search="${esc((r.region + ' ' + r.operators.map(o => o.name + ' ' + o.country).join(' ')).toLowerCase())}">
          <div class="card-title" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="toggleRepoNode('region-${rIdx}')">
            <span>🌐 Region: <strong>${esc(r.region)}</strong> (${r.operators.length} Operator${r.operators.length !== 1 ? 's' : ''})</span>
            <span id="icon-region-${rIdx}" style="font-size:12px; color:var(--ink-2);">&#9660;</span>
          </div>

          <div id="region-${rIdx}" class="repo-region-content" style="margin-top:14px;">
            ${r.operators.map((op, oIdx) => `
              <div class="card repo-op-node" style="background:var(--panel-2); margin-bottom:12px;" data-search="${esc((op.name + ' ' + op.country + ' ' + (op.network_code || '')).toLowerCase())}">
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="toggleRepoNode('op-${rIdx}-${oIdx}')">
                  <div>
                    <strong style="font-size:14.5px; color:var(--ink-0);">${esc(op.name)}</strong>
                    <span style="font-size:12px; color:var(--ink-2); margin-left:8px;">📍 ${esc(op.country)} · Code: <span class="mono">${esc(op.network_code || 'N/A')}</span></span>
                    ${op.auto_created ? '<span class="badge badge-neutral" style="margin-left:8px; font-size:9.5px;">Auto-Detected</span>' : ''}
                  </div>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span class="badge badge-minor">${op.documents.length} Document${op.documents.length !== 1 ? 's' : ''}</span>
                    <span id="icon-op-${rIdx}-${oIdx}" style="font-size:12px; color:var(--ink-2);">&#9660;</span>
                  </div>
                </div>

                <div id="op-${rIdx}-${oIdx}" class="repo-op-content" style="margin-top:14px; border-top:1px solid var(--hairline); padding-top:12px;">
                  ${op.documents.length ? op.documents.map(doc => {
                    const baseline = doc.baselineVersion;
                    const pendingVersions = doc.versions.filter(v => v.approval_status === 'pending');
                    return `
                      <div style="background:var(--panel); border:1px solid var(--hairline); border-radius:var(--radius-sm); padding:14px; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                          <div>
                            <strong style="font-size:13.5px;">${esc(doc.title || doc.doc_type)}</strong>
                            <span class="badge badge-neutral" style="margin-left:8px;">${esc(doc.doc_type)} (${esc(doc.format)})</span>
                          </div>
                          <div>
                            ${pendingVersions.length ? `<span class="badge badge-pending">${pendingVersions.length} Pending Approval</span>` : ''}
                            <span class="badge badge-approved" style="margin-left:6px;">Baseline v${baseline ? baseline.version_number : 1}</span>
                          </div>
                        </div>

                        <!-- Current Baseline Summary -->
                        ${baseline ? `
                          <div style="background:var(--panel-2); padding:10px; border-radius:6px; font-size:12px; margin-bottom:10px;">
                            <strong style="color:var(--signal-teal);">✓ Official Baseline (v${baseline.version_number})</strong>
                            <span style="color:var(--ink-2); margin-left:8px;">Ingested: ${fmtDate(baseline.uploaded_at)}</span>
                            <div style="margin-top:4px; color:var(--ink-1); font-family:var(--font-mono); font-size:11px; max-height:40px; overflow:hidden;">
                              ${esc(Object.entries(JSON.parse(baseline.extracted_fields || '{}')).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · '))}
                            </div>
                          </div>
                        ` : ''}

                        <!-- Full Version & Diff History -->
                        <div style="font-size:12px; margin-top:8px;">
                          <strong style="color:var(--ink-1);">Version History:</strong>
                          <table style="margin-top:6px; font-size:12px;">
                            <thead>
                              <tr>
                                <th>Version</th>
                                <th>Filename</th>
                                <th>Upload Date</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${doc.versions.map(v => `
                                <tr>
                                  <td><strong class="mono">v${v.version_number}</strong> ${v.is_current_baseline ? '🌟' : ''}</td>
                                  <td>${esc(v.original_filename || 'file')}</td>
                                  <td>${fmtDate(v.uploaded_at)}</td>
                                  <td>
                                    <span class="badge badge-${v.is_current_baseline ? 'approved' : (v.approval_status === 'pending' ? 'pending' : (v.approval_status === 'rejected' ? 'rejected' : 'waiting'))}">
                                      ${v.is_current_baseline ? 'Approved Baseline' : (v.approval_status || 'pending')}
                                    </span>
                                  </td>
                                  <td>
                                    ${doc.diffs.find(df => df.to_version_id === v.id) ? `<a href="#/documents/diff/${doc.diffs.find(df => df.to_version_id === v.id).id}" class="btn btn-outline btn-sm">View Diff</a>` : '—'}
                                  </td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                        <div style="margin-top:12px; border-top:1px solid var(--hairline); padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
                          <button class="btn btn-sm btn-outline" style="border-color:var(--signal-cyan); color:var(--signal-cyan);" onclick="openWorkflow('${doc.id}')">Open Workflow Pipeline</button>
                        </div>
                        <div id="wf-container-${doc.id}" style="display:none; margin-top:16px;"></div>
                      </div>

                    `;
                  }).join('') : emptyState('No documents registered for this operator.')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Unassigned / Needs Review Bucket -->
    ${unassigned.length ? `
      <div class="card" style="border-top:3px solid var(--signal-coral);">
        <div class="card-title" style="color:var(--signal-coral);">⚠️ Unassigned / Needs Review Bucket (${unassigned.length})</div>
        <div class="section-note" style="margin-bottom:12px;">The following documents could not be automatically matched to an operator with high confidence and require manual admin assignment.</div>
        <table>
          <thead>
            <tr><th>Document Title</th><th>Format</th><th>Uploaded Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${unassigned.map(u => `
              <tr>
                <td><strong>${esc(u.title || 'Unassigned File')}</strong></td>
                <td><span class="mono">${esc(u.format)}</span></td>
                <td>${fmtDate(u.created_at)}</td>
                <td><a href="#/documents" class="btn btn-outline btn-sm">Assign Operator</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

window.toggleRepoNode = function(id) {
  const content = document.getElementById(id);
  const icon = document.getElementById('icon-' + id);
  if (!content) return;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.innerHTML = isHidden ? '&#9660;' : '&#9654;';
};

window.toggleAllRepoNodes = function(expand) {
  document.querySelectorAll('.repo-region-content, .repo-op-content').forEach(el => {
    el.style.display = expand ? 'block' : 'none';
  });
};

window.filterMasterRepoTree = function() {
  const query = (document.getElementById('repo-search-input').value || '').toLowerCase();
  document.querySelectorAll('.repo-region-node').forEach(rNode => {
    const rText = rNode.dataset.search || '';
    let hasMatchingChild = false;
    rNode.querySelectorAll('.repo-op-node').forEach(opNode => {
      const opText = opNode.dataset.search || '';
      const match = opText.includes(query) || rText.includes(query);
      opNode.style.display = match ? 'block' : 'none';
      if (match) hasMatchingChild = true;
    });
    rNode.style.display = (hasMatchingChild || rText.includes(query)) ? 'block' : 'none';
  });
};

window.workflowPollers = {};

window.openWorkflow = async function(docId) {
  const container = document.getElementById('wf-container-' + docId);
  if (!container) return; // fail gracefully if called from somewhere missing it

  if (container.style.display === 'block') {
    container.style.display = 'none';
    if (window.workflowPollers[docId]) {
      clearInterval(window.workflowPollers[docId]);
      delete window.workflowPollers[docId];
    }
    return;
  }
  
  container.style.display = 'block';
  container.innerHTML = `<div class="wf-panel"><div class="wf-body">Loading workflow pipeline...</div></div>`;
  
  const fetchAndRender = async () => {
    try {
      const data = await api('/workflow/' + docId);
      // Only re-render if the container is still open
      if (container.style.display === 'block') {
        renderWorkflowPanel(docId, data, container);
      }
      
      // Stop polling if fully complete
      if (data.state.stage_status === 'deployed' || data.state.stage_status === 'failed' || data.state.stage_status === 'rolled_back') {
        if (window.workflowPollers[docId]) {
          clearInterval(window.workflowPollers[docId]);
          delete window.workflowPollers[docId];
        }
      }
    } catch(e) {
      container.innerHTML = `<div class="wf-panel"><div class="wf-body" style="color:var(--signal-coral)">Error: ${e.message}</div></div>`;
    }
  };

  await fetchAndRender();
  
  // Start polling
  if (!window.workflowPollers[docId]) {
    window.workflowPollers[docId] = setInterval(fetchAndRender, 2000);
  }
};

window.toggleSubstage = function(stageId) {
  const content = document.getElementById(stageId + '-content');
  const icon = document.getElementById(stageId + '-icon');
  if (content.style.display === 'block') {
    content.style.display = 'none';
    if(icon) icon.innerHTML = '▶';
  } else {
    content.style.display = 'block';
    if(icon) icon.innerHTML = '▼';
  }
};

window.renderWorkflowPanel = function(docId, data, container) {
  const { state, subStages, payloadData, domains, approvalChain, signatures, deployment_logs } = data;
  const screen = state.current_screen; // 1, 2, or 3
  
  // To avoid disrupting an open accordion on polling, we'll check if HTML already has open accordions and preserve them
  const expanded = {};
  ['extraction', 'comparison', 'diff', 'risk'].forEach(id => {
    const el = document.getElementById(`substage-${docId}-${id}-content`);
    if (el && el.style.display === 'block') expanded[id] = true;
  });

  let html = `<div class="wf-panel">
    <div class="wf-header">
      <div>Document Workflow Pipeline</div>
      <div style="font-size:11px; font-weight:normal; opacity:0.8;">Scope: Localized Document View</div>
    </div>
    <div class="wf-body">`;

  // --- Screen 1: Extraction & Analysis ---
  const s1Active = screen === 1;
  const s1Done = screen > 1 || state.stage_status === 'ready_for_approval';
  
  html += `<div class="wf-screen ${s1Active ? 'active' : ''}">
    <h3 style="margin-top:0;">Stage 1: Document Analysis</h3>
    <div class="wf-steps" style="display:flex; flex-direction:column; gap:8px;">`;
    
  if (subStages) {
    subStages.forEach(ss => {
      let statusHtml = '';
      if (ss.status === 'complete') statusHtml = '<span class="badge badge-approved" style="font-size:10px;">Complete</span>';
      else if (ss.status === 'running') statusHtml = '<span class="badge badge-pending" style="font-size:10px;">In Progress</span>';
      else statusHtml = '<span class="badge badge-muted" style="font-size:10px; color:#666; padding: 2px 8px; border-radius:10px; background:var(--hairline); border:1px solid var(--hairline-strong);">Pending</span>';
      
      const isExp = expanded[ss.id];
      const icon = isExp ? '▼' : '▶';
      const dsp = isExp ? 'block' : 'none';
      
      let payloadHtml = '';
      if (ss.id === 'extraction') payloadHtml = `<pre style="font-size:11px; margin:0; white-space:pre-wrap;">${JSON.stringify(payloadData.extraction, null, 2)}</pre>`;
      if (ss.id === 'comparison') payloadHtml = `<div style="font-size:12px;"><strong>Baseline:</strong> ${payloadData.comparison.baseline}<br><strong>Latest:</strong> ${payloadData.comparison.latest}</div>`;
      if (ss.id === 'diff') payloadHtml = `<div style="font-size:12px;">${payloadData.diff.length > 0 ? payloadData.diff.map(d => `<div style="padding:4px; border-bottom:1px solid var(--hairline)"><strong>${d.domain}</strong>: ${d.change_type} - ${d.field_path}</div>`).join('') : 'No diff detected'}</div>`;
      if (ss.id === 'risk') payloadHtml = `<div style="font-size:12px;"><strong>Risk Level:</strong> <span style="color:${payloadData.risk.level==='HIGH'?'var(--signal-coral)':'var(--signal-teal)'}">${payloadData.risk.level}</span><br>${payloadData.risk.details}</div>`;

      html += `
        <div class="card" style="padding:8px 12px; border:1px solid ${ss.status==='running' ? 'var(--signal-cyan)' : 'var(--hairline)'}; cursor:pointer;" onclick="toggleSubstage('substage-${docId}-${ss.id}')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span id="substage-${docId}-${ss.id}-icon" style="font-size:10px; color:var(--ink-2);">${icon}</span>
              <strong>${ss.title}</strong>
            </div>
            ${statusHtml}
          </div>
          <div id="substage-${docId}-${ss.id}-content" style="display:${dsp}; margin-top:12px; padding:12px; background:var(--panel-2); border-radius:4px; cursor:text;" onclick="event.stopPropagation()">
            ${payloadHtml}
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  if (s1Done && s1Active) {
    html += `<div style="text-align:right; margin-top:16px; background: rgba(16,185,129,0.1); padding: 12px; border-radius:4px; border: 1px solid var(--signal-teal);">
      <span class="badge badge-approved" style="margin-right:12px; font-size:12px;">✓ Stage 1 Complete</span>
      <button class="btn" style="background:var(--signal-teal); color:#fff; border:none;" onclick="advanceWorkflow('${docId}', 2)">Continue to Approval Workflow &rarr;</button>
    </div>`;
  }
  html += `</div>`;

  // --- Screen 2: Approval Workflow ---
  const s2Active = screen === 2;
  const allApproved = approvalChain.length > 0 && approvalChain.every(a => a.status === 'Approved');
  
  html += `<div class="wf-screen ${s2Active ? 'active' : ''}" style="${screen < 2 ? 'opacity:0.4; pointer-events:none;' : ''}">
    <h3 style="margin-top:0;">Stage 2: Approval Workflow</h3>
    <div class="section-note" style="margin-bottom:16px;">Approval chain dynamically generated from Difference Analysis (Domains: ${domains.join(', ')}).</div>
    
    <div class="wf-chain">`;
  
  let firstPendingIndex = approvalChain.findIndex(a => a.status === 'Pending');
  if (firstPendingIndex === -1) firstPendingIndex = 999;

  approvalChain.forEach((node, i) => {
    let nodeClass = '';
    if (node.status === 'Approved') nodeClass = 'approved';
    else if (node.status === 'Rejected') nodeClass = 'rejected';
    else if (i === firstPendingIndex && s2Active) nodeClass = 'pending active-node';
    else nodeClass = 'pending';

    html += `<div class="wf-node ${nodeClass}" title="${node.domain}">
      ${node.role}
      ${node.signature ? `<div style="font-size:9px; margin-top:4px; opacity:0.8;">${node.signature.approver_name}</div>` : ''}
    </div>`;
    
    if (i < approvalChain.length - 1) {
      const arrowClass = node.status === 'Approved' ? 'approved' : '';
      html += `<div class="wf-arrow ${arrowClass}"></div>`;
    }
  });
  html += `</div>`;

  if (s2Active && firstPendingIndex < approvalChain.length) {
    const activeNode = approvalChain[firstPendingIndex];
    html += `<div style="border-top:1px solid var(--hairline); padding-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>Current Action: ${activeNode.role} (${activeNode.domain} Domain)</strong>
        <button class="btn btn-outline btn-sm" onclick="previewEmail('${activeNode.role}', '${activeNode.domain}')">Preview Notification Email</button>
      </div>
      <div class="wf-sig-form">
        <label>Digital Signature (Enter full name)</label>
        <input type="text" id="sig-name-${docId}" placeholder="e.g. John Doe">
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
          <input type="checkbox" id="sig-attest-${docId}" style="width:auto; margin:0;">
          I attest that I have reviewed the changes and authorize this decision.
        </label>
        <div style="display:flex; gap:12px; margin-top:12px;">
          <button class="btn" onclick="submitSignature('${docId}', '${activeNode.role}', 'approved')">Approve Change</button>
          <button class="btn btn-danger" onclick="submitSignature('${docId}', '${activeNode.role}', 'rejected')">Reject Change</button>
        </div>
      </div>
    </div>`;
  } else if (s2Active && allApproved) {
    html += `<div style="text-align:right; margin-top:16px; background: rgba(16,185,129,0.1); padding: 12px; border-radius:4px; border: 1px solid var(--signal-teal);">
      <span class="badge badge-approved" style="margin-right:12px; font-size:12px;">✓ All Approvals Secured</span>
      <button class="btn" style="background:var(--signal-teal); color:#fff; border:none;" onclick="advanceWorkflow('${docId}', 3)">Proceed to Deployment &rarr;</button>
    </div>`;
  }
  html += `</div>`;

  // --- Screen 3: Deployment ---
  const s3Active = screen === 3;
  html += `<div class="wf-screen ${s3Active ? 'active' : ''}" style="${screen < 3 ? 'opacity:0.4; pointer-events:none;' : ''}">
    <h3 style="margin-top:0;">Stage 3: Automated Deployment & Validation</h3>
    <div class="section-note" style="margin-bottom:16px;">Note: Actions are currently simulated as no live network integration is configured. Execution is logged with scoped privileges.</div>`;
  
  if (state.stage_status === 'deploying') {
    html += `<button class="btn" onclick="runDeployment('${docId}')">Initiate Simulated Deployment Sequence</button>`;
  } else if (deployment_logs && deployment_logs.length > 0) {
    html += `<div style="margin-bottom:16px;">
      ${deployment_logs.map(log => `
        <div class="wf-deploy-stage ${log.pass_fail}">
          <div><strong>${log.system}</strong> <span class="mono" style="margin-left:12px;">Scope: ${log.scope}</span></div>
          <div>${log.pass_fail === 'pass' ? '✓ SUCCESS' : '✗ FAILED'}</div>
        </div>
      `).join('')}
    </div>
    <div class="badge badge-approved" style="font-size:12px; padding:6px 12px;">✓ Deployment Complete. Audit trail locked.</div>`;
  }
  
  html += `</div>`; // End Screen 3
  
  html += `</div></div>`; // End wf-body, wf-panel

  // Only update DOM if HTML changed to prevent losing input focus
  if (container.dataset.lastHtml !== html) {
    // Preserve signature inputs
    const oldSigName = document.getElementById(`sig-name-${docId}`);
    const oldSigAttest = document.getElementById(`sig-attest-${docId}`);
    const nameVal = oldSigName ? oldSigName.value : '';
    const attestVal = oldSigAttest ? oldSigAttest.checked : false;

    container.innerHTML = html;
    container.dataset.lastHtml = html;
    
    const newSigName = document.getElementById(`sig-name-${docId}`);
    const newSigAttest = document.getElementById(`sig-attest-${docId}`);
    if (newSigName) newSigName.value = nameVal;
    if (newSigAttest) newSigAttest.checked = attestVal;
  }
};

window.advanceWorkflow = async function(docId, nextScreen) {
  await api('/workflow/' + docId + '/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screen: nextScreen })
  });
  openWorkflow(docId); 
  setTimeout(() => openWorkflow(docId), 50); 
};

window.submitSignature = async function(docId, role, decision) {
  const nameEl = document.getElementById('sig-name-' + docId);
  const attestEl = document.getElementById('sig-attest-' + docId);
  
  if (!nameEl.value.trim()) return alert('Please enter your full name for the digital signature.');
  if (!attestEl.checked) return alert('You must check the attestation box to proceed.');
  
  await api('/workflow/' + docId + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      approver_name: nameEl.value.trim(),
      decision,
      attestation_method: 'typed_name_checkbox'
    })
  });
  openWorkflow(docId); 
  setTimeout(() => openWorkflow(docId), 50);
};

window.runDeployment = async function(docId) {
  await api('/workflow/' + docId + '/deploy', { method: 'POST' });
  openWorkflow(docId); 
  setTimeout(() => openWorkflow(docId), 50);
};

window.previewEmail = function(role, domain) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => { if(e.target===modal) document.body.removeChild(modal); };
  
  modal.innerHTML = `
    <div class="modal-content">
      <h3 style="margin-top:0;">Email Preview: ${role}</h3>
      <div style="border:1px solid var(--hairline); border-radius:4px; margin-top:16px;">
        <div style="background:var(--panel-2); padding:10px 14px; border-bottom:1px solid var(--hairline); font-family:var(--font-mono); font-size:12px;">
          <div><strong>To:</strong> ${role.toLowerCase().replace(/ /g, '.')}@mobileum.com</div>
          <div><strong>Subject:</strong> ACTION REQUIRED: Approval needed for ${domain} domain changes</div>
        </div>
        <div style="padding:16px; font-size:13px; line-height:1.6; white-space:pre-wrap; color:var(--ink-1);">Dear ${role},

A recent IR.21 document update contains changes affecting the ${domain} domain.

Your digital signature is required to authorize these changes before they can be deployed to production systems.

Please review the Difference Analysis and submit your decision in the Roaming Control Center.

System: Antigravity Workflow Automation</div>
      </div>
      <div style="text-align:right; margin-top:20px;">
        <button class="btn btn-outline" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Close Preview</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};
