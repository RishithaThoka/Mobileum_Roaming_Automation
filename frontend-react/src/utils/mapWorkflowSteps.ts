/**
 * mapWorkflowSteps.ts — pure function, no React/network dependencies.
 *
 * Single source of truth that translates a GET /api/workflow/:docId response
 * into the 11-step UI array with real per-document StepStatus values.
 *
 * Rules (agreed in plan):
 *   Steps 1-5   → driven by subStages[] (extraction/comparison/diff/risk) + version existence
 *   Step 6      → driven by stage_status (running→upcoming, ready_for_approval→waiting,
 *                 in_approval→current, approved/deploying/deployed/rolled_back→completed,
 *                 rejected→rejected)
 *   Steps 7-9   → driven by deployment_logs system entries
 *   Step 10     → not_applicable with tooltip "Standing capability — always available"
 *                 once deployment is done; upcoming before that
 *   Step 11     → completed once document exists (audit is live from ingest), labelled
 *                 "Live from ingest" to distinguish from a one-time finished action
 *
 * Known limitation (documented, not a bug):
 *   POST /deploy writes all 4 deployment_log rows atomically, so steps 7/8/9
 *   jump from upcoming → completed simultaneously, not one at a time.
 *   That is the expected behaviour given the current deploy simulation.
 */

import { WorkflowStepDefinition, WorkflowApiResponse, StepStatus } from '../types';
import { WORKFLOW_STEPS_DATA } from '../data/workflowStepsData';

function substageStatus(
  subStages: WorkflowApiResponse['subStages'],
  id: 'extraction' | 'comparison' | 'diff' | 'risk'
): 'pending' | 'complete' | 'failed' | 'not_applicable' {
  const s = subStages.find(s => s.id === id);
  return s ? s.status : 'pending';
}

function hasDeployLog(logs: WorkflowApiResponse['deployment_logs'], system: string): boolean {
  return logs.some(l => l.system === system && l.pass_fail === 'pass');
}

function backendToStep(bs: 'pending' | 'complete' | 'failed' | 'not_applicable'): StepStatus {
  if (bs === 'complete')       return 'completed';
  if (bs === 'not_applicable') return 'not_applicable';
  if (bs === 'failed')         return 'rejected';
  return 'upcoming'; // pending
}

export function mapWorkflowSteps(
  data: WorkflowApiResponse | null,
  loading: boolean
): WorkflowStepDefinition[] {
  // While loading or when no document is selected: return template with all
  // steps as 'upcoming' (honest neutral — no fabricated state).
  if (loading || !data) {
    return WORKFLOW_STEPS_DATA.map(s => ({ ...s, status: 'upcoming' as StepStatus }));
  }

  const { state, subStages, deployment_logs } = data;
  const ss = state.stage_status;

  // ── Step 1: Repository Ingest ──────────────────────────────────────────────
  // Signal: the workflow API responded with a valid state → document was ingested.
  const step1: StepStatus = 'completed';

  // ── Step 2: AI Extraction ──────────────────────────────────────────────────
  const step2: StepStatus = backendToStep(substageStatus(subStages, 'extraction'));

  // ── Step 3: Version Comparison ────────────────────────────────────────────
  const step3: StepStatus = backendToStep(substageStatus(subStages, 'comparison'));

  // ── Step 4: Difference Analysis ───────────────────────────────────────────
  const step4: StepStatus = backendToStep(substageStatus(subStages, 'diff'));

  // ── Step 5: Risk Assessment ───────────────────────────────────────────────
  const step5: StepStatus = backendToStep(substageStatus(subStages, 'risk'));

  // ── Step 6: Approval Workflow ─────────────────────────────────────────────
  // stage_status transitions: running → ready_for_approval → in_approval →
  //   approved (explicit, written by decideStep) → deploying → deployed
  let step6: StepStatus;
  if (['deploying', 'deployed', 'rolled_back'].includes(ss)) {
    step6 = 'completed'; // approval is fully behind us
  } else if (ss === 'approved') {
    step6 = 'completed'; // explicitly approved, about to deploy
  } else if (ss === 'rejected') {
    step6 = 'rejected';
  } else if (ss === 'in_approval') {
    step6 = 'current';
  } else if (ss === 'ready_for_approval') {
    step6 = 'waiting'; // substages resolved, approval hasn't started
  } else {
    step6 = 'upcoming'; // still running substages
  }

  // ── Steps 7–9: driven by deployment_log rows ──────────────────────────────
  // Known limitation: all 4 rows are written atomically by POST /deploy, so
  // these three steps always resolve together (upcoming → completed at once).
  const stagingDone     = hasDeployLog(deployment_logs, 'Staging Environment');
  const productionDone  = hasDeployLog(deployment_logs, 'Production - Billing') &&
                          hasDeployLog(deployment_logs, 'Production - HLR');
  const reconDone       = hasDeployLog(deployment_logs, 'Reconciliation Engine') &&
                          ss === 'deployed';

  let step7: StepStatus;
  if (stagingDone) {
    step7 = 'completed';
  } else if (ss === 'deploying') {
    step7 = 'current';
  } else {
    step7 = 'upcoming';
  }

  const step8: StepStatus = productionDone ? 'completed' : 'upcoming';
  const step9: StepStatus = reconDone       ? 'completed' : 'upcoming';

  // ── Step 10: Rollback Safety ──────────────────────────────────────────────
  // Rollback is a standing capability, not a sequential step that finishes.
  // not_applicable = "Standing capability — always available" once any
  // deployment has occurred. upcoming before that.
  const step10: StepStatus = (ss === 'deployed' || ss === 'rolled_back') ? 'not_applicable' : 'upcoming';

  // ── Step 11: Audit & Reports ──────────────────────────────────────────────
  // Audit log is written from the moment of ingest onward. Always completed.
  // Displayed with label "Live from ingest" to distinguish from a one-time
  // finished action (a deliberate UI distinction per design decision).
  const step11: StepStatus = 'completed';

  const statuses: StepStatus[] = [
    step1, step2, step3, step4, step5,
    step6, step7, step8, step9, step10, step11,
  ];

  return WORKFLOW_STEPS_DATA.map((def, idx) => ({
    ...def,
    status: statuses[idx],
  }));
}
