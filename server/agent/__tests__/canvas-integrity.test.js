/**
 * canvas-integrity.test.js
 * Comprehensive tests for Phase 32: Canvas State & Submission Integrity.
 *
 * Tests:
 * 1. Assignment state verification
 * 2. Artifact integrity checks
 * 3. Approval integrity binding
 * 4. Duplicate submission prevention
 * 5. Post-submission verification
 * 6. External change detection
 * 7. Full pre-submission check
 * 8. Integration with write tools
 */

const assert = require('assert');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ─── Load modules ─────────────────────────────────────────────────

const {
  verifyAssignmentState,
  verifyArtifactIntegrity,
  verifyApprovalIntegrity,
  verifyNoDuplicateSubmission,
  verifySubmissionResult,
  detectExternalChanges,
  verifyPreSubmission,
  VERIFICATION_PASSED,
  VERIFICATION_FAILED,
} = require('../canvas-integrity');

const { APPROVAL_STATUS, createApprovalRequest, approveRequest } = require('../approval/approval-model');

// ─── Mock Factories ───────────────────────────────────────────────

function createMockCanvasService(overrides = {}) {
  return {
    fetchOne: overrides.fetchOne || (async () => ({
      id: 123,
      name: 'Test Assignment',
      description: 'Write a report',
      due_at: new Date(Date.now() + 86400000).toISOString(),
      lock_at: null,
      points_possible: 100,
      submission_types: ['online_upload'],
      submission: null,
    })),
    fetchAll: overrides.fetchAll || (async () => []),
    post: overrides.post || (async () => ({ id: 999 })),
  };
}

function createMockArtifactStorage(overrides = {}) {
  return {
    readArtifact: overrides.readArtifact || (() => Buffer.from('test content')),
  };
}

function createMockJob(overrides = {}) {
  return {
    id: 'job_test_001',
    userId: 100,
    courseId: 10,
    assignmentId: 123,
    state: 'READY',
    artifacts: overrides.artifacts || [
      {
        id: 'art_001',
        type: 'docx',
        filename: 'report.docx',
        size: 1024,
        status: 'READY',
        storagePath: '/path/to/report.docx',
        artifactVersion: 1,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
    approval: overrides.approval || null,
    submissionResult: overrides.submissionResult || null,
    manifest: overrides.manifest || {
      identity: { courseId: 10, assignmentId: 123 },
      metadata: { title: 'Test Assignment', submissionTypes: ['online_upload'] },
    },
  };
}

// ─── 1. Assignment State Verification ─────────────────────────────

console.log('\n1. Assignment State Verification');

test('verifyAssignmentState: assignment exists and accepts uploads', async () => {
  const canvasService = createMockCanvasService();
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'ASSIGNMENT_READY');
});

test('verifyAssignmentState: assignment not found', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => { throw new Error('HTTP_404'); },
  });
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 999, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ASSIGNMENT_NOT_FOUND');
});

test('verifyAssignmentState: assignment does not accept uploads', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Quiz', submission_types: ['online_quiz'], submission: null,
    }),
  });
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'SUBMISSION_TYPE_UNSUPPORTED');
});

test('verifyAssignmentState: assignment is locked', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Locked', submission_types: ['online_upload'],
      lock_at: new Date(Date.now() - 86400000).toISOString(), // locked yesterday
      submission: null,
    }),
  });
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ASSIGNMENT_LOCKED');
});

test('verifyAssignmentState: already submitted (warning)', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Test', submission_types: ['online_upload'],
      submission: { workflow_state: 'submitted', submitted_at: new Date().toISOString() },
    }),
  });
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'ALREADY_SUBMITTED');
  assert(result.canResubmit === true);
});

test('verifyAssignmentState: no auth', async () => {
  const result = await verifyAssignmentState(null, null, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'NO_AUTH');
});

test('verifyAssignmentState: canvas unauthorized', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => { throw new Error('UNAUTHORIZED'); },
  });
  const result = await verifyAssignmentState(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'CANVAS_UNAUTHORIZED');
});

// ─── 2. Artifact Integrity ────────────────────────────────────────

console.log('\n2. Artifact Integrity');

test('verifyArtifactIntegrity: valid artifact', () => {
  const job = createMockJob();
  const storage = createMockArtifactStorage({
    readArtifact: () => Buffer.alloc(1024), // matches artifact.size
  });
  const result = verifyArtifactIntegrity(job, 'art_001', storage, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'ARTIFACT_VALID');
});

