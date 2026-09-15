#!/usr/bin/env node
'use strict';

/**
 * Seed script — creates the initial 6 user accounts.
 *
 * Run once after migration: node scripts/seed_users.js
 *
 * Generates secure random passwords at runtime. Prints them to console
 * ONCE — never stored or logged anywhere else.
 *
 * Idempotent: skips any username that already exists.
 *
 * Also fixes the corrupted category_routing row for Routing (GT).
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');

const SEED_ACCOUNTS = [
  { username: 'rishithathoka@gmail.com',        role: 'Admin',    full_name: 'Rishitha Thoka',     approved_domains: null },
  { username: 'rishitha.t1201@gmail.com',        role: 'Approver', full_name: 'Rishitha T',         approved_domains: '["Security (IPsec)"]' },
  { username: 'e0322017@sret.edu.in',            role: 'Approver', full_name: 'Routing Approver',   approved_domains: '["Routing (GT)"]' },
  { username: 'bhargownarravula777@gmail.com',   role: 'Approver', full_name: 'Bhargownarra Vula',  approved_domains: '["Commercial (IOT)"]' },
  { username: 'e0322026@sret.edu.in',            role: 'Approver', full_name: 'APN Approver',       approved_domains: '["Packet Core (APN)"]' },
  { username: 'e0322046@sret.edu.in',            role: 'Approver', full_name: 'Voice SMS Approver', approved_domains: '["Voice/SMS (IMSI)"]' },
];

async function main() {
  // Run migrations first to ensure users table exists
  await db.migrate.latest();

  console.log('\n=== User Account Seed ===\n');

  const results = [];

  for (const account of SEED_ACCOUNTS) {
    const existing = await db('users').where({ username: account.username }).first();
    if (existing) {
      console.log(`  SKIP: ${account.username} (already exists)`);
      results.push({ ...account, password: '(existing — not changed)', skipped: true });
      continue;
    }

    // Generate secure random password (16 URL-safe chars)
    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const passwordHash = bcrypt.hashSync(tempPassword, 12);

    await db('users').insert({
      id: uuid(),
      username: account.username,
      password_hash: passwordHash,
      role: account.role,
      full_name: account.full_name,
      approved_domains: account.approved_domains,
      status: 'active',
    });

    results.push({ ...account, password: tempPassword, skipped: false });
    console.log(`  CREATED: ${account.username} (${account.role})`);
  }

  // Fix corrupted category_routing row for Routing (GT)
  const routingRow = await db('category_routing').where({ category: 'Routing (GT)' }).first();
  if (routingRow) {
    await db('category_routing')
      .where({ category: 'Routing (GT)' })
      .update({ approver_email: 'e0322017@sret.edu.in' });
    console.log('\n  FIXED: category_routing "Routing (GT)" approver_email → e0322017@sret.edu.in');
  }

  // Print credentials table
  console.log('\n┌────────────────────────────────────────┬──────────┬─────────────────────┬──────────────────┐');
  console.log('│ Username                               │ Role     │ Full Name           │ Password (1-time)│');
  console.log('├────────────────────────────────────────┼──────────┼─────────────────────┼──────────────────┤');
  for (const r of results) {
    const user = r.username.padEnd(38);
    const role = r.role.padEnd(8);
    const name = r.full_name.substring(0, 19).padEnd(19);
    const pw   = r.skipped ? '(unchanged)'.padEnd(16) : r.password.padEnd(16);
    console.log(`│ ${user} │ ${role} │ ${name} │ ${pw} │`);
  }
  console.log('└────────────────────────────────────────┴──────────┴─────────────────────┴──────────────────┘');

  const newCount = results.filter(r => !r.skipped).length;
  if (newCount > 0) {
    console.log(`\n⚠  Save these ${newCount} password(s) now. They will NEVER be shown again.\n`);
  } else {
    console.log('\n  All accounts already existed — no new passwords generated.\n');
  }

  await db.destroy();
}

main().catch(err => {
  console.error('Seed failed:', err);
  db.destroy();
  process.exit(1);
});
