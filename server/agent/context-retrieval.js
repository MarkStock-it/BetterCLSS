/**
 * context-retrieval.js
 * Relevant Context Retrieval for Agentic Helper
 *
 * Lightweight retrieval layer that:
 *   1. Determines what information each execution step needs
 *   2. Retrieves only authorized, relevant sources
 *   3. Compacts large content deterministically (no AI summarization)
 *   4. Formats context with clear source boundaries for the AI
 *
 * Does NOT:
 *   - Introduce vector databases or RAG pipelines
 *   - Use AI for summarization (deterministic extraction only)
 *   - Expose cross-user data
 *   - Store prompt/response contents
 *
 * Sources:
 *   - Assignment manifest (requirements, constraints, deliverables)
 *   - Previous step results (analysis, generated content, validation)
 *   - User-provided information (personal experiences, missing context)
 *   - Generated artifacts (file metadata, not content re-sending)
 *   - Assignment attachments (metadata only — content via tools)
 *
 * Authorization model:
 *   - Every retrieval verifies user owns the job
 *   - Course access verified via manifest identity
 *   - Assignment access verified via manifest identity
 *   - Artifact ownership verified via job.artifacts array
 */

// ─── Source Definitions ────────────────────────────────────────────

/**
 * Sources of context available to the agent.
 * Each source has a type and authorization requirements.
 */
const CONTEXT_SOURCES = {
  ASSIGNMENT: 'assignment',         // Always available — requirements, constraints, deliverables
  STEP_RESULT: 'step_result',       // Previous step outputs (analysis, content, validation)
  USER_INPUT: 'user_input',         // User-provided information
  ARTIFACT: 'artifact',             // Generated artifact metadata
  ATTACHMENT: 'attachment',         // Assignment attachment metadata
  COURSE: 'course',                 // Course-level information
};

/**
 * Step-type to required-sources mapping.
 * Defines which context sources are relevant for each execution step.
 */
const STEP_CONTEXT_MAP = {
  analyze: {
    required: [CONTEXT_SOURCES.ASSIGNMENT],
    optional: [],
    description: 'Understand assignment requirements',
  },
  generate: {
    required: [CONTEXT_SOURCES.ASSIGNMENT, CONTEXT_SOURCES.STEP_RESULT],
    optional: [CONTEXT_SOURCES.USER_INPUT, CONTEXT_SOURCES.ATTACHMENT],
    description: 'Generate content fulfilling requirements',
  },
  refine: {
    required: [CONTEXT_SOURCES.ASSIGNMENT, CONTEXT_SOURCES.STEP_RESULT],
    optional: [],
    description: 'Refine generated content',
  },
  validate: {
    required: [CONTEXT_SOURCES.ASSIGNMENT, CONTEXT_SOURCES.STEP_RESULT],
    optional: [],
    description: 'Validate content against requirements',
  },
  artifact: {
    required: [CONTEXT_SOURCES.ASSIGNMENT, CONTEXT_SOURCES.STEP_RESULT],
    optional: [CONTEXT_SOURCES.ARTIFACT],
    description: 'Generate artifact file',
  },
  artifact_validate: {
    required: [CONTEXT_SOURCES.ARTIFACT],
    optional: [],
    description: 'Validate generated artifact',
  },
};

// ─── Content Limits ────────────────────────────────────────────────

/**
 * Maximum content sizes for deterministic compression.
 * Prevents sending excessively large content to the AI.
 */
const CONTENT_LIMITS = {
  assignmentDescription: 4000,   // Max chars for assignment description
  previousAnalysis: 500,        // Max chars for previous analysis summary
  generatedContent: 8000,       // Max chars for content to refine (full for generate)
  refinedContent: 8000,         // Max chars for refined content
  userInput: 2000,              // Max chars for user-provided info
  attachmentSummary: 300,       // Max chars for attachment metadata summary
  artifactMetadata: 200,        // Max chars for artifact metadata
  stepResult: 1000,             // Max chars for a single step result summary
};

// ─── Authorization ─────────────────────────────────────────────────

