/**
 * capability-analyzer.js
 * Main capability analysis engine.
 *
 * Combines:
 *   - Capability Registry (what we can do)
 *   - Requirement Extractor (what the assignment needs)
 *   - External Tool Detection (what software is required)
 *
 * Produces a structured CapabilityAnalysis with:
 *   - Overall status (SUPPORTED / PARTIAL / UNSUPPORTED / UNKNOWN)
 *   - Confidence score
 *   - Required capabilities list
 *   - Supported vs unsupported breakdown
 *   - Human-readable summary
 *
 * Does NOT generate content, submit to Canvas, or execute agent tasks.
 * This phase is purely analytical.
 */

const { CAPABILITIES, getCapability } = require('./capability-registry');
const { normalizeAssignment } = require('./assignment-normalizer');
const { extractRequirements } = require('./requirement-extractor');

// ─── Requirement → Capability Mapping ───────────────────────────────

const REQUIREMENT_TO_CAPABILITIES = {
  TEXT: ['text_generation', 'text_refinement'],
  FILE: [],  // Determined by specific file format
  MEDIA: ['video_generation', 'image_generation', 'audio_generation'],
  CANVAS_SUBMISSION: ['canvas_submission', 'canvas_file_upload'],
  EXTERNAL_SOFTWARE: [],  // Determined by specific tool
  PHYSICAL_ACTIVITY: ['physical_activity'],
  CODE: ['code_execution'],
  DATA_ANALYSIS: ['code_execution'],
  PRESENTATION: ['pptx_generation'],
  COMMENT: ['canvas_create_comment'],
};

// ─── File Extension → Capability Mapping ─────────────────────────────

const FILE_EXTENSION_CAPABILITIES = {
  '.docx': ['docx_generation'],
  '.pdf': ['pdf_generation'],
  '.txt': ['txt_generation'],
  '.pptx': ['pptx_generation'],
  '.xlsx': ['xlsx_generation', 'code_execution'],
  '.csv': ['txt_generation'],
  '.png': ['image_generation'],
  '.jpg': ['image_generation'],
  '.jpeg': ['image_generation'],
  '.mp4': ['video_generation'],
  '.zip': [],
};

// ─── Helper Functions ────────────────────────────────────────────────

/**
 * Map a requirement to the capabilities it needs.
 * @param {object} requirement
 * @returns {string[]} Capability IDs
 */
function mapRequirementToCapabilities(requirement) {
  const type = requirement.type;

  // For file requirements, use the specific format
  if (type === 'FILE' && requirement.formats && requirement.formats.length > 0) {
    const caps = new Set();
    for (const format of requirement.formats) {
      const ext = format.startsWith('.') ? format : `.${format}`;
      const extCaps = FILE_EXTENSION_CAPABILITIES[ext.toLowerCase()] || [];
      for (const cap of extCaps) {
        caps.add(cap);
      }
    }
    // If no specific capabilities mapped, mark as unknown
    if (caps.size === 0) {
      return ['unknown_file_format'];
    }
    return [...caps];
  }

  // For external software, use the tool's required capabilities
  if (type === 'EXTERNAL_SOFTWARE' && requirement.toolId) {
    // Check if any of the tool's required capabilities are in our registry
    // For now, external tools are not supported
    return requirement.requiredCapabilities || [];
  }

  // For media, determine specific media type
  if (type === 'MEDIA' && requirement.mediaTypes) {
    const caps = [];
    for (const mediaType of requirement.mediaTypes) {
      switch (mediaType) {
        case 'video': caps.push('video_generation'); break;
        case 'audio': caps.push('audio_generation'); break;
        case 'screenshot': caps.push('image_generation'); break;
        case 'image': caps.push('image_generation'); break;
      }
    }
    return caps.length > 0 ? caps : ['unknown_media_type'];
  }

  // Default mapping
  return REQUIREMENT_TO_CAPABILITIES[type] || [];
}

