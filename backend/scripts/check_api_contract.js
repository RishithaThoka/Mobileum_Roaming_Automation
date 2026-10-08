#!/usr/bin/env node
'use strict';

/**
 * check_api_contract.js
 *
 * Static frontend<->backend API path contract checker.
 *
 * What it does:
 *   1. Walks every .ts/.tsx file under frontend-react/src and extracts every
 *      /api/... URL string (static strings and template literals with ${...}
 *      segments normalised to :param).
 *   2. Reads backend/server.js to determine every mount prefix, then reads
 *      each router file and extracts every router.get/post/patch/put/delete
 *      route, combining prefix + sub-path into a full canonical URL.
 *   3. For each unique (method, path) the frontend calls, checks whether a
 *      matching backend route exists (params wildcard-matched).
 *   4. Exits 0 if all paths matched; exits 1 and prints a clear failure list
 *      if any frontend path has no backend route.
 *
 * Usage:
 *   node backend/scripts/check_api_contract.js
 *
 * Zero npm dependencies -- pure Node.js core.
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT    = path.resolve(__dirname, '..', '..');
const BACKEND_DIR  = path.join(REPO_ROOT, 'backend');
const FRONTEND_SRC = path.join(REPO_ROOT, 'frontend-react', 'src');
const ROUTES_DIR   = path.join(BACKEND_DIR, 'routes');
const SERVER_FILE  = path.join(BACKEND_DIR, 'server.js');

// 1. Parse server.js -> { prefix, routerFile } mount table

function parseMounts(serverSrc) {
  const mounts = [];

  // Pattern A: app.use('/api/xxx', [middleware, ...] require('./routes/yyy'))
  const inlineRe = /app\.use\(\s*'(\/api\/[^']+)'\s*(?:,[^)]*?)*,\s*require\(['"]\.\/routes\/([^'"]+)['"]\)\s*\)/g;
  let m;
  while ((m = inlineRe.exec(serverSrc)) !== null) {
    const prefix     = m[1].replace(/\/$/, '');
    const routerName = m[2].replace(/\.js$/, '');
    mounts.push({ prefix, routerFile: path.join(ROUTES_DIR, routerName + '.js') });
  }

  // Pattern B: const { router: authRouter } = require('./routes/auth'); app.use('/api/auth', authRouter);
  const namedRequireRe = /const\s*\{[^}]*router\s*:\s*(\w+)[^}]*\}\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
  const aliasToFile = {};
  while ((m = namedRequireRe.exec(serverSrc)) !== null) {
    aliasToFile[m[1]] = path.join(ROUTES_DIR, m[2].replace(/\.js$/, '') + '.js');
  }

  const namedUseRe = /app\.use\(\s*'(\/api\/[^']+)'\s*,\s*(\w+)\s*\)/g;
  while ((m = namedUseRe.exec(serverSrc)) !== null) {
    const prefix = m[1].replace(/\/$/, '');
    const alias  = m[2];
    if (aliasToFile[alias]) {
      mounts.push({ prefix, routerFile: aliasToFile[alias] });
    }
  }

  return mounts;
}

// 2. Parse a router file -> [{ method, fullPath, source }]

function parseRouterRoutes(routerFile, mountPrefix) {
  if (!fs.existsSync(routerFile)) return [];
  const src = fs.readFileSync(routerFile, 'utf8');
  const routes = [];

  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const method  = m[1].toUpperCase();
    const subPath = m[2] === '/' ? '' : m[2];
    const full    = (mountPrefix + subPath).replace(/\/+$/, '') || '/';
    routes.push({ method, fullPath: full, source: path.basename(routerFile) });
  }
  return routes;
}

// 3. Walk frontend src, extract every /api/ URL

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

function normalizePath(raw) {
  return raw
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\?.*$/, '');
}

function detectMethod(contextChunk) {
  const m = contextChunk.match(/method\s*:\s*['"](\w+)['"]/i);
  return m ? m[1].toUpperCase() : 'GET';
}

function lineNumber(src, charIdx) {
  return src.slice(0, charIdx).split('\n').length;
}

function extractFrontendCalls(files) {
  const calls = [];

  for (const file of files) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }

    const relFile = path.relative(REPO_ROOT, file).replace(/\\/g, '/');

    // Quoted strings: '/api/foo' or "/api/foo"
    const quotedRe = /['"](\/?api\/[^'"?\s\\]+(?:\?[^'"]*)?)['"]/g;
    let m;
    while ((m = quotedRe.exec(src)) !== null) {
      const raw = '/' + m[1].replace(/^\//, '');
      if (!raw.startsWith('/api/')) continue;
      const ctx    = src.slice(m.index, m.index + 300);
      const method = detectMethod(ctx);
      calls.push({ raw, normalized: normalizePath(raw), method, file: relFile, line: lineNumber(src, m.index) });
    }

    // Template literals: `${API_BASE}/api/foo/${id}` or `/api/foo/${id}/bar`
    const tplRe = /`([^`]*\/api\/[^`]+)`/g;
    while ((m = tplRe.exec(src)) !== null) {
      const inner  = m[1];
      const apiIdx = inner.indexOf('/api/');
      if (apiIdx < 0) continue;
      const raw    = inner.slice(apiIdx);
      const ctx    = src.slice(m.index, m.index + 300);
      const method = detectMethod(ctx);
      calls.push({ raw, normalized: normalizePath(raw), method, file: relFile, line: lineNumber(src, m.index) });
    }
  }

  // Deduplicate by (method, normalized)
  const seen = new Set();
  return calls.filter(c => {
    const key = c.method + ':' + c.normalized;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 4. Match a frontend path against backend routes

function buildMatchRegex(backendPath) {
  const escaped = backendPath
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[\w]+/g, '[^/]+')
    .replace(/\\\*/g, '.*');
  return new RegExp('^' + escaped + '/?$');
}

