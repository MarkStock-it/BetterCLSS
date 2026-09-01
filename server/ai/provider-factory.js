/**
 * provider-factory.js
 * AI Provider Factory.
 *
 * Creates AI provider instances from configuration.
 * Supports provider selection by name.
 *
 * Usage:
 *   const provider = createProvider('gemini', config);
 *   // or
 *   const provider = createProvider('mock', config);
 */

const { createGeminiProvider } = require('./providers/gemini-provider');
const { createMockProvider } = require('./providers/mock-provider');

const PROVIDER_REGISTRY = {
  gemini: createGeminiProvider,
  mock: createMockProvider,
};

/**
 * Create an AI provider by name.
 *
 * @param {string} providerName - 'gemini', 'mock', etc.
 * @param {object} config - Provider-specific configuration
 * @returns {object} Provider instance
 * @throws {Error} If provider is unknown
 */
function createProvider(providerName, config = {}) {
  const factory = PROVIDER_REGISTRY[providerName];
  if (!factory) {
    throw new Error(
      `Unknown AI provider: ${providerName}. ` +
      `Available providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`
    );
  }
  return factory(config);
}

/**
 * Create the default provider from application configuration.
 *
 * @param {object} aiConfig - AI configuration from ai-config.js
 * @returns {object} Provider instance
 */
function createDefaultProvider(aiConfig) {
  const providerName = aiConfig.defaultProvider || 'gemini';
  const providerConfig = aiConfig[providerName] || {};

  return createProvider(providerName, providerConfig);
}

/**
 * Register a custom provider.
 * Useful for extending with new providers without modifying this file.
 *
 * @param {string} name - Provider name
 * @param {function} factory - Factory function(config) => provider
 */
function registerProvider(name, factory) {
  PROVIDER_REGISTRY[name] = factory;
}

/**
 * Get list of available provider names.
 * @returns {string[]}
 */
function getAvailableProviders() {
  return Object.keys(PROVIDER_REGISTRY);
}

module.exports = {
  createProvider,
  createDefaultProvider,
  registerProvider,
  getAvailableProviders,
  PROVIDER_REGISTRY,
};
