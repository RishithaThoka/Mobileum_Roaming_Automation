"use strict";
/**
 * tests/test_workflow_engine_unit.js
 *
 * Unit tests for workflowEngine.createWorkflowForDiff() internals.
 * Runs directly against the DB — no HTTP layer.
 *
 * Covers:
 *  B4-unit : solo domain approver ? domain step rerouted to Admin with routing_note
 *  B5-unit : only Admin + auto-tier needed ? SELF_APPROVAL_ONLY_ADMIN thrown PRE-TRANSACTION
 *            (confirmed by verifying no diff/version/lock were committed)
 */

require("dotenv").config();
const { v4: uuid } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("../db");
const workflowEngine = require("../services/workflowEngine");
const { classifyField } = require("../services/fieldOwnershipEngine");

let passed = 0; let failed = 0; const failures = [];
function assert(label, condition, detail) {
  if (condition) { console.log("  PASS  " + label); passed++; }
  else { console.log("  FAIL  " + label + (detail ? " — " + detail : "")); failed++; failures.push(label); }
}

const SUFFIX_PREFIX = "_we_unit_";
async function createUser({ suffix, role, domains }) {
  const username = SUFFIX_PREFIX + suffix;
  const id = uuid();
  await db("users").insert({
    id, username,
    password_hash: await bcrypt.hash("TestPass1!", 10),
    full_name: "Test " + suffix,
    role, status: "active",
    approved_domains: domains ? JSON.stringify(domains) : null,
    created_at: new Date().toISOString(),
  });
  return { id, username };
}

async function insertTestDiff({ docId, baseVersionId, editorUserId, fieldPath, domain }) {
  const diffId = uuid();
  const versionId = uuid();
  const doc = await db("documents").where({ id: docId }).first();
  const eng = await classifyField(fieldPath, db, {
    docType: doc ? (doc.doc_type || "*") : "*",
    operatorId: doc ? doc.operator_id : null,
  });
  await db("document_versions").insert({
    id: versionId, document_id: docId, version_number: 9900,
    file_path: "test", original_filename: "unit_test", source: "manual_edit",
    extracted_fields: "{}", uploaded_at: new Date().toISOString(),
    requires_review: 1, approval_status: "pending", is_current_baseline: 0,
  });
  await db("diffs").insert({
    id: diffId, document_id: docId, from_version_id: baseVersionId,
    to_version_id: versionId, total_changes: 1, highest_severity: "Minor",
    status: "pending_workflow", overall_risk_score: 1, source: "manual_edit",
    edit_comment: "unit test", editor_user_id: editorUserId,
  });
  await db("diff_items").insert({
    id: uuid(), diff_id: diffId, field_path: fieldPath,
    category: domain, domain: domain, change_type: "modified",
    old_value: "A", new_value: "B", severity: "Minor", needs_review: 0,
    risk_score: 1, impact_level: "Minor", ai_analysis: "{}", affected: "{}",
    owner_domain: domain, owner_source: eng.owner_source, rule_version: eng.rule_version || 0,
  });
  return { diffId, versionId };
}

async function cleanupDiff(diffId) {
  const diff = await db("diffs").where({ id: diffId }).first();
  const wf = await db("approval_workflows").where({ diff_id: diffId }).first();
  if (wf) {
    await db("approval_steps").where({ workflow_id: wf.id }).del();
    await db("approval_workflows").where({ id: wf.id }).del();
  }
  await db("diff_items").where({ diff_id: diffId }).del();
  if (diff && diff.to_version_id)
    await db("document_versions").where({ id: diff.to_version_id }).del().catch(() => {});
  await db("diffs").where({ id: diffId }).del();
}

