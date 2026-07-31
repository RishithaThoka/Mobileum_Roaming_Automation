const db = require('../../db');
const { callGeminiChat } = require('./aiClient');

// Pulls a live snapshot of everything currently in the portal — operators,
// documents, recent diffs, pending approvals — so the chat answers are
// grounded in whatever's actually been uploaded, not training data.
function buildContext() {
  try {
    const operators = db.prepare(`SELECT id, name, country, region, network_code, status FROM operators`).all();

    const documents = db.prepare(`
      SELECT d.id, d.doc_type, d.format, o.name as operator_name, o.country,
             (SELECT COUNT(*) FROM document_versions WHERE document_id = d.id) as version_count,
             (SELECT approval_status FROM document_versions WHERE id = d.current_version_id) as current_status
      FROM documents d JOIN operators o ON o.id = d.operator_id
    `).all();

    const diffs = db.prepare(`
      SELECT df.id, df.status, df.total_changes, df.highest_severity, d.doc_type,
             o.name as operator_name, df.created_at
      FROM diffs df
      JOIN documents d ON d.id = df.document_id
      JOIN operators o ON o.id = d.operator_id
      ORDER BY df.created_at DESC LIMIT 30
    `).all();

    const pendingApprovals = db.prepare(`
      SELECT s.role_title, s.approver_email, s.status, s.category, w.id as workflow_id
      FROM approval_steps s JOIN approval_workflows w ON w.id = s.workflow_id
      WHERE s.status IN ('pending','waiting') LIMIT 30
    `).all();

    const recentDiffItems = db.prepare(`
      SELECT field_path, category, domain, change_type, old_value, new_value, severity
      FROM diff_items ORDER BY id DESC LIMIT 40
    `).all();

    return { operators, documents, diffs, pendingApprovals, recentDiffItems };
  } catch (e) {
    console.error("[chatAssistant] Error building context:", e.message);
    return { error: e.message, operators: [], documents: [], diffs: [], pendingApprovals: [], recentDiffItems: [] };
  }
}

async function answer(question, history = []) {
  const ctx = buildContext();
  const system = `You are the Roaming Control Center AI Copilot. Answer using ONLY the live portal data given below. If the answer isn't in the data, say so plainly rather than guessing. Be concise, use bullet points for lists, and refer to operators/documents by the exact names given.

PORTAL DATA (live snapshot):
${JSON.stringify(ctx, null, 2).slice(0, 12000)}`;

  return await callGeminiChat({ system, history, message: question, maxTokens: 1024 });
}

module.exports = { answer, buildContext };
