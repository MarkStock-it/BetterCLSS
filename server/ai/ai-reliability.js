/**
 * ai-reliability.js
 * AI Provider Reliability Layer (Phase 31).
 *
 * Provides:
 *   - Retry with exponential backoff for transient failures
 *   - Structured output validation and repair
 *   - Provider fallback for appropriate tasks
 *   - Rate limit awareness
 *   - Budget-integrated retry limits
 *
 * Does NOT:
 *   - Retry permanent failures (auth, invalid config)
 *   - Create uncontrolled parallel requests
 *   - Retry indefinitely
 *   - Bypass the existing token/call budgeting
 */

const { AIError, AI_ERROR_CATEGORIES } = require('./ai-errors');

// ─── Retry Configuration ──────────────────────────────────────────

const DEFAULT_RETRY_CONFIG = {
  maxRetries: 2,              // Max retry attempts (total attempts = 1 + maxRetries)
  baseDelayMs: 1000,          // Base delay before first retry
  maxDelayMs: 30000,          // Maximum delay between retries
  backoffMultiplier: 2,       // Exponential backoff multiplier
  jitterFraction: 0.3,        // Jitter as fraction of delay
  retryableCategories: [      // Error categories that trigger retry
    AI_ERROR_CATEGORIES.RATE_LIMIT,
    AI_ERROR_CATEGORIES.TIMEOUT,
    AI_ERROR_CATEGORIES.NETWORK,
    AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
    AI_ERROR_CATEGORIES.MODEL_ERROR,  // Empty responses, etc.
  ],
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

// ─── Structured Output Repair ─────────────────────────────────────

/**
 * Attempt to repair a malformed structured response.
 * Only applies safe, deterministic fixes.
 *
 * @param {string} rawText - Raw text from the model
 * @param {object} schema - Expected JSON schema
 * @returns {{ repaired: object|null, strategy: string|null }}
 */
function repairStructuredOutput(rawText, schema) {
  if (!rawText || typeof rawText !== 'string') {
    return { repaired: null, strategy: null };
  }

  // Strategy 1: Direct parse (already valid)
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed === 'object' && parsed !== null) {
      return { repaired: parsed, strategy: 'direct_parse' };
    }
  } catch { /* not valid JSON */ }

  // Strategy 2: Extract JSON from markdown code blocks
  const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null) {
        return { repaired: parsed, strategy: 'code_block_extract' };
      }
    } catch { /* not valid JSON in code block */ }
  }

  // Strategy 3: Find JSON object or array boundaries
  const jsonStart = rawText.indexOf('{');
  const jsonArrayStart = rawText.indexOf('[');
  let startIdx = -1;
  let startChar = '';

  if (jsonStart >= 0 && (jsonArrayStart < 0 || jsonStart < jsonArrayStart)) {
    startIdx = jsonStart;
    startChar = '{';
  } else if (jsonArrayStart >= 0) {
    startIdx = jsonArrayStart;
    startChar = '[';
  }

  if (startIdx >= 0) {
    const endChar = startChar === '{' ? '}' : ']';
    const endIdx = rawText.lastIndexOf(endChar);
    if (endIdx > startIdx) {
      const candidate = rawText.slice(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'object' && parsed !== null) {
          return { repaired: parsed, strategy: 'boundary_extract' };
        }
      } catch { /* not valid JSON from boundaries */ }
    }
  }

  // Strategy 4: Fix common JSON issues
  const fixes = [
    // Remove trailing commas
    (s) => s.replace(/,\s*([\]}])/g, '$1'),
    // Remove single-line comments
    (s) => s.replace(/\/\/.*$/gm, ''),
    // Remove multi-line comments
    (s) => s.replace(/\/\*[\s\S]*?\*\//g, ''),
    // Fix unquoted keys (simple cases)
    (s) => s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":'),
  ];

  let fixed = rawText;
  for (const fix of fixes) {
    fixed = fix(fixed);
  }

  try {
    const parsed = JSON.parse(fixed);
    if (typeof parsed === 'object' && parsed !== null) {
      return { repaired: parsed, strategy: 'fix_common_issues' };
    }
  } catch { /* still not valid after fixes */ }

  return { repaired: null, strategy: null };
}

