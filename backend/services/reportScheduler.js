const reportService = require('./reportService');

let intervalHandle = null;

function start(intervalMs) {
  if (intervalHandle) return; // already running
  
  intervalHandle = setInterval(() => {
    reportService.generateAllOperatorReports().catch(err => {
      console.error('Scheduled report generation failed:', err.message);
    });
  }, intervalMs);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  start,
  stop
};
