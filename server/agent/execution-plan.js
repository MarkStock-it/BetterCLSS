/**
 * execution-plan.js
 * Execution Plan for Agentic Helper.
 *
 * Defines the structured execution plan that guides an Agent Job
 * through a deterministic pipeline of steps.
 *
 * Each step has:
 *   - id: unique step identifier
 *   - type: category of step (analyze, generate, refine, validate, artifact, submit)
 *   - state: PENDING | RUNNING | COMPLETED | FAILED | BLOCKED
 *   - dependencies: array of step IDs that must complete before this step
 *   - requiredCapabilities: capabilities needed for this step
 *   - requiredRequirements: assignment requirements this step covers
 *   - result: output of the step (if completed)
 *   - error: error info (if failed)
 *   - startedAt, completedAt: timestamps
 *
 * The plan is:
 *   1. Generated from the Assignment Manifest
 *   2. Validated against the Capability Engine
 *   3. Executed by the Orchestrator
 *   4. Used to build the human review package
 */

// ─── Step States ───────────────────────────────────────────────────

const STEP_STATES = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
};

const TERMINAL_STEP_STATES = new Set([
  STEP_STATES.COMPLETED,
  STEP_STATES.FAILED,
  STEP_STATES.BLOCKED,
]);

// ─── Step Types ────────────────────────────────────────────────────

const STEP_TYPES = {
  ANALYZE: 'analyze',           // Read and understand assignment
  GENERATE: 'generate',         // Generate content via AI
  REFINE: 'refine',             // Refine generated content
  VALIDATE: 'validate',         // Validate against requirements
  ARTIFACT: 'artifact',         // Generate DOCX/TXT artifact
  ARTIFACT_VALIDATE: 'artifact_validate', // Validate generated artifact
  SUBMIT: 'submit',             // Canvas submission (requires approval)
};

// ─── Plan States ───────────────────────────────────────────────────

const PLAN_STATES = {
  CREATED: 'CREATED',
  VALIDATED: 'VALIDATED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',           // USER_ACTION_REQUIRED
};

// ─── Plan Creation ─────────────────────────────────────────────────

/**
 * Create an execution plan from an Assignment Manifest.
 *
 * @param {object} manifest - Assignment Manifest
 * @returns {object} ExecutionPlan
 */
