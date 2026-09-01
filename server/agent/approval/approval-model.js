/**
 * approval-model.js
 * Approval Model for Agentic Helper.
 *
 * Manages the human approval gate for high-risk Canvas operations
 * (file uploads, comments, submissions).
 *
 * The AI may prepare submissions, but it must not independently submit them.
 * Human approval is required before any SUBMIT-tier action.
 */

// ─── Approval Status ───────────────────────────────────────────────

const APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
};

// ─── Approval Types ────────────────────────────────────────────────

const APPROVAL_TYPES = {
  UPLOAD: 'UPLOAD',
  COMMENT: 'COMMENT',
  SUBMISSION: 'SUBMISSION',
};

// ─── Approval Creation ─────────────────────────────────────────────

/**
 * Create an approval request record.
 *
 * @param {object} params
 * @param {string} params.jobId - Agent Job ID
 * @param {number} params.userId - Canvas user ID
 * @param {string} params.type - Approval type (from APPROVAL_TYPES)
 * @param {string} params.artifactId - Artifact ID being approved
 * @param {number} params.artifactVersion - Artifact version (for staleness detection)
 * @param {object} params.actionDetails - Details of the action to approve
 * @param {number} [params.expiresInMs] - Time until approval expires (default: 1 hour)
 * @returns {object} Approval record
 */
function createApprovalRequest({
  jobId,
  userId,
  type,
  artifactId,
  artifactVersion = 1,
  actionDetails = {},
  expiresInMs = 3600000, // 1 hour
}) {
  const id = generateApprovalId();
  const now = new Date().toISOString();

  return {
    id,
    jobId,
    userId,
    type,
    artifactId,
    artifactVersion,
    actionDetails,
    status: APPROVAL_STATUS.PENDING,
    approvedBy: null,
    approvedAt: null,
    deniedAt: null,
    denialReason: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

/**
 * Approve an approval request.
 *
 * @param {object} approval
 * @param {number} approvedBy - User ID of approver
 * @returns {object} Updated approval
 */
function approveRequest(approval, approvedBy) {
  return {
    ...approval,
    status: APPROVAL_STATUS.APPROVED,
    approvedBy,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deny an approval request.
 *
 * @param {object} approval
 * @param {string} reason
 * @returns {object} Updated approval
 */
function denyRequest(approval, reason) {
  return {
    ...approval,
    status: APPROVAL_STATUS.DENIED,
    deniedAt: new Date().toISOString(),
    denialReason: reason || 'Denied by user',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Check if an approval is valid for a specific artifact version.
 *
 * @param {object} approval
 * @param {string} artifactId
 * @param {number} artifactVersion
 * @returns {{ valid: boolean, reason: string }}
 */
function validateApproval(approval, artifactId, artifactVersion) {
  if (!approval) {
    return { valid: false, reason: 'No approval found' };
  }

  if (approval.status !== APPROVAL_STATUS.APPROVED) {
    return { valid: false, reason: `Approval status is ${approval.status}` };
  }

  // Check expiration
  if (approval.expiresAt && new Date(approval.expiresAt) < new Date()) {
    return { valid: false, reason: 'Approval has expired' };
  }

  // Check artifact version (prevents stale approvals)
  if (approval.artifactId !== artifactId) {
    return { valid: false, reason: 'Approval is for a different artifact' };
  }

  if (approval.artifactVersion !== artifactVersion) {
    return {
      valid: false,
      reason: `Approval is for artifact version ${approval.artifactVersion}, but current version is ${artifactVersion}`,
    };
  }

  return { valid: true, reason: '' };
}

// ─── Helpers ───────────────────────────────────────────────────────

function generateApprovalId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `appr_${timestamp}_${random}`;
}

module.exports = {
  APPROVAL_STATUS,
  APPROVAL_TYPES,
  createApprovalRequest,
  approveRequest,
  denyRequest,
  validateApproval,
  generateApprovalId,
};
