require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first'); // Fix IPv6 ENETUNREACH on Render
}
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const db = require('./db'); // Knex instance — exposes db.bootstrap()
const heartbeatPoller = require('./services/heartbeatPoller');

const app = express();
app.use(cors());
app.use(express.json());

const { router: authRouter, requireRole, requireAuth } = require('./routes/auth');
app.use('/api/auth', authRouter);

// Per-route gating inside each router (mixed GET/POST roles):
app.use('/api/operators',         require('./routes/operators'));
app.use('/api/documents',         require('./routes/documents'));
app.use('/api/diffs',             require('./routes/diffs'));
app.use('/api/approvals',         require('./routes/approvals'));
app.use('/api/dashboard',         require('./routes/dashboard'));
app.use('/api/workflow',          require('./routes/workflow'));
app.use('/api/reports',           require('./routes/reports'));

// Blanket gates — all endpoints share the same role requirement:
app.use('/api/settings',          requireRole('Admin'),   require('./routes/settings'));
app.use('/api/admin',             requireRole('Admin'),   require('./routes/admin'));
app.use('/api/users',             requireRole('Admin'),   require('./routes/users'));
app.use('/api/notifications',     requireAuth,            require('./routes/notifications'));
app.use('/api/master-repository', requireAuth,            require('./routes/masterRepository'));
app.use('/api/network',           requireAuth,            require('./routes/network'));
app.use('/api/assistant',         requireAuth,            require('./routes/assistant'));

app.use(express.static(path.join(__dirname, '../frontend')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 4021;

// Run migrations + seed + dedup BEFORE accepting HTTP traffic.
db.bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`IR21/RAEX Roaming Document Control Center running on port ${PORT}`);

      const heartbeatEnabled    = (process.env.HEARTBEAT_ENABLED    || 'true') !== 'false';
      const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS  || 20000);
      if (heartbeatEnabled) {
        heartbeatPoller.start(heartbeatIntervalMs);
        console.log(`Heartbeat poller active — checking each heartbeat operator's watch folder every ${heartbeatIntervalMs / 1000}s`);
      } else {
        console.log('Heartbeat poller disabled (HEARTBEAT_ENABLED=false)');
      }

      const reportSchedulerEnabled = (process.env.REPORT_SCHEDULE_ENABLED || 'true') !== 'false';
      const reportIntervalMs       = Number(process.env.REPORT_INTERVAL_MS  || 86400000); // 24 hours
      if (reportSchedulerEnabled) {
        const reportScheduler = require('./services/reportScheduler');
        reportScheduler.start(reportIntervalMs);
        console.log(`Report scheduler active — generating operator daily reports every ${reportIntervalMs / 1000 / 60 / 60}h`);
      } else {
        console.log('Report scheduler disabled (REPORT_SCHEDULE_ENABLED=false)');
      }
    });
  })
  .catch(err => {
    console.error('Bootstrap failed — server not started:', err);
    process.exit(1);
  });