/**
 * Verify that a user is authorized to access the context for a job.
 *
 * @param {number} userId - Authenticated user ID
 * @param {object} job - Agent Job
 * @param {object} manifest - Assignment Manifest
 * @returns {{ authorized: boolean, reason: string }}
 */
function verifyAccess(userId, job, manifest) {
  if (!userId || !job) {
    return { authorized: false, reason: 'Missing userId or job' };
  }

  // User must own the job
  if (String(job.userId) !== String(userId)) {
    return { authorized: false, reason: 'Job does not belong to this user' };
  }

  // Manifest identity must match job
  if (manifest) {
    const jobCourseId = job.courseId;
    const jobAssignmentId = job.assignmentId;
    const manifestCourseId = manifest.identity?.courseId;
    const manifestAssignmentId = manifest.identity?.assignmentId;

    if (manifestCourseId && String(jobCourseId) !== String(manifestCourseId)) {
      return { authorized: false, reason: 'Course ID mismatch between job and manifest' };
    }
    if (manifestAssignmentId && String(jobAssignmentId) !== String(manifestAssignmentId)) {
      return { authorized: false, reason: 'Assignment ID mismatch between job and manifest' };
    }
  }

  return { authorized: true, reason: '' };
}

/**
 * Verify that a specific artifact belongs to the job.
 *
 * @param {string} artifactId - Artifact ID to check
 * @param {object} job - Agent Job
 * @returns {boolean}
 */
function verifyArtifactOwnership(artifactId, job) {
  if (!artifactId || !job) return false;
  if (!Array.isArray(job.artifacts)) return false;
  return job.artifacts.some(a => a.id === artifactId);
}

// ─── Content Compression ───────────────────────────────────────────

/**
 * Deterministically compress content to fit within limits.
 * Uses extraction/truncation, NOT AI summarization.
 *
 * @param {string} content - Raw content
 * @param {number} maxLength - Maximum character length
 * @param {string} [strategy] - Compression strategy: 'truncate', 'extract', 'head_tail'
 * @returns {string} Compressed content
 */
function compactContent(content, maxLength, strategy = 'truncate') {
  if (!content || typeof content !== 'string') return '';
  if (content.length <= maxLength) return content;

  switch (strategy) {
    case 'head_tail': {
      // Keep beginning and end (good for structured content)
      const marker = '\n\n[...content compressed for context efficiency...]\n\n';
      const markerLen = marker.length;
      const tailLen = Math.max(0, Math.floor((maxLength - markerLen) * 0.3));
      const headLen = maxLength - markerLen - tailLen;
      if (headLen <= 0) {
        return content.slice(0, maxLength);
      }
      const head = content.slice(0, headLen);
      const tail = tailLen > 0 ? content.slice(-tailLen) : '';
      return head + marker + tail;
    }

    case 'extract':
      // Extract key sentences (first N sentences that fit)
      const sentences = content.split(/(?<=[.!?])\s+/);
      let extracted = '';
      for (const sentence of sentences) {
        if (extracted.length + sentence.length + 1 > maxLength) break;
        extracted += (extracted ? ' ' : '') + sentence;
      }
      return extracted || content.slice(0, maxLength);

    case 'truncate':
    default:
      return content.slice(0, maxLength) + '\n[Content truncated for context efficiency]';
  }
}

/**
 * Compact a step result for inclusion in context.
 * Extracts only the essential information.
 *
 * @param {object} stepResult - Result from a previous step
 * @param {string} stepType - Type of step that produced the result
 * @returns {string} Compacted result summary
 */