function createExecutionPlan(manifest) {
  const meta = manifest?.metadata || {};
  const requirements = manifest?.requirements || {};
  const capabilityResult = manifest?.capabilityResult || {};
  const caps = manifest?.capabilities || {};

  const planId = generatePlanId();
  const now = new Date().toISOString();

  // Build steps based on assignment requirements
  const steps = [];

  // Step 1: Analyze assignment
  steps.push(createStep({
    id: `${planId}_analyze`,
    type: STEP_TYPES.ANALYZE,
    label: 'Analyze Assignment',
    description: `Read and understand the requirements for "${meta.title || 'Unknown'}"`,
    requiredCapabilities: ['canvas_read_assignment'],
    requiredRequirements: [],
    dependencies: [],
  }));

  // Step 2: Generate content (if text-based)
  const isTextBased = (requirements.categories || []).includes('TEXT')
    || (requirements.categories || []).length === 0;
  const hasFileRequirement = (requirements.categories || []).includes('FILE');

  if (isTextBased) {
    steps.push(createStep({
      id: `${planId}_generate`,
      type: STEP_TYPES.GENERATE,
      label: 'Generate Content',
      description: 'Generate written response based on assignment requirements',
      requiredCapabilities: ['text_generation'],
      requiredRequirements: ['text_content'],
      dependencies: [`${planId}_analyze`],
    }));

    // Step 3: Refine content
    steps.push(createStep({
      id: `${planId}_refine`,
      type: STEP_TYPES.REFINE,
      label: 'Refine Content',
      description: 'Improve clarity, grammar, and structure of generated content',
      requiredCapabilities: ['text_refinement'],
      requiredRequirements: ['text_quality'],
      dependencies: [`${planId}_generate`],
    }));

    // Step 4: Validate requirements
    steps.push(createStep({
      id: `${planId}_validate`,
      type: STEP_TYPES.VALIDATE,
      label: 'Validate Requirements',
      description: 'Check generated content against assignment requirements',
      requiredCapabilities: [],
      requiredRequirements: ['requirement_coverage'],
      dependencies: [`${planId}_refine`],
    }));

    // Step 5: Generate artifact (TXT or DOCX based on submission type)
    const submissionTypes = meta.submissionTypes || [];
    const isDocx = submissionTypes.some(t => t === 'online_upload')
      && (meta.allowedExtensions || []).some(e => e === '.docx');

    steps.push(createStep({
      id: `${planId}_artifact`,
      type: STEP_TYPES.ARTIFACT,
      label: isDocx ? 'Generate DOCX' : 'Generate Document',
      description: isDocx
        ? 'Create formatted Word document from refined content'
        : 'Create text document from refined content',
      requiredCapabilities: isDocx ? ['docx_generation'] : ['txt_generation'],
      requiredRequirements: ['artifact_delivery'],
      dependencies: [`${planId}_validate`],
      artifactType: isDocx ? 'docx' : 'txt',
    }));

    // Step 6: Validate artifact
    steps.push(createStep({
      id: `${planId}_artifact_validate`,
      type: STEP_TYPES.ARTIFACT_VALIDATE,
      label: 'Validate Document',
      description: 'Verify generated document is valid and complete',
      requiredCapabilities: [],
      requiredRequirements: ['artifact_valid'],
      dependencies: [`${planId}_artifact`],
    }));
  } else if (hasFileRequirement) {
    // File-based assignment without text generation
    steps.push(createStep({
      id: `${planId}_unsupported`,
      type: STEP_TYPES.GENERATE,
      label: 'Unsupported Format',
      description: 'This assignment requires a file format that cannot be generated',
      requiredCapabilities: [],
      requiredRequirements: [],
      dependencies: [`${planId}_analyze`],
      blocked: true,
      blockedReason: 'File-based assignment requires unsupported format',
    }));
  }

  const plan = {
    id: planId,
    manifestId: manifest?.id || null,
    state: PLAN_STATES.CREATED,
    steps,
    requirements: extractRequirements(manifest),
    requiredCapabilities: extractRequiredCapabilities(steps),
    expectedArtifacts: extractExpectedArtifacts(steps),
    warnings: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  return plan;
}

/**
 * Create a single execution step.
 *
 * @param {object} params
 * @returns {object} Step
 */
function createStep({
  id,
  type,
  label,
  description,
  requiredCapabilities = [],
  requiredRequirements = [],
  dependencies = [],
  artifactType = null,
  blocked = false,
  blockedReason = null,
}) {
  const now = new Date().toISOString();

  return {
    id,
    type,
    label,
    description,
    state: blocked ? STEP_STATES.BLOCKED : STEP_STATES.PENDING,
    requiredCapabilities,
    requiredRequirements,
    dependencies,
    artifactType,
    blocked,
    blockedReason,
    result: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    startedAt: null,
    completedAt: null,
    createdAt: now,
  };
}

// ─── Plan Validation ───────────────────────────────────────────────

/**
 * Validate an execution plan against the Capability Engine.
 * Marks unsupported steps as BLOCKED.
 *
 * @param {object} plan - ExecutionPlan
 * @param {object} capabilityResult - Capability analysis result
 * @returns {object} Validation result { valid: boolean, blockedSteps: string[], warnings: string[] }
 */
function validatePlan(plan, capabilityResult) {
  const blockedSteps = [];
  const warnings = [];
  const unsupportedCaps = capabilityResult?.unsupportedCapabilities || [];

  for (const step of plan.steps) {
    if (step.state === STEP_STATES.BLOCKED) {
      blockedSteps.push(step.id);
      continue;
    }

    // Check if any required capability is unsupported
    const missingCaps = step.requiredCapabilities.filter(
      cap => unsupportedCaps.includes(cap)
    );

    if (missingCaps.length > 0) {
      step.state = STEP_STATES.BLOCKED;
      step.blocked = true;
      step.blockedReason = `Missing capabilities: ${missingCaps.join(', ')}`;
      blockedSteps.push(step.id);
    }
  }

  // Check overall capability status
  if (capabilityResult?.status === 'UNSUPPORTED') {
    warnings.push('Assignment is not supported by Agentic Helper');
  } else if (capabilityResult?.status === 'PARTIAL') {
    warnings.push('Assignment has partial capability support');
  } else if (capabilityResult?.status === 'UNKNOWN') {
    warnings.push('Assignment requirements could not be fully determined');
  }

  return {
    valid: blockedSteps.length === 0,
    blockedSteps,
    warnings,
  };
}

// ─── Step Execution ────────────────────────────────────────────────

/**
 * Get the next step that can be executed.
 * A step can execute if:
 *   - It is in PENDING state
 *   - All its dependencies are COMPLETED
 *   - It is not BLOCKED
 *
 * @param {object} plan - ExecutionPlan
 * @returns {object|null} Next step or null
 */
function getNextStep(plan) {
  for (const step of plan.steps) {
    if (step.state !== STEP_STATES.PENDING) continue;
    if (step.blocked) continue;

    // Check dependencies
    const depsComplete = step.dependencies.every(depId => {
      const dep = plan.steps.find(s => s.id === depId);
      return dep && dep.state === STEP_STATES.COMPLETED;
    });

    if (depsComplete) {
      return step;
    }
  }
  return null;
}

/**
 * Mark a step as running.
 *
 * @param {object} plan - ExecutionPlan
 * @param {string} stepId
 * @returns {object} Updated step
 */
function startStep(plan, stepId) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) throw new Error(`Step not found: ${stepId}`);
  if (step.state !== STEP_STATES.PENDING) {
    throw new Error(`Step ${stepId} is not in PENDING state (current: ${step.state})`);
  }

  step.state = STEP_STATES.RUNNING;
  step.startedAt = new Date().toISOString();
  plan.updatedAt = step.startedAt;

  return step;
}

