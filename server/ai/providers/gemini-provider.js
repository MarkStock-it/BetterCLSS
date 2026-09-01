/**
 * gemini-provider.js
 * Gemini AI Provider Implementation.
 *
 * Uses Google's official Gemini API (generativelanguage.googleapis.com).
 * Implements the AI Provider interface for use by Agentic Helper.
 *
 * Security:
 *   - API key is server-side only
 *   - Never exposed to frontend
 *   - Never logged
 */

const { createBaseProvider } = require('../provider');
const { AIError, AI_ERROR_CATEGORIES, fromGeminiResponse, fromNetworkError } = require('../ai-errors');

/**
 * Create a Gemini AI Provider.
 *
 * @param {object} config
 * @param {string} config.apiKey - Gemini API key (server-side only)
 * @param {string} [config.model] - Model name (default: gemini-2.0-flash)
 * @param {number} [config.timeoutMs] - Request timeout (default: 60000)
 * @param {number} [config.maxOutputTokens] - Max output tokens
 * @param {number} [config.temperature] - Generation temperature
 * @returns {object} Gemini provider implementing AI Provider interface
 */
function createGeminiProvider(config) {
  // BYOK: this provider accepts a per-request API key, so it is always "ready".
  const base = createBaseProvider('gemini', { ...config, perRequestKey: true });

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const model = config.model || 'gemini-2.0-flash';
  const apiKey = config.apiKey || '';
  const timeoutMs = config.timeoutMs || 60000;
  const maxOutputTokens = config.maxOutputTokens || 8192;
  const temperature = config.temperature || 0.4;

  /**
   * Resolve the effective API key for a request: prefer the per-user key sent
   * with the request (BYOK), falling back to the configured key.
   * @param {object} request - AIRequest (may carry `aiKeys.gemini` or `apiKey`)
   * @returns {string}
   */
  function resolveKey(request) {
    return (request && request.aiKeys && request.aiKeys.gemini)
      || (request && request.apiKey)
      || apiKey;
  }

  /**
   * Make a raw request to the Gemini API.
   * @param {string} endpoint - API endpoint path
   * @param {object} body - Request body
   * @param {AbortSignal} signal - Timeout signal
   * @param {string} key - Effective API key (per-request or configured)
   * @returns {Promise<object>} Parsed response
   */
  async function rawRequest(endpoint, body, signal, key) {
    const url = `${API_BASE}/models/${encodeURIComponent(model)}:${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw fromGeminiResponse(response.status, errorBody, 'gemini');
    }

    return response.json();
  }

  /**
   * Extract text content from a Gemini response.
   * @param {object} data - Gemini API response
   * @returns {string}
   */
  function extractText(data) {
    return data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';
  }

  /**
   * Extract usage metadata from a Gemini response.
   * @param {object} data - Gemini API response
   * @returns {object|null}
   */
  function extractUsage(data) {
    const usage = data?.usageMetadata;
    if (!usage) return null;
    return {
      promptTokens: usage.promptTokenCount || null,
      completionTokens: usage.candidatesTokenCount || null,
      totalTokens: usage.totalTokenCount || null,
    };
  }

  /**
   * Extract finish reason from a Gemini response.
   * @param {object} data - Gemini API response
   * @returns {string|null}
   */
  function extractFinishReason(data) {
    return data?.candidates?.[0]?.finishReason || null;
  }

  /**
   * Generate text using Gemini.
   *
   * @param {object} request
   * @param {string} request.systemInstruction - System instructions
   * @param {string} request.prompt - User prompt
   * @param {object[]} [request.history] - Conversation history
   * @param {string} [request.jobId] - Job ID for tracking
   * @param {object} [request.generationConfig] - Override generation settings
   * @returns {Promise<AIResponse>}
   */
  async function generate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'gemini',
        retryable: false,
      });
    }

    const readiness = base.isReady();
    if (!readiness.ready) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: readiness.reason,
        provider: 'gemini',
        retryable: false,
      });
    }

    const requestId = base.generateRequestId();
    const startTime = Date.now();
    const signal = base.createTimeoutSignal();

    // Build contents array from history + current prompt
    const contents = [];
    if (Array.isArray(request.history)) {
      for (const entry of request.history.slice(-20)) {
        if (entry && typeof entry.role === 'string' && typeof entry.content === 'string') {
          contents.push({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: entry.content }],
          });
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: request.prompt }] });

    // Build request body
    const body = {
      contents,
      generationConfig: {
        temperature: request.generationConfig?.temperature ?? temperature,
        maxOutputTokens: request.generationConfig?.maxOutputTokens ?? maxOutputTokens,
      },
    };

    // Add system instruction if provided
    if (request.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    const effectiveKey = resolveKey(request);
    if (!effectiveKey) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: 'No Gemini API key provided. Add your Gemini key in Settings (bring-your-own-key).',
        provider: 'gemini',
        retryable: false,
      });
    }

    try {
      const data = await rawRequest('generateContent', body, signal, effectiveKey);
      const text = extractText(data);
      const durationMs = Date.now() - startTime;

      if (!text) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.MODEL_ERROR,
          message: 'Gemini returned an empty response.',
          provider: 'gemini',
          code: 'EMPTY_RESPONSE',
          retryable: true,
        });
      }

      return {
        text,
        provider: 'gemini',
        model,
        usage: extractUsage(data),
        requestId,
        finishReason: extractFinishReason(data),
        durationMs,
      };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw fromNetworkError(error, 'gemini');
    }
  }

  /**
   * Generate structured JSON output using Gemini.
   *
   * Uses Gemini's JSON mode for reliable structured output.
   * Validates the response against the provided schema.
   *
   * @param {object} request
   * @param {string} request.systemInstruction - System instructions
   * @param {string} request.prompt - User prompt
   * @param {object} request.schema - Expected JSON schema
   * @param {object[]} [request.history] - Conversation history
   * @param {string} [request.jobId] - Job ID for tracking
   * @param {object} [request.generationConfig] - Override generation settings
   * @returns {Promise<StructuredAIResponse>}
   */
  async function structuredGenerate(request) {
    const validation = base.validateRequest(request);
    if (!validation.valid) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: validation.reason,
        provider: 'gemini',
        retryable: false,
      });
    }

    if (!request.schema || typeof request.schema !== 'object') {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_REQUEST,
        message: 'Structured generation requires a JSON schema.',
        provider: 'gemini',
        retryable: false,
      });
    }

    const readiness = base.isReady();
    if (!readiness.ready) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: readiness.reason,
        provider: 'gemini',
        retryable: false,
      });
    }

    const requestId = base.generateRequestId();
    const startTime = Date.now();
    const signal = base.createTimeoutSignal();

    // Build contents
    const contents = [];
    if (Array.isArray(request.history)) {
      for (const entry of request.history.slice(-20)) {
        if (entry && typeof entry.role === 'string' && typeof entry.content === 'string') {
          contents.push({
            role: entry.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: entry.content }],
          });
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: request.prompt }] });

    // Build request with JSON mode
    const body = {
      contents,
      generationConfig: {
        temperature: request.generationConfig?.temperature ?? temperature,
        maxOutputTokens: request.generationConfig?.maxOutputTokens ?? maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: convertToGeminiSchema(request.schema),
      },
    };

    if (request.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    const effectiveKey = resolveKey(request);
    if (!effectiveKey) {
      throw new AIError({
        category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION,
        message: 'No Gemini API key provided. Add your Gemini key in Settings (bring-your-own-key).',
        provider: 'gemini',
        retryable: false,
      });
    }

    try {
      const data = await rawRequest('generateContent', body, signal, effectiveKey);
      const rawText = extractText(data);
      const durationMs = Date.now() - startTime;

      if (!rawText) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.MODEL_ERROR,
          message: 'Gemini returned an empty structured response.',
          provider: 'gemini',
          code: 'EMPTY_RESPONSE',
          retryable: true,
        });
      }

      // Parse and validate JSON
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseError) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
          message: 'Gemini returned invalid JSON.',
          provider: 'gemini',
          code: 'INVALID_JSON',
          retryable: false,
          detail: rawText.slice(0, 200),
        });
      }

      // Validate against schema (basic validation)
      const schemaError = validateAgainstSchema(parsed, request.schema);
      if (schemaError) {
        throw new AIError({
          category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
          message: `Response does not match expected schema: ${schemaError}`,
          provider: 'gemini',
          code: 'SCHEMA_MISMATCH',
          retryable: false,
          detail: rawText.slice(0, 200),
        });
      }

      return {
        data: parsed,
        text: rawText,
        provider: 'gemini',
        model,
        usage: extractUsage(data),
        requestId,
        finishReason: extractFinishReason(data),
        durationMs,
      };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw fromNetworkError(error, 'gemini');
    }
  }

  return {
    ...base,
    generate,
    structuredGenerate,
  };
}

/**
 * Convert a standard JSON schema to Gemini's schema format.
 * @param {object} schema
 * @returns {object}
 */
function convertToGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return {};

  const result = {};

  if (schema.type) result.type = mapJsonSchemaType(schema.type);
  if (schema.description) result.description = schema.description;
  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertToGeminiSchema(value);
    }
  }
  if (schema.items) {
    result.items = convertToGeminiSchema(schema.items);
  }
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;

  return result;
}

/**
 * Map JSON Schema types to Gemini types.
 * @param {string} type
 * @returns {string}
 */
function mapJsonSchemaType(type) {
  const map = {
    string: 'STRING',
    number: 'NUMBER',
    integer: 'INTEGER',
    boolean: 'BOOLEAN',
    array: 'ARRAY',
    object: 'OBJECT',
  };
  return map[type] || 'STRING';
}

/**
 * Basic schema validation.
 * @param {object} data
 * @param {object} schema
 * @returns {string|null} Error message or null if valid
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
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const error = validateAgainstSchema(data[key], propSchema);
          if (error) return `Property "${key}": ${error}`;
        }
      }
    }
  } else if (type === 'array') {
    if (!Array.isArray(data)) {
      return 'Expected array';
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const error = validateAgainstSchema(data[i], schema.items);
        if (error) return `Item ${i}: ${error}`;
      }
    }
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
  createGeminiProvider,
  convertToGeminiSchema,
  validateAgainstSchema,
};