function compactStepResult(stepResult, stepType) {
  if (!stepResult) return '';

  switch (stepType) {
    case 'analyze':
      // Analysis results — compact the analysis text
      if (stepResult.analysis) {
        return compactContent(stepResult.analysis, CONTENT_LIMITS.previousAnalysis);
      }
      if (stepResult.deterministic) {
        return '[Deterministic analysis completed — requirements extracted from manifest]';
      }
      return '[Analysis completed]';

    case 'generate':
      // Generated content — include length info, not full content for non-generate steps
      if (stepResult.generatedContent) {
        const wordCount = stepResult.generatedContent.split(/\s+/).filter(Boolean).length;
        return `[Generated content: ${wordCount} words, ${stepResult.generatedContent.length} chars]`;
      }
      return '[Content generation completed]';

    case 'refine':
      // Refined content — include length info
      if (stepResult.refinedContent) {
        const wordCount = stepResult.refinedContent.split(/\s+/).filter(Boolean).length;
        const changed = stepResult.refined ? ' (refined)' : ' (no changes needed)';
        return `[Refined content: ${wordCount} words${changed}]`;
      }
      return '[Refinement completed]';

    case 'validate':
      // Validation results — compact validation summary
      if (stepResult.validation) {
        const v = stepResult.validation;
        const parts = [`Validation: ${v.passed ? 'PASSED' : 'FAILED'}`];
        if (v.wordCount) parts.push(`${v.wordCount} words`);
        if (v.checks && v.checks.length > 0) {
          parts.push(`${v.checks.length} checks`);
        }
        return parts.join(' | ');
      }
      return '[Validation completed]';

    case 'artifact':
      // Artifact results — metadata only (no file content)
      if (stepResult.artifact) {
        const a = stepResult.artifact;
        return `[Artifact: ${a.filename || 'unknown'} (${a.size || 0} bytes, ${a.type || 'unknown'})]`;
      }
      return '[Artifact generated]';

    case 'artifact_validate':
      // Artifact validation — compact result
      if (stepResult.validation) {
        return `[Artifact validation: ${stepResult.validation.passed ? 'PASSED' : 'FAILED'}]`;
      }
      return '[Artifact validation completed]';

    default:
      return `[Step ${stepType} completed]`;
  }
}

// ─── Context Retrieval ─────────────────────────────────────────────

/**
 * Retrieve authorized context for a specific execution step.
 *
 * @param {object} params
 * @param {string} params.stepType - Current step type
 * @param {number} params.userId - Authenticated user ID
 * @param {object} params.job - Agent Job
 * @param {object} params.manifest - Assignment Manifest
 * @param {object} params.understanding - AssignmentUnderstanding
 * @param {object} params.stepResults - Results from previous steps
 * @param {object} [params.plan] - Current execution plan
 * @param {object} [params.userInput] - User-provided information
 * @returns {object} Retrieved context with authorization status
 */
function retrieveForStep({ stepType, userId, job, manifest, understanding, stepResults, plan, userInput }) {
  // ─── Authorization check ──────────────────────────────────────
  const auth = verifyAccess(userId, job, manifest);
  if (!auth.authorized) {
    return {
      authorized: false,
      reason: auth.reason,
      sources: {},
      compacted: {},
    };
  }

  const contextMap = STEP_CONTEXT_MAP[stepType] || STEP_CONTEXT_MAP.analyze;
  const sources = {};
  const compacted = {};

  // Build the full context for source retrieval
  const fullCtx = { stepType, userId, job, manifest, understanding, stepResults, plan, userInput };

  // ─── Retrieve required sources ────────────────────────────────
  for (const sourceType of contextMap.required) {
    const result = retrieveSource(sourceType, fullCtx);
    if (result.authorized) {
      sources[sourceType] = result.data;
      compacted[sourceType] = result.compacted;
    }
  }

  // ─── Retrieve optional sources (if available) ─────────────────
  for (const sourceType of contextMap.optional) {
    const result = retrieveSource(sourceType, fullCtx);
    if (result.authorized && result.data) {
      sources[sourceType] = result.data;
      compacted[sourceType] = result.compacted;
    }
  }

  return {
    authorized: true,
    reason: '',
    sources,
    compacted,
    stepType,
    description: contextMap.description,
  };
}

/**
 * Retrieve a single source of context.
 *
 * @param {string} sourceType - Source type constant
 * @param {object} context - Available context data
 * @returns {{ authorized: boolean, data: object|null, compacted: string|null }}
 */
