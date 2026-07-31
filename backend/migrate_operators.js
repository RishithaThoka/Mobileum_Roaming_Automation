const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'ir21_portal.db'));

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(ltd|limited|inc|corp|corporation)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
      }
    }
  }
  return matrix[a.length][b.length];
}

function getSimilarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (dist / maxLen);
}

console.log("1. Adding normalized_name to all existing operators...");
const ops = db.prepare('SELECT * FROM operators').all();
const updateNorm = db.prepare('UPDATE operators SET normalized_name = ? WHERE id = ?');
db.transaction(() => {
  for (const op of ops) {
    updateNorm.run(normalizeName(op.name), op.id);
  }
})();

console.log("2. Merging exact matches (by normalized_name and country)...");
const allOps = db.prepare('SELECT * FROM operators ORDER BY created_at ASC').all();
const groups = {};
allOps.forEach(op => {
    const key = (op.normalized_name + '|' + op.country).toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(op);
});

let mergedCount = 0;
db.transaction(() => {
    for (const key in groups) {
        const opsInGroup = groups[key];
        if (opsInGroup.length > 1) {
            const master = opsInGroup[0];
            const duplicates = opsInGroup.slice(1);
            for (const dup of duplicates) {
                db.prepare('UPDATE documents SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id);
                try { db.prepare('UPDATE heartbeat_seen_files SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id); } catch(e){}
                db.prepare('DELETE FROM operators WHERE id = ?').run(dup.id);
                console.log(` -> Merged exact duplicate: ${dup.name} into master: ${master.name} (ID: ${master.id})`);
                mergedCount++;
            }
        }
    }
})();
console.log(`Merged ${mergedCount} exact duplicates.`);

console.log("3. Identifying potential near-duplicates for manual review...");
const distinctOps = db.prepare('SELECT * FROM operators').all();
const nearMatches = [];
for (let i = 0; i < distinctOps.length; i++) {
  for (let j = i + 1; j < distinctOps.length; j++) {
    const op1 = distinctOps[i];
    const op2 = distinctOps[j];
    const sim = getSimilarity(op1.normalized_name, op2.normalized_name);
    if (sim > 0.85) {
      nearMatches.push({
        op1: `${op1.name} (${op1.country})`,
        op2: `${op2.name} (${op2.country})`,
        similarity: (sim * 100).toFixed(1) + '%'
      });
    }
  }
}

if (nearMatches.length > 0) {
  console.log("Suspected near-duplicates found:");
  console.table(nearMatches);
} else {
  console.log("No near-duplicates found.");
}
console.log("Migration complete.");
