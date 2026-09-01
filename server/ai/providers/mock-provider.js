/**
 * mock-provider.js
 * Mock AI Provider for testing.
 *
 * This is NOT a production provider.
 * It allows Agentic Helper tests to run without consuming API credits
 * or requiring network access.
 *
 * Usage:
 *   const mock = createMockProvider({ responses: [...] });
 *   const response = await mock.generate({ ... });
 */

const { createBaseProvider } = require('../provider');
const { AIError, AI_ERROR_CATEGORIES } = require('../ai-errors');

/**
 * Create a Mock AI Provider.
 *
 * @param {object} [options]
 * @param {string[]} [options.responses] - Pre-configured responses (cycled through)
 * @param {function} [options.handler] - Custom handler function
 * @param {number} [options.delayMs] - Simulated response delay
 * @param {boolean} [options.failNext] - Make next request fail
 * @param {AIError} [options.nextError] - Error to throw on next request
 * @returns {object} Mock provider
 */
function createMockProvider(options = {}) {
  const config = {
    apiKey: 'mock-key',
    model: 'mock-model',
    timeoutMs: 5000,
    maxOutputTokens: 1000,
    temperature: 0.4,
  };

  const base = createBaseProvider('mock', config);

  let responseIndex = 0;
  let callCount = 0;
  const calls = [];

  const responses = options.responses || ['Mock response'];
  const delayMs = options.delayMs || 0;

  /**
   * Record a call for verification.
   * @param {string} method
   * @param {object} request
   */
  function recordCall(method, request) {
    callCount++;
    calls.push({
      method,
      request: { ...request },
      timestamp: Date.now(),
    });
  }

  /**
   * Get the next mock response.
   * @returns {string}
   */
  function getNextResponse() {
    const response = responses[responseIndex % responses.length];
    responseIndex++;
    return response;
  }

  /**
   * Simulate delay if configured.
   * @returns {Promise<void>}
   */
  async function simulateDelay() {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Generate mock text response.
   * @param {object} request
   * @returns {Promise<AIResponse>}
   */
  async function generate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'mock',
        retryable: false,
      });
    }

    recordCall('generate', request);
    await simulateDelay();

    // Check for configured failure
    if (options.failNext) {
      options.failNext = false;
      throw options.nextError || new AIError({
        category: AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
        message: 'Mock provider simulated failure.',
        provider: 'mock',
        retryable: true,
      });
    }

    const text = getNextResponse();
    return {
      text,
      provider: 'mock',
      model: 'mock-model',
      usage: {
        promptTokens: 10,
        completionTokens: text.split(' ').length,
        totalTokens: 10 + text.split(' ').length,
      },
      requestId: base.generateRequestId(),
      finishReason: 'STOP',
      durationMs: delayMs,
    };
  }

  /**
   * Generate mock structured response.
   * @param {object} request
   * @returns {Promise<StructuredAIResponse>}
   */
  async function structuredGenerate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'mock',
        retryable: false,
      });
    }

    recordCall('structuredGenerate', request);
    await simulateDelay();

    // Check for configured failure
    if (options.failNext) {
      options.failNext = false;
      throw options.nextError || new AIError({
        category: AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
        message: 'Mock provider simulated failure.',
        provider: 'mock',
        retryable: true,
      });
    }

    const text = getNextResponse();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { result: text };
    }

    return {
      data,
      text,
      provider: 'mock',
      model: 'mock-model',
      usage: {
        promptTokens: 10,
        completionTokens: text.split(' ').length,
        totalTokens: 10 + text.split(' ').length,
      },
      requestId: base.generateRequestId(),
      finishReason: 'STOP',
      durationMs: delayMs,
    };
  }

  /**
   * Get all recorded calls for verification.
   * @returns {object[]}
   */
  function getCalls() {
    return [...calls];
  }

  /**
   * Get call count.
   * @returns {number}
   */
  function getCallCount() {
    return callCount;
  }

  /**
   * Reset mock state.
   */
  function reset() {
    responseIndex = 0;
    callCount = 0;
    calls.length = 0;
    options.failNext = false;
  }

  /**
   * Set the next response.
   * @param {string} response
   */
  function setNextResponse(response) {
    responses.splice(responseIndex, 0, response);
  }

  /**
   * Configure the provider to fail on next call.
   * @param {AIError} [error]
   */
  function failNext(error) {
    options.failNext = true;
    options.nextError = error || null;
  }

  return {
    ...base,
    generate,
    structuredGenerate,
    getCalls,
    getCallCount,
    reset,
    setNextResponse,
    failNext,
  };
}

module.exports = { createMockProvider };