function retrieveSource(sourceType, context) {
  switch (sourceType) {
    case CONTEXT_SOURCES.ASSIGNMENT:
      return retrieveAssignment(context);

    case CONTEXT_SOURCES.STEP_RESULT:
      return retrieveStepResults(context);

    case CONTEXT_SOURCES.USER_INPUT:
      return retrieveUserInput(context);

    case CONTEXT_SOURCES.ARTIFACT:
      return retrieveArtifact(context);

    case CONTEXT_SOURCES.ATTACHMENT:
      return retrieveAttachment(context);

    case CONTEXT_SOURCES.COURSE:
      return retrieveCourse(context);

    default:
      return { authorized: false, data: null, compacted: null };
  }
}

/**
 * Retrieve assignment context (always authorized for job owner).
 */
function retrieveAssignment({ manifest, understanding }) {
  if (!manifest) {
    return { authorized: true, data: null, compacted: null };
  }

  const data = {
    title: understanding?.title || manifest.metadata?.title || 'Untitled',
    course: understanding?.course || manifest.identity?.courseName || 'Unknown',
    description: compactContent(
      manifest.metadata?.plainDescription || manifest.metadata?.description || '',
      CONTENT_LIMITS.assignmentDescription
    ),
    requirements: understanding?.requirements || [],
    constraints: understanding?.constraints || [],
    deliverables: understanding?.deliverables || [],
    dueDate: understanding?.dueDate || manifest.metadata?.dueDate || null,
    submissionType: understanding?.submissionType || 'unknown',
    personalInfoRequired: understanding?.personalInfoRequired || false,
    referencesRequired: understanding?.referencesRequired || false,
    referencesNote: understanding?.referencesNote || '',
  };

  // Build compact representation
  const parts = [`Assignment: ${data.title} (${data.course})`];
  if (data.dueDate) parts.push(`Due: ${data.dueDate}`);
  if (data.requirements.length > 0) {
    parts.push(`Requirements: ${data.requirements.map(r => r.description).join('; ')}`);
  }
  if (data.constraints.length > 0) {
    parts.push(`Constraints: ${data.constraints.map(c => c.description).join('; ')}`);
  }
  if (data.deliverables.length > 0) {
    parts.push(`Deliverables: ${data.deliverables.map(d => `${d.description} (${d.format})`).join('; ')}`);
  }

  return {
    authorized: true,
    data,
    compacted: parts.join('\n'),
  };
}

/**
 * Retrieve previous step results.
 * Only returns results from steps that are relevant to the current step.
 */
function retrieveStepResults({ stepType, stepResults }) {
  if (!stepResults || Object.keys(stepResults).length === 0) {
    return { authorized: true, data: {}, compacted: null };
  }

  // Determine which previous steps are relevant
  const relevantSteps = getRelevantPreviousSteps(stepType);
  const relevantResults = {};

  for (const [stepId, result] of Object.entries(stepResults)) {
    // Match by step type embedded in step ID or by checking result properties
    const isRelevant = relevantSteps.some(relevantType =>
      stepId.includes(relevantType) || resultHasType(result, relevantType)
    );

    if (isRelevant) {
      relevantResults[stepId] = result;
    }
  }

  // Compact the results
  const compactedParts = [];
  for (const [stepId, result] of Object.entries(relevantResults)) {
    const stepTypeForCompact = inferStepType(stepId, result);
    const compacted = compactStepResult(result, stepTypeForCompact);
    if (compacted) {
      compactedParts.push(compacted);
    }
  }

  return {
    authorized: true,
    data: relevantResults,
    compacted: compactedParts.length > 0 ? compactedParts.join('\n') : null,
  };
}

/**
 * Retrieve user-provided information.
 * Only included when the step needs it AND user has provided it.
 */
function retrieveUserInput({ userInput }) {
  if (!userInput || typeof userInput !== 'object') {
    return { authorized: true, data: null, compacted: null };
  }

  // Compact user input
  const compacted = compactContent(JSON.stringify(userInput), CONTENT_LIMITS.userInput, 'head_tail');

  return {
    authorized: true,
    data: userInput,
    compacted,
  };
}