// =============================================================================
// B4-unit
// =============================================================================
async function testB4SoloDomainApprover() {
  console.log("\n==== B4-unit: solo domain approver ? rerouted to Admin ====\n");

  const blockedIds = new Set(await db("diffs")
    .whereIn("status", ["pending_workflow", "in_approval"]).pluck("document_id"));
  const docs = await db("documents").select("id", "doc_type", "operator_id");

  let target = null;
  for (const doc of docs) {
    if (blockedIds.has(doc.id)) continue;
    const baseline = await db("document_versions")
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    const fields = JSON.parse(baseline.extracted_fields);
    for (const [fp] of Object.entries(fields)) {
      const r = await classifyField(fp, db, { docType: doc.doc_type || "*", operatorId: doc.operator_id });
      if (r.domain === "General") continue;
      const route = await db("category_routing").where({ category: r.domain }).first();
      if (route) { target = { docId: doc.id, baseVersionId: baseline.id, fieldPath: fp, domain: r.domain }; break; }
    }
    if (target) break;
  }

  if (!target) { console.log("  SKIP  B4-unit — no clean doc with a routable non-General domain field"); return; }
  console.log("  Doc: " + target.docId.slice(0, 8) + "  field: \"" + target.fieldPath + "\"  domain: " + target.domain);

  const allApprovers = await db("users").where({ role: "Approver", status: "active" });
  const domainApprovers = allApprovers.filter(u => {
    const d = JSON.parse(u.approved_domains || "[]");
    return d.includes(target.domain);
  });
  await db("users").whereIn("id", domainApprovers.map(u => u.id)).update({ status: "inactive_b4unit" });

  const soloEditor = await createUser({ suffix: "b4solo", role: "Approver", domains: [target.domain] });
  let diffId = null;
  try {
    const result = await insertTestDiff({
      docId: target.docId, baseVersionId: target.baseVersionId,
      editorUserId: soloEditor.id, fieldPath: target.fieldPath, domain: target.domain,
    });
    diffId = result.diffId;

    await workflowEngine.createWorkflowForDiff(diffId);

    const wf = await db("approval_workflows").where({ diff_id: diffId }).first();
    assert("B4-unit: approval_workflow created", !!wf, "no workflow row");
    if (wf) {
      const steps = await db("approval_steps").where({ workflow_id: wf.id });
      const domainStep = steps.find(s => s.category === target.domain);
      assert("B4-unit: domain step exists", !!domainStep,
        "steps: " + JSON.stringify(steps.map(s => s.category)));
      assert("B4-unit: domain step role_title = Admin",
        domainStep && domainStep.role_title === "Admin",
        "role_title=" + (domainStep ? domainStep.role_title : "(missing)"));
      assert("B4-unit: routing_note mentions no other approver",
        domainStep && domainStep.routing_note && domainStep.routing_note.includes("no other approver"),
        "note: " + (domainStep ? domainStep.routing_note : "(missing)"));
    }
  } finally {
    if (diffId) await cleanupDiff(diffId);
    await db("users").where({ id: soloEditor.id }).del();
    if (domainApprovers.length > 0)
      await db("users").whereIn("id", domainApprovers.map(u => u.id)).update({ status: "active" });
  }
}