/**
 * Check if all capabilities for a requirement are available.
 * @param {string[]} capabilityIds
 * @returns {{ available: string[], unavailable: string[], partialAvailable: string[] }}
 */
function checkCapabilityAvailability(capabilityIds) {
  const available = [];
  const unavailable = [];
  const partialAvailable = [];

  for (const capId of capabilityIds) {
    const cap = getCapability(capId);
    if (!cap) {
      // Unknown capability - cannot determine
      unavailable.push(capId);
    } else if (cap.status === 'SUPPORTED') {
      available.push(capId);
    } else if (cap.status === 'PARTIAL') {
      partialAvailable.push(capId);
    } else {
      // UNSUPPORTED
      unavailable.push(capId);
    }
  }

  return { available, unavailable, partialAvailable };
}

// ─── Main Analyzer ───────────────────────────────────────────────────

/**
 * Analyze a Canvas assignment and determine capability status.
 *
 * @param {object} canvasAssignment - Raw Canvas assignment data
 * @param {object} options - Additional context
 * @param {object} [options.course] - Canvas course object
 * @param {object} [options.rubric] - Canvas rubric data
 * @param {object} [options.submission] - Existing submission data
 * @returns {object} CapabilityAnalysis
 */
function analyzeAssignment(canvasAssignment, options = {}) {
  // Step 1: Normalize the assignment
  const normalized = normalizeAssignment(canvasAssignment, options);

  // Step 2: Extract requirements
  const extracted = extractRequirements(normalized);

  // Step 3: Map requirements to capabilities
  const requiredCapabilities = new Set();
  const requirementCapabilityMap = [];

  for (const requirement of extracted.requirements) {
    const capabilityIds = mapRequirementToCapabilities(requirement);
    const { available, unavailable, partialAvailable } = checkCapabilityAvailability(capabilityIds);

    requirementCapabilityMap.push({
      requirement,
      capabilityIds,
      available,
      unavailable,
      partialAvailable,
    });

    for (const capId of capabilityIds) {
      requiredCapabilities.add(capId);
    }
  }

  // Step 4: Determine overall status
  const allRequiredCaps = [...requiredCapabilities];
  const { available, unavailable, partialAvailable } = checkCapabilityAvailability(allRequiredCaps);

  let status;
  let canProceed;
  let reason;

  if (allRequiredCaps.length === 0) {
    // No capabilities required (e.g., simple Canvas-only action)
    status = 'UNKNOWN';
    canProceed = false;
    reason = 'Could not determine specific capabilities required for this assignment.';
  } else if (unavailable.length > 0) {
    // At least one required capability is unavailable
    status = 'UNSUPPORTED';
    canProceed = false;
    const unsupportedNames = unavailable.map((capId) => {
      const cap = getCapability(capId);
      return cap ? cap.name : capId;
    });
    reason = `Agentic Helper cannot perform: ${unsupportedNames.join(', ')}.`;
  } else if (partialAvailable.length > 0) {
    // All capabilities available, but some are partial
    status = 'PARTIAL';
    canProceed = false; // Conservative: don't auto-proceed on partial
    const partialNames = partialAvailable.map((capId) => {
      const cap = getCapability(capId);
      return cap ? cap.name : capId;
    });
    reason = `Agentic Helper has partial support for: ${partialNames.join(', ')}. Review carefully before proceeding.`;
  } else if (available.length > 0) {
    // All required capabilities are fully supported
    status = 'SUPPORTED';
    canProceed = true;
    reason = 'Agentic Helper can support all identified requirements for this assignment.';
  } else {
    // Edge case
    status = 'UNKNOWN';
    canProceed = false;
    reason = 'Insufficient information to determine capability support.';
  }

  // Step 5: Build human-readable summary
  const summary = buildSummary(status, extracted, available, unavailable, partialAvailable);

  // Step 6: Calculate confidence
  const confidence = calculateConfidence(normalized, extracted, allRequiredCaps);

  return {
    // Overall result
    status,
    confidence,
    canProceed,
    reason,
    summary,

    // Assignment identity
    assignmentId: normalized.canvasId || normalized.id,
    assignmentName: normalized.name,
    courseId: normalized.courseId,
    courseName: normalized.courseName,

    // Requirements breakdown
    requirements: extracted.requirements,
    requirementCategories: extracted.requirementCategories,
    hasExternalTools: extracted.hasExternalTools,
    hasPhysicalActivity: extracted.hasPhysicalActivity,
    externalTools: extracted.externalTools,

    // Capability breakdown
    requiredCapabilities: allRequiredCaps,
    supportedCapabilities: available,
    partialCapabilities: partialAvailable,
    unsupportedCapabilities: unavailable,

    // Detailed requirement→capability mapping
    requirementCapabilityMap,

    // Metadata
    analyzedAt: new Date().toISOString(),
    noSubmission: status === 'UNSUPPORTED' || status === 'UNKNOWN',
  };
}