test('verifyArtifactIntegrity: artifact not found', () => {
  const job = createMockJob();
  const result = verifyArtifactIntegrity(job, 'art_nonexistent', null, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_NOT_FOUND');
});

test('verifyArtifactIntegrity: artifact not READY', () => {
  const job = createMockJob({
    artifacts: [{ id: 'art_001', status: 'GENERATING', type: 'docx' }],
  });
  const result = verifyArtifactIntegrity(job, 'art_001', null, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_NOT_READY');
});

test('verifyArtifactIntegrity: wrong user', () => {
  const job = createMockJob();
  const result = verifyArtifactIntegrity(job, 'art_001', null, 999);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_NOT_OWNED');
});

test('verifyArtifactIntegrity: file missing from storage', () => {
  const job = createMockJob();
  const storage = createMockArtifactStorage({ readArtifact: () => null });
  const result = verifyArtifactIntegrity(job, 'art_001', storage, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_FILE_MISSING');
});

test('verifyArtifactIntegrity: file size mismatch', () => {
  const job = createMockJob({
    artifacts: [{ id: 'art_001', status: 'READY', size: 2048, storagePath: '/x' }],
  });
  const storage = createMockArtifactStorage({ readArtifact: () => Buffer.from('short') });
  const result = verifyArtifactIntegrity(job, 'art_001', storage, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_SIZE_MISMATCH');
});

test('verifyArtifactIntegrity: format not allowed', () => {
  const job = createMockJob({
    artifacts: [{ id: 'art_001', status: 'READY', type: 'docx', filename: 'report.docx' }],
  });
  const result = verifyArtifactIntegrity(job, 'art_001', null, 100, { pdf: true });
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_FORMAT_UNSUPPORTED');
});

test('verifyArtifactIntegrity: artifact changed since approval', () => {
  const job = createMockJob({
    artifacts: [{ id: 'art_001', status: 'READY', artifactVersion: 2 }],
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      artifactId: 'art_001',
      artifactVersion: 1,
    },
  });
  const result = verifyArtifactIntegrity(job, 'art_001', null, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_VERSION_CHANGED');
});

test('verifyArtifactIntegrity: approval for different artifact', () => {
  const job = createMockJob({
    artifacts: [{
      id: 'art_001', status: 'READY', size: 12,
      storagePath: null, // no storagePath skips file check
      artifactVersion: 1,
    }],
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      artifactId: 'art_999',
      artifactVersion: 1,
    },
  });
  const result = verifyArtifactIntegrity(job, 'art_001', null, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'ARTIFACT_MISMATCH');
});

test('verifyArtifactIntegrity: no artifacts in job', () => {
  const job = createMockJob({ artifacts: [] });
  const result = verifyArtifactIntegrity(job, 'art_001', null, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'NO_ARTIFACTS');
});

// ─── 3. Approval Integrity ────────────────────────────────────────

console.log('\n3. Approval Integrity');

test('verifyApprovalIntegrity: valid approval', () => {
  const approval = createApprovalRequest({
    jobId: 'job_test_001',
    userId: 100,
    type: 'SUBMISSION',
    artifactId: 'art_001',
    artifactVersion: 1,
  });
  const approved = approveRequest(approval, 100);
  const job = createMockJob({ approval: approved });
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'APPROVAL_VALID');
});

test('verifyApprovalIntegrity: no approval', () => {
  const job = createMockJob();
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_MISSING');
});

test('verifyApprovalIntegrity: approval denied', () => {
  const job = createMockJob({
    approval: {
      status: APPROVAL_STATUS.DENIED,
      userId: 100,
      jobId: 'job_test_001',
      artifactId: 'art_001',
      artifactVersion: 1,
    },
  });
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_NOT_APPROVED');
});

test('verifyApprovalIntegrity: approval expired', () => {
  const job = createMockJob({
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      userId: 100,
      jobId: 'job_test_001',
      artifactId: 'art_001',
      artifactVersion: 1,
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // expired 1 hour ago
    },
  });
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_EXPIRED');
});

test('verifyApprovalIntegrity: wrong user', () => {
  const job = createMockJob({
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      userId: 200, // different user
      jobId: 'job_test_001',
      artifactId: 'art_001',
      artifactVersion: 1,
    },
  });
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_WRONG_USER');
});

test('verifyApprovalIntegrity: wrong artifact version', () => {
  const job = createMockJob({
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      userId: 100,
      jobId: 'job_test_001',
      artifactId: 'art_001',
      artifactVersion: 1,
    },
  });
  const result = verifyApprovalIntegrity(job, 'art_001', 2, 100); // version 2 but approval for v1
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_ARTIFACT_MISMATCH');
});