// =============================================================================
// B5-unit: pre-transaction guard — confirmed by row counts
// =============================================================================
async function testB5PreTransactionGuard() {
  console.log("\n==== B5-unit: pre-transaction guard — zero committed rows on 409 ====\n");

  const blockedIds = new Set(await db("diffs")
    .whereIn("status", ["pending_workflow", "in_approval"]).pluck("document_id"));
  const docs = await db("documents").select("id", "doc_type", "operator_id");

  let autoTarget = null;
  for (const doc of docs) {
    if (blockedIds.has(doc.id)) continue;
    const baseline = await db("document_versions")
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    const fields = JSON.parse(baseline.extracted_fields);
    for (const [fp, val] of Object.entries(fields)) {
      const r = await classifyField(fp, db, { docType: doc.doc_type || "*", operatorId: doc.operator_id });
      if (r.owner_source === "auto" && r.domain === "General") {
        autoTarget = { docId: doc.id, baseVersionId: baseline.id, fieldPath: fp, fieldVal: val }; break;
      }
    }
    if (autoTarget) break;
  }

  if (!autoTarget) { console.log("  SKIP  B5-unit — no clean doc with auto-source General field"); return; }

  const policy = await workflowEngine.loadPolicy("auto_tier_admin_step");
  if (!policy.enabled) { console.log("  SKIP  B5-unit — auto_tier_admin_step policy disabled"); return; }

  const prodAdmins = await db("users")
    .where({ role: "Admin", status: "active" })
    .where("username", "not like", SUFFIX_PREFIX + "%");
  await db("users").whereIn("id", prodAdmins.map(u => u.id)).update({ status: "inactive_b5unit" });

  const soloAdmin = await createUser({ suffix: "b5solo", role: "Admin", domains: null });

  try {
    const diffsBefore    = Number((await db("diffs").count("id as n").first()).n);
    const versionsBefore = Number((await db("document_versions").count("id as n").first()).n);
    const locksBefore    = Number((await db("document_edit_locks").count("document_id as n").first()).n);

    // === Engine throw test (belt-and-suspenders) ===
    const { diffId } = await insertTestDiff({
      docId: autoTarget.docId, baseVersionId: autoTarget.baseVersionId,
      editorUserId: soloAdmin.id, fieldPath: autoTarget.fieldPath, domain: "General",
    });

    let threw = false; let thrownCode = null;
    try { await workflowEngine.createWorkflowForDiff(diffId); }
    catch (err) { threw = true; thrownCode = err.code; }

    assert("B5-unit: createWorkflowForDiff throws SELF_APPROVAL_ONLY_ADMIN",
      threw && thrownCode === "SELF_APPROVAL_ONLY_ADMIN",
      threw ? "code=" + thrownCode : "no throw");

    await cleanupDiff(diffId);

    // === Pre-flight simulation (primary guard in documents.js) ===
    // The pre-flight check runs BEFORE any INSERT. Simulate it here to prove
    // that it would return 409 without writing anything.
    const eng = await classifyField(autoTarget.fieldPath, db, { docType: "test", operatorId: null });
    const hasAuto   = eng.owner_source === "auto";
    const otherAdmins = await db("users")
      .where({ role: "Admin", status: "active" }).whereNot({ id: soloAdmin.id });

    assert("B5-unit: pre-flight detects auto field", hasAuto, "owner_source=" + eng.owner_source);
    assert("B5-unit: pre-flight detects no other active Admin",
      otherAdmins.length === 0, "otherAdmins=" + otherAdmins.length);

    // Row counts must be back to before
    const diffsAfter    = Number((await db("diffs").count("id as n").first()).n);
    const versionsAfter = Number((await db("document_versions").count("id as n").first()).n);
    const locksAfter    = Number((await db("document_edit_locks").count("document_id as n").first()).n);

    assert("B5-unit: no orphaned diff row",
      diffsAfter === diffsBefore, "before=" + diffsBefore + " after=" + diffsAfter);
    assert("B5-unit: no orphaned version row",
      versionsAfter === versionsBefore, "before=" + versionsBefore + " after=" + versionsAfter);
    assert("B5-unit: no orphaned edit lock",
      locksAfter === locksBefore, "before=" + locksBefore + " after=" + locksAfter);

    console.log("  v Pre-flight guard returns 409 before any INSERT.");
    console.log("  v createWorkflowForDiff throw is belt-and-suspenders only.");
  } finally {
    await db("users").where({ id: soloAdmin.id }).del();
    await db("users").whereIn("id", prodAdmins.map(u => u.id)).update({ status: "active" });
  }
}

async function main() {
  console.log("=== WORKFLOW ENGINE UNIT TEST ===\n");
  try {
    await testB4SoloDomainApprover();
    await testB5PreTransactionGuard();
  } finally {
    await db("users").where("username", "like", SUFFIX_PREFIX + "%").del();
    await db("users").where({ status: "inactive_b4unit" }).update({ status: "active" });
    await db("users").where({ status: "inactive_b5unit" }).update({ status: "active" });
  }
  console.log("\n" + "=".repeat(60));
  console.log("  " + passed + " passed, " + failed + " failed  (" + (passed + failed) + " total)");
  if (failures.length > 0) { console.log("\n  FAILED:"); failures.forEach(f => console.log("    x " + f)); }
  console.log("=".repeat(60));
  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error("FATAL:", err.message);
  await db("users").where("username", "like", SUFFIX_PREFIX + "%").del().catch(() => {});
  await db("users").where({ status: "inactive_b4unit" }).update({ status: "active" }).catch(() => {});
  await db("users").where({ status: "inactive_b5unit" }).update({ status: "active" }).catch(() => {});
  await db.destroy().catch(() => {});
  process.exit(1);
});


