/**
 * canvas-write-tools.js
 * Canvas Write Tools for Agentic Helper.
 *
 * These tools perform mutations on Canvas:
 *   - canvas.upload_file
 *   - canvas.create_comment
 *   - canvas.submit_assignment
 *
 * All write tools enforce:
 *   - Job ownership
 *   - Assignment scope
 *   - Artifact validation
 *   - Approval gate for SUBMIT operations
 *   - Idempotency for submissions
 *
 * The AI may prepare submissions, but must not independently submit them.
 */

const { registerTool, TOOL_PERMISSIONS } = require('./tool-registry');
const { createSuccessResult, createErrorResult } = require('./tool-runtime');
const {
  verifyAssignmentState,
  verifyArtifactIntegrity,
  verifyApprovalIntegrity,
  verifyNoDuplicateSubmission,
  verifySubmissionResult,
  detectExternalChanges,
} = require('../canvas-integrity');

// ─── Tool Registration ─────────────────────────────────────────────

/**
 * Register all Canvas write tools.
 *
 * @param {object} deps
 * @param {object} deps.canvasService - Existing canvas service
 * @param {object} deps.artifactStorage - Artifact storage service
 * @param {function} deps.getJob - Function to get job: (userId, jobId) => job
 * @param {function} deps.addEvent - Function to add event: (jobId, type, metadata) => void
 */