/**
 * Mark a step as completed with a result.
 *
 * @param {object} plan - ExecutionPlan
 * @param {string} stepId
 * @param {*} result - Step output
 * @returns {object} Updated step
 */
function completeStep(plan, stepId, result = null) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) throw new Error(`Step not found: ${stepId}`);

  step.state = STEP_STATES.COMPLETED;
  step.result = result;
  step.completedAt = new Date().toISOString();
  plan.updatedAt = step.completedAt;

  return step;
}

/**
 * Mark a step as failed.
 *
 * @param {object} plan - ExecutionPlan
 * @param {string} stepId
 * @param {object} error - Error info
 * @returns {object} Updated step
 */
function failStep(plan, stepId, error) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) throw new Error(`Step not found: ${stepId}`);

  step.state = STEP_STATES.FAILED;
  step.error = {
    code: error.code || 'STEP_FAILED',
    message: error.message || 'Step execution failed',
    timestamp: new Date().toISOString(),
  };
  step.completedAt = step.error.timestamp;
  plan.updatedAt = step.completedAt;

  // Block dependent steps
  blockDependents(plan, stepId, `Dependent on failed step: ${step.label}`);

  return step;
}

/**
 * Block all steps that depend on the given step, including transitive dependents.
 *
 * @param {object} plan - ExecutionPlan
 * @param {string} stepId - Failed step ID
 * @param {string} reason - Block reason
 */
function blockDependents(plan, stepId, reason) {
  // Collect all step IDs that need blocking (direct + transitive)
  const toBlock = new Set();
  const queue = [stepId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const step of plan.steps) {
      if (step.dependencies.includes(currentId)
          && step.state === STEP_STATES.PENDING
          && !toBlock.has(step.id)) {
        toBlock.add(step.id);
        queue.push(step.id);
      }
    }
  }

  // Apply blocking
  for (const step of plan.steps) {
    if (toBlock.has(step.id)) {
      step.state = STEP_STATES.BLOCKED;
      step.blocked = true;
      step.blockedReason = reason;
    }
  }
}

// ─── Requirement Coverage ──────────────────────────────────────────

/**
 * Extract requirements from the manifest.
 *
 * @param {object} manifest
 * @returns {object[]} Array of requirement objects
 */
