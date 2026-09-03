const db = require('../../db');
const { callGeminiChat } = require('./aiClient');

// Pulls a live snapshot of everything currently in the portal — operators,
// documents, recent diffs, pending approvals — so the chat answers are
// grounded in whatever's actually been uploaded, not training data.
async function buildContext() {
  try {
    const operators = await db('operators')
      .select('id', 'name', 'country', 'region', 'network_code', 'status');

    const documents = await db('documents as d')
      .select([
        'd.id', 'd.doc_type', 'd.format',
        'o.name as operator_name', 'o.country',
        db.raw('(SELECT COUNT(*) FROM document_versions WHERE document_id = d.id) as version_count'),
        db.raw('(SELECT approval_status FROM document_versions WHERE id = d.current_version_id) as current_status'),
      ])
      .join('operators as o', 'o.id', 'd.operator_id');

    const diffs = await db('diffs as df')
      .select([
        'df.id', 'df.status', 'df.total_changes', 'df.highest_severity',
        'd.doc_type', 'o.name as operator_name', 'df.created_at',
      ])
      .join('documents as d', 'd.id', 'df.document_id')
      .join('operators as o', 'o.id', 'd.operator_id')
      .orderBy('df.created_at', 'desc')
      .limit(30);

    const pendingApprovals = await db('approval_steps as s')
      .select(['s.role_title', 's.approver_email', 's.status', 's.category', 'w.id as workflow_id'])
      .join('approval_workflows as w', 'w.id', 's.workflow_id')
      .whereIn('s.status', ['pending', 'waiting'])
      .limit(30);

    const recentDiffItems = await db('diff_items')
      .select('field_path', 'category', 'domain', 'change_type', 'old_value', 'new_value', 'severity')
      .orderBy('id', 'desc')
      .limit(40);

    return { operators, documents, diffs, pendingApprovals, recentDiffItems };
  } catch (e) {
    console.error('[chatAssistant] Error building context:', e.message);
    return { error: e.message, operators: [], documents: [], diffs: [], pendingApprovals: [], recentDiffItems: [] };
  }
}

async function answer(question, history = []) {
  const ctx = await buildContext();
  const system = `You are the Roaming Control Center AI Copilot. Answer using ONLY the live portal data given below. If the answer isn't in the data, say so plainly rather than guessing. Be concise, use bullet points for lists, and refer to operators/documents by the exact names given.

PORTAL DATA (live snapshot):
${JSON.stringify(ctx, null, 2).slice(0, 12000)}`;

  return await callGeminiChat({ system, history, message: question, maxTokens: 1024 });
}

module.exports = { answer, buildContext };
