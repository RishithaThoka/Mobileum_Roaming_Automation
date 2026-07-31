const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'ir21_portal.db'));

const operators = db.prepare('SELECT id, name, country FROM operators ORDER BY created_at ASC').all();

const groups = {};
operators.forEach(op => {
    const key = (op.name + '|' + op.country).toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(op);
});

db.transaction(() => {
    for (const key in groups) {
        const ops = groups[key];
        if (ops.length > 1) {
            const master = ops[0];
            const duplicates = ops.slice(1);
            
            for (const dup of duplicates) {
                // Update documents
                db.prepare('UPDATE documents SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id);
                // Update heartbeat_seen_files if it exists
                try {
                    db.prepare('UPDATE heartbeat_seen_files SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id);
                } catch (e) {
                    // ignore if table doesn't exist
                }
                // Delete duplicate
                db.prepare('DELETE FROM operators WHERE id = ?').run(dup.id);
                console.log(`Merged duplicate ${dup.name} (${dup.id}) into master (${master.id})`);
            }
        }
    }
})();
console.log('Deduplication complete.');
