/**
 * artifact-model.js
 * Artifact Model for Agentic Helper.
 *
 * Defines the normalized artifact schema and creation functions.
 * An artifact represents a generated file that belongs to an Agent Job.
 */

// ─── Artifact Types ────────────────────────────────────────────────

const ARTIFACT_TYPES = {
  DOCX: 'docx',
  PDF: 'pdf',
  TXT: 'txt',
};

const ARTIFACT_MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

// ─── Artifact States ───────────────────────────────────────────────

const ARTIFACT_STATES = {
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED',
};

// ─── Artifact Creation ─────────────────────────────────────────────

/**
 * Create a new artifact record.
 *
 * @param {object} params
 * @param {string} params.jobId - Agent Job ID
 * @param {number} params.userId - Canvas user ID
 * @param {string} params.type - Artifact type (from ARTIFACT_TYPES)
 * @param {string} params.filename - Desired filename
 * @param {object} [params.metadata] - Additional metadata
 * @returns {object} Artifact record
 */
function createArtifact({ jobId, userId, type, filename, metadata = {} }) {
  const id = generateArtifactId();
  const sanitizedFilename = sanitizeFilename(filename, type);

  return {
    id,
    jobId,
    userId,
    type,
    mimeType: ARTIFACT_MIME_TYPES[type] || 'application/octet-stream',
    filename: sanitizedFilename,
    size: 0,
    status: ARTIFACT_STATES.GENERATING,
    storagePath: null,
    error: null,
    metadata: {
      ...metadata,
      createdAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark an artifact as ready (successfully generated).
 *
 * @param {object} artifact
 * @param {string} storagePath - Path where the file is stored
 * @param {number} size - File size in bytes
 * @returns {object} Updated artifact
 */
function markArtifactReady(artifact, storagePath, size) {
  return {
    ...artifact,
    status: ARTIFACT_STATES.READY,
    storagePath,
    size,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark an artifact as failed.
 *
 * @param {object} artifact
 * @param {string} errorMessage
 * @returns {object} Updated artifact
 */
function markArtifactFailed(artifact, errorMessage) {
  return {
    ...artifact,
    status: ARTIFACT_STATES.FAILED,
    error: errorMessage,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Generate a unique artifact ID.
 * @returns {string}
 */
function generateArtifactId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `art_${timestamp}_${random}`;
}

/**
 * Sanitize a filename to prevent path traversal and invalid characters.
 * @param {string} filename
 * @param {string} type - Artifact type (used for extension)
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename, type) {
  if (!filename || typeof filename !== 'string') {
    return `document.${type}`;
  }

  // Remove path separators and traversal attempts
  let sanitized = filename
    .replace(/[/\\]/g, '')        // Remove forward and back slashes
    .replace(/\.\./g, '')         // Remove traversal attempts
    .replace(/[<>:"|?*]/g, '')   // Remove invalid filesystem chars
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .trim();

  // Ensure it's not empty
  if (!sanitized) {
    sanitized = `document.${type}`;
  }

  // Ensure correct extension
  const ext = `.${type}`;
  if (!sanitized.toLowerCase().endsWith(ext)) {
    sanitized = sanitized + ext;
  }

  // Limit length
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 196) + ext;
  }

  return sanitized;
}

/**
 * Check if an artifact type is supported by the available generators.
 * @param {string} type
 * @returns {{ supported: boolean, reason: string }}
 */
function checkArtifactTypeSupport(type) {
  const supported = [ARTIFACT_TYPES.DOCX, ARTIFACT_TYPES.TXT];
  const unimplemented = [ARTIFACT_TYPES.PDF];

  if (supported.includes(type)) {
    return { supported: true, reason: '' };
  }
  if (unimplemented.includes(type)) {
    return { supported: false, reason: `${type.toUpperCase()} generation is not yet implemented.` };
  }
  return { supported: false, reason: `Artifact type "${type}" is not supported.` };
}

module.exports = {
  ARTIFACT_TYPES,
  ARTIFACT_MIME_TYPES,
  ARTIFACT_STATES,
  createArtifact,
  markArtifactReady,
  markArtifactFailed,
  generateArtifactId,
  sanitizeFilename,
  checkArtifactTypeSupport,
};