/**
 * Retrieve artifact metadata.
 * Only returns metadata — never re-sends file content.
 */
function retrieveArtifact({ job, stepResults }) {
  if (!job || !Array.isArray(job.artifacts) || job.artifacts.length === 0) {
    return { authorized: true, data: null, compacted: null };
  }

  // Get artifacts from the artifact generation step
  const artifactStep = stepResults?.artifact || stepResults[Object.keys(stepResults).find(k => k.includes('artifact'))];
  const artifactData = artifactStep?.artifact || null;

  if (!artifactData) {
    // Return job-level artifact list
    const summaries = job.artifacts.map(a =>
      `[${a.filename || 'unknown'}: ${a.size || 0} bytes, ${a.type || 'unknown'}]`
    );
    return {
      authorized: true,
      data: job.artifacts,
      compacted: summaries.join('\n'),
    };
  }

  return {
    authorized: true,
    data: artifactData,
    compacted: `[Artifact: ${artifactData.filename || 'unknown'} (${artifactData.size || 0} bytes)]`,
  };
}

/**
 * Retrieve attachment metadata.
 * Content is NOT sent — only metadata for context.
 */
function retrieveAttachment({ manifest }) {
  // In the current implementation, attachments are represented in the manifest
  // but not fully processed. Return what's available.
  const attachments = manifest?.attachments || manifest?.metadata?.attachments || [];

  if (attachments.length === 0) {
    return { authorized: true, data: null, compacted: null };
  }

  const summaries = attachments.map(a => {
    const name = a.filename || a.displayName || 'attachment';
    const type = a.contentType || a.mimeType || 'unknown';
    const size = a.size || 0;
    return compactContent(`Attachment: ${name} (${type}, ${size} bytes)`, CONTENT_LIMITS.attachmentSummary);
  });

  return {
    authorized: true,
    data: attachments,
    compacted: summaries.join('\n'),
  };
}

/**
 * Retrieve course-level information.
 */
function retrieveCourse({ manifest, understanding }) {
  const courseData = {
    name: understanding?.course || manifest?.identity?.courseName || 'Unknown',
    code: understanding?.courseCode || manifest?.identity?.courseCode || '',
    courseId: manifest?.identity?.courseId || null,
  };

  return {
    authorized: true,
    data: courseData,
    compacted: `${courseData.name}${courseData.code ? ` (${courseData.code})` : ''}`,
  };
}

// ─── Formatting ────────────────────────────────────────────────────

/**
 * Format retrieved context with clear source boundaries for the AI.
 * Treats all retrieved material as untrusted reference data.
 *
 * @param {object} retrieved - Output from retrieveForStep()
 * @returns {string} Formatted context string
 */