test('verifyApprovalIntegrity: wrong job', () => {
  const job = createMockJob({
    approval: {
      status: APPROVAL_STATUS.APPROVED,
      userId: 100,
      jobId: 'job_different',
      artifactId: 'art_001',
      artifactVersion: 1,
    },
  });
  const result = verifyApprovalIntegrity(job, 'art_001', 1, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'APPROVAL_WRONG_JOB');
});

// ─── 4. Duplicate Submission Prevention ───────────────────────────

console.log('\n4. Duplicate Submission Prevention');

test('verifyNoDuplicateSubmission: no existing submission', async () => {
  const job = createMockJob();
  const canvasService = createMockCanvasService({ fetchAll: async () => [] });
  const result = await verifyNoDuplicateSubmission(job, canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'NO_DUPLICATE');
});

test('verifyNoDuplicateSubmission: job already submitted', async () => {
  const job = createMockJob({
    submissionResult: { submitted: true, submissionId: 999, submittedAt: new Date().toISOString() },
  });
  const result = await verifyNoDuplicateSubmission(job, null, null, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'DUPLICATE_SUBMISSION');
});

test('verifyNoDuplicateSubmission: Canvas shows existing submission', async () => {
  const job = createMockJob();
  const canvasService = createMockCanvasService({
    fetchAll: async () => [
      { user_id: 100, workflow_state: 'submitted', submitted_at: new Date().toISOString() },
    ],
  });
  const result = await verifyNoDuplicateSubmission(job, canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'DUPLICATE_SUBMISSION_CANVAS');
});

test('verifyNoDuplicateSubmission: Canvas check fails gracefully', async () => {
  const job = createMockJob();
  const canvasService = createMockCanvasService({
    fetchAll: async () => { throw new Error('Network error'); },
  });
  const result = await verifyNoDuplicateSubmission(job, canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'DUPLICATE_CHECK_UNAVAILABLE');
});

// ─── 5. Post-Submission Verification ──────────────────────────────

console.log('\n5. Post-Submission Verification');

test('verifySubmissionResult: submission confirmed', async () => {
  const canvasService = createMockCanvasService({
    fetchAll: async () => [
      { user_id: 100, workflow_state: 'submitted', submitted_at: new Date().toISOString(), id: 888 },
    ],
  });
  const result = await verifySubmissionResult(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'SUBMISSION_VERIFIED');
  assert.strictEqual(result.submissionId, 888);
});

test('verifySubmissionResult: no Canvas service', async () => {
  const result = await verifySubmissionResult(null, null, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'VERIFICATION_SKIPPED');
});

test('verifySubmissionResult: Canvas shows unsubmitted', async () => {
  const canvasService = createMockCanvasService({
    fetchAll: async () => [
      { user_id: 100, workflow_state: 'unsubmitted' },
    ],
  });
  const result = await verifySubmissionResult(canvasService, { token: 't', domain: 'd' }, 10, 123, 100, 1000);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'SUBMISSION_NOT_CONFIRMED');
});

test('verifySubmissionResult: Canvas API error', async () => {
  const canvasService = createMockCanvasService({
    fetchAll: async () => { throw new Error('Network error'); },
  });
  const result = await verifySubmissionResult(canvasService, { token: 't', domain: 'd' }, 10, 123, 100);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'VERIFICATION_INCONCLUSIVE');
});

test('verifySubmissionResult: timeout', async () => {
  const canvasService = createMockCanvasService({
    fetchAll: async () => [], // No submission found
  });
  const result = await verifySubmissionResult(canvasService, { token: 't', domain: 'd' }, 10, 123, 100, 500);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'VERIFICATION_TIMEOUT');
});

// ─── 6. External Change Detection ─────────────────────────────────

console.log('\n6. External Change Detection');

test('detectExternalChanges: no changes', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Test Assignment', due_at: '2026-12-01T00:00:00Z',
      points_possible: 100, submission_types: ['online_upload'], lock_at: null,
    }),
  });
  const manifest = {
    metadata: { title: 'Test Assignment', dueDate: '2026-12-01T00:00:00Z', pointsPossible: 100 },
    normalizedAssignment: { submissionTypes: ['online_upload'] },
  };
  const result = await detectExternalChanges(canvasService, { token: 't', domain: 'd' }, 10, 123, manifest);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'NO_EXTERNAL_CHANGES');
});

test('detectExternalChanges: title changed', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Changed Title', submission_types: ['online_upload'],
    }),
  });
  const manifest = { metadata: { title: 'Original Title' } };
  const result = await detectExternalChanges(canvasService, { token: 't', domain: 'd' }, 10, 123, manifest);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'EXTERNAL_CHANGES_DETECTED');
  assert(result.details.changes.some(c => c.field === 'title'));
});

