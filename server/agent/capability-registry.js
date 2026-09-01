/**
 * capability-registry.js
 * Centralized capability registry for Agentic Helper.
 *
 * This is the single source of truth for what Agentic Helper can do.
 * Each capability has a status, metadata, and associated tool requirements.
 *
 * Status values:
 *   SUPPORTED   — Agentic Helper has all required tools and can complete this
 *   PARTIAL     — Agentic Helper can do some but not all of this
 *   UNSUPPORTED — Agentic Helper cannot do this
 */

const CAPABILITIES = {
  // ─── Text Generation ─────────────────────────────────────────────
  text_generation: {
    id: 'text_generation',
    name: 'Text Generation',
    description: 'Generate written text responses, essays, short answers, and structured prose',
    category: 'TEXT',
    status: 'SUPPORTED',
    requiredTools: [],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['text/plain', 'text/markdown'],
    limitations: [],
  },

  text_refinement: {
    id: 'text_refinement',
    name: 'Text Refinement',
    description: 'Improve clarity, grammar, structure, and naturalness of existing text',
    category: 'TEXT',
    status: 'SUPPORTED',
    requiredTools: [],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['text/plain', 'text/markdown'],
    limitations: [],
  },

  structured_text_generation: {
    id: 'structured_text_generation',
    name: 'Structured Text Generation',
    description: 'Generate structured documents with headings, lists, citations, and formatting',
    category: 'TEXT',
    status: 'SUPPORTED',
    requiredTools: [],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['text/plain', 'text/markdown'],
    limitations: ['Complex LaTeX may have limitations'],
  },

  // ─── Document Generation ─────────────────────────────────────────
  docx_generation: {
    id: 'docx_generation',
    name: 'DOCX Generation',
    description: 'Generate Microsoft Word documents with proper formatting, headings, and styles',
    category: 'FILE',
    status: 'SUPPORTED',
    requiredTools: ['document_generator'],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    fileExtensions: ['.docx'],
    limitations: ['Complex table layouts may have limitations', 'Macros not supported'],
  },

  pdf_generation: {
    id: 'pdf_generation',
    name: 'PDF Generation',
    description: 'Generate PDF documents with formatted text, headings, and basic layouts',
    category: 'FILE',
    status: 'UNSUPPORTED',
    requiredTools: ['pdf_generator'],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['application/pdf'],
    fileExtensions: ['.pdf'],
    limitations: ['Not yet implemented — no PDF library available on server'],
  },

  txt_generation: {
    id: 'txt_generation',
    name: 'Plain Text Generation',
    description: 'Generate plain text files',
    category: 'FILE',
    status: 'SUPPORTED',
    requiredTools: [],
    supportedInputTypes: ['text/plain'],
    supportedOutputTypes: ['text/plain'],
    fileExtensions: ['.txt'],
    limitations: [],
  },

  // ─── Presentation Generation (Partial) ───────────────────────────
  pptx_generation: {
    id: 'pptx_generation',
    name: 'PowerPoint Generation',
    description: 'Generate basic PowerPoint slide decks',
    category: 'FILE',
    status: 'PARTIAL',
    requiredTools: ['presentation_generator'],
    supportedInputTypes: ['text/plain', 'text/markdown'],
    supportedOutputTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    fileExtensions: ['.pptx'],
    limitations: ['Complex animations not supported', 'Limited chart support', 'Speaker notes only'],
  },

  // ─── Spreadsheet Generation (Partial) ────────────────────────────
  xlsx_generation: {
    id: 'xlsx_generation',
    name: 'Excel Spreadsheet Generation',
    description: 'Generate basic Excel spreadsheets with data and formulas',
    category: 'FILE',
    status: 'PARTIAL',
    requiredTools: ['spreadsheet_generator'],
    supportedInputTypes: ['text/csv', 'text/plain'],
    supportedOutputTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    fileExtensions: ['.xlsx', '.csv'],
    limitations: ['Macros not supported', 'Complex pivot tables not supported'],
  },

  // ─── Canvas Operations ───────────────────────────────────────────
  canvas_read_assignment: {
    id: 'canvas_read_assignment',
    name: 'Canvas Assignment Reading',
    description: 'Read assignment details, descriptions, and metadata from Canvas',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_read'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: [],
  },

  canvas_read_rubric: {
    id: 'canvas_read_rubric',
    name: 'Canvas Rubric Reading',
    description: 'Read assignment rubrics and grading criteria from Canvas',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_read'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Some assignments may not have rubrics'],
  },

  canvas_read_submission: {
    id: 'canvas_read_submission',
    name: 'Canvas Submission Reading',
    description: 'Read existing submission status and details from Canvas',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_read'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: [],
  },

  canvas_read_comments: {
    id: 'canvas_read_comments',
    name: 'Canvas Comment Reading',
    description: 'Read submission comments and feedback from Canvas',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_read'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: [],
  },

  canvas_create_comment: {
    id: 'canvas_create_comment',
    name: 'Canvas Comment Creation',
    description: 'Post comments on Canvas submissions',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_write'],
    supportedInputTypes: ['text/plain'],
    supportedOutputTypes: [],
    limitations: [],
  },

  canvas_file_upload: {
    id: 'canvas_file_upload',
    name: 'Canvas File Upload',
    description: 'Upload files to Canvas assignments',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_write', 'file_upload'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['File size limits apply (10MB default)'],
  },

  canvas_submission: {
    id: 'canvas_submission',
    name: 'Canvas Assignment Submission',
    description: 'Submit assignments through Canvas API',
    category: 'CANVAS',
    status: 'SUPPORTED',
    requiredTools: ['canvas_api_write'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: [],
  },

  // ─── Unsupported Capabilities ────────────────────────────────────
  code_execution: {
    id: 'code_execution',
    name: 'Code Execution',
    description: 'Execute and test code in programming environments',
    category: 'CODE',
    status: 'UNSUPPORTED',
    requiredTools: ['code_runner'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Cannot run or validate code'],
  },

  video_generation: {
    id: 'video_generation',
    name: 'Video Generation',
    description: 'Generate video content, screen recordings, or presentations',
    category: 'MEDIA',
    status: 'UNSUPPORTED',
    requiredTools: ['video_generator'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Cannot produce video content'],
  },

  image_generation: {
    id: 'image_generation',
    name: 'Image Generation',
    description: 'Generate images, diagrams, or visual content',
    category: 'MEDIA',
    status: 'UNSUPPORTED',
    requiredTools: ['image_generator'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Cannot produce image content'],
  },

  audio_generation: {
    id: 'audio_generation',
    name: 'Audio Generation',
    description: 'Generate audio recordings or voice content',
    category: 'MEDIA',
    status: 'UNSUPPORTED',
    requiredTools: ['audio_generator'],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Cannot produce audio content'],
  },

  physical_activity: {
    id: 'physical_activity',
    name: 'Physical Activity',
    description: 'Perform physical tasks like building circuits, conducting experiments, or measuring equipment',
    category: 'PHYSICAL',
    status: 'UNSUPPORTED',
    requiredTools: [],
    supportedInputTypes: [],
    supportedOutputTypes: [],
    limitations: ['Requires physical presence and equipment'],
  },
};

/**
 * Get a capability by ID.
 * @param {string} capabilityId
 * @returns {object|undefined}
 */
function getCapability(capabilityId) {
  return CAPABILITIES[capabilityId];
}

/**
 * Get all capabilities.
 * @returns {object}
 */
function getAllCapabilities() {
  return { ...CAPABILITIES };
}

/**
 * Get capabilities filtered by status.
 * @param {string} status - SUPPORTED, PARTIAL, UNSUPPORTED
 * @returns {object[]}
 */
function getCapabilitiesByStatus(status) {
  return Object.values(CAPABILITIES).filter((cap) => cap.status === status);
}

/**
 * Check if a specific capability is available (SUPPORTED or PARTIAL).
 * @param {string} capabilityId
 * @returns {boolean}
 */
function isCapabilityAvailable(capabilityId) {
  const cap = CAPABILITIES[capabilityId];
  return cap && (cap.status === 'SUPPORTED' || cap.status === 'PARTIAL');
}

module.exports = {
  CAPABILITIES,
  getCapability,
  getAllCapabilities,
  getCapabilitiesByStatus,
  isCapabilityAvailable,
};
