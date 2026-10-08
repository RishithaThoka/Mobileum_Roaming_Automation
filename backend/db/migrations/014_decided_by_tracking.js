'use strict';

/**
 * Migration 014: decided_by tracking on approval_steps
 *
 * Problem: approval_steps already records WHO a step was *assigned* to
 * (approver_name, approver_email) and WHEN it was decided (decided_at),
 * but it never captured WHO ACTUALLY clicked the Approve/Reject button
 * as the authenticated session user.
 *
 * This matters because:
 *   (a) Admin can force-advance any step assigned to someone else.
 *       Without decided_by_*, the record implies the assigned approver acted.
 *   (b) A domain may have multiple Approver accounts for the same category.
 *       Any of them can decide. Without decided_by_*, there is no audit trail
 *       of which specific user made the call.
 *
 * Three new columns added to approval_steps:
 *   decided_by_user_id  - users.id of the authenticated actor (null for
 *                         email magic-link paths that have no portal session)
 *   decided_by_name     - full_name from the session at decision time
 *   decided_by_email    - username (login email) from the session at decision time
 *
 * These are DISTINCT from approver_name / approver_email, which remain as
 * the *assignment* fields (who the step was originally routed to by the engine).
 */

exports.up = async function (db) {
  await db.schema.table('approval_steps', (t) => {
    t.string('decided_by_user_id').nullable();
    t.string('decided_by_name').nullable();
    t.string('decided_by_email').nullable();
  });
};

exports.down = async function (db) {
  await db.schema.table('approval_steps', (t) => {
    t.dropColumn('decided_by_user_id');
    t.dropColumn('decided_by_name');
    t.dropColumn('decided_by_email');
  });
};
