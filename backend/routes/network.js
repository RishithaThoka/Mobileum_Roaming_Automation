const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/network/sla
router.get('/sla', (req, res) => {
  try {
    // 1. Get all operators
    const operators = db.prepare('SELECT * FROM operators').all();
    
    // 2. Fetch all workflow states joined with documents
    const workflows = db.prepare(`
      SELECT 
        ws.id, ws.document_id, ws.stage_status, ws.updated_at,
        d.operator_id, d.created_at as ingested_at
      FROM document_workflow_state ws
      JOIN documents d ON ws.document_id = d.id
    `).all();

    // Configuration: 5 days threshold for SLA
    const slaThresholdDays = 5;
    const slaThresholdMs = slaThresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Aggregate platform metrics
    let totalRollbacks = 0;
    let totalCompleted = 0;
    let totalOnTime = 0;
    let operatorsInBreach = new Set();
    
    // Map to store per-operator metrics
    const opStats = {};
    operators.forEach(op => {
      opStats[op.id] = {
        operator: op,
        total_processed: 0,
        audited: 0,
        rejected: 0,
        rolled_back: 0,
        cycle_time_sum_ms: 0,
        cycle_time_count: 0,
        recent_outcomes: [],
        breaching: false
      };
    });

    workflows.forEach(wf => {
      const stats = opStats[wf.operator_id];
      if (!stats) return; // dangling doc

      stats.total_processed++;
      
      const ingestedMs = new Date(wf.ingested_at).getTime();
      const updatedMs = new Date(wf.updated_at).getTime();
      const durationMs = updatedMs - ingestedMs;
      
      // Categorize terminal states
      const isTerminal = ['deployed', 'rejected', 'failed', 'rolled_back'].includes(wf.stage_status);
      
      if (isTerminal) {
        if (wf.stage_status === 'deployed') {
          stats.audited++;
          totalCompleted++;
          if (durationMs <= slaThresholdMs) totalOnTime++;
        }
        else if (wf.stage_status === 'rejected') stats.rejected++;
        else if (wf.stage_status === 'rolled_back' || wf.stage_status === 'failed') {
          stats.rolled_back++;
          totalRollbacks++;
        }
        
        stats.cycle_time_sum_ms += durationMs;
        stats.cycle_time_count++;
        
        stats.recent_outcomes.push({
          status: wf.stage_status,
          date: wf.updated_at,
          ms: updatedMs
        });
      } else {
        // Active pipeline: check for breach
        const activeDurationMs = now - ingestedMs;
        if (activeDurationMs > slaThresholdMs) {
          stats.breaching = true;
          operatorsInBreach.add(wf.operator_id);
        }
      }
    });

    const opList = Object.values(opStats).map(stats => {
      // Sort recent outcomes desc
      stats.recent_outcomes.sort((a, b) => b.ms - a.ms);
      
      let health = 'Healthy';
      if (stats.breaching) health = 'Action Required';
      else if (stats.rolled_back > 0 || stats.rejected > 0) health = 'Attention Needed';

      const avgCycleMs = stats.cycle_time_count > 0 ? (stats.cycle_time_sum_ms / stats.cycle_time_count) : null;
      
      return {
        id: stats.operator.id,
        name: stats.operator.name,
        country: stats.operator.country,
        region: stats.operator.region,
        total_processed: stats.total_processed,
        audited: stats.audited,
        rejected: stats.rejected,
        rolled_back: stats.rolled_back,
        avg_cycle_days: avgCycleMs ? (avgCycleMs / (1000 * 60 * 60 * 24)).toFixed(1) : '-',
        last_outcome: stats.recent_outcomes.length > 0 ? stats.recent_outcomes[0] : null,
        health: health
      };
    });

    const platform = {
      on_time_rate: totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 100,
      total_rollbacks: totalRollbacks,
      breaching_operators_count: operatorsInBreach.size,
      sla_threshold_days: slaThresholdDays
    };
    
    // Cross-partner propagation mock
    const cross_partner = workflows.some(w => w.stage_status === 'deploying') ? [
      {
        id: 'prop-1',
        title: 'Global Roaming Agreement Update (LTE)',
        affected_count: 3,
        status: 'Propagating',
        details: 'Changes deploying to multiple connected domains simultaneously.'
      }
    ] : [];

    res.json({
      platform,
      operators: opList,
      cross_partner
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
