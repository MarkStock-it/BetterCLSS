/**
 * ai-config.js
 * AI Provider Configuration Layer.
 *
 * Centralizes all AI-related configuration.
 * Reads from environment variables and provides a clean config object
 * for provider initialization.
 */

/**
 * Create AI configuration from the application config.
 * @param {object} appConfig - Application config from server/config.js
 * @returns {object} AI configuration
 */
function createAIConfig(appConfig) {
  return {
    // Gemini configuration (used for chat / tokenization)
    gemini: {
      apiKey: appConfig.geminiApiKey || '',
      model: appConfig.geminiModel || 'gemini-2.0-flash',
      timeoutMs: appConfig.geminiTimeoutMs || 60000,
      maxOutputTokens: appConfig.geminiMaxOutputTokens || 8192,
      temperature: appConfig.geminiTemperature || 0.4,
    },

    // Groq configuration (used for tool / agentic turns)
    groq: {
      apiKey: appConfig.groqApiKey || '',
      model: appConfig.groqModel || 'llama-3.3-70b-versatile',
      timeoutMs: appConfig.groqTimeoutMs || 60000,
      maxOutputTokens: appConfig.groqMaxOutputTokens || 8192,
      temperature: appConfig.groqTemperature || 0.3,
    },

    // Provider selection
    defaultProvider: appConfig.aiDefaultProvider || 'gemini',

    // Retry settings
    maxRetries: appConfig.aiMaxRetries || 2,
    retryBaseDelayMs: appConfig.aiRetryBaseDelayMs || 1000,

    // Logging
    logRequests: appConfig.aiLogRequests || false,
  };
}

/**
 * Create AI configuration from environment variables.
 * Use this when appConfig is not available.
 * @returns {object}
 */
function createAIConfigFromEnv() {
  return {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 60000),
      maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
      temperature: Number(process.env.GEMINI_TEMPERATURE || 0.4),
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 60000),
      maxOutputTokens: Number(process.env.GROQ_MAX_OUTPUT_TOKENS || 8192),
      temperature: Number(process.env.GROQ_TEMPERATURE || 0.3),
    },
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
    maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
    retryBaseDelayMs: Number(process.env.AI_RETRY_BASE_DELAY_MS || 1000),
    logRequests: process.env.AI_LOG_REQUESTS === '1',
  };
}

module.exports = {
  createAIConfig,
  createAIConfigFromEnv,
};
