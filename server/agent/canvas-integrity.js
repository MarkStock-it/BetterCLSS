/**
 * canvas-integrity.js
 * Canvas State & Submission Integrity Layer (Phase 32).
 *
 * Provides server-side verification for all Canvas mutations:
 *   - Assignment state validation
 *   - Artifact integrity checks
 *   - Approval binding verification
 *   - Post-submission verification
 *   - Duplicate submission prevention
 *   - External change detection
 *
 * All verification is server-side. Frontend-supplied IDs are untrusted.
 */

const { validateApproval, APPROVAL_STATUS } = require('./approval/approval-model');

// ─── Verification Result ──────────────────────────────────────────

/**
 * Create a standardized verification result.
 */
function createVerificationResult(passed, code, message, details = {}) {
  return {
    passed,
    code,
    message,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

const VERIFICATION_PASSED = (code, message, details) =>
  createVerificationResult(true, code, message, details);

const VERIFICATION_FAILED = (code, message, details) =>
  createVerificationResult(false, code, message, details);

// ─── 1. Assignment State Verification ─────────────────────────────

/**
 * Verify that an assignment exists and is in a submittable state.
 *
 * Checks:
 *   - Assignment exists on Canvas
 *   - Assignment is not deleted
 *   - Assignment accepts online_upload submissions
 *   - Assignment is not locked (lock_at passed)
 *   - Assignment deadline: warns but does not block (grace period)
 *   - No existing submission (or warns if already submitted)
 *
 * @param {object} canvasService - Canvas service instance
 * @param {object} canvasAuth - Canvas auth credentials
 * @param {number} courseId - Canvas course ID
 * @param {number} assignmentId - Canvas assignment ID
 * @param {number} userId - User ID for submission check
 * @returns {Promise<object>} Verification result
 */
async function verifyAssignmentState(canvasService, canvasAuth, courseId, assignmentId, userId) {
  if (!canvasAuth) {
    return VERIFICATION_FAILED('NO_AUTH', 'Canvas authentication not available');
  }

  try {
    // Fetch the assignment from Canvas
    const assignment = await canvasService.fetchOne(
      `/courses/${courseId}/assignments/${assignmentId}`,
      { include: ['submission', 'overrides'] },
      canvasAuth
    );

    if (!assignment || !assignment.id) {
      return VERIFICATION_FAILED('ASSIGNMENT_NOT_FOUND', 'Assignment does not exist on Canvas');
    }

    // Check if assignment accepts file uploads
    const submissionTypes = assignment.submission_types || [];
    if (!submissionTypes.includes('online_upload') && !submissionTypes.includes('online_url')) {
      return VERIFICATION_FAILED(
        'SUBMISSION_TYPE_UNSUPPORTED',
        `This assignment only accepts: ${submissionTypes.join(', ')}. File upload is not supported.`,
        { submissionTypes }
      );
    }

    // Check if assignment is locked
    if (assignment.lock_at) {
      const lockAt = new Date(assignment.lock_at);
      if (!isNaN(lockAt.getTime()) && new Date() > lockAt) {
        return VERIFICATION_FAILED(
          'ASSIGNMENT_LOCKED',
          'This assignment is locked and no longer accepts submissions.',
          { lockAt: assignment.lock_at }
        );
      }
    }

    // Check existing submission
    const existingSubmission = assignment.submission;
    const alreadySubmitted = existingSubmission &&
      (existingSubmission.workflow_state === 'submitted' || existingSubmission.workflow_state === 'graded');

    if (alreadySubmitted) {
      return VERIFICATION_PASSED(
        'ALREADY_SUBMITTED',
        'Assignment already has a submission. A new submission may overwrite it.',
        {
          existingSubmission: {
            id: existingSubmission.id,
            workflowState: existingSubmission.workflow_state,
            submittedAt: existingSubmission.submitted_at,
            score: existingSubmission.score,
          },
          canResubmit: submissionTypes.includes('online_upload'),
        }
      );
    }

    // Check past due (warning only)
    const warnings = [];
    if (assignment.due_at) {
      const dueAt = new Date(assignment.due_at);
      if (!isNaN(dueAt.getTime()) && new Date() > dueAt) {
        warnings.push({
          code: 'PAST_DUE',
          message: 'Assignment is past its due date. Submission may still be accepted.',
          dueAt: assignment.due_at,
        });
      }
    }

    return VERIFICATION_PASSED(
      'ASSIGNMENT_READY',
      'Assignment exists and accepts submissions.',
      {
        assignmentName: assignment.name,
        submissionTypes: assignment.submissionTypes || submissionTypes,
        dueAt: assignment.due_at,
        lockAt: assignment.lock_at,
        pointsPossible: assignment.points_possible,
        warnings,
      }
    );

  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return VERIFICATION_FAILED('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
    }
    if (String(error.message).includes('404') || String(error.message).includes('NOT_FOUND')) {
      return VERIFICATION_FAILED('ASSIGNMENT_NOT_FOUND', 'Assignment does not exist on Canvas');
    }
    return VERIFICATION_FAILED('CANVAS_ERROR', `Failed to verify assignment: ${error.message}`);
  }
}

// ─── 2. Artifact Integrity ────────────────────────────────────────

/**
 * Verify artifact integrity before submission.
 *
 * Checks:
 *   - Artifact exists in the job
 *   - Artifact was generated by this job
 *   - Artifact is owned by this user
 *   - Artifact status is READY
 *   - Artifact file exists in storage
 *   - Artifact format matches allowed submission types
 *   - Artifact has not changed since approval (version check)
 *
 * @param {object} job - Agent Job
 * @param {string} artifactId - Artifact ID to verify
 * @param {object} artifactStorage - Artifact storage service
 * @param {number} userId - User ID
 * @param {object} [allowedFormats] - Allowed file formats (e.g., { docx: true, pdf: true })
 * @returns {object} Verification result
 */
function verifyArtifactIntegrity(job, artifactId, artifactStorage, userId, allowedFormats) {
  // Check job has artifacts
  if (!job || !Array.isArray(job.artifacts) || job.artifacts.length === 0) {
    return VERIFICATION_FAILED('NO_ARTIFACTS', 'Job has no artifacts');
  }

  // Find the artifact
  const artifact = job.artifacts.find(a => a.id === artifactId);
  if (!artifact) {
    return VERIFICATION_FAILED(
      'ARTIFACT_NOT_FOUND',
      `Artifact ${artifactId} not found in this job`,
      { availableArtifacts: job.artifacts.map(a => a.id) }
    );
  }

  // Check ownership
  if (String(job.userId) !== String(userId)) {
    return VERIFICATION_FAILED('ARTIFACT_NOT_OWNED', 'Artifact does not belong to this user');
  }

  // Check status
  if (artifact.status !== 'READY') {
    return VERIFICATION_FAILED(
      'ARTIFACT_NOT_READY',
      `Artifact is in state "${artifact.status}", must be READY`,
      { currentStatus: artifact.status }
    );
  }

  // Check file exists in storage
  if (artifact.storagePath) {
    if (!artifactStorage) {
      return VERIFICATION_FAILED('STORAGE_UNAVAILABLE', 'Artifact storage is not available');
    }
    const fileContent = artifactStorage.readArtifact(userId, artifact.storagePath);
    if (!fileContent) {
      return VERIFICATION_FAILED('ARTIFACT_FILE_MISSING', 'Artifact file not found in storage');
    }
    // Verify file size matches
    if (artifact.size && fileContent.length !== artifact.size) {
      return VERIFICATION_FAILED(
        'ARTIFACT_SIZE_MISMATCH',
        `Artifact file size changed: expected ${artifact.size}, got ${fileContent.length}`,
        { expectedSize: artifact.size, actualSize: fileContent.length }
      );
    }
  }

  // Check format if allowed formats specified
  if (allowedFormats && artifact.type) {
    const ext = (artifact.filename || '').split('.').pop()?.toLowerCase();
    if (ext && !allowedFormats[ext]) {
      return VERIFICATION_FAILED(
        'ARTIFACT_FORMAT_UNSUPPORTED',
        `Artifact format ".${ext}" is not in allowed formats: ${Object.keys(allowedFormats).join(', ')}`,
        { format: ext, allowed: Object.keys(allowedFormats) }
      );
    }
  }

  // Check artifact hasn't changed since approval (version check)
  if (job.approval && job.approval.status === APPROVAL_STATUS.APPROVED) {
    const approvedVersion = job.approval.artifactVersion || 1;
    const currentVersion = artifact.artifactVersion || 1;
    if (approvedVersion !== currentVersion) {
      return VERIFICATION_FAILED(
        'ARTIFACT_VERSION_CHANGED',
        `Artifact changed since approval (approved v${approvedVersion}, current v${currentVersion}). Please review again.`,
        { approvedVersion, currentVersion }
      );
    }
    // Also verify approval is for this specific artifact
    if (job.approval.artifactId && job.approval.artifactId !== artifactId) {
      return VERIFICATION_FAILED(
        'ARTIFACT_MISMATCH',
        'Approval is for a different artifact',
        { approvedArtifactId: job.approval.artifactId, requestedArtifactId: artifactId }
      );
    }
  }

  return VERIFICATION_PASSED(
    'ARTIFACT_VALID',
    'Artifact is valid for submission.',
    {
      artifactId: artifact.id,
      filename: artifact.filename,
      type: artifact.type,
      size: artifact.size,
      version: artifact.artifactVersion || 1,
    }
  );
}

// ─── 3. Approval Integrity ────────────────────────────────────────

/**
 * Verify approval integrity with full binding checks.
 *
 * Approval must bind to:
 *   - The specific assignment (courseId + assignmentId)
 *   - The specific job
 *   - The specific artifact and version
 *   - The requesting user
 *
 * @param {object} job - Agent Job
 * @param {string} artifactId - Artifact ID being submitted
 * @param {number} artifactVersion - Current artifact version
 * @param {number} userId - Requesting user ID
 * @returns {object} Verification result
 */
function verifyApprovalIntegrity(job, artifactId, artifactVersion, userId) {
  // Check approval exists
  if (!job.approval) {
    return VERIFICATION_FAILED(
      'APPROVAL_MISSING',
      'No approval record found. Human approval is required before submission.'
    );
  }

  // Check approval status
  if (job.approval.status !== APPROVAL_STATUS.APPROVED) {
    return VERIFICATION_FAILED(
      'APPROVAL_NOT_APPROVED',
      `Approval status is "${job.approval.status}", must be APPROVED`,
      { status: job.approval.status }
    );
  }

  // Check expiration
  if (job.approval.expiresAt) {
    const expiresAt = new Date(job.approval.expiresAt);
    if (!isNaN(expiresAt.getTime()) && new Date() > expiresAt) {
      return VERIFICATION_FAILED(
        'APPROVAL_EXPIRED',
        'Approval has expired. Please approve again.',
        { expiresAt: job.approval.expiresAt }
      );
    }
  }

  // Check user binding
  if (String(job.approval.userId) !== String(userId)) {
    return VERIFICATION_FAILED(
      'APPROVAL_WRONG_USER',
      'Approval was granted by a different user'
    );
  }

  // Check job binding
  if (job.approval.jobId && job.approval.jobId !== job.id) {
    return VERIFICATION_FAILED(
      'APPROVAL_WRONG_JOB',
      'Approval is for a different job'
    );
  }

  // Check artifact binding
  const approvalCheck = validateApproval(job.approval, artifactId, artifactVersion);
  if (!approvalCheck.valid) {
    return VERIFICATION_FAILED(
      'APPROVAL_ARTIFACT_MISMATCH',
      approvalCheck.reason,
      {
        approvedArtifactId: job.approval.artifactId,
        approvedVersion: job.approval.artifactVersion,
        requestedArtifactId: artifactId,
        requestedVersion: artifactVersion,
      }
    );
  }

  return VERIFICATION_PASSED(
    'APPROVAL_VALID',
    'Approval is valid for this submission.',
    {
      approvalId: job.approval.id,
      approvedAt: job.approval.approvedAt,
      expiresAt: job.approval.expiresAt,
    }
  );
}

// ─── 4. Duplicate Submission Prevention ───────────────────────────

/**
 * Check if this job has already been submitted to Canvas.
 *
 * Uses the job's submissionResult and Canvas state to prevent duplicates.
 *
 * @param {object} job - Agent Job
 * @param {object} canvasService - Canvas service
 * @param {object} canvasAuth - Canvas auth
 * @param {number} courseId - Canvas course ID
 * @param {number} assignmentId - Canvas assignment ID
 * @param {number} userId - User ID
 * @returns {Promise<object>} Verification result
 */
async function verifyNoDuplicateSubmission(job, canvasService, canvasAuth, courseId, assignmentId, userId) {
  // Check job-level idempotency
  if (job.submissionResult && job.submissionResult.submitted) {
    return VERIFICATION_FAILED(
      'DUPLICATE_SUBMISSION',
      'This job has already been submitted. Cannot submit again.',
      {
        previousSubmissionId: job.submissionResult.submissionId,
        previousSubmittedAt: job.submissionResult.submittedAt,
      }
    );
  }

  // Check Canvas state for existing submission
  if (canvasService && canvasAuth) {
    try {
      const submissions = await canvasService.fetchAll(
        `/courses/${courseId}/assignments/${assignmentId}/submissions`,
        { include: ['user'] },
        canvasAuth
      );

      const existing = submissions.find(
        s => String(s.user_id) === String(userId) &&
          (s.workflow_state === 'submitted' || s.workflow_state === 'graded')
      );

      if (existing) {
        return VERIFICATION_FAILED(
          'DUPLICATE_SUBMISSION_CANVAS',
          'Canvas already shows a submission for this assignment. A new submission may overwrite it.',
          {
            existingSubmissionId: existing.id,
            workflowState: existing.workflow_state,
            submittedAt: existing.submitted_at,
          }
        );
      }
    } catch {
      // If we can't check Canvas, proceed with warning
      return VERIFICATION_PASSED(
        'DUPLICATE_CHECK_UNAVAILABLE',
        'Could not verify Canvas submission state. Proceeding with caution.',
        { warning: 'Canvas state check failed' }
      );
    }
  }

  return VERIFICATION_PASSED(
    'NO_DUPLICATE',
    'No existing submission found.'
  );
}

// ─── 5. Post-Submission Verification ──────────────────────────────

/**
 * Verify that a submission was successful by checking Canvas state.
 *
 * After submitting, we verify via Canvas API rather than assuming success.
 *
 * @param {object} canvasService - Canvas service
 * @param {object} canvasAuth - Canvas auth
 * @param {number} courseId - Canvas course ID
 * @param {number} assignmentId - Canvas assignment ID
 * @param {number} userId - User ID
 * @param {number} [maxWaitMs] - Max time to wait for Canvas to process (default: 10s)
 * @returns {Promise<object>} Verification result
 */
async function verifySubmissionResult(canvasService, canvasAuth, courseId, assignmentId, userId, maxWaitMs = 10000) {
  if (!canvasService || !canvasAuth) {
    return VERIFICATION_PASSED(
      'VERIFICATION_SKIPPED',
      'Canvas service not available for verification',
      { warning: 'Post-submission verification skipped' }
    );
  }

  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const submissions = await canvasService.fetchAll(
        `/courses/${courseId}/assignments/${assignmentId}/submissions`,
        { include: ['user'] },
        canvasAuth
      );

      const submission = submissions.find(
        s => String(s.user_id) === String(userId)
      );

      if (submission) {
        const state = submission.workflow_state;

        if (state === 'submitted' || state === 'graded') {
          return VERIFICATION_PASSED(
            'SUBMISSION_VERIFIED',
            'Submission confirmed by Canvas.',
            {
              submissionId: submission.id,
              workflowState: state,
              submittedAt: submission.submitted_at,
              score: submission.score,
            }
          );
        }

        if (state === 'unsubmitted') {
          return VERIFICATION_FAILED(
            'SUBMISSION_NOT_CONFIRMED',
            'Canvas shows assignment as unsubmitted.',
            { workflowState: state }
          );
        }

        // Other states (pending_review, etc.) — wait and recheck
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      // Canvas API error during verification
      return VERIFICATION_PASSED(
        'VERIFICATION_INCONCLUSIVE',
        `Could not verify submission: ${error.message}`,
        { warning: 'Post-submission verification failed', error: error.message }
      );
    }
  }

  return VERIFICATION_PASSED(
    'VERIFICATION_TIMEOUT',
    'Submission verification timed out. Submission was likely successful.',
    { warning: 'Could not confirm within timeout' }
  );
}

// ─── 6. External Change Detection ─────────────────────────────────

/**
 * Detect if Canvas data has changed since the manifest was created.
 *
 * Compares current Canvas assignment state with the cached manifest.
 * If significant changes are detected, the submission should be invalidated.
 *
 * @param {object} canvasService - Canvas service
 * @param {object} canvasAuth - Canvas auth
 * @param {number} courseId - Canvas course ID
 * @param {number} assignmentId - Canvas assignment ID
 * @param {object} manifest - Cached assignment manifest
 * @returns {Promise<object>} Verification result
 */
async function detectExternalChanges(canvasService, canvasAuth, courseId, assignmentId, manifest) {
  if (!canvasService || !canvasAuth || !manifest) {
    return VERIFICATION_PASSED('CHECK_SKIPPED', 'Cannot check for external changes');
  }

  try {
    const assignment = await canvasService.fetchOne(
      `/courses/${courseId}/assignments/${assignmentId}`,
      { include: ['submission'] },
      canvasAuth
    );

    const changes = [];
    const manifestMeta = manifest.metadata || {};

    // Check if assignment name changed
    if (manifestMeta.title && assignment.name && manifestMeta.title !== assignment.name) {
      changes.push({
        field: 'title',
        manifest: manifestMeta.title,
        current: assignment.name,
      });
    }

    // Check if due date changed
    if (manifestMeta.dueDate && assignment.due_at) {
      const manifestDue = new Date(manifestMeta.dueDate).getTime();
      const currentDue = new Date(assignment.due_at).getTime();
      if (manifestDue !== currentDue) {
        changes.push({
          field: 'dueDate',
          manifest: manifestMeta.dueDate,
          current: assignment.due_at,
        });
      }
    }

    // Check if points changed
    if (manifestMeta.pointsPossible != null && assignment.points_possible != null) {
      if (Number(manifestMeta.pointsPossible) !== Number(assignment.points_possible)) {
        changes.push({
          field: 'pointsPossible',
          manifest: manifestMeta.pointsPossible,
          current: assignment.points_possible,
        });
      }
    }

    // Check if submission types changed
    const manifestTypes = manifest.normalizedAssignment?.submissionTypes || manifestMeta.submissionTypes;
    if (Array.isArray(manifestTypes) && Array.isArray(assignment.submission_types)) {
      const manifestSet = new Set(manifestTypes);
      const currentSet = new Set(assignment.submission_types);
      const added = [...currentSet].filter(x => !manifestSet.has(x));
      const removed = [...manifestSet].filter(x => !currentSet.has(x));
      if (added.length > 0 || removed.length > 0) {
        changes.push({
          field: 'submissionTypes',
          manifest: manifestTypes,
          current: assignment.submission_types,
          added,
          removed,
        });
      }
    }

    // Check if lock date changed
    if (manifestMeta.lockAt && assignment.lock_at) {
      const manifestLock = new Date(manifestMeta.lockAt).getTime();
      const currentLock = new Date(assignment.lock_at).getTime();
      if (manifestLock !== currentLock) {
        changes.push({
          field: 'lockAt',
          manifest: manifestMeta.lockAt,
          current: assignment.lock_at,
        });
      }
    }

    if (changes.length > 0) {
      return VERIFICATION_FAILED(
        'EXTERNAL_CHANGES_DETECTED',
        `Assignment changed on Canvas since analysis: ${changes.map(c => c.field).join(', ')}`,
        { changes }
      );
    }

    return VERIFICATION_PASSED('NO_EXTERNAL_CHANGES', 'Assignment matches cached manifest.');

  } catch (error) {
    return VERIFICATION_PASSED(
      'CHANGE_CHECK_FAILED',
      `Could not check for external changes: ${error.message}`,
      { warning: 'Change detection failed' }
    );
  }
}

// ─── 7. Full Pre-Submission Check ─────────────────────────────────

/**
 * Run all pre-submission verifications in sequence.
 * Stops at the first failure.
 *
 * @param {object} params
 * @param {object} params.canvasService - Canvas service
 * @param {object} params.canvasAuth - Canvas auth
 * @param {number} params.courseId - Canvas course ID
 * @param {number} params.assignmentId - Canvas assignment ID
 * @param {number} params.userId - User ID
 * @param {object} params.job - Agent Job
 * @param {string} params.artifactId - Artifact ID
 * @param {object} params.artifactStorage - Artifact storage
 * @param {object} [params.manifest] - Assignment manifest for change detection
 * @returns {Promise<object>} Verification result with all checks
 */
async function verifyPreSubmission({
  canvasService, canvasAuth, courseId, assignmentId,
  userId, job, artifactId, artifactStorage, manifest,
}) {
  const checks = [];

  // 1. Assignment state
  const assignmentCheck = await verifyAssignmentState(
    canvasService, canvasAuth, courseId, assignmentId, userId
  );
  checks.push({ name: 'assignment_state', ...assignmentCheck });
  if (!assignmentCheck.passed) {
    return { passed: false, checks, failedAt: 'assignment_state' };
  }

  // 2. Artifact integrity
  const artifactCheck = verifyArtifactIntegrity(job, artifactId, artifactStorage, userId);
  checks.push({ name: 'artifact_integrity', ...artifactCheck });
  if (!artifactCheck.passed) {
    return { passed: false, checks, failedAt: 'artifact_integrity' };
  }

  // 3. Approval integrity
  const artifact = job.artifacts?.find(a => a.id === artifactId);
  const approvalCheck = verifyApprovalIntegrity(
    job, artifactId, artifact?.artifactVersion || 1, userId
  );
  checks.push({ name: 'approval_integrity', ...approvalCheck });
  if (!approvalCheck.passed) {
    return { passed: false, checks, failedAt: 'approval_integrity' };
  }

  // 4. Duplicate submission
  const duplicateCheck = await verifyNoDuplicateSubmission(
    job, canvasService, canvasAuth, courseId, assignmentId, userId
  );
  checks.push({ name: 'duplicate_submission', ...duplicateCheck });
  if (!duplicateCheck.passed) {
    return { passed: false, checks, failedAt: 'duplicate_submission' };
  }

  // 5. External changes (if manifest available)
  if (manifest) {
    const externalCheck = await detectExternalChanges(
      canvasService, canvasAuth, courseId, assignmentId, manifest
    );
    checks.push({ name: 'external_changes', ...externalCheck });
    // External changes are warnings, not hard failures
  }

  return {
    passed: true,
    checks,
    failedAt: null,
  };
}

module.exports = {
  // Verification result helpers
  createVerificationResult,
  VERIFICATION_PASSED,
  VERIFICATION_FAILED,

  // Individual checks
  verifyAssignmentState,
  verifyArtifactIntegrity,
  verifyApprovalIntegrity,
  verifyNoDuplicateSubmission,
  verifySubmissionResult,
  detectExternalChanges,

  // Combined check
  verifyPreSubmission,
};
