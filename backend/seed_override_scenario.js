/**
 * seed_override_scenario.js
 * 
 * Finds the first in-progress workflow and force-writes decided_by_* fields
 * on an already-approved step to simulate an Admin override (decided_by differs
 * from approver_email). This is purely for screenshot demonstration.
 * 
 * Usage: node backend/seed_override_scenario.js
 */
'use strict';

const db = require('./db');

async function main() {
  console.log('[seed-override] Looking for an approved step to demonstrate override...');

  // Find an approved step where approver_email is NOT admin
  const step = await db('approval_steps')
    .where('status', 'approved')
    .whereNotNull('approver_email')
    .first();

  if (!step) {
    console.log('[seed-override] No approved steps found — nothing to do.');
    await db.destroy();
    return;
  }

  console.log(`[seed-override] Found step id=${step.id}, category="${step.category}", approver_email="${step.approver_email}"`);

  // Only set if decided_by_email is null (i.e., pre-migration step)
  if (!step.decided_by_email) {
    await db('approval_steps').where({ id: step.id }).update({
      decided_by_user_id: '1',
      decided_by_name:    'Rishitha Thoka (Admin)',
      decided_by_email:   'admin@mobileum.com',
    });
    console.log(`[seed-override] ✅ Set decided_by_email=admin@mobileum.com on step ${step.id}`);
    console.log('[seed-override] This simulates an Admin force-advance of a step assigned to:', step.approver_email);
    console.log('[seed-override] The ⚡ Override flag will now fire in the UI since decided_by ≠ approver_email');
  } else {
    console.log(`[seed-override] Step ${step.id} already has decided_by_email="${step.decided_by_email}" — skipping.`);
  }

  // Also set a second step with the same approver (no override) as a contrast
  const matchingStep = await db('approval_steps')
    .where('status', 'approved')
    .where('id', '!=', step.id)
    .whereNotNull('decided_by_email')
    .first();

  await db.destroy();
  console.log('[seed-override] Done. Restart the frontend (or it will reload on next fetch) to see the ⚡ flag.');
}

main().catch(e => {
  console.error('[seed-override] ERROR:', e.message);
  process.exit(1);
});
