/**
 * provider.js
 * AI Provider Interface.
 *
 * Defines the abstract contract that all AI providers must implement.
 * Future Agentic Helper code depends on this interface, not on
 * any specific provider implementation.
 *
 * Usage:
 *   const provider = createGeminiProvider(config);
 *   const response = await provider.generate({ ... });
 */

/**
 * @typedef {object} AIRequest
 * @property {string} systemInstruction - System-level instructions
 * @property {string} prompt - User prompt / content
 * @property {object[]} [history] - Conversation history [{role, content}]
 * @property {object} [context] - Additional context
 * @property {string} [jobId] - Agent Job ID for tracking
 * @property {object} [generationConfig] - Provider-specific overrides
 */

/**
 * @typedef {object} AIResponse
 * @property {string} text - Generated text content
 * @property {string} provider - Provider name
 * @property {string} model - Model name used
 * @property {object} [usage] - Token usage { promptTokens, completionTokens, totalTokens }
 * @property {string} [requestId] - Request identifier
 * @property {string} [finishReason] - Why generation stopped
 * @property {number} durationMs - Request duration
 */

/**
 * @typedef {object} StructuredAIRequest
 * @property {string} systemInstruction - System-level instructions
 * @property {string} prompt - User prompt / content
 * @property {object} schema - JSON schema for output validation
 * @property {object[]} [history] - Conversation history
 * @property {object} [context] - Additional context
 * @property {string} [jobId] - Agent Job ID for tracking
 * @property {object} [generationConfig] - Provider-specific overrides
 */

/**
 * @typedef {object} StructuredAIResponse
 * @property {object} data - Parsed and validated structured data
 * @property {string} text - Raw text (for debugging)
 * @property {string} provider - Provider name
 * @property {string} model - Model name used
 * @property {object} [usage] - Token usage
 * @property {string} [requestId] - Request identifier
 * @property {string} [finishReason] - Why generation stopped
 * @property {number} durationMs - Request duration
 */

/**
 * Create a base provider with shared utility methods.
 * Provider-specific implementations extend this.
 *
 * @param {string} providerName - Name of this provider
 * @param {object} config - Provider configuration
 * @returns {object} Base provider object
 */
function createBaseProvider(providerName, config) {
  return {
    /**
     * Get provider metadata.
     * @returns {object}
     */
    metadata() {
      return {
        name: providerName,
        model: config.model || 'unknown',
        hasApiKey: Boolean(config.apiKey),
        maxOutputTokens: config.maxOutputTokens || null,
        temperature: config.temperature || 0.4,
      };
    },

    /**
     * Check if provider is properly configured.
     * A provider that supports bring-your-own-key (per-request keys, config.perRequestKey)
     * is always considered ready here — the actual key is validated per request.
     * @returns {{ ready: boolean, reason: string }}
     */
    isReady() {
      if (config.apiKey || config.perRequestKey) {
        return { ready: true, reason: '' };
      }
      return {
        ready: false,
        reason: `${providerName} API key is not configured.`,
      };
    },

    /**
     * Validate a request before sending.
     * @param {AIRequest} request
     * @returns {{ valid: boolean, reason: string }}
     */
    validateRequest(request) {
      if (!request || typeof request !== 'object') {
        return { valid: false, reason: 'Request must be an object.' };
      }
      if (!request.prompt || typeof request.prompt !== 'string') {
        return { valid: false, reason: 'Request must include a prompt string.' };
      }
      if (request.prompt.length === 0) {
        return { valid: false, reason: 'Prompt cannot be empty.' };
      }
      if (request.prompt.length > 100000) {
        return { valid: false, reason: 'Prompt exceeds maximum length.' };
      }
      return { valid: true, reason: '' };
    },

    /**
     * Build the timeout signal for requests.
     * @param {number} [overrideTimeoutMs]
     * @returns {AbortSignal}
     */
    createTimeoutSignal(overrideTimeoutMs) {
      const timeoutMs = overrideTimeoutMs || config.timeoutMs || 60000;
      return AbortSignal.timeout(timeoutMs);
    },

    /**
     * Build a request ID for tracking.
     * @returns {string}
     */
    generateRequestId() {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).slice(2, 8);
      return `req_${providerName}_${timestamp}_${random}`;
    },

    /**
     * Calculate retry delay with exponential backoff.
     * @param {number} attempt - Current attempt (0-based)
     * @param {number} baseDelayMs - Base delay
     * @returns {number} Delay in ms
     */
    getRetryDelay(attempt, baseDelayMs = 1000) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs * 0.5;
      return Math.min(delay + jitter, 30000); // Max 30 seconds
    },
  };
}

module.exports = {
  createBaseProvider,
};
