#!/usr/bin/env node
'use strict';
/**
 * diagnose_auth.js — Step-by-step auth diagnostics.
 * Run: node scripts/diagnose_auth.js
 *
 * 1. Dumps all users table rows (id, username, role, status, hash prefix)
 * 2. Confirms migration table state (which migrations have run)
 * 3. Tests bcrypt.compare directly against each stored hash with a canary
 * 4. Checks if approved_domains column is parseable JSON (line 50 in auth.js would throw if not)
 */

const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db     = require('../db');

async function main() {
  console.log('\n════════════════════════════════════════════════');
  console.log(' Auth Diagnostics — ' + new Date().toISOString());
  console.log('════════════════════════════════════════════════\n');

  // ── 1. Migration state ─────────────────────────────────────────────────────
  console.log('── 1. Applied migrations ─────────────────────────────────────');
  try {
    const applied = await db('knex_migrations').orderBy('id').select('name', 'batch');
    applied.forEach(m => console.log(`  [batch ${m.batch}] ${m.name}`));
  } catch (e) {
    console.log('  ERROR reading knex_migrations:', e.message);
  }

  // ── 2. Raw users table ─────────────────────────────────────────────────────
  console.log('\n── 2. Users table (raw) ──────────────────────────────────────');
  let users;
  try {
    users = await db('users').select(
      'id', 'username', 'role', 'status', 'password_hash', 'approved_domains', 'created_at'
    );
    if (users.length === 0) {
      console.log('  ⚠  TABLE IS EMPTY — seed_users.js has never run or users were deleted');
    } else {
      for (const u of users) {
        const hashOk  = typeof u.password_hash === 'string' && u.password_hash.startsWith('$2');
        const domainOk = !u.approved_domains || (() => { try { JSON.parse(u.approved_domains); return true; } catch { return false; } })();
        console.log(`  username:    ${u.username}`);
        console.log(`  role:        ${u.role}`);
        console.log(`  status:      ${u.status}`);
        console.log(`  hash prefix: ${u.password_hash ? u.password_hash.substring(0, 7) + '...' : 'NULL/EMPTY ⚠'}`);
        console.log(`  hash valid:  ${hashOk ? '✓ looks like bcrypt' : '✗ NOT a bcrypt hash ← BUG HERE'}`);
        console.log(`  domains:     ${u.approved_domains || '(null)'} — parse: ${domainOk ? '✓' : '✗ INVALID JSON ← will throw on login'}`);
        console.log(`  created_at:  ${u.created_at}`);
        console.log('  ─────────────────────────────────────────────────────');
      }
    }
  } catch (e) {
    console.log('  ERROR reading users table:', e.message);
    console.log('  → Does the users table exist? Run: node scripts/seed_users.js');
    await db.destroy();
    process.exit(1);
  }

  // ── 3. Schema: confirm password_hash column exists ─────────────────────────
  console.log('\n── 3. Schema check ───────────────────────────────────────────');
  try {
    const hasHash = await db.schema.hasColumn('users', 'password_hash');
    console.log(`  password_hash column exists: ${hasHash ? '✓' : '✗ MISSING — migration 005 did not run'}`);
    const hasStatus = await db.schema.hasColumn('users', 'status');
    console.log(`  status column exists:        ${hasStatus ? '✓' : '✗ MISSING'}`);
  } catch (e) {
    console.log('  Schema check error:', e.message);
  }

  // ── 4. Live bcrypt.compare test ────────────────────────────────────────────
  console.log('\n── 4. Live bcrypt.compare test (canary check) ────────────────');
  if (users && users.length > 0) {
    const testUser = users[0];
    // Test that the stored hash *structurally* verifies a known matching password
    // We can't know the real password, but we can:
    //   (a) hash a fresh value and compare it against itself — confirms bcrypt works
    //   (b) compare 'wrongpassword' against the stored hash — should return false
    try {
      const freshHash = bcrypt.hashSync('canary_test_pw_12345', 10);
      const selfMatch = await bcrypt.compare('canary_test_pw_12345', freshHash);
      console.log(`  bcrypt self-test (hash then compare): ${selfMatch ? '✓ OK' : '✗ BCRYPT BROKEN'}`);

      const wrongMatch = await bcrypt.compare('wrongpassword', testUser.password_hash);
      console.log(`  bcrypt wrong-password test vs ${testUser.username}: ${wrongMatch ? '✗ INCORRECTLY MATCHED (serious bug)' : '✓ Correctly rejected'}`);

      // The real culprit check: does the hash look like it was stored with a different salt rounds?
      const rounds = parseInt((testUser.password_hash || '').split('$')[2], 10);
      console.log(`  bcrypt cost rounds in stored hash: ${isNaN(rounds) ? 'UNKNOWN (not a bcrypt hash)' : rounds}`);
      console.log(`  seed_users.js uses rounds: 12`);
    } catch (e) {
      console.log('  bcrypt test error:', e.message);
    }
  }

  // ── 5. Test the actual auth.js query path ─────────────────────────────────
  console.log('\n── 5. Replicate auth.js query ────────────────────────────────');
  const testUsername = 'rishithathoka@gmail.com';
  try {
    const user = await db('users').where({ username: testUsername }).first();
    if (!user) {
      console.log(`  ✗ No user found for username="${testUsername}"`);
      console.log('    → The row does not exist. Run seed_users.js');
    } else {
      console.log(`  ✓ User row found for "${testUsername}"`);
      console.log(`  status: ${user.status}`);
      if (user.status !== 'active') {
        console.log('  ✗ STATUS IS NOT "active" ← THIS IS WHY LOGIN FAILS');
      } else {
        console.log('  ✓ status = active');
      }
      console.log(`  password_hash present: ${!!user.password_hash}`);
      console.log(`  hash value (first 20 chars): ${(user.password_hash || '').substring(0, 20)}`);
    }
  } catch (e) {
    console.log('  Query error:', e.message);
  }

  console.log('\n════════════════════════════════════════════════\n');
  await db.destroy();
}

main().catch(err => {
  console.error('Diagnostics failed:', err);
  process.exit(1);
});