/**
 * Build a human-readable summary of the analysis.
 * @param {string} status
 * @param {object} extracted
 * @param {string[]} available
 * @param {string[]} unavailable
 * @param {string[]} partialAvailable
 * @returns {string}
 */
function buildSummary(status, extracted, available, unavailable, partialAvailable) {
  const parts = [];

  switch (status) {
    case 'SUPPORTED':
      parts.push('Agentic Helper can support this assignment.');
      parts.push(`All ${available.length} required capability/ies are available.`);
      break;

    case 'PARTIAL':
      parts.push('Agentic Helper has partial support for this assignment.');
      if (available.length > 0) {
        parts.push(`Can perform: ${available.map((c) => getCapability(c)?.name || c).join(', ')}.`);
      }
      if (partialAvailable.length > 0) {
        parts.push(`Partial support for: ${partialAvailable.map((c) => getCapability(c)?.name || c).join(', ')}.`);
      }
      break;

    case 'UNSUPPORTED':
      parts.push('Agentic Helper cannot complete this assignment.');
      if (unavailable.length > 0) {
        parts.push(`Missing capabilities: ${unavailable.map((c) => getCapability(c)?.name || c).join(', ')}.`);
      }
      break;

    case 'UNKNOWN':
      parts.push('Could not fully determine assignment requirements.');
      parts.push('Please review the assignment details manually.');
      break;
  }

  if (extracted.hasExternalTools) {
    const toolNames = extracted.externalTools.map((t) => t.name);
    parts.push(`External software detected: ${toolNames.join(', ')}.`);
  }

  if (extracted.hasPhysicalActivity) {
    parts.push('Physical activity or in-person work appears to be required.');
  }

  return parts.join(' ');
}

/**
 * Calculate a confidence score for the analysis.
 * @param {object} normalized
 * @param {object} extracted
 * @param {string[]} requiredCapabilities
 * @returns {number} Confidence between 0 and 1
 */
function calculateConfidence(normalized, extracted, requiredCapabilities) {
  let confidence = 0.5; // Base confidence

  // Higher confidence if we have rich assignment data
  if (normalized.name) confidence += 0.1;
  if (normalized.plainDescription && normalized.plainDescription.length > 50) confidence += 0.1;
  if (normalized.submissionTypes.length > 0) confidence += 0.1;
  if (normalized.fileExtensions.length > 0) confidence += 0.05;
  if (normalized.hasRubric) confidence += 0.1;

  // Lower confidence if requirements are ambiguous
  if (extracted.requirements.length === 0) confidence -= 0.2;
  if (extracted.hasExternalTools && extracted.externalTools.some((t) => !t.executionAvailable)) {
    confidence += 0.05; // More confident about unsupported tools
  }

  return Math.min(1, Math.max(0, Math.round(confidence * 100) / 100));
}

module.exports = {
  analyzeAssignment,
  mapRequirementToCapabilities,
  checkCapabilityAvailability,
  buildSummary,
  calculateConfidence,
  REQUIREMENT_TO_CAPABILITIES,
  FILE_EXTENSION_CAPABILITIES,
};
