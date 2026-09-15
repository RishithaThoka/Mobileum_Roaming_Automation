const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');
const workflowEngine = require('../services/workflowEngine');
const { requireRole, requireAuth } = require('./auth');

// Generate and stream an operator's daily report
router.get('/operators/:id/daily', requireAuth, (req, res) => {
  const operatorId = req.params.id;
  try {
    const data = reportService.getOperatorReportData(operatorId);
    if (!data) return res.status(404).json({ error: 'Operator not found' });
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${data.operator.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_daily_report.pdf"`);
    
    // Generate and pipe the PDF
    reportService.generateOperatorReportPDFStream(operatorId, res);
    
    workflowEngine.logAudit('operator', operatorId, 'report_generated', req.user ? req.user.username : 'admin', 'Generated daily PDF report on-demand');
  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Trigger bulk generation manually
router.post('/generate-all', requireRole('Admin'), async (req, res) => {
  try {
    await reportService.generateAllOperatorReports();
    res.json({ message: 'Bulk report generation triggered successfully' });
  } catch (error) {
    console.error('Error triggering bulk report generation:', error);
    res.status(500).json({ error: 'Failed to trigger bulk report generation' });
  }
});

module.exports = router;
