/**
 * ai-errors.js
 * Normalized AI Error system.
 *
 * All AI providers produce errors through a unified error class.
 * The rest of BetterCLSS does not need to understand provider-specific formats.
 */

const AI_ERROR_CATEGORIES = {
  AUTHENTICATION: 'AUTHENTICATION',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MODEL_ERROR: 'MODEL_ERROR',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  SCHEMA_VALIDATION: 'SCHEMA_VALIDATION',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Normalized AI Error.
 * Thrown by all AI provider implementations.
 */
class AIError extends Error {
  /**
   * @param {object} params
   * @param {string} params.category - Error category from AI_ERROR_CATEGORIES
   * @param {string} params.message - Human-readable error message
   * @param {string} params.provider - Provider name (e.g., 'gemini')
   * @param {string} [params.code] - Provider-specific error code
   * @param {boolean} [params.retryable] - Whether this error is retryable
   * @param {number} [params.providerStatus] - HTTP status from provider
   * @param {string} [params.detail] - Additional detail (safe for logging)
   * @param {object} [params.cause] - Original error
   */
  constructor(params) {
    const message = params.message || 'Unknown AI error';
    super(message);
    this.name = 'AIError';
    this.category = params.category || AI_ERROR_CATEGORIES.UNKNOWN;
    this.provider = params.provider || 'unknown';
    this.code = params.code || null;
    this.retryable = params.retryable || false;
    this.providerStatus = params.providerStatus || null;
    this.detail = params.detail || null;
    if (params.cause) {
      this.cause = params.cause;
    }
  }

  /**
   * Get a safe representation for client consumption.
   * Does not expose internal details.
   * @returns {object}
   */
  toClientSafe() {
    return {
      category: this.category,
      message: this.message,
      provider: this.provider,
      retryable: this.retryable,
      code: this.code,
    };
  }

  /**
   * Get a representation for server-side logging.
   * @returns {object}
   */
  toLoggable() {
    return {
      category: this.category,
      message: this.message,
      provider: this.provider,
      code: this.code,
      retryable: this.retryable,
      providerStatus: this.providerStatus,
      detail: this.detail,
    };
  }
}

/**
 * Create an AIError from a Gemini HTTP response.
 * @param {number} status - HTTP status code
 * @param {object} body - Response body (parsed JSON or text)
 * @param {string} provider - Provider name
 * @returns {AIError}
 */
function fromGeminiResponse(status, body, provider = 'gemini') {
  const detail = typeof body === 'string'
    ? body.slice(0, 300)
    : JSON.stringify(body).slice(0, 300);

  const detailLower = detail.toLowerCase();

  // Authentication errors
  if (status === 401 || status === 403) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.AUTHENTICATION,
      message: 'Gemini API key is invalid or expired.',
      provider,
      code: 'AUTHENTICATION_FAILED',
      retryable: false,
      providerStatus: status,
      detail,
    });
  }

  // Rate limiting
  if (status === 429) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.RATE_LIMIT,
      message: 'Gemini rate limit exceeded.',
      provider,
      code: 'RATE_LIMIT_EXCEEDED',
      retryable: true,
      providerStatus: status,
      detail,
    });
  }

  // Bad request (invalid model, bad parameters)
  if (status === 400) {
    const isInvalidKey = ['api_key_invalid', 'invalid api key', 'invalid_api_key'].some(
      (s) => detailLower.includes(s)
    );
    if (isInvalidKey) {
      return new AIError({
        category: AI_ERROR_CATEGORIES.AUTHENTICATION,
        message: 'Gemini API key is invalid.',
        provider,
        code: 'INVALID_API_KEY',
        retryable: false,
        providerStatus: status,
        detail,
      });
    }
    return new AIError({
      category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
      message: 'Invalid request to Gemini.',
      provider,
      code: 'INVALID_REQUEST',
      retryable: false,
      providerStatus: status,
      detail,
    });
  }

  // Server error (retryable)
  if (status >= 500) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
      message: `Gemini returned server error ${status}.`,
      provider,
      code: 'SERVER_ERROR',
      retryable: true,
      providerStatus: status,
      detail,
    });
  }

  // Other
  return new AIError({
    category: AI_ERROR_CATEGORIES.UNKNOWN,
    message: `Gemini returned HTTP ${status}.`,
    provider,
    code: 'HTTP_ERROR',
    retryable: false,
    providerStatus: status,
    detail,
  });
}

/**
 * Create an AIError from a network/timeout error.
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @returns {AIError}
 */
function fromNetworkError(error, provider = 'gemini') {
  const message = String(error?.message || '').toLowerCase();

  if (error.name === 'AbortError' || message.includes('timeout')) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.TIMEOUT,
      message: 'Gemini request timed out.',
      provider,
      code: 'REQUEST_TIMEOUT',
      retryable: true,
      cause: error,
    });
  }

  if (error.name === 'TypeError' && (
    message.includes('fetch') || message.includes('network')
  )) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.NETWORK,
      message: 'Network error connecting to Gemini.',
      provider,
      code: 'NETWORK_ERROR',
      retryable: true,
      cause: error,
    });
  }

  return new AIError({
    category: AI_ERROR_CATEGORIES.NETWORK,
    message: `Network error: ${error.message || 'unknown'}`,
    provider,
    code: 'NETWORK_ERROR',
    retryable: true,
    cause: error,
  });
}

module.exports = {
  AIError,
  AI_ERROR_CATEGORIES,
  fromGeminiResponse,
  fromNetworkError,
};