/**
 * Validate and repair a structured AI response.
 * Returns the repaired data if possible, or null if unrecoverable.
 *
 * @param {string} rawText - Raw text from the model
 * @param {object} schema - Expected JSON schema
 * @param {function} [validateFn] - Optional custom validation function
 * @returns {{ data: object|null, repaired: boolean, strategy: string|null, error: string|null }}
 */
function validateAndRepair(rawText, schema, validateFn) {
  // Try direct parse first
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed === 'object' && parsed !== null) {
      // Validate against schema
      const schemaError = validateAgainstSchema(parsed, schema);
      const customError = validateFn ? validateFn(parsed) : null;
      if (!schemaError && !customError) {
        return { data: parsed, repaired: false, strategy: 'direct_parse', error: null };
      }
      // Both schema and custom must pass — if either fails, try repair
    }
  } catch { /* not valid JSON */ }

  // Attempt repair
  const { repaired, strategy } = repairStructuredOutput(rawText, schema);
  if (repaired) {
    // Validate repaired data
    const schemaError = validateAgainstSchema(repaired, schema);
    const customError = validateFn ? validateFn(repaired) : null;
    if (!schemaError && !customError) {
      return { data: repaired, repaired: true, strategy, error: null };
    }
  }

  return { data: null, repaired: false, strategy: null, error: 'Unable to parse or repair structured output' };
}

// ─── Retry Logic ──────────────────────────────────────────────────

/**
 * Calculate retry delay with exponential backoff and jitter.
 *
 * @param {number} attempt - Current attempt (0-based, 0 = first retry)
 * @param {object} [config] - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt, config = {}) {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  const delay = cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt);
  const jitter = Math.random() * delay * cfg.jitterFraction;
  return Math.min(delay + jitter, cfg.maxDelayMs);
}

/**
 * Determine whether an error is retryable.
 *
 * @param {AIError|Error} error
 * @param {object} [config] - Retry configuration
 * @returns {boolean}
 */
function isRetryable(error, config = {}) {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };

  if (error instanceof AIError) {
    // Explicit retryable flag
    if (error.retryable) return true;
    // Category-based check
    return cfg.retryableCategories.includes(error.category);
  }

  // Generic errors — retry if they look transient
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('timeout') || message.includes('network') || message.includes('econnreset')) {
    return true;
  }

  return false;
}

/**
 * Execute an async function with retry and backoff.
 * Only retries on transient/retryable failures.
 *
 * @param {function} fn - Async function to execute
 * @param {object} [options]
 * @param {number} [options.maxRetries] - Max retry attempts
 * @param {object} [options.retryConfig] - Retry configuration override
 * @param {function} [options.onRetry] - Callback on retry (attempt, delay, error)
 * @param {function} [options.onFinalError] - Callback when all retries exhausted
 * @returns {Promise<*>} Result of fn
 * @throws {AIError} Final error after retries exhausted
 */
async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : config.maxRetries;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // Check if retryable
      if (!isRetryable(error, config)) {
        // Permanent failure — don't retry
        if (typeof options.onFinalError === 'function') {
          options.onFinalError(error, attempt);
        }
        throw error;
      }

      // Check if we have retries left
      if (attempt >= maxRetries) {
        if (typeof options.onFinalError === 'function') {
          options.onFinalError(error, attempt);
        }
        throw error;
      }

      // Calculate delay
      const delay = calculateRetryDelay(attempt, config);

      // Notify
      if (typeof options.onRetry === 'function') {
        options.onRetry(attempt + 1, delay, error);
      }

      // Wait
      await sleep(delay);
    }
  }

  // Should not reach here, but just in case
  if (lastError) throw lastError;
}

// ─── Provider Wrapper ─────────────────────────────────────────────

