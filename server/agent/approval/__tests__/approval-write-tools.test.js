/**
 * approval-write-tools.test.js
 * Tests for the Approval Model and Canvas Write Tools.
 *
 * Tests: approval creation, approval/denial, validation,
 * version binding, tool authorization, and approval gate.
 */

const assert = require('assert');
const {
  APPROVAL_STATUS,
  APPROVAL_TYPES,
  createApprovalRequest,
  approveRequest,
  denyRequest,
  validateApproval,
  generateApprovalId,
} = require('../approval-model');
const {
  TOOL_PERMISSIONS,
  registerTool,
  clearTools,
  getTool,
  hasTool,
} = require('../../tools/tool-registry');
const { createToolRuntime, createSuccessResult, createErrorResult } = require('../../tools/tool-runtime');

let passed = 0;
let total = 0;

function ok(condition, msg) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

function eq(actual, expected, msg) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg} — expected "${expected}", got "${actual}"`);
    process.exit(1);
  }
}

// ─── Approval Model Tests ─────────────────────────────────────────

console.log('\n=== Approval Model Tests ===');

(() => {
  const approval = createApprovalRequest({
    jobId: 'ajob_test_001',
    userId: 100,
    type: APPROVAL_TYPES.SUBMISSION,
    artifactId: 'art_001',
    artifactVersion: 1,
  });

  ok(approval.id.startsWith('appr_'), 'Approval ID has correct prefix');
  eq(approval.jobId, 'ajob_test_001', 'Job ID is set');
  eq(approval.userId, 100, 'User ID is set');
  eq(approval.type, APPROVAL_TYPES.SUBMISSION, 'Type is SUBMISSION');
  eq(approval.artifactId, 'art_001', 'Artifact ID is set');
  eq(approval.artifactVersion, 1, 'Artifact version is set');
  eq(approval.status, APPROVAL_STATUS.PENDING, 'Initial status is PENDING');
  ok(approval.expiresAt !== undefined, 'Expiration is set');

  const approved = approveRequest(approval, 100);
  eq(approved.status, APPROVAL_STATUS.APPROVED, 'Status becomes APPROVED');
  eq(approved.approvedBy, 100, 'Approved by user');
  ok(approved.approvedAt !== undefined, 'Approval timestamp is set');

  const denied = denyRequest(approval, 'Not ready yet');
  eq(denied.status, APPROVAL_STATUS.DENIED, 'Status becomes DENIED');
  eq(denied.denialReason, 'Not ready yet', 'Denial reason is set');

  // Validation
  ok(validateApproval(approved, 'art_001', 1).valid, 'Valid approval passes');
  ok(!validateApproval(approved, 'art_999', 1).valid, 'Wrong artifact fails');
  ok(!validateApproval(approved, 'art_001', 2).valid, 'Wrong version fails');

  const expired = { ...approved, expiresAt: new Date(Date.now() - 1000).toISOString() };
  ok(!validateApproval(expired, 'art_001', 1).valid, 'Expired approval fails');
  ok(!validateApproval(null, 'art_001', 1).valid, 'Null approval fails');
  ok(!validateApproval(denied, 'art_001', 1).valid, 'Denied approval fails');
  ok(!validateApproval(approval, 'art_001', 1).valid, 'Pending approval fails');
})();

// ─── Permission Level Tests ────────────────────────────────────────

console.log('\n=== Permission Level Tests ===');

(() => {
  eq(TOOL_PERMISSIONS.READ, 'READ', 'READ permission exists');
  eq(TOOL_PERMISSIONS.GENERATE, 'GENERATE', 'GENERATE permission exists');
  eq(TOOL_PERMISSIONS.WRITE, 'WRITE', 'WRITE permission exists');
  eq(TOOL_PERMISSIONS.SUBMIT, 'SUBMIT', 'SUBMIT permission exists');
})();

// ─── Write Tools Registration Tests ────────────────────────────────

console.log('\n=== Write Tools Registration Tests ===');

(() => {
  clearTools();

  const { registerCanvasWriteTools } = require('../../tools/canvas-write-tools');
  registerCanvasWriteTools({
    canvasService: {},
    artifactStorage: { readArtifact: () => Buffer.from('test') },
    getJob: () => null,
    addEvent: () => {},
  });

  ok(hasTool('canvas.upload_file'), 'canvas.upload_file is registered');
  ok(hasTool('canvas.create_comment'), 'canvas.create_comment is registered');
  ok(hasTool('canvas.submit_assignment'), 'canvas.submit_assignment is registered');

  const uploadTool = getTool('canvas.upload_file');
  ok(uploadTool.permissions.includes(TOOL_PERMISSIONS.WRITE), 'Upload has WRITE permission');

  const commentTool = getTool('canvas.create_comment');
  ok(commentTool.permissions.includes(TOOL_PERMISSIONS.WRITE), 'Comment has WRITE permission');

  const submitTool = getTool('canvas.submit_assignment');
  ok(submitTool.permissions.includes(TOOL_PERMISSIONS.SUBMIT), 'Submit has SUBMIT permission');
})();

// ─── Tool Runtime Authorization Tests ──────────────────────────────

console.log('\n=== Write Tool Authorization Tests ===');

(async () => {
  clearTools();

  // Register a mock SUBMIT tool
  registerTool({
    id: 'test.submit_assignment',
    name: 'Submit Assignment',
    permissions: [TOOL_PERMISSIONS.SUBMIT],
    inputSchema: { type: 'object' },
    execute: async () => createSuccessResult({ submitted: true }),
  });

  // Register a mock WRITE tool
  registerTool({
    id: 'test.upload_file',
    name: 'Upload File',
    permissions: [TOOL_PERMISSIONS.WRITE],
    inputSchema: { type: 'object' },
    execute: async () => createSuccessResult({ uploaded: true }),
  });

  const agentService = { isAgenticHelperEnabled: () => true };
  const agentJobService = {
    getJob: (userId, jobId) => {
      const jobs = {
        'job_no_approval': {
          id: 'job_no_approval', userId: 100, courseId: 200, assignmentId: 300,
          state: 'EXECUTING', approval: null,
        },
        'job_approved': {
          id: 'job_approved', userId: 100, courseId: 200, assignmentId: 300,
          state: 'EXECUTING',
          approval: {
            id: 'appr_001', status: 'APPROVED', approvedBy: 100,
            artifactId: 'art_001', artifactVersion: 1,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };
      return jobs[jobId] || null;
    },
  };

  const runtime = createToolRuntime({ agentService, agentJobService, onEvent: () => {} });

  // Test 1: SUBMIT without approval → rejected
  const noApproval = await runtime.execute(
    { tool: 'test.submit_assignment', arguments: {}, jobId: 'job_no_approval' },
    100
  );
  eq(noApproval.success, false, 'SUBMIT without approval is rejected');
  ok(noApproval.error.message.includes('approval'), 'Error mentions approval');

  // Test 2: SUBMIT with approval → authorized
  const withApproval = await runtime.execute(
    { tool: 'test.submit_assignment', arguments: {}, jobId: 'job_approved' },
    100
  );
  ok(withApproval.success, 'SUBMIT with approval succeeds');

  // Test 3: WRITE in EXECUTING state → authorized
  const writeResult = await runtime.execute(
    { tool: 'test.upload_file', arguments: {}, jobId: 'job_approved' },
    100
  );
  ok(writeResult.success, 'WRITE in EXECUTING state succeeds');

  // Test 4: Wrong user → rejected
  const wrongUser = await runtime.execute(
    { tool: 'test.submit_assignment', arguments: {}, jobId: 'job_approved' },
    200
  );
  eq(wrongUser.success, false, 'Wrong user is rejected');
  ok(wrongUser.error.message.includes('not belong'), 'Error mentions ownership');
})();

// ─── Approval Flow Integration Tests ───────────────────────────────

console.log('\n=== Approval Flow Integration Tests ===');

(() => {
  const job = {
    id: 'ajob_flow_001',
    userId: 100,
    courseId: 200,
    assignmentId: 300,
    state: 'EXECUTING',
    artifacts: [
      { id: 'art_flow_001', status: 'READY', filename: 'essay.docx', type: 'docx', size: 5000, artifactVersion: 1 },
    ],
    approval: null,
  };

  ok(!job.approval, 'Job has no approval initially');

  // Create approval
  const approval = createApprovalRequest({
    jobId: job.id,
    userId: 100,
    type: APPROVAL_TYPES.SUBMISSION,
    artifactId: 'art_flow_001',
    artifactVersion: 1,
  });
  job.approval = approval;
  eq(job.approval.status, APPROVAL_STATUS.PENDING, 'Approval is PENDING');

  // Pending → fails validation
  ok(!validateApproval(job.approval, 'art_flow_001', 1).valid, 'Pending approval fails');

  // Approve
  job.approval = approveRequest(job.approval, 100);
  eq(job.approval.status, APPROVAL_STATUS.APPROVED, 'Approval is APPROVED');

  // Approved v1 → passes
  ok(validateApproval(job.approval, 'art_flow_001', 1).valid, 'Approved v1 passes');

  // Artifact v2 → stale approval fails
  ok(!validateApproval(job.approval, 'art_flow_001', 2).valid, 'Stale v1 approval fails for v2');

  // Different artifact → fails
  ok(!validateApproval(job.approval, 'art_other', 1).valid, 'Wrong artifact fails');
})();

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed}/${total} passed, ${total - passed} failed`);
console.log('='.repeat(50));

if (total - passed > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed!\n');
}
