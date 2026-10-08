#!/usr/bin/env node
'use strict';
/**
 * force_reseed_users.js — FORCE re-hash and update ALL 6 user accounts.
 *
 * Unlike seed_users.js which SKIPS existing accounts, this script:
 *   1. Runs all pending migrations
 *   2. For every account in SEED_ACCOUNTS:
 *      - If the row exists → UPDATE password_hash + status='active'
 *      - If the row doesn't exist → INSERT it fresh
 *   3. Prints the new credentials table with plaintext passwords (once only)
 *
 * Run: node scripts/force_reseed_users.js
 * ⚠  This invalidates ALL existing sessions — users will need to log in again.
 */

const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db     = require('../db');

const SEED_ACCOUNTS = [
  { username: 'rishithathoka@gmail.com',      role: 'Admin',    full_name: 'Rishitha Thoka',     approved_domains: null },
  { username: 'rishitha.t1201@gmail.com',      role: 'Approver', full_name: 'Rishitha T',         approved_domains: '["Security (IPsec)"]' },
  { username: 'e0322017@sret.edu.in',          role: 'Approver', full_name: 'Routing Approver',   approved_domains: '["Routing (GT)"]' },
  { username: 'bhargownarravula777@gmail.com', role: 'Approver', full_name: 'Bhargownarra Vula',  approved_domains: '["Commercial (IOT)"]' },
  { username: 'e0322026@sret.edu.in',          role: 'Approver', full_name: 'APN Approver',       approved_domains: '["Packet Core (APN)"]' },
  { username: 'e0322046@sret.edu.in',          role: 'Approver', full_name: 'Voice SMS Approver', approved_domains: '["Voice/SMS (IMSI)"]' },
];

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(' Force Reseed Users — ' + new Date().toISOString());
  console.log('════════════════════════════════════════════════════════════\n');

  // Step 1: Run all pending migrations
  console.log('Step 1: Running pending migrations...');
  await db.migrate.latest();
  console.log('  ✓ Migrations up to date\n');

  const results = [];

  // Step 2: For each account, generate new password and upsert
  console.log('Step 2: Force-updating all accounts...');
  for (const account of SEED_ACCOUNTS) {
    const plainPassword = crypto.randomBytes(12).toString('base64url'); // 16 URL-safe chars
    const passwordHash  = bcrypt.hashSync(plainPassword, 12);

    const existing = await db('users').where({ username: account.username }).first();

    if (existing) {
      await db('users').where({ username: account.username }).update({
        password_hash:    passwordHash,
        role:             account.role,
        full_name:        account.full_name,
        approved_domains: account.approved_domains,
        status:           'active',
      });
      console.log(`  UPDATED: ${account.username}`);
    } else {
      await db('users').insert({
        id:               uuid(),
        username:         account.username,
        password_hash:    passwordHash,
        role:             account.role,
        full_name:        account.full_name,
        approved_domains: account.approved_domains,
        status:           'active',
      });
      console.log(`  CREATED: ${account.username}`);
    }

    results.push({ ...account, password: plainPassword });
  }

  // Step 3: Fix category_routing
  console.log('\nStep 3: Ensuring category_routing is correct...');
  try {
    const routingRow = await db('category_routing').where({ category: 'Routing (GT)' }).first();
    if (routingRow && !routingRow.approver_email) {
      await db('category_routing')
        .where({ category: 'Routing (GT)' })
        .update({ approver_email: 'e0322017@sret.edu.in' });
      console.log('  FIXED: category_routing Routing (GT) approver_email');
    } else if (!routingRow) {
      console.log('  SKIP: category_routing row not found (startup seed handles this)');
    } else {
      console.log('  OK: category_routing already correct');
    }
  } catch (e) {
    console.log('  SKIP: category_routing fix failed (non-fatal):', e.message);
  }

  // Step 4: Verify bcrypt round-trip for first account
  console.log('\nStep 4: Round-trip bcrypt verification...');
  const verifyUser = results[0];
  const storedRow  = await db('users').where({ username: verifyUser.username }).first();
  const verifyOk   = await bcrypt.compare(verifyUser.password, storedRow.password_hash);
  console.log(`  bcrypt.compare("${verifyUser.password.substring(0, 4)}...", stored_hash) = ${verifyOk ? '✓ MATCH — auth WILL work' : '✗ NO MATCH — bcrypt bug'}`);
  if (!verifyOk) {
    console.error('\n  ✗ CRITICAL: bcrypt round-trip failed. This is a bcryptjs bug or version mismatch.');
    await db.destroy();
    process.exit(1);
  }

  // Step 5: Print credentials table
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(' NEW CREDENTIALS (save now — never shown again)');
  console.log('════════════════════════════════════════════════════════════');
  console.log('┌─────────────────────────────────────────┬──────────┬──────────────────────┐');
  console.log('│ Username                                │ Role     │ Password             │');
  console.log('├─────────────────────────────────────────┼──────────┼──────────────────────┤');
  for (const r of results) {
    const u = r.username.padEnd(39);
    const role = r.role.padEnd(8);
    const pw   = r.password.padEnd(20);
    console.log(`│ ${u} │ ${role} │ ${pw} │`);
  }
  console.log('└─────────────────────────────────────────┴──────────┴──────────────────────┘');
  console.log('\n⚠  Save these passwords now. They will NEVER be shown again.');
  console.log('⚠  All existing login sessions are now invalid — users must log in again.\n');

  await db.destroy();
}

main().catch(err => {
  console.error('\nForce reseed FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