function formatWithBoundaries(retrieved) {
  if (!retrieved || !retrieved.authorized) {
    return retrieved?.reason || 'Context retrieval unauthorized';
  }

  const sections = [];

  // ─── Assignment Requirements (always present, authoritative) ──
  if (retrieved.sources[CONTEXT_SOURCES.ASSIGNMENT]) {
    sections.push('═══ ASSIGNMENT REQUIREMENTS (authoritative) ═══');
    sections.push(retrieved.compacted[CONTEXT_SOURCES.ASSIGNMENT] || '');
    sections.push('');
  }

  // ─── Relevant Previous Results ────────────────────────────────
  if (retrieved.compacted[CONTEXT_SOURCES.STEP_RESULT]) {
    sections.push('═══ PREVIOUS STEP RESULTS (reference data) ═══');
    sections.push(retrieved.compacted[CONTEXT_SOURCES.STEP_RESULT]);
    sections.push('');
  }

  // ─── User-Provided Information ────────────────────────────────
  if (retrieved.compacted[CONTEXT_SOURCES.USER_INPUT]) {
    sections.push('═══ USER-PROVIDED INFORMATION (untrusted reference) ═══');
    sections.push(retrieved.compacted[CONTEXT_SOURCES.USER_INPUT]);
    sections.push('');
  }

  // ─── Attachment Metadata ──────────────────────────────────────
  if (retrieved.compacted[CONTEXT_SOURCES.ATTACHMENT]) {
    sections.push('═══ ASSIGNMENT ATTACHMENTS (metadata only) ═══');
    sections.push(retrieved.compacted[CONTEXT_SOURCES.ATTACHMENT]);
    sections.push('');
  }

  // ─── Artifact Metadata ────────────────────────────────────────
  if (retrieved.compacted[CONTEXT_SOURCES.ARTIFACT]) {
    sections.push('═══ ARTIFACT STATUS ═══');
    sections.push(retrieved.compacted[CONTEXT_SOURCES.ARTIFACT]);
    sections.push('');
  }

  // ─── Course Info ──────────────────────────────────────────────
  if (retrieved.compacted[CONTEXT_SOURCES.COURSE]) {
    sections.push(`═══ COURSE: ${retrieved.compacted[CONTEXT_SOURCES.COURSE]} ═══`);
    sections.push('');
  }

  // ─── Current Task ─────────────────────────────────────────────
  sections.push('═══ CURRENT TASK ═══');
  sections.push(`Step: ${retrieved.stepType.toUpperCase()}`);
  sections.push(`Objective: ${retrieved.description || 'Complete this step'}`);

  return sections.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Get which previous step types are relevant for a given current step.
 *
 * @param {string} currentStepType
 * @returns {string[]} Relevant previous step types
 */
function getRelevantPreviousSteps(currentStepType) {
  const relevanceMap = {
    analyze: [],                                    // No previous steps needed
    generate: ['analyze'],                          // Needs analysis
    refine: ['generate'],                           // Needs generated content
    validate: ['generate', 'refine'],               // Needs content to validate
    artifact: ['generate', 'refine', 'validate'],   // Needs content for artifact
    artifact_validate: ['artifact'],                 // Needs artifact info
  };
  return relevanceMap[currentStepType] || [];
}

/**
 * Check if a step result has a specific step type.
 *
 * @param {object} result
 * @param {string} stepType
 * @returns {boolean}
 */
function resultHasType(result, stepType) {
  if (!result) return false;
  switch (stepType) {
    case 'analyze': return Boolean(result.analysis || result.deterministic);
    case 'generate': return Boolean(result.generatedContent);
    case 'refine': return Boolean(result.refinedContent || result.refined !== undefined);
    case 'validate': return Boolean(result.validation);
    case 'artifact': return Boolean(result.artifact);
    case 'artifact_validate': return Boolean(result.validation && result.validation.checks);
    default: return false;
  }
}

/**
 * Infer the step type from a step ID or result structure.
 *
 * @param {string} stepId
 * @param {object} result
 * @returns {string}
 */
function inferStepType(stepId, result) {
  if (stepId.includes('analyze')) return 'analyze';
  if (stepId.includes('generate')) return 'generate';
  if (stepId.includes('refine')) return 'refine';
  if (stepId.includes('artifact_validate')) return 'artifact_validate';
  if (stepId.includes('validate')) return 'validate';
  if (stepId.includes('artifact')) return 'artifact';
  // Infer from result shape
  if (result.generatedContent) return 'generate';
  if (result.refinedContent) return 'refine';
  if (result.analysis) return 'analyze';
  if (result.validation) return 'validate';
  if (result.artifact) return 'artifact';
  return 'unknown';
}

module.exports = {
  // Core retrieval
  retrieveForStep,
  formatWithBoundaries,
  verifyAccess,
  verifyArtifactOwnership,

  // Compression
  compactContent,
  compactStepResult,

  // Constants
  CONTEXT_SOURCES,
  STEP_CONTEXT_MAP,
  CONTENT_LIMITS,

  // Helpers (exported for testing)
  getRelevantPreviousSteps,
  resultHasType,
  inferStepType,
  retrieveSource,
};
