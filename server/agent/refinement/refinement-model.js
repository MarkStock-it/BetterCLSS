/**
 * refinement-model.js
 * Refinement Pipeline Model.
 *
 * Defines the refinement stages, result schema, and content structures
 * used by the content refinement pipeline.
 *
 * The pipeline improves generated content for clarity, naturalness,
 * and requirement alignment. It is NOT an AI-detector bypass.
 */

// ─── Refinement Stages ─────────────────────────────────────────────

const REFINEMENT_STAGES = {
  CONTENT_REVIEW: 'CONTENT_REVIEW',
  STYLE_REFINEMENT: 'STYLE_REFINEMENT',
  FACT_CONSISTENCY: 'FACT_CONSISTENCY',
  REQUIREMENT_CHECK: 'REQUIREMENT_CHECK',
  FINAL_VALIDATION: 'FINAL_VALIDATION',
};

const STAGE_ORDER = [
  REFINEMENT_STAGES.CONTENT_REVIEW,
  REFINEMENT_STAGES.STYLE_REFINEMENT,
  REFINEMENT_STAGES.FACT_CONSISTENCY,
  REFINEMENT_STAGES.REQUIREMENT_CHECK,
  REFINEMENT_STAGES.FINAL_VALIDATION,
];

// ─── Refinement Status ─────────────────────────────────────────────

const REFINEMENT_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

// ─── Refinement Result ─────────────────────────────────────────────

/**
 * Create a refinement result object.
 *
 * @param {object} params
 * @param {string} params.originalContent - Original generated content
 * @param {string} params.refinedContent - Refined content (may equal original)
 * @param {string[]} params.stages - Stages that were run
 * @param {object[]} params.changes - List of changes made
 * @param {string[]} params.warnings - Warnings about the content
 * @param {object} params.validation - Requirement validation result
 * @returns {object} Refinement result
 */
function createRefinementResult({
  originalContent,
  refinedContent,
  stages = [],
  changes = [],
  warnings = [],
  validation = null,
}) {
  return {
    originalContent,
    refinedContent: refinedContent || originalContent,
    stages,
    changes,
    warnings,
    validation,
    contentChanged: originalContent !== refinedContent,
    wordCount: countWords(refinedContent || originalContent),
    timestamp: new Date().toISOString(),
  };
}

// ─── Content Structure ─────────────────────────────────────────────

/**
 * Normalized content structure for refinement.
 *
 * Content flows through the pipeline as structured objects,
 * not raw strings.
 *
 * @typedef {object} RefinableContent
 * @property {string} title - Document title
 * @property {Array} paragraphs - Array of paragraph objects
 * @property {string} [rawText] - Alternative: raw text content
 * @property {object} [metadata] - Content metadata
 */

/**
 * Convert content to a refinable format.
 *
 * @param {object} content - Content from artifact generator
 * @returns {RefinableContent}
 */
function normalizeForRefinement(content) {
  if (!content) return { title: '', paragraphs: [], rawText: '' };

  // If already structured
  if (Array.isArray(content.paragraphs) && content.paragraphs.length > 0) {
    return {
      title: content.title || '',
      paragraphs: content.paragraphs.map((p) => ({
        text: p.text || '',
        style: p.style || 'normal',
        bold: p.bold || false,
        italic: p.italic || false,
      })),
      rawText: content.rawText || '',
      metadata: content.metadata || {},
    };
  }

  // If raw text, split into paragraphs
  const text = content.text || content.rawText || '';
  const paragraphs = text
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => ({ text: p.trim(), style: 'normal', bold: false, italic: false }));

  return {
    title: content.title || '',
    paragraphs,
    rawText: text,
    metadata: content.metadata || {},
  };
}

/**
 * Convert refined content back to artifact format.
 *
 * @param {RefinableContent} refined
 * @returns {object} Content format for artifact generators
 */
function toArtifactContent(refined) {
  if (!refined) return {};

  return {
    title: refined.title || '',
    paragraphs: (refined.paragraphs || []).map((p) => ({
      text: p.text,
      style: p.style,
      bold: p.bold,
      italic: p.italic,
    })),
    rawText: refined.rawText || (refined.paragraphs || []).map((p) => p.text).join('\n\n'),
  };
}

// ─── Refinement Schema ─────────────────────────────────────────────

/**
 * JSON Schema for AI refinement responses.
 */
const REFINEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    content: {
      type: 'object',
      description: 'The refined content',
      properties: {
        title: { type: 'string', description: 'Document title (may be improved)' },
        paragraphs: {
          type: 'array',
          description: 'Refined paragraphs',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Paragraph text' },
              style: { type: 'string', enum: ['heading1', 'heading2', 'heading3', 'normal'] },
              bold: { type: 'boolean' },
              italic: { type: 'boolean' },
            },
            required: ['text'],
          },
        },
      },
      required: ['paragraphs'],
    },
    changes: {
      type: 'array',
      description: 'List of changes made during refinement',
      items: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: 'Which refinement stage made this change' },
          type: { type: 'string', description: 'Type of change (e.g., clarity, length, structure)' },
          description: { type: 'string', description: 'Description of the change' },
          paragraphIndex: { type: 'number', description: 'Index of affected paragraph (if applicable)' },
        },
        required: ['stage', 'description'],
      },
    },
    warnings: {
      type: 'array',
      description: 'Warnings about the content',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Warning type' },
          message: { type: 'string', description: 'Warning message' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
        },
        required: ['message'],
      },
    },
    summary: {
      type: 'string',
      description: 'Brief summary of refinement changes',
    },
  },
  required: ['content'],
};

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Count words in text.
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Get the next stage in the pipeline.
 * @param {string} currentStage
 * @returns {string|null}
 */
function getNextStage(currentStage) {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

/**
 * Check if a stage is the final stage.
 * @param {string} stage
 * @returns {boolean}
 */
function isFinalStage(stage) {
  return stage === REFINEMENT_STAGES.FINAL_VALIDATION;
}

module.exports = {
  REFINEMENT_STAGES,
  STAGE_ORDER,
  REFINEMENT_STATUS,
  createRefinementResult,
  normalizeForRefinement,
  toArtifactContent,
  REFINEMENT_RESPONSE_SCHEMA,
  countWords,
  getNextStage,
  isFinalStage,
};
