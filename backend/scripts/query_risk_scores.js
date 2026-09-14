/**
 * Usage:
 *   node scripts/query_risk_scores.js <diff_id>          -- show all diff_items for one diff
 *   node scripts/query_risk_scores.js                    -- show last 10 rows across all diffs (fallback)
 *
 * diff_id comes from the upload response body: response.diff.diffId
 */
const db = require('../db');

const diffId = process.argv[2];

if (!diffId) {
  console.warn('WARNING: no diff_id supplied -- showing last 10 rows across all diffs (may mix results from multiple uploads).');
  console.warn('Usage: node scripts/query_risk_scores.js <diff_id>\n');
}

let query = db('diff_items')
  .select('field_path', 'risk_score', 'impact_level', 'scoring_method', 'ai_analysis', 'domain', 'severity')
  .orderBy('risk_score', 'desc');

if (diffId) {
  query = query.where({ diff_id: diffId });
} else {
  query = query.limit(10);
}

query.then(rows => {
  if (rows.length === 0) {
    console.log(diffId
      ? `No diff_items found for diff_id: ${diffId}`
      : 'No diff_items in database yet.');
  } else {
    console.log(`\n=== ${rows.length} diff_item(s)${diffId ? ' for diff ' + diffId : ' (last 10 across all diffs)'} ===\n`);
    rows.forEach(r => {
      // Pretty-print ai_analysis inline if it's a JSON string
      let row = { ...r };
      try { row.ai_analysis = JSON.parse(r.ai_analysis); } catch (_) {}
      console.log(JSON.stringify(row, null, 2));
    });
  }
  db.destroy();
}).catch(err => {
  console.error('Query failed:', err.message);
  db.destroy();
  process.exit(1);
});