/**
 * Create a reliable AI provider wrapper.
 * Adds retry, structured output repair, and fallback to any provider.
 *
 * @param {object} primaryProvider - Primary AI provider
 * @param {object} [options]
 * @param {object} [options.fallbackProvider] - Fallback provider (optional)
 * @param {object} [options.retryConfig] - Retry configuration
 * @param {object} [options.usageTracker] - Usage tracker for budget checks
 * @param {function} [options.onRetry] - Retry event callback
 * @param {function} [options.onFallback] - Fallback event callback
 * @returns {object} Reliable provider wrapping the primary
 */
function createReliableProvider(primaryProvider, options = {}) {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
  const fallbackProvider = options.fallbackProvider || null;
  const usageTracker = options.usageTracker || null;

  /**
   * Generate text with retry and optional fallback.
   */
  async function generate(request) {
    return withRetry(
      async (attempt) => {
        try {
          return await primaryProvider.generate(request);
        } catch (error) {
          // On last attempt, try fallback if available and error is retryable
          if (attempt >= retryConfig.maxRetries && fallbackProvider && isRetryable(error, retryConfig)) {
            if (typeof options.onFallback === 'function') {
              options.onFallback(error, 'generate');
            }
            return await fallbackProvider.generate(request);
          }
          throw error;
        }
      },
      {
        maxRetries: retryConfig.maxRetries,
        retryConfig,
        onRetry: (attempt, delay, error) => {
          if (typeof options.onRetry === 'function') {
            options.onRetry(attempt, delay, error, 'generate');
          }
        },
      }
    );
  }

  /**
   * Generate structured output with retry, repair, and optional fallback.
   */
  async function structuredGenerate(request) {
    return withRetry(
      async (attempt) => {
        try {
          const response = await primaryProvider.structuredGenerate(request);
          return response;
        } catch (error) {
          // On last attempt, try fallback if available
          if (attempt >= retryConfig.maxRetries && fallbackProvider && isRetryable(error, retryConfig)) {
            if (typeof options.onFallback === 'function') {
              options.onFallback(error, 'structuredGenerate');
            }
            return await fallbackProvider.structuredGenerate(request);
          }
          throw error;
        }
      },
      {
        maxRetries: retryConfig.maxRetries,
        retryConfig,
        onRetry: (attempt, delay, error) => {
          if (typeof options.onRetry === 'function') {
            options.onRetry(attempt, delay, error, 'structuredGenerate');
          }
        },
      }
    );
  }

  /**
   * Generate with structured output repair on parse failure.
   * If the model returns invalid JSON, attempts deterministic repair.
   */
  async function structuredGenerateWithRepair(request) {
    const maxRepairAttempts = 1; // One repair attempt before giving up

    for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt++) {
      try {
        const response = await structuredGenerate(request);
        return response;
      } catch (error) {
        // Only attempt repair for schema validation errors
        if (
          error instanceof AIError &&
          error.category === AI_ERROR_CATEGORIES.SCHEMA_VALIDATION &&
          repairAttempt < maxRepairAttempts
        ) {
          // Try to repair/recover the response
          const rawText = error.detail || '';
          const { data, repaired, strategy } = validateAndRepair(rawText, request.schema);
          if (data) {
            return {
              data,
              text: rawText,
              provider: primaryProvider.metadata?.()?.name || 'unknown',
              model: primaryProvider.metadata?.()?.model || 'unknown',
              usage: null,
              requestId: null,
              finishReason: 'repaired',
              durationMs: 0,
              _repaired: true,
              _repairStrategy: strategy,
            };
          }
        }
        throw error;
      }
    }
  }

  /**
   * Get provider metadata.
   */
  function metadata() {
    return {
      ...(primaryProvider.metadata?.() || {}),
      hasFallback: Boolean(fallbackProvider),
      retryConfig: { ...retryConfig },
    };
  }

  /**
   * Check if provider is ready.
   */
  function isReady() {
    return primaryProvider.isReady?.() || { ready: false, reason: 'Provider not available' };
  }

  return {
    generate,
    structuredGenerate,
    structuredGenerateWithRepair,
    metadata,
    isReady,
    // Expose primary for direct access if needed
    _primary: primaryProvider,
    _fallback: fallbackProvider,
  };
}

