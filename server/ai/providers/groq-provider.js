/**
 * groq-provider.js
 * Groq AI Provider Implementation.
 *
 * Uses Groq's OpenAI-compatible API (api.groq.com/openai/v1). Groq's free tier
 * is ideal for the agentic / tool-call turns — very fast, very cheap, and
 * supports structured JSON output. In the hybrid router this provider handles
 * "tool utilization" while Gemini handles "chat / tokenization".
 *
 * Implements the same AI Provider interface as the Gemini provider, so it can
 * be swapped in / routed without touching the orchestrator.
 *
 * Security:
 *   - API key is server-side only
 *   - Never exposed to frontend
 *   - Never logged
 */

const { createBaseProvider } = require('../provider');
const { AIError, AI_ERROR_CATEGORIES, fromNetworkError } = require('../ai-errors');
const { validateAgainstSchema } = require('./gemini-provider');

/**
 * Create a Groq AI Provider.
 *
 * @param {object} config
 * @param {string} config.apiKey - Groq API key (server-side only)
 * @param {string} [config.model] - Model name (default: llama-3.3-70b-versatile)
 * @param {number} [config.timeoutMs] - Request timeout (default: 60000)
 * @param {number} [config.maxOutputTokens] - Max output tokens
 * @param {number} [config.temperature] - Generation temperature
 * @returns {object} Groq provider implementing AI Provider interface
 */
