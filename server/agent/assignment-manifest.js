/**
 * assignment-manifest.js
 * Assignment Manifest — the normalized internal representation of a Canvas assignment.
 *
 * This is the central object that later agent stages will consume.
 * It combines:
 *   - Normalized assignment data
 *   - Extracted requirements
 *   - Capability analysis result
 *
 * Future components (planner, generator, validator, canvas tools)
 * should consume the manifest rather than raw Canvas responses.
 */

/**
 * Create an AssignmentManifest from normalized assignment data and capability analysis.
 *
 * @param {object} normalizedAssignment - Output from normalizeAssignment()
 * @param {object} capabilityAnalysis - Output from analyzeAssignment()
 * @param {object} options - Additional context
 * @param {number} options.userId - Canvas user ID
 * @returns {object} AssignmentManifest
 */
function createManifest(normalizedAssignment, capabilityAnalysis, options = {}) {
  const assignment = normalizedAssignment || {};
  const analysis = capabilityAnalysis || {};
  const userId = options.userId || null;

  return {
    // ─── Identity ─────────────────────────────────────────────────
    identity: {
      assignmentId: analysis.assignmentId || assignment.canvasId || assignment.id || null,
      courseId: analysis.courseId || assignment.courseId || null,
      courseName: analysis.courseName || assignment.courseName || null,
      courseCode: assignment.courseCode || null,
      userId: userId,
    },

    // ─── Metadata ─────────────────────────────────────────────────
    metadata: {
      title: analysis.assignmentName || assignment.name || '',
      description: assignment.description || '',
      plainDescription: assignment.plainDescription || '',
      dueDate: assignment.dueAt || null,
      lockAt: assignment.lockAt || null,
      pointsPossible: assignment.pointsPossible || null,
      submissionTypes: assignment.submissionTypes || [],
      allowedExtensions: assignment.allowedExtensions || [],
      fileExtensions: assignment.fileExtensions || [],
      externalToolUrl: assignment.externalToolUrl || null,
      canvasUrl: assignment.canvasUrl || null,
    },

    // ─── Requirements ─────────────────────────────────────────────
    requirements: {
      categories: analysis.requirementCategories || [],
      details: analysis.requirements || [],
      hasExternalTools: analysis.hasExternalTools || false,
      hasPhysicalActivity: analysis.hasPhysicalActivity || false,
      externalTools: analysis.externalTools || [],
    },

    // ─── Capabilities ─────────────────────────────────────────────
    capabilities: {
      required: analysis.requiredCapabilities || [],
      supported: analysis.supportedCapabilities || [],
      partial: analysis.partialCapabilities || [],
      unsupported: analysis.unsupportedCapabilities || [],
    },

    // ─── Capability Result ────────────────────────────────────────
    capabilityResult: {
      status: analysis.status || 'UNKNOWN',
      confidence: analysis.confidence || 0,
      canProceed: analysis.canProceed || false,
      reason: analysis.reason || '',
      summary: analysis.summary || '',
      noSubmission: analysis.noSubmission !== false,
    },

    // ─── Source ───────────────────────────────────────────────────
    source: {
      platform: 'canvas',
      assignmentId: assignment.canvasId || assignment.id || null,
      courseId: assignment.courseId || null,
      rubricAvailable: assignment.hasRubric || false,
      submissionAvailable: assignment.hasSubmission || false,
    },

    // ─── Timestamps ───────────────────────────────────────────────
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analyzedAt: analysis.analyzedAt || new Date().toISOString(),
  };
}

/**
 * Get a unique key for a manifest (for deduplication).
 * @param {object} manifest
 * @returns {string}
 */
function getManifestKey(manifest) {
  const identity = manifest.identity || {};
  return `${identity.userId || 'unknown'}_${identity.courseId || 'unknown'}_${identity.assignmentId || 'unknown'}`;
}

/**
 * Check if a manifest is stale (older than a threshold).
 * @param {object} manifest
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns {boolean}
 */
function isManifestStale(manifest, maxAgeMs = 3600000) {
  if (!manifest || !manifest.updatedAt) return true;
  const updatedAt = new Date(manifest.updatedAt).getTime();
  return (Date.now() - updatedAt) > maxAgeMs;
}

module.exports = {
  createManifest,
  getManifestKey,
  isManifestStale,
};