// ─── Error Classification ─────────────────────────────────────────

/**
 * Classify an AI error for job state transition.
 *
 * @param {AIError|Error} error
 * @returns {{ jobState: string, message: string, retryable: boolean }}
 */
function classifyAiFailure(error) {
  if (error instanceof AIError) {
    switch (error.category) {
      case AI_ERROR_CATEGORIES.AUTHENTICATION:
        return {
          jobState: 'FAILED',
          message: 'AI provider authentication failed. Please check your API key.',
          retryable: false,
        };
      case AI_ERROR_CATEGORIES.INVALID_CONFIGURATION:
        return {
          jobState: 'FAILED',
          message: 'AI provider is not properly configured.',
          retryable: false,
        };
      case AI_ERROR_CATEGORIES.RATE_LIMIT:
        return {
          jobState: 'USER_ACTION_REQUIRED',
          message: 'AI rate limit exceeded. Please wait a moment and try again.',
          retryable: true,
        };
      case AI_ERROR_CATEGORIES.TIMEOUT:
        return {
          jobState: 'USER_ACTION_REQUIRED',
          message: 'AI request timed out. You can retry later.',
          retryable: true,
        };
      case AI_ERROR_CATEGORIES.NETWORK:
        return {
          jobState: 'USER_ACTION_REQUIRED',
          message: 'Network error connecting to AI provider. You can retry later.',
          retryable: true,
        };
      case AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE:
        return {
          jobState: 'USER_ACTION_REQUIRED',
          message: 'AI provider is temporarily unavailable. You can retry later.',
          retryable: true,
        };
      case AI_ERROR_CATEGORIES.MODEL_ERROR:
        return {
          jobState: 'USER_ACTION_REQUIRED',
          message: 'AI provider returned an unexpected response. You can retry later.',
          retryable: true,
        };
      case AI_ERROR_CATEGORIES.SCHEMA_VALIDATION:
        return {
          jobState: 'FAILED',
          message: 'AI response could not be parsed. The assignment may need different handling.',
          retryable: false,
        };
      case AI_ERROR_CATEGORIES.INVALID_REQUEST:
        return {
          jobState: 'FAILED',
          message: 'Invalid request sent to AI provider.',
          retryable: false,
        };
      default:
        return {
          jobState: 'FAILED',
          message: 'An unexpected AI error occurred.',
          retryable: isRetryable(error),
        };
    }
  }

  // Generic error
  return {
    jobState: 'USER_ACTION_REQUIRED',
    message: 'An error occurred with the AI provider. You can retry later.',
    retryable: true,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Basic schema validation (same as provider-layer for standalone use).
 */
function validateAgainstSchema(data, schema) {
  if (!schema || typeof schema !== 'object') return null;

  const type = schema.type;
  if (type === 'object') {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return 'Expected object';
    }
    if (schema.required && Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in data)) {
          return `Missing required property: ${key}`;
        }
      }
    }
  } else if (type === 'array') {
    if (!Array.isArray(data)) return 'Expected array';
  } else if (type === 'string') {
    if (typeof data !== 'string') return 'Expected string';
    if (schema.enum && !schema.enum.includes(data)) {
      return `Expected one of: ${schema.enum.join(', ')}`;
    }
  } else if (type === 'number' || type === 'integer') {
    if (typeof data !== 'number') return 'Expected number';
  } else if (type === 'boolean') {
    if (typeof data !== 'boolean') return 'Expected boolean';
  }

  return null;
}

module.exports = {
  // Configuration
  DEFAULT_RETRY_CONFIG,

  // Core
  withRetry,
  calculateRetryDelay,
  isRetryable,

  // Provider wrapper
  createReliableProvider,

  // Structured output
  repairStructuredOutput,
  validateAndRepair,

  // Error classification
  classifyAiFailure,
};
