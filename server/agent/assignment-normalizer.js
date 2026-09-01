/**
 * assignment-normalizer.js
 * Normalizes Canvas assignment data into a consistent internal format
 * for capability analysis.
 *
 * Accepts raw Canvas assignment data and produces a normalized
 * AssignmentInput object with all fields the analyzer needs.
 *
 * Fields that are unavailable from Canvas are set to null/empty
 * rather than invented.
 */

const { stripHtml } = require('./utils');

/**
 * Extract URLs from HTML content.
 * @param {string} html
 * @returns {string[]}
 */
function extractLinks(html) {
  if (!html) return [];
  const links = [];
  const urlPattern = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    links.push(match[1]);
  }
  // Also extract bare URLs
  const bareUrlPattern = /(?<!["=])(https?:\/\/[^\s<>"')\]]+)/gi;
  while ((match = bareUrlPattern.exec(html)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  return links;
}

/**
 * Extract file extensions from a list of submission types or allowed extensions.
 * @param {string[]} submissionTypes
 * @param {string[]} allowedExtensions
 * @returns {string[]}
 */
function extractFileExtensions(submissionTypes, allowedExtensions) {
  const extensions = new Set();

  // From allowed extensions
  if (Array.isArray(allowedExtensions)) {
    for (const ext of allowedExtensions) {
      if (typeof ext === 'string' && ext.startsWith('.')) {
        extensions.add(ext.toLowerCase());
      }
    }
  }

  // From submission types (some include extension hints)
  if (Array.isArray(submissionTypes)) {
    for (const type of submissionTypes) {
      if (typeof type === 'string' && type.startsWith('.')) {
        extensions.add(type.toLowerCase());
      }
    }
  }

  return [...extensions];
}

/**
 * Determine whether a Canvas assignment is an online_upload type.
 * @param {string[]} submissionTypes
 * @returns {boolean}
 */
function isFileUploadAssignment(submissionTypes) {
  if (!Array.isArray(submissionTypes)) return false;
  return submissionTypes.includes('online_upload');
}

/**
 * Determine whether a Canvas assignment is an online_text_entry type.
 * @param {string[]} submissionTypes
 * @returns {boolean}
 */
function isTextEntryAssignment(submissionTypes) {
  if (!Array.isArray(submissionTypes)) return false;
  return submissionTypes.includes('online_text_entry');
}

/**
 * Normalize a Canvas assignment into the internal AssignmentInput format.
 *
 * @param {object} canvasAssignment - Raw Canvas assignment data
 * @param {object} options - Additional context
 * @param {object} [options.course] - Canvas course object
 * @param {object} [options.rubric] - Canvas rubric object
 * @param {object} [options.submission] - Existing submission data
 * @returns {object} Normalized AssignmentInput
 */
function normalizeAssignment(canvasAssignment, options = {}) {
  const assignment = canvasAssignment || {};
  const course = options.course || {};
  const rubric = options.rubric || null;
  const submission = options.submission || null;

  const submissionTypes = Array.isArray(assignment.submission_types)
    ? assignment.submission_types
    : [];
  const allowedExtensions = Array.isArray(assignment.allowed_extensions)
    ? assignment.allowed_extensions
    : [];

  const description = String(assignment.description || '');
  const name = String(assignment.name || assignment.title || '');
  const plainDescription = stripHtml(description);
  const combinedText = `${name} ${plainDescription}`;

  return {
    // Identity
    id: assignment.id || null,
    canvasId: assignment.canvasId || assignment.id || null,
    courseId: assignment.courseId || course.id || null,
    courseName: assignment.courseName || course.name || null,
    courseCode: assignment.courseCode || course.course_code || null,

    // Assignment content
    name: name,
    description: description,
    plainDescription: plainDescription,
    combinedText: combinedText,

    // Canvas metadata
    submissionTypes: submissionTypes,
    allowedExtensions: allowedExtensions,
    fileExtensions: extractFileExtensions(submissionTypes, allowedExtensions),
    pointsPossible: assignment.points_possible || null,
    dueAt: assignment.dueAt || assignment.due_at || null,
    lockAt: assignment.lockAt || assignment.lock_at || null,

    // Flags
    isFileUpload: isFileUploadAssignment(submissionTypes),
    isTextEntry: isTextEntryAssignment(submissionTypes),
    hasRubric: Boolean(rubric),
    hasSubmission: Boolean(submission),

    // Links and resources
    links: extractLinks(description),
    externalToolUrl: assignment.external_tool_tag_attributes?.url || null,

    // Rubric data (passed through if available)
    rubric: rubric,

    // Submission metadata
    submissionState: submission?.workflow_state || null,

    // Source marker
    source: 'canvas',
  };
}

module.exports = {
  normalizeAssignment,
  extractLinks,
  extractFileExtensions,
  isFileUploadAssignment,
  isTextEntryAssignment,
};