function createGroqProvider(config) {
  // BYOK: this provider accepts a per-request API key, so it is always "ready".
  const base = createBaseProvider('groq', { ...config, perRequestKey: true });

  const API_BASE = 'https://api.groq.com/openai/v1/chat/completions';
  const model = config.model || 'llama-3.3-70b-versatile';
  const apiKey = config.apiKey || '';
  const timeoutMs = config.timeoutMs || 60000;
  const maxOutputTokens = config.maxOutputTokens || 8192;
  const temperature = config.temperature || 0.3;

  /**
   * Resolve the effective API key for a request: prefer the per-user key sent
   * with the request (BYOK), falling back to the configured key.
   * @param {object} request - AIRequest (may carry `aiKeys.groq` or `apiKey`)
   * @returns {string}
   */
  function resolveKey(request) {
    return (request && request.aiKeys && request.aiKeys.groq)
      || (request && request.apiKey)
      || apiKey;
  }

  /**
   * Resolve the fetch abort signal for a request: combine the per-request
   * timeout with the job's cancellation signal (Phase 33). If the job was
   * already cancelled, throw immediately so we don't fire a doomed request.
   * @param {object} request - AIRequest (may carry `request.signal`)
   * @returns {AbortSignal}
   */
  function resolveSignal(request) {
    const timeoutSignal = base.createTimeoutSignal();
    const jobSignal = request && request.signal;
    if (!jobSignal) return timeoutSignal;
    if (jobSignal.aborted) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.CANCELLED,
        message: 'Job cancelled by user.',
        provider: 'groq',
        code: 'CANCELLED',
        retryable: false,
      });
    }
    return AbortSignal.any([jobSignal, timeoutSignal]);
  }

  /**
   * Map an abort that came from the job's cancellation signal to a clean,
   * non-retryable CANCELLED error (so the reliability wrapper doesn't retry it).
   * @param {Error} error - The error from the failed fetch
   * @param {object} request - AIRequest
   * @returns {boolean}
   */
  function isJobAbort(error, request) {
    return Boolean(request && request.signal && request.signal.aborted && error && error.name === 'AbortError');
  }

  /**
   * Make a raw request to the Groq API (OpenAI-compatible chat completions).
   * @param {object} body - Request body
   * @param {AbortSignal} signal - Timeout signal
   * @param {string} key - Effective API key (per-request or configured)
   * @returns {Promise<object>} Parsed response
   */
  async function rawRequest(body, signal, key) {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw fromGroqResponse(response.status, errorBody);
    }

    return response.json();
  }

  /**
   * Build the chat messages array (system + bounded history + user prompt).
   * For structured output, Groq's json_object mode requires the word "json"
   * in the messages, so we append an explicit JSON instruction.
   * @param {object} request - AIRequest
   * @param {boolean} json - Whether this is a JSON-only response
   * @returns {object[]}
   */
  function buildMessages(request, json) {
    const messages = [];
    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }
    if (Array.isArray(request.history)) {
      for (const entry of request.history.slice(-20)) {
        if (entry && typeof entry.role === 'string' && typeof entry.content === 'string') {
          messages.push({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: entry.content,
          });
        }
      }
    }
    let prompt = request.prompt;
    if (json) prompt = `${prompt}\n\nReturn your response as valid JSON only.`;
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  /**
   * Extract text content from a Groq chat completion response.
   * @param {object} data - Groq API response
   * @returns {string}
   */
  function extractContent(data) {
    return data?.choices?.[0]?.message?.content || '';
  }

  /**
   * Extract usage metadata from a Groq response.
   * @param {object} data - Groq API response
   * @returns {object|null}
   */
  function extractUsage(data) {
    const usage = data?.usage;
    if (!usage) return null;
    return {
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
    };
  }

  /**
   * Extract finish reason from a Groq response.
   * @param {object} data - Groq API response
   * @returns {string|null}
   */
  function extractFinishReason(data) {
    return data?.choices?.[0]?.finish_reason || null;
  }

  /**
   * Generate text using Groq.
   * @param {object} request
   * @param {string} request.systemInstruction - System instructions
   * @param {string} request.prompt - User prompt
   * @param {object[]} [request.history] - Conversation history
   * @param {object} [request.generationConfig] - Override generation settings
   * @returns {Promise<AIResponse>}
   */
  async function generate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'groq',
        retryable: false,
      });
    }

    const readiness = base.isReady();
    if (!readiness.ready) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: readiness.reason,
        provider: 'groq',
        retryable: false,
      });
    }

    const effectiveKey = resolveKey(request);
    if (!effectiveKey) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: 'No Groq API key provided. Add your Groq key in Settings (bring-your-own-key).',
        provider: 'groq',
        retryable: false,
      });
    }

    const requestId = base.generateRequestId();
    const startTime = Date.now();
    const signal = resolveSignal(request);

    const body = {
      model,
      messages: buildMessages(request, false),
      temperature: request.generationConfig?.temperature ?? temperature,
      max_tokens: request.generationConfig?.maxOutputTokens ?? maxOutputTokens,
    };

    try {
      const data = await rawRequest(body, signal, effectiveKey);
      const text = extractContent(data);
      const durationMs = Date.now() - startTime;

      if (!text) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.MODEL_ERROR,
          message: 'Groq returned an empty response.',
          provider: 'groq',
          code: 'EMPTY_RESPONSE',
          retryable: true,
        });
      }

      return {
        text,
        provider: 'groq',
        model,
        usage: extractUsage(data),
        requestId,
        finishReason: extractFinishReason(data),
        durationMs,
      };
    } catch (error) {
      if (isJobAbort(error, request)) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.CANCELLED,
          message: 'Job cancelled by user.',
          provider: 'groq',
          code: 'CANCELLED',
          retryable: false,
          cause: error,
        });
      }
      if (error instanceof AIError) throw error;
      throw fromNetworkError(error, 'groq');
    }
  }

  /**
   * Generate structured JSON output using Groq.
   *
   * Uses Groq's JSON mode (response_format json_object) and validates the
   * response against the provided schema, mirroring the Gemini provider.
   *
   * @param {object} request
   * @param {string} request.systemInstruction - System instructions
   * @param {string} request.prompt - User prompt
   * @param {object} request.schema - Expected JSON schema
   * @param {object[]} [request.history] - Conversation history
   * @param {object} [request.generationConfig] - Override generation settings
   * @returns {Promise<StructuredAIResponse>}
   */
  async function structuredGenerate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'groq',
        retryable: false,
      });
    }

    if (!request.schema || typeof request.schema !== 'object') {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: 'Structured generation requires a JSON schema.',
        provider: 'groq',
        retryable: false,
      });
    }

    const readiness = base.isReady();
    if (!readiness.ready) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: readiness.reason,
        provider: 'groq',
        retryable: false,
      });
    }

    const effectiveKey = resolveKey(request);
    if (!effectiveKey) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: 'No Groq API key provided. Add your Groq key in Settings (bring-your-own-key).',
        provider: 'groq',
        retryable: false,
      });
    }

    const requestId = base.generateRequestId();
    const startTime = Date.now();
    const signal = resolveSignal(request);

    const body = {
      model,
      messages: buildMessages(request, true),
      temperature: request.generationConfig?.temperature ?? temperature,
      max_tokens: request.generationConfig?.maxOutputTokens ?? maxOutputTokens,
      response_format: { type: 'json_object' },
    };

    try {
      const data = await rawRequest(body, signal, effectiveKey);
      const rawText = extractContent(data);
      const durationMs = Date.now() - startTime;

      if (!rawText) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.MODEL_ERROR,
          message: 'Groq returned an empty structured response.',
          provider: 'groq',
          code: 'EMPTY_RESPONSE',
          retryable: true,
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseError) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
          message: 'Groq returned invalid JSON.',
          provider: 'groq',
          code: 'INVALID_JSON',
          retryable: false,
          detail: rawText.slice(0, 200),
        });
      }

      const schemaError = validateAgainstSchema(parsed, request.schema);
      if (schemaError) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
          message: `Response does not match expected schema: ${schemaError}`,
          provider: 'groq',
          code: 'SCHEMA_MISMATCH',
          retryable: false,
          detail: rawText.slice(0, 200),
        });
      }

      return {
        data: parsed,
        text: rawText,
        provider: 'groq',
        model,
        usage: extractUsage(data),
        requestId,
        finishReason: extractFinishReason(data),
        durationMs,
      };
    } catch (error) {
      if (isJobAbort(error, request)) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.CANCELLED,
          message: 'Job cancelled by user.',
          provider: 'groq',
          code: 'CANCELLED',
          retryable: false,
          cause: error,
        });
      }
      if (error instanceof AIError) throw error;
      throw fromNetworkError(error, 'groq');
    }
  }

  return {
    ...base,
    generate,
    structuredGenerate,
  };
}