function findMatch(call, backendRoutes) {
  const pathOnly = call.normalized.split('?')[0];
  return backendRoutes.find(r => {
    if (r.method !== call.method) return false;
    return buildMatchRegex(r.fullPath).test(pathOnly);
  });
}

// 5. Main

function main() {
  const serverSrc = fs.readFileSync(SERVER_FILE, 'utf8');

  const mounts = parseMounts(serverSrc);
  const backendRoutes = [];
  for (const { prefix, routerFile } of mounts) {
    backendRoutes.push(...parseRouterRoutes(routerFile, prefix));
  }

  const frontendFiles = walkDir(FRONTEND_SRC);
  const frontendCalls = extractFrontendCalls(frontendFiles);

  const unmatched = [];
  const matched   = [];
  for (const call of frontendCalls) {
    const hit = findMatch(call, backendRoutes);
    if (hit) matched.push({ call, backend: hit });
    else     unmatched.push(call);
  }

  const hr = '='.repeat(70);
  console.log('\n' + hr);
  console.log('  FRONTEND <-> BACKEND API CONTRACT CHECK');
  console.log(hr);
  console.log('\n  Backend mount points : ' + mounts.length);
  console.log('  Backend routes found : ' + backendRoutes.length);
  console.log('  Frontend call sites  : ' + frontendCalls.length + ' unique (method+path)');
  console.log('  [OK] Matched         : ' + matched.length);
  console.log('  [!!] UNMATCHED       : ' + unmatched.length);

  if (unmatched.length > 0) {
    console.log('\n' + hr);
    console.log('  UNMATCHED FRONTEND API CALLS  (no backend route found)');
    console.log(hr + '\n');
    for (const c of unmatched) {
      console.log('  ' + c.method.padEnd(7) + ' ' + c.normalized);
      console.log('           raw    : ' + c.raw);
      console.log('           file   : ' + c.file + ':' + c.line);
      console.log();
    }
  }

  console.log(hr);
  console.log('  ALL BACKEND ROUTES (sorted)');
  console.log(hr);
  const sorted = [...backendRoutes].sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));
  for (const r of sorted) {
    console.log('  ' + r.method.padEnd(7) + ' ' + r.fullPath.padEnd(52) + ' (' + r.source + ')');
  }

  if (unmatched.length > 0) {
    console.log('\n' + hr);
    console.log('  [FAIL] CONTRACT CHECK FAILED -- fix unmatched paths before shipping');
    console.log(hr + '\n');
    process.exit(1);
  } else {
    console.log('\n' + hr);
    console.log('  [PASS] All frontend API calls matched to backend routes.');
    console.log(hr + '\n');
    process.exit(0);
  }
}

main();
