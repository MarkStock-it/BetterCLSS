/**
 * tool-runtime.js
 * Tool Runtime for Agentic Helper.
 *
 * This is the security boundary between the AI and BetterCLSS.
 * The AI cannot directly execute tools — it can only produce
 * tool requests that the runtime validates and executes.
 *
 * Flow:
 *   AI → Tool Request → Runtime → Permission/Schema Validation → Execution → Result → AI
 */

const { getTool, getToolDefinitions } = require('./tool-registry');

// ─── Tool Request Schema ─────────────────────────────────────────────

/**
 * @typedef {object} ToolRequest
 * @property {string} tool - Tool ID to execute
 * @property {object} arguments - Tool input arguments
 * @property {string} [jobId] - Agent Job ID for context
 */

/**
 * @typedef {object} ToolResult
 * @property {boolean} success - Whether execution succeeded
 * @property {*} [data] - Result data (if successful)
 * @property {object} [error] - Error info (if failed)
 * @property {object} [metadata] - Execution metadata
 */

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Validate a tool request structure.
 * @param {object} request
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateToolRequest(request) {
  const errors = [];

  if (!request || typeof request !== 'object') {
    return { valid: false, errors: ['Request must be an object'] };
  }

  if (!request.tool || typeof request.tool !== 'string') {
    errors.push('Request must include a tool ID string');
  }

  if (request.arguments && typeof request.arguments !== 'object') {
    errors.push('Arguments must be an object');
  }

  if (request.jobId && typeof request.jobId !== 'string') {
    errors.push('Job ID must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate arguments against a tool's input schema.
 * Basic JSON Schema validation (type checking, required fields).
 *
 * @param {object} args
 * @param {object} schema
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateArguments(args, schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return { valid: true, errors: [] }; // No schema = no validation
  }

  const safeArgs = args || {};

  // Type check
  if (schema.type === 'object') {
    if (typeof safeArgs !== 'object' || Array.isArray(safeArgs)) {
      errors.push('Arguments must be an object');
      return { valid: false, errors };
    }

    // Required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in safeArgs)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Property type checks
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in safeArgs && propSchema.type) {
          const typeError = checkType(safeArgs[key], propSchema.type, key);
          if (typeError) errors.push(typeError);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check a value against an expected type.
 * @param {*} value
 * @param {string} expectedType
 * @param {string} fieldName
 * @returns {string|null} Error message or null
 */
function checkType(value, expectedType, fieldName) {
  if (value === null || value === undefined) return null; // Allow null/undefined

  switch (expectedType) {
    case 'string':
      return typeof value !== 'string' ? `${fieldName} must be a string` : null;
    case 'number':
      return typeof value !== 'number' ? `${fieldName} must be a number` : null;
    case 'integer':
      return typeof value !== 'number' || !Number.isInteger(value) ? `${fieldName} must be an integer` : null;
    case 'boolean':
      return typeof value !== 'boolean' ? `${fieldName} must be a boolean` : null;
    case 'array':
      return !Array.isArray(value) ? `${fieldName} must be an array` : null;
    case 'object':
      return typeof value !== 'object' || Array.isArray(value) ? `${fieldName} must be an object` : null;
    default:
      return null;
  }
}

// ─── Authorization ───────────────────────────────────────────────────

/**
 * Authorize a tool request against a job and user context.
 *
 * @param {object} tool - Tool definition from registry
 * @param {object} job - Agent Job
 * @param {number} userId - Requesting user ID
 * @param {object} agentService - Agent service for feature gate check
 * @returns {{ authorized: boolean, reason: string }}
 */
function authorizeTool(tool, job, userId, agentService) {
  // 1. Feature gate
  if (!agentService.isAgenticHelperEnabled(userId)) {
    return { authorized: false, reason: 'Agentic Helper is not enabled' };
  }

  // 2. Job exists and belongs to user
  if (!job) {
    return { authorized: false, reason: 'Job not found' };
  }
  if (String(job.userId) !== String(userId)) {
    return { authorized: false, reason: 'Job does not belong to this user' };
  }

  // 3. Job is in a state that allows tool execution
  const executableStates = ['PLANNING', 'GENERATING', 'REFINING', 'VALIDATING', 'EXECUTING'];
  if (!executableStates.includes(job.state)) {
    return {
      authorized: false,
      reason: `Job in state ${job.state} does not allow tool execution`,
    };
  }

  // 4. Tool exists
  if (!tool) {
    return { authorized: false, reason: 'Tool not registered' };
  }

  // 5. SUBMIT permission requires approval
  if (tool.permissions && tool.permissions.includes('SUBMIT')) {
    if (!job.approval || job.approval.status !== 'APPROVED') {
      return {
        authorized: false,
        reason: 'SUBMIT tools require human approval before execution',
      };
    }
    // Verify approval is for a specific artifact version
    if (job.approval && !job.approval.artifactId) {
      return {
        authorized: false,
        reason: 'Approval must specify an artifact ID',
      };
    }
    // Verify approval hasn't expired
    if (job.approval.expiresAt && new Date(job.approval.expiresAt) < new Date()) {
      return {
        authorized: false,
        reason: 'Approval has expired',
      };
    }
  }

  // 6. WRITE permission check
  if (tool.permissions && tool.permissions.includes('WRITE')) {
    // WRITE tools require job to be in EXECUTING state
    if (job.state !== 'EXECUTING') {
      return {
        authorized: false,
        reason: 'WRITE tools require job to be in EXECUTING state',
      };
    }
  }

  return { authorized: true, reason: '' };
}

// ─── Result Normalization ────────────────────────────────────────────

/**
 * Create a successful tool result.
 * @param {*} data
 * @param {object} [metadata]
 * @returns {ToolResult}
 */
function createSuccessResult(data, metadata = {}) {
  return {
    success: true,
    data,
    error: null,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Create a failed tool result.
 * @param {string} code
 * @param {string} message
 * @param {object} [metadata]
 * @returns {ToolResult}
 */
function createErrorResult(code, message, metadata = {}) {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Truncate or normalize a tool result to prevent excessive sizes.
 * @param {ToolResult} result
 * @param {number} maxSize
 * @returns {ToolResult}
 */
function normalizeResultSize(result, maxSize = 50000) {
  if (!result.success || !result.data) return result;

  const serialized = JSON.stringify(result.data);
  if (serialized.length <= maxSize) return result;

  // Return a truncated metadata-only result instead of trying to parse partial JSON
  return {
    ...result,
    data: {
      _truncated: true,
      _originalSize: serialized.length,
      _preview: serialized.slice(0, 500),
    },
    metadata: {
      ...result.metadata,
      truncated: true,
      originalSize: serialized.length,
      maxSize,
    },
  };
}

// ─── Main Runtime ────────────────────────────────────────────────────

/**
 * Create a Tool Runtime.
 *
 * @param {object} options
 * @param {object} options.agentService - Agent service for feature gate
 * @param {object} options.agentJobService - Job service for job lookup
 * @param {function} [options.onEvent] - Event callback (jobId, type, metadata)
 * @returns {object} Tool runtime API
 */
function createToolRuntime({ agentService, agentJobService, onEvent }) {

  /**
   * Execute a tool request.
   *
   * @param {ToolRequest} request
   * @param {number} userId - Authenticated user ID
   * @returns {Promise<ToolResult>}
   */
  async function execute(request, userId, options = {}) {
    // Merge any extra context (e.g., canvasAuth) into the request
    if (options.canvasAuth && !request.canvasAuth) {
      request.canvasAuth = options.canvasAuth;
    }
    const startTime = Date.now();

    // Step 1: Validate request structure
    const requestValidation = validateToolRequest(request);
    if (!requestValidation.valid) {
      return createErrorResult('INVALID_REQUEST', requestValidation.errors.join('; '));
    }

    // Step 2: Get the tool
    const tool = getTool(request.tool);
    if (!tool) {
      return createErrorResult('UNKNOWN_TOOL', `Tool "${request.tool}" is not registered`);
    }

    // Step 3: Get the job (if jobId provided)
    let job = null;
    if (request.jobId) {
      job = agentJobService.getJob(userId, request.jobId);
    }

    // Step 4: Authorize
    const auth = authorizeTool(tool, job, userId, agentService);
    if (!auth.authorized) {
      emitEvent(request.jobId, 'TOOL_UNAUTHORIZED', {
        toolId: request.tool,
        reason: auth.reason,
      }, userId);
      return createErrorResult('UNAUTHORIZED', auth.reason);
    }

    // Step 5: Validate arguments against schema
    const argValidation = validateArguments(request.arguments, tool.inputSchema);
    if (!argValidation.valid) {
      emitEvent(request.jobId, 'TOOL_INVALID_ARGS', {
        toolId: request.tool,
        errors: argValidation.errors,
      }, userId);
      return createErrorResult('INVALID_ARGUMENTS', argValidation.errors.join('; '));
    }

    // Step 6: Emit validation event
    emitEvent(request.jobId, 'TOOL_VALIDATED', {
      toolId: request.tool,
      argumentCount: Object.keys(request.arguments || {}).length,
    }, userId);

    // Step 7: Execute
    try {
      const context = {
        userId,
        jobId: request.jobId,
        courseId: job?.courseId || null,
        assignmentId: job?.assignmentId || null,
        canvasAuth: request.canvasAuth || null,
      };

      const result = await tool.execute(request.arguments || {}, context);

      // Step 8: Normalize result size
      const normalized = normalizeResultSize(result, tool.maxResultSize);

      // Step 9: Emit success event
      const durationMs = Date.now() - startTime;
      emitEvent(request.jobId, 'TOOL_EXECUTED', {
        toolId: request.tool,
        success: normalized.success,
        durationMs,
      }, userId);

      return normalized;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      emitEvent(request.jobId, 'TOOL_FAILED', {
        toolId: request.tool,
        error: error.message,
        durationMs,
      }, userId);

      return createErrorResult(
        'EXECUTION_ERROR',
        error.message || 'Tool execution failed'
      );
    }
  }

  /**
   * Get available tool definitions for AI consumption.
   * @returns {object[]}
   */
  function getAvailableTools() {
    return getToolDefinitions();
  }

  /**
   * Emit an event if callback is configured.
   * @param {string} jobId
   * @param {string} type
   * @param {object} metadata
   * @param {number} [userId] - Authenticated user ID
   */
  function emitEvent(jobId, type, metadata, userId) {
    if (typeof onEvent === 'function' && jobId) {
      try {
        onEvent(jobId, type, metadata, userId);
      } catch {
        // Event emission should not fail the tool execution
      }
    }
  }

  return {
    execute,
    getAvailableTools,
    validateToolRequest,
    validateArguments,
    authorizeTool,
  };
}

module.exports = {
  createToolRuntime,
  validateToolRequest,
  validateArguments,
  authorizeTool,
  createSuccessResult,
  createErrorResult,
  normalizeResultSize,
  TOOL_PERMISSIONS: require('./tool-registry').TOOL_PERMISSIONS,
};