/**
 * Create an AIError from a Groq HTTP response.
 * Groq returns OpenAI-compatible errors: { "error": { "message", "type", "code" } }.
 * @param {number} status - HTTP status code
 * @param {string} body - Response body text
 * @returns {AIError}
 */
function fromGroqResponse(status, body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const error = parsed?.error || {};
  const detail = (error.message || body || '').slice(0, 300);
  const detailLower = detail.toLowerCase();

  if (status === 401 || status === 403) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.AUTHENTICATION,
      message: 'Groq API key is invalid or expired.',
      provider: 'groq',
      code: 'AUTHENTICATION_FAILED',
      retryable: false,
      providerStatus: status,
      detail,
    });
  }

  if (status === 429) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.RATE_LIMIT,
      message: 'Groq rate limit exceeded.',
      provider: 'groq',
      code: 'RATE_LIMIT_EXCEEDED',
      retryable: true,
      providerStatus: status,
      detail,
    });
  }

  if (status === 400) {
    const isInvalidKey = ['invalid api key', 'api key', 'unauthorized', 'authentication'].some(
      (s) => detailLower.includes(s)
    );
    if (isInvalidKey) {
      return new AIError({
        category: AI_ERROR_CATEGORIES.AUTHENTICATION,
        message: 'Groq API key is invalid.',
        provider: 'groq',
        code: 'AUTHENTICATION_FAILED',
        retryable: false,
        providerStatus: status,
        detail,
      });
    }
    return new AIError({
      category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
      message: 'Groq rejected the request.',
      provider: 'groq',
      code: 'INVALID_REQUEST',
      retryable: false,
      providerStatus: status,
      detail,
    });
  }

  if (status >= 500) {
    return new AIError({
      category: AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
      message: 'Groq service is temporarily unavailable.',
      provider: 'groq',
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      providerStatus: status,
      detail,
    });
  }

  return new AIError({
    category: AI_ERROR_CATEGORIES.UNKNOWN,
    message: `Groq request failed (${status}).`,
    provider: 'groq',
    code: 'UNKNOWN',
    retryable: false,
    providerStatus: status,
    detail,
  });
}

module.exports = {
  createGroqProvider,
  fromGroqResponse,
};