function extractRequirements(manifest) {
  const requirements = [];
  const meta = manifest?.metadata || {};
  const reqs = manifest?.requirements || {};
  const details = reqs.details || [];
  const text = meta.plainDescription || meta.description || '';
  const textLower = text.toLowerCase();

  // ─── From requirement details ────────────────────────────────
  for (const detail of details) {
    if (detail.description || detail.text) {
      requirements.push({
        id: detail.id || `req_${requirements.length}`,
        type: detail.type || 'content',
        description: detail.description || detail.text,
        value: detail.value || null,
        covered: false,
      });
    }
  }

  // ─── Word count ──────────────────────────────────────────────
  if (text) {
    const wordMatch = text.match(/(\d+)[\s-]*words?/i);
    if (wordMatch) {
      requirements.push({
        id: 'word_count',
        type: 'length',
        description: `Minimum ${wordMatch[1]} words`,
        value: parseInt(wordMatch[1]),
        covered: false,
      });
    }
  }

  // ─── Category requirements ───────────────────────────────────
  if (reqs.categories) {
    for (const cat of reqs.categories) {
      requirements.push({
        id: `category_${cat.toLowerCase()}`,
        type: 'category',
        description: `Requires ${cat} content`,
        value: cat,
        covered: false,
      });
    }
  }

  // ─── File format requirement ─────────────────────────────────
  if (reqs.categories?.includes('FILE')) {
    requirements.push({
      id: 'file_delivery',
      type: 'artifact',
      description: 'Requires file artifact delivery',
      value: true,
      covered: false,
    });
  }

  // ─── Section requirements ────────────────────────────────────
  const sectionKeywords = [
    'introduction', 'conclusion', 'abstract', 'summary',
    'methodology', 'analysis', 'discussion', 'results',
    'findings', 'recommendations', 'bibliography', 'references', 'works cited',
  ];

  for (const section of sectionKeywords) {
    // Check if explicitly required (e.g., "include an introduction")
    const requirePattern = new RegExp(`(?:include|have|contain|need|require|must have)\\s+(?:an?\\s+)?(?:the\\s+)?${section}`, 'i');
    if (requirePattern.test(text)) {
      requirements.push({
        id: `section_${section}`,
        type: 'section',
        description: `Requires a ${section} section`,
        value: section,
        covered: false,
      });
    }
  }

  // ─── Reference requirements ──────────────────────────────────
  const refMatch = text.match(/(\d+)\s*references?/i);
  if (refMatch) {
    requirements.push({
      id: 'references',
      type: 'content',
      description: `Requires ${refMatch[1]} references`,
      value: parseInt(refMatch[1]),
      covered: false,
    });
  } else if (textLower.match(/\b(?:reference|citation|source|bibliography|works cited)\b/)) {
    requirements.push({
      id: 'references',
      type: 'content',
      description: 'References/citations required',
      value: null,
      covered: false,
    });
  }

  // ─── Citation format ─────────────────────────────────────────
  const formatMatch = text.match(/\b(apa|mla|chicago|harvard|ieee)\b/i);
  if (formatMatch) {
    requirements.push({
      id: 'citation_format',
      type: 'format',
      description: `Must use ${formatMatch[1].toUpperCase()} citation format`,
      value: formatMatch[1].toUpperCase(),
      covered: false,
    });
  }

  // ─── Personal information requirement ────────────────────────
  const personalPatterns = [
    /(?:your|my)\s+(?:own|personal|individual)\s+(?:experience|opinion|observation|reflection)/i,
    /(?:personal\s+(?:experience|reflection|opinion|statement))/i,
    /(?:reflect\s+on|share\s+your)/i,
    /(?:what\s+do\s+you\s+think|how\s+do\s+you\s+feel)/i,
    /(?:describe\s+your\s+(?:own|personal|experience))/i,
  ];

  for (const pattern of personalPatterns) {
    if (pattern.test(text)) {
      requirements.push({
        id: 'personal_input',
        type: 'personal',
        description: 'Requires personal experiences or opinions',
        value: true,
        covered: false,
      });
      break;
    }
  }

  return requirements;
}

/**
 * Extract required capabilities from steps.
 *
 * @param {object[]} steps
 * @returns {string[]} Unique capability IDs
 */
function extractRequiredCapabilities(steps) {
  const caps = new Set();
  for (const step of steps) {
    for (const cap of step.requiredCapabilities) {
      caps.add(cap);
    }
  }
  return [...caps];
}

/**
 * Extract expected artifacts from steps.
 *
 * @param {object[]} steps
 * @returns {object[]} Expected artifact specs
 */
function extractExpectedArtifacts(steps) {
  return steps
    .filter(s => s.type === STEP_TYPES.ARTIFACT)
    .map(s => ({
      stepId: s.id,
      type: s.artifactType || 'txt',
      label: s.label,
    }));
}

/**
 * Check if all requirements are covered by completed steps.
 *
 * @param {object} plan - ExecutionPlan
 * @returns {{ covered: boolean, uncovered: object[] }}
 */
function checkRequirementCoverage(plan) {
  const uncovered = plan.requirements.filter(r => !r.covered);
  return {
    covered: uncovered.length === 0,
    uncovered,
    total: plan.requirements.length,
    coveredCount: plan.requirements.length - uncovered.length,
  };
}

/**
 * Mark requirements as covered based on step results.
 *
 * @param {object} plan - ExecutionPlan
 * @param {string} stepId - Completed step ID
 */
function markRequirementsCovered(plan, stepId) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step || step.state !== STEP_STATES.COMPLETED) return;

  for (const reqId of step.requiredRequirements) {
    const req = plan.requirements.find(r => r.id === reqId);
    if (req) {
      req.covered = true;
    }
  }
}

