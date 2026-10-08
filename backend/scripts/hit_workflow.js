'use strict';
const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 4021, path, method, headers: {} };
    if (body) {
      const payload = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (req._token) opts.headers['Authorization'] = 'Bearer ' + req._token;
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // Login
  const creds = {
    username: process.env.VERIFY_USERNAME || '',
    password: process.env.VERIFY_PASSWORD || '',
  };
  if (!creds.username || !creds.password) {
    console.error('FATAL: VERIFY_USERNAME and VERIFY_PASSWORD env vars required.');
    process.exit(1);
  }
  const login = await req('POST', '/api/auth/login', creds);
  const { token } = JSON.parse(login.body);
  if (!token) { console.error('Login failed:', login.body); process.exit(1); }
  req._token = token;
  console.log('Logged in.\n');

  // GET /api/workflow/<docId>
  const docId = process.argv[2] || 'bf83fd92-861f-408f-ad72-150f9aec13b5';
  console.log(`GET /api/workflow/${docId}\n`);
  const wf = await req('GET', '/api/workflow/' + docId);
  console.log(`HTTP ${wf.status}`);
  console.log(JSON.stringify(JSON.parse(wf.body), null, 2));
})();
