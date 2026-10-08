/**
 * Query the version history and workflow state for document 95b8914c
 * to determine if it had prior versions before the substage test ran.
 */
const db = require('../db');

async function main() {
  const docId = '95b8914c-c651-49ad-a451-b09658a6c061';

  console.log('=== Document ===');
  const doc = await db('documents').where({ id: docId }).first();
  console.log(JSON.stringify(doc, null, 2));

  console.log('\n=== All Versions (ordered by version_number) ===');
  const versions = await db('document_versions')
    .where({ document_id: docId })
    .orderBy('version_number', 'asc');
  for (const v of versions) {
    console.log(`  v${v.version_number} | id=${v.id} | uploaded_at=${v.uploaded_at} | source=${v.source} | file=${v.original_filename} | baseline=${v.is_current_baseline}`);
  }
  console.log(`  Total versions: ${versions.length}`);

  console.log('\n=== All Diffs ===');
  const diffs = await db('diffs').where({ document_id: docId }).orderBy('created_at', 'asc');
  for (const d of diffs) {
    console.log(`  diff=${d.id} | from=${d.from_version_id} → to=${d.to_version_id} | changes=${d.total_changes} | status=${d.status} | created_at=${d.created_at}`);
  }
  console.log(`  Total diffs: ${diffs.length}`);

  console.log('\n=== Workflow State ===');
  const wfState = await db('document_workflow_state').where({ document_id: docId }).first();
  console.log(JSON.stringify(wfState, null, 2));

  console.log('\n=== Substage Rows ===');
  const substages = await db('document_workflow_substages').where({ document_id: docId });
  for (const s of substages) {
    console.log(`  ${s.substage_id} | status=${s.status} | completed_at=${s.completed_at} | reason=${s.reason}`);
  }

  console.log('\n=== Approval Workflows ===');
  const workflows = await db('approval_workflows as aw')
    .join('diffs as d', 'aw.diff_id', 'd.id')
    .where({ 'd.document_id': docId })
    .select('aw.*');
  for (const w of workflows) {
    console.log(`  workflow=${w.id} | diff=${w.diff_id} | status=${w.status} | created_at=${w.created_at}`);
  }

  console.log('\n=== Deployment Log ===');
  const deplogs = await db('deployment_log').where({ document_id: docId }).orderBy('order_executed', 'asc');
  for (const dl of deplogs) {
    console.log(`  ${dl.system} | ${dl.pass_fail} | executed_at=${dl.executed_at}`);
  }
  if (!deplogs.length) console.log('  (none)');

  await db.destroy();
}

main().catch(err => { console.error(err); process.exit(1); });