test('detectExternalChanges: submission types changed', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Test', submission_types: ['online_quiz'],
    }),
  });
  const manifest = {
    metadata: { title: 'Test' },
    normalizedAssignment: { submissionTypes: ['online_upload'] },
  };
  const result = await detectExternalChanges(canvasService, { token: 't', domain: 'd' }, 10, 123, manifest);
  assert.strictEqual(result.passed, false);
  assert(result.details.changes.some(c => c.field === 'submissionTypes'));
});

test('detectExternalChanges: no canvas service', async () => {
  const result = await detectExternalChanges(null, null, 10, 123, {});
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'CHECK_SKIPPED');
});

test('detectExternalChanges: canvas error', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => { throw new Error('Network error'); },
  });
  const result = await detectExternalChanges(canvasService, { token: 't', domain: 'd' }, 10, 123, {});
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'CHANGE_CHECK_FAILED');
});

// ─── 7. Full Pre-Submission Check ─────────────────────────────────

console.log('\n7. Full Pre-Submission Check');

test('verifyPreSubmission: all checks pass', async () => {
  const canvasService = createMockCanvasService();
  const storage = createMockArtifactStorage();
  const job = createMockJob({
    approval: approveRequest(
      createApprovalRequest({
        jobId: 'job_test_001', userId: 100, type: 'SUBMISSION',
        artifactId: 'art_001', artifactVersion: 1,
      }),
      100
    ),
  });

  const result = await verifyPreSubmission({
    canvasService, canvasAuth: { token: 't', domain: 'd' },
    courseId: 10, assignmentId: 123,
    userId: 100, job, artifactId: 'art_001', artifactStorage: storage,
  });

  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.checks.length, 5); // assignment, artifact, approval, duplicate, external
  assert.strictEqual(result.failedAt, null);
});

test('verifyPreSubmission: fails at assignment state', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => { throw new Error('HTTP_404'); },
  });
  const job = createMockJob();

  const result = await verifyPreSubmission({
    canvasService, canvasAuth: { token: 't', domain: 'd' },
    courseId: 10, assignmentId: 123,
    userId: 100, job, artifactId: 'art_001', artifactStorage: null,
  });

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failedAt, 'assignment_state');
});

test('verifyPreSubmission: fails at artifact integrity', async () => {
  const canvasService = createMockCanvasService();
  const job = createMockJob({
    artifacts: [{ id: 'art_001', status: 'GENERATING' }],
  });

  const result = await verifyPreSubmission({
    canvasService, canvasAuth: { token: 't', domain: 'd' },
    courseId: 10, assignmentId: 123,
    userId: 100, job, artifactId: 'art_001', artifactStorage: null,
  });

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failedAt, 'artifact_integrity');
});

test('verifyPreSubmission: fails at approval', async () => {
  const canvasService = createMockCanvasService();
  const job = createMockJob(); // no approval

  const result = await verifyPreSubmission({
    canvasService, canvasAuth: { token: 't', domain: 'd' },
    courseId: 10, assignmentId: 123,
    userId: 100, job, artifactId: 'art_001', artifactStorage: null,
  });

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failedAt, 'approval_integrity');
});

// ─── 8. Integration ───────────────────────────────────────────────

console.log('\n8. Integration');

test('VERIFICATION_PASSED creates correct result', () => {
  const result = VERIFICATION_PASSED('TEST_CODE', 'Test message', { extra: true });
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.code, 'TEST_CODE');
  assert.strictEqual(result.message, 'Test message');
  assert.strictEqual(result.extra, true);
  assert(result.timestamp);
});

test('VERIFICATION_FAILED creates correct result', () => {
  const result = VERIFICATION_FAILED('FAIL_CODE', 'Failure reason');
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.code, 'FAIL_CODE');
  assert.strictEqual(result.message, 'Failure reason');
  assert(result.timestamp);
});

test('assignment locked + artifact valid + no approval = fails at approval', async () => {
  const canvasService = createMockCanvasService({
    fetchOne: async () => ({
      id: 123, name: 'Locked', submission_types: ['online_upload'],
      lock_at: new Date(Date.now() - 86400000).toISOString(),
      submission: null,
    }),
  });
  const job = createMockJob();

  const result = await verifyPreSubmission({
    canvasService, canvasAuth: { token: 't', domain: 'd' },
    courseId: 10, assignmentId: 123,
    userId: 100, job, artifactId: 'art_001', artifactStorage: null,
  });

  // Should fail at assignment_state because it's locked
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failedAt, 'assignment_state');
});

// ─── Summary ───────────────────────────────────────────────────────

console.log(`\n==================================================`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
}