// ─── Plan Progress ─────────────────────────────────────────────────

/**
 * Get plan progress summary.
 *
 * @param {object} plan - ExecutionPlan
 * @returns {object} Progress info
 */
function getPlanProgress(plan) {
  const total = plan.steps.length;
  const completed = plan.steps.filter(s => s.state === STEP_STATES.COMPLETED).length;
  const failed = plan.steps.filter(s => s.state === STEP_STATES.FAILED).length;
  const blocked = plan.steps.filter(s => s.state === STEP_STATES.BLOCKED).length;
  const running = plan.steps.filter(s => s.state === STEP_STATES.RUNNING).length;
  const pending = plan.steps.filter(s => s.state === STEP_STATES.PENDING).length;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    failed,
    blocked,
    running,
    pending,
    percent,
    currentStep: plan.steps.find(s => s.state === STEP_STATES.RUNNING)?.label || null,
    nextStep: getNextStep(plan)?.label || null,
  };
}

// ─── Human Review Package ──────────────────────────────────────────

/**
 * Build a human review package from the execution plan.
 * This is what gets shown to the user in the mobile UI.
 *
 * @param {object} plan - ExecutionPlan
 * @param {object} job - Agent Job
 * @returns {object} Review package
 */
function buildReviewPackage(plan, job) {
  const progress = getPlanProgress(plan);
  const coverage = checkRequirementCoverage(plan);

  return {
    // Assignment info
    assignment: {
      title: job.assignmentTitle || 'Unknown',
      course: job.courseName || 'Unknown',
      courseId: job.courseId,
      assignmentId: job.assignmentId,
    },

    // Plan summary
    plan: {
      id: plan.id,
      state: plan.state,
      progress,
      requirementCoverage: coverage,
    },

    // Completed steps (concise outcomes only)
    completedSteps: plan.steps
      .filter(s => s.state === STEP_STATES.COMPLETED)
      .map(s => ({
        label: s.label,
        type: s.type,
        completedAt: s.completedAt,
        hasResult: s.result !== null,
      })),

    // Failed steps
    failedSteps: plan.steps
      .filter(s => s.state === STEP_STATES.FAILED)
      .map(s => ({
        label: s.label,
        type: s.type,
        error: s.error ? { code: s.error.code, message: s.error.message } : null,
      })),

    // Blocked steps
    blockedSteps: plan.steps
      .filter(s => s.state === STEP_STATES.BLOCKED)
      .map(s => ({
        label: s.label,
        type: s.type,
        reason: s.blockedReason,
      })),

    // Artifacts
    artifacts: (job.artifacts || []).map(a => ({
      id: a.id,
      type: a.type,
      filename: a.filename,
      size: a.size,
      status: a.status,
      mimeType: a.mimeType,
    })),

    // Warnings
    warnings: plan.warnings,

    // Submission target
    submissionTarget: {
      courseId: job.courseId,
      assignmentId: job.assignmentId,
      courseName: job.courseName,
      assignmentTitle: job.assignmentTitle,
    },

    // Timestamps
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
  };
}

// ─── Resume Support ────────────────────────────────────────────────

/**
 * Check if a plan can be resumed (has USER_ACTION_REQUIRED state).
 *
 * @param {object} plan - ExecutionPlan
 * @returns {boolean}
 */
function canResume(plan) {
  return plan.state === PLAN_STATES.PAUSED;
}

/**
 * Get the step to resume from.
 * Returns the first RUNNING or PENDING step that isn't blocked.
 *
 * @param {object} plan - ExecutionPlan
 * @returns {object|null}
 */
function getResumeStep(plan) {
  // First check for running steps (interrupted)
  const running = plan.steps.find(s => s.state === STEP_STATES.RUNNING);
  if (running) return running;

  // Then check for next pending step
  return getNextStep(plan);
}

// ─── Helpers ───────────────────────────────────────────────────────

function generatePlanId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `plan_${timestamp}_${random}`;
}

// ─── Exports ───────────────────────────────────────────────────────

module.exports = {
  STEP_STATES,
  STEP_TYPES,
  PLAN_STATES,
  createExecutionPlan,
  createStep,
  validatePlan,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  blockDependents,
  extractRequirements,
  extractRequiredCapabilities,
  extractExpectedArtifacts,
  checkRequirementCoverage,
  markRequirementsCovered,
  getPlanProgress,
  buildReviewPackage,
  canResume,
  getResumeStep,
  generatePlanId,
};
