require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first'); // Fix IPv6 ENETUNREACH on Render
}
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // ensures schema is created on boot
const heartbeatPoller = require('./services/heartbeatPoller');

const app = express();
app.use(cors());
app.use(express.json());

const auth = require('./routes/auth');
app.use('/api/auth', auth.router);

app.use('/api/operators', auth.requireAdmin, require('./routes/operators'));
app.use('/api/documents', auth.requireAdmin, require('./routes/documents'));
app.use('/api/diffs', auth.requireAdmin, require('./routes/diffs'));
app.use('/api/approvals', require('./routes/approvals')); // inner routes handle selective public/admin checks
app.use('/api/dashboard', auth.requireAdmin, require('./routes/dashboard'));
app.use('/api/settings', auth.requireAdmin, require('./routes/settings'));
app.use('/api/admin', auth.requireAdmin, require('./routes/admin'));
app.use('/api/notifications', auth.requireAdmin, require('./routes/notifications'));
app.use('/api/master-repository', auth.requireAdmin, require('./routes/masterRepository'));
app.use('/api/workflow', auth.requireAdmin, require('./routes/workflow'));
app.use('/api/network', auth.requireAdmin, require('./routes/network'));
app.use('/api/assistant', auth.requireAdmin, require('./routes/assistant'));

app.use(express.static(path.join(__dirname, '../frontend')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 4021;
app.listen(PORT, () => {
  console.log(`IR21/RAEX Roaming Document Control Center running on port ${PORT}`);

  const heartbeatEnabled = (process.env.HEARTBEAT_ENABLED || 'true') !== 'false';
  const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 20000);
  if (heartbeatEnabled) {
    heartbeatPoller.start(heartbeatIntervalMs);
    console.log(`Heartbeat poller active — checking each heartbeat operator's watch folder every ${heartbeatIntervalMs / 1000}s`);
  } else {
    console.log('Heartbeat poller disabled (HEARTBEAT_ENABLED=false)');
  }
});