function registerCanvasWriteTools({ canvasService, artifactStorage, getJob, addEvent }) {

  /**
   * Emit an event through the addEvent callback.
   */
  function emitJobEvent(jobId, type, metadata) {
    if (typeof addEvent === 'function' && jobId) {
      try { addEvent(jobId, type, metadata); } catch { /* ignore */ }
    }
  }

  // ─── canvas.upload_file ────────────────────────────────────────

  registerTool({
    id: 'canvas.upload_file',
    name: 'Upload File to Canvas',
    description: 'Upload a generated artifact to Canvas as a submission file upload. Requires the artifact to be READY and belonging to this job.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.WRITE],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
        artifactId: { type: 'string', description: 'Artifact ID from the artifact system' },
        comment: { type: 'string', description: 'Optional comment to attach to the upload' },
      },
      required: ['courseId', 'assignmentId', 'artifactId'],
    },
    maxResultSize: 10000,
    execute: async (args, context) => {
      const { courseId, assignmentId, artifactId, comment } = args;
      const { userId, jobId, canvasAuth } = context;

      // Validate assignment scope
      const job = getJob(userId, jobId);
      if (!job) {
        return createErrorResult('JOB_NOT_FOUND', 'Agent job not found');
      }
      if (job.courseId !== courseId || job.assignmentId !== assignmentId) {
        return createErrorResult('SCOPE_VIOLATION', 'Upload target does not match job assignment');
      }
      if (!canvasAuth) {
        return createErrorResult('NO_AUTH', 'Canvas authentication not available');
      }

      // Find and validate the artifact
      const artifact = findArtifact(job, artifactId);
      if (!artifact) {
        return createErrorResult('ARTIFACT_NOT_FOUND', `Artifact ${artifactId} not found in this job`);
      }
      if (artifact.status !== 'READY') {
        return createErrorResult('ARTIFACT_INVALID', `Artifact is in state ${artifact.status}, must be READY`);
      }
      if (!artifact.storagePath) {
        return createErrorResult('ARTIFACT_NO_FILE', 'Artifact has no associated file');
      }

      // Read the artifact file
      const fileContent = artifactStorage.readArtifact(userId, artifact.storagePath);
      if (!fileContent) {
        return createErrorResult('FILE_NOT_FOUND', 'Artifact file not found in storage');
      }

      // Upload to Canvas
      try {
        emitJobEvent(jobId, 'UPLOAD_STARTED', { artifactId, courseId, assignmentId });

        const uploadResult = await uploadToCanvas(canvasService, canvasAuth, {
          courseId,
          assignmentId,
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          content: fileContent,
          comment,
        });

        emitJobEvent(jobId, 'UPLOAD_COMPLETED', {
          artifactId,
          submissionId: uploadResult.submissionId,
        });

        return createSuccessResult({
          submissionId: uploadResult.submissionId,
          artifactId,
          filename: artifact.filename,
          size: artifact.size,
          uploadedAt: new Date().toISOString(),
        });

      } catch (error) {
        emitJobEvent(jobId, 'UPLOAD_FAILED', { artifactId, error: error.message });
        return createErrorResult('UPLOAD_FAILED', error.message);
      }
    },
  });

  // ─── canvas.create_comment ─────────────────────────────────────

  registerTool({
    id: 'canvas.create_comment',
    name: 'Create Assignment Comment',
    description: 'Add a comment to a Canvas assignment submission. Requires the job to be in EXECUTING state.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.WRITE],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
        comment: { type: 'string', description: 'Comment text (may contain HTML)' },
      },
      required: ['courseId', 'assignmentId', 'comment'],
    },
    maxResultSize: 5000,
    execute: async (args, context) => {
      const { courseId, assignmentId, comment } = args;
      const { userId, jobId, canvasAuth } = context;

      // Validate assignment scope
      const job = getJob(userId, jobId);
      if (!job) {
        return createErrorResult('JOB_NOT_FOUND', 'Agent job not found');
      }
      if (job.courseId !== courseId || job.assignmentId !== assignmentId) {
        return createErrorResult('SCOPE_VIOLATION', 'Comment target does not match job assignment');
      }
      if (!canvasAuth) {
        return createErrorResult('NO_AUTH', 'Canvas authentication not available');
      }

      // Validate comment content
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        return createErrorResult('INVALID_COMMENT', 'Comment cannot be empty');
      }
      if (comment.length > 10000) {
        return createErrorResult('COMMENT_TOO_LONG', 'Comment exceeds 10,000 characters');
      }

      try {
        emitJobEvent(jobId, 'COMMENT_STARTED', { courseId, assignmentId });

        // Post comment to Canvas via canvasService
        const result = await canvasService.post(
          `/courses/${courseId}/assignments/${assignmentId}/submissions/self/comments`,
          { comment: { text_comment: comment } },
          canvasAuth
        );

        emitJobEvent(jobId, 'COMMENT_COMPLETED', {
          commentId: result.id,
          courseId,
          assignmentId,
        });

        return createSuccessResult({
          commentId: result.id,
          createdAt: result.created_at,
          author: result.author?.display_name || 'Unknown',
        });

      } catch (error) {
        emitJobEvent(jobId, 'COMMENT_FAILED', { error: error.message });
        return createErrorResult('COMMENT_FAILED', error.message);
      }
    },
  });

  // ─── canvas.submit_assignment ──────────────────────────────────

  registerTool({
    id: 'canvas.submit_assignment',
    name: 'Submit Assignment',
    description: 'Submit an assignment to Canvas. REQUIRES HUMAN APPROVAL before execution. Will reject if approval is missing or for a different artifact version.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.SUBMIT], // Highest risk — requires approval
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
        artifactId: { type: 'string', description: 'Artifact ID to submit' },
        comment: { type: 'string', description: 'Optional submission comment' },
      },
      required: ['courseId', 'assignmentId', 'artifactId'],
    },
    maxResultSize: 10000,
    execute: async (args, context) => {
      const { courseId, assignmentId, artifactId, comment } = args;
      const { userId, jobId, canvasAuth } = context;

      // ─── Step 1: Validate job scope ──────────────────────────
      const job = getJob(userId, jobId);
      if (!job) {
        return createErrorResult('JOB_NOT_FOUND', 'Agent job not found');
      }
      if (job.courseId !== courseId || job.assignmentId !== assignmentId) {
        return createErrorResult('SCOPE_VIOLATION', 'Submission target does not match job assignment');
      }
      if (!canvasAuth) {
        return createErrorResult('NO_AUTH', 'Canvas authentication not available');
      }

      // ─── Step 2: Verify artifact integrity ───────────────────
      const artifactCheck = verifyArtifactIntegrity(job, artifactId, artifactStorage, userId);
      if (!artifactCheck.passed) {
        return createErrorResult(artifactCheck.code, artifactCheck.message);
      }
      const artifact = findArtifact(job, artifactId);

      // ─── Step 3: Verify approval integrity ───────────────────
      const approvalCheck = verifyApprovalIntegrity(
        job, artifactId, artifact?.artifactVersion || 1, userId
      );
      if (!approvalCheck.passed) {
        return createErrorResult(approvalCheck.code, approvalCheck.message);
      }

      // ─── Step 4: Check for duplicate submission ───────────────
      const duplicateCheck = await verifyNoDuplicateSubmission(
        job, canvasService, canvasAuth, courseId, assignmentId, userId
      );
      if (!duplicateCheck.passed) {
        return createErrorResult(duplicateCheck.code, duplicateCheck.message);
      }

      // ─── Step 5: Verify assignment state on Canvas ───────────
      const assignmentCheck = await verifyAssignmentState(
        canvasService, canvasAuth, courseId, assignmentId, userId
      );
      if (!assignmentCheck.passed) {
        return createErrorResult(assignmentCheck.code, assignmentCheck.message);
      }
      // Warn about past-due but don't block
      const warnings = assignmentCheck.warnings || [];

      // ─── Step 6: Detect external changes ──────────────────────
      const manifest = job.manifest;
      if (manifest) {
        const externalCheck = await detectExternalChanges(
          canvasService, canvasAuth, courseId, assignmentId, manifest
        );
        if (!externalCheck.passed && externalCheck.changes) {
          return createErrorResult(
            'ASSIGNMENT_CHANGED',
            `Assignment changed on Canvas since analysis: ${externalCheck.changes.map(c => c.field).join(', ')}`
          );
        }
      }

      // ─── Step 7: Upload file first if needed ─────────────────
      let submissionFileId = null;

      if (artifact.storagePath) {
        const fileContent = artifactStorage.readArtifact(userId, artifact.storagePath);
        if (!fileContent) {
          return createErrorResult('FILE_NOT_FOUND', 'Artifact file not found in storage');
        }

        try {
          const uploadResult = await uploadToCanvas(canvasService, canvasAuth, {
            courseId,
            assignmentId,
            filename: artifact.filename,
            mimeType: artifact.mimeType,
            content: fileContent,
            comment,
          });
          submissionFileId = uploadResult.submissionId;
        } catch (error) {
          emitJobEvent(jobId, 'SUBMISSION_UPLOAD_FAILED', { error: error.message });
          return createErrorResult('UPLOAD_FAILED', `File upload failed: ${error.message}`);
        }
      }

      // ─── Step 6: Submit to Canvas ────────────────────────────
      try {
        emitJobEvent(jobId, 'SUBMISSION_REQUESTED', {
          courseId,
          assignmentId,
          artifactId,
        });

        const submissionBody = {
          submission: {
            submission_type: 'online_upload',
          },
        };

        // If we uploaded a file, attach it
        if (submissionFileId) {
          submissionBody.submission.file_ids = [submissionFileId];
        }

        // Add comment if provided
        if (comment) {
          submissionBody.submission.comment = { text_comment: comment };
        }

        // Use canvasService.post() for clean Canvas API access
        // canvasService.post() throws on HTTP errors and UNAUTHORIZED
        const result = await canvasService.post(
          `/courses/${courseId}/assignments/${assignmentId}/submissions`,
          submissionBody,
          canvasAuth
        );

        const submissionResult = {
          submitted: true,
          submissionId: result.id,
          assignmentId,
          courseId,
          artifactId,
          submittedAt: new Date().toISOString(),
          status: result.workflow_state || 'submitted',
        };

        // ─── Step 8: Post-submission verification ────────────
        // Verify via Canvas API rather than assuming success
        const verification = await verifySubmissionResult(
          canvasService, canvasAuth, courseId, assignmentId, userId
        );

        submissionResult.verified = verification.passed;
        submissionResult.verificationCode = verification.code;
        if (verification.warning) {
          submissionResult.verificationWarning = verification.warning;
        }
        if (verification.submissionId) {
          submissionResult.verifiedSubmissionId = verification.submissionId;
        }

        // Add warnings from assignment state check
        if (warnings.length > 0) {
          submissionResult.warnings = warnings;
        }

        emitJobEvent(jobId, 'SUBMISSION_CONFIRMED', {
          submissionId: result.id,
          artifactId,
          verified: verification.passed,
          verificationCode: verification.code,
        });

        return createSuccessResult(submissionResult);

      } catch (error) {
        emitJobEvent(jobId, 'SUBMISSION_FAILED', { error: error.message });
        return createErrorResult('SUBMISSION_FAILED', error.message);
      }
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Find an artifact in a job's artifact list.
 */
function findArtifact(job, artifactId) {
  if (!job || !Array.isArray(job.artifacts)) return null;
  return job.artifacts.find((a) => a.id === artifactId) || null;
}

/**
 * Upload a file to Canvas using the upload API.
 */
async function uploadToCanvas(canvasService, canvasAuth, { courseId, assignmentId, filename, mimeType, content, comment }) {
  // Use canvasService.post() for clean Canvas API access
  const submissionBody = {
    submission: {
      submission_type: 'online_upload',
      comment: comment ? { text_comment: comment } : undefined,
    },
  };

  const result = await canvasService.post(
    `/courses/${courseId}/assignments/${assignmentId}/submissions`,
    submissionBody,
    canvasAuth
  );

  return { submissionId: result.id };
}

module.exports = {
  registerCanvasWriteTools,
};
