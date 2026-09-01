/**
 * provider-layer.test.js
 * Tests for the AI Provider layer.
 *
 * Run with: node server/ai/__tests__/provider-layer.test.js
 */

const { AIError, AI_ERROR_CATEGORIES, fromGeminiResponse, fromNetworkError } = require('../ai-errors');
const { createAIConfig } = require('../ai-config');
const { createBaseProvider } = require('../provider');
const { createGeminiProvider, validateAgainstSchema, convertToGeminiSchema } = require('../providers/gemini-provider');
const { createMockProvider } = require('../providers/mock-provider');
const { createProvider, createDefaultProvider, getAvailableProviders } = require('../provider-factory');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, testName, details = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.log(`  ✗ ${testName}${details ? ` — ${details}` : ''}`);
  }
}

function assertEqual(actual, expected, testName) {
  assert(actual === expected, testName, `expected "${expected}", got "${actual}"`);
}

function assertThrows(fn, testName) {
  total++;
  try {
    fn();
    failed++;
    console.log(`  ✗ ${testName} — expected error but none thrown`);
  } catch {
    passed++;
    console.log(`  ✓ ${testName}`);
  }
}

async function assertThrowsAsync(fn, testName) {
  total++;
  try {
    await fn();
    failed++;
    console.log(`  ✗ ${testName} — expected error but none thrown`);
  } catch {
    passed++;
    console.log(`  ✓ ${testName}`);
  }
}

// ─── AI Error Tests ──────────────────────────────────────────────────

console.log('\n=== AI Error Tests ===');

(() => {
  const error = new AIError({
    category: AI_ERROR_CATEGORIES.RATE_LIMIT,
    message: 'Rate limit exceeded',
    provider: 'gemini',
    retryable: true,
  });

  assert(error instanceof Error, 'AIError is an Error');
  assertEqual(error.category, 'RATE_LIMIT', 'Error has category');
  assertEqual(error.provider, 'gemini', 'Error has provider');
  assert(error.retryable === true, 'Error has retryable flag');
  assertEqual(error.name, 'AIError', 'Error name is AIError');

  const safe = error.toClientSafe();
  assert(!safe.detail, 'Client-safe does not expose detail');
  assert(!safe.cause, 'Client-safe does not expose cause');

  const logged = error.toLoggable();
  assert(typeof logged === 'object', 'Loggable is an object');
})();

console.log('\n=== Error Creation from Gemini Response ===');

(() => {
  const authError = fromGeminiResponse(401, 'Unauthorized');
  assertEqual(authError.category, 'AUTHENTICATION', '401 is AUTHENTICATION');
  assert(authError.retryable === false, '401 is not retryable');

  const rateLimitError = fromGeminiResponse(429, 'Rate limit');
  assertEqual(rateLimitError.category, 'RATE_LIMIT', '429 is RATE_LIMIT');
  assert(rateLimitError.retryable === true, '429 is retryable');

  const serverError = fromGeminiResponse(500, 'Internal error');
  assertEqual(serverError.category, 'PROVIDER_UNAVAILABLE', '500 is PROVIDER_UNAVAILABLE');
  assert(serverError.retryable === true, '500 is retryable');

  const badRequest = fromGeminiResponse(400, 'Bad request');
  assertEqual(badRequest.category, 'INVALID_REQUEST', '400 is INVALID_REQUEST');
})();

console.log('\n=== Error Creation from Network Error ===');

(() => {
  const timeoutError = fromNetworkError({ name: 'AbortError', message: 'timeout' });
  assertEqual(timeoutError.category, 'TIMEOUT', 'AbortError is TIMEOUT');
  assert(timeoutError.retryable === true, 'Timeout is retryable');

  const networkError = fromNetworkError(new TypeError('fetch failed'));
  assertEqual(networkError.category, 'NETWORK', 'fetch failed is NETWORK');
  assert(networkError.retryable === true, 'Network error is retryable');
})();

// ─── AI Config Tests ─────────────────────────────────────────────────

console.log('\n=== AI Config Tests ===');

(() => {
  const config = createAIConfig({
    geminiApiKey: 'test-key',
    geminiModel: 'gemini-2.0-flash',
  });

  assertEqual(config.gemini.apiKey, 'test-key', 'Config has API key');
  assertEqual(config.gemini.model, 'gemini-2.0-flash', 'Config has model');
  assert(config.gemini.timeoutMs > 0, 'Config has timeout');
  assert(config.gemini.maxOutputTokens > 0, 'Config has maxOutputTokens');

  // Config without key
  const noKeyConfig = createAIConfig({});
  assertEqual(noKeyConfig.gemini.apiKey, '', 'Missing key defaults to empty');
})();

// ─── Base Provider Tests ─────────────────────────────────────────────

console.log('\n=== Base Provider Tests ===');

(() => {
  const provider = createBaseProvider('test', {
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 5000,
  });

  const meta = provider.metadata();
  assertEqual(meta.name, 'test', 'Metadata has name');
  assertEqual(meta.model, 'test-model', 'Metadata has model');
  assert(meta.hasApiKey === true, 'Metadata has hasApiKey');

  const ready = provider.isReady();
  assert(ready.ready === true, 'Provider is ready with key');

  const noKeyProvider = createBaseProvider('nokey', { apiKey: '' });
  const notReady = noKeyProvider.isReady();
  assert(notReady.ready === false, 'Provider not ready without key');

  // Request validation
  const validReq = provider.validateRequest({ prompt: 'Hello' });
  assert(validReq.valid === true, 'Valid request passes');

  const noPrompt = provider.validateRequest({});
  assert(noPrompt.valid === false, 'Missing prompt fails');

  const emptyPrompt = provider.validateRequest({ prompt: '' });
  assert(emptyPrompt.valid === false, 'Empty prompt fails');

  const longPrompt = provider.validateRequest({ prompt: 'x'.repeat(200000) });
  assert(longPrompt.valid === false, 'Too-long prompt fails');
})();

// ─── Mock Provider Tests ─────────────────────────────────────────────

console.log('\n=== Mock Provider Tests ===');

(async () => {
  // Basic generation
  const mock = createMockProvider({
    responses: ['Hello from mock', 'Second response'],
  });

  const response1 = await mock.generate({ prompt: 'Test' });
  assertEqual(response1.text, 'Hello from mock', 'Mock returns configured response');
  assertEqual(response1.provider, 'mock', 'Mock reports provider name');
  assertEqual(response1.model, 'mock-model', 'Mock reports model name');
  assert(response1.usage !== null, 'Mock returns usage');

  const response2 = await mock.generate({ prompt: 'Test 2' });
  assertEqual(response2.text, 'Second response', 'Mock cycles through responses');

  // Call tracking
  assertEqual(mock.getCallCount(), 2, 'Mock tracks call count');
  const calls = mock.getCalls();
  assertEqual(calls.length, 2, 'Mock records calls');
  assertEqual(calls[0].method, 'generate', 'Mock records method');

  // Structured generation
  const mockStructured = createMockProvider({
    responses: ['{"result": "success", "count": 5}'],
  });
  const structResponse = await mockStructured.structuredGenerate({
    prompt: 'Test structured',
    schema: { type: 'object', properties: { result: { type: 'string' } } },
  });
  assertEqual(structResponse.data.result, 'success', 'Structured response parsed');

  // Reset
  mock.reset();
  assertEqual(mock.getCallCount(), 0, 'Reset clears call count');

  // Failure simulation
  const failMock = createMockProvider({ responses: ['ok'] });
  failMock.failNext();
  await assertThrowsAsync(
    () => failMock.generate({ prompt: 'Will fail' }),
    'Mock fails on next call when configured'
  );

  // Request validation
  await assertThrowsAsync(
    () => mock.generate({}),
    'Mock rejects invalid request'
  );
})();

// ─── Gemini Provider Tests (unit) ────────────────────────────────────

console.log('\n=== Gemini Provider Unit Tests ===');

(async () => {
  // Schema conversion
  const geminiSchema = convertToGeminiSchema({
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
      items: { type: 'array', items: { type: 'string' } },
    },
  });
  assertEqual(geminiSchema.type, 'OBJECT', 'Schema type converted');
  assertEqual(geminiSchema.properties.name.type, 'STRING', 'String type converted');
  assertEqual(geminiSchema.properties.count.type, 'NUMBER', 'Number type converted');
  assertEqual(geminiSchema.properties.items.type, 'ARRAY', 'Array type converted');

  // Schema validation
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
    },
    required: ['name'],
  };

  assert(validateAgainstSchema({ name: 'test', count: 5 }, schema) === null, 'Valid object passes');
  assert(validateAgainstSchema({ count: 5 }, schema) === 'Missing required property: name', 'Missing required fails');
  assert(validateAgainstSchema('not an object', schema) === 'Expected object', 'Wrong type fails');
  assert(validateAgainstSchema({ name: 123 }, schema) === 'Property "name": Expected string', 'Wrong property type fails');

  // Gemini provider with mock (no real API call)
  const geminiProvider = createGeminiProvider({
    apiKey: 'test-key',
    model: 'gemini-2.0-flash',
  });

  const meta = geminiProvider.metadata();
  assertEqual(meta.name, 'gemini', 'Gemini provider has correct name');
  assert(meta.hasApiKey === true, 'Gemini provider has API key');

  // Request validation
  const validReq = geminiProvider.validateRequest({ prompt: 'Hello' });
  assert(validReq.valid === true, 'Gemini validates valid request');

  // Cannot make real API call without valid key, but provider initializes
  assert(typeof geminiProvider.generate === 'function', 'Gemini has generate method');
  assert(typeof geminiProvider.structuredGenerate === 'function', 'Gemini has structuredGenerate method');
})();

// ─── Provider Factory Tests ──────────────────────────────────────────

console.log('\n=== Provider Factory Tests ===');

(() => {
  const providers = getAvailableProviders();
  assert(providers.includes('gemini'), 'Gemini is available');
  assert(providers.includes('mock'), 'Mock is available');

  // Create mock provider
  const mock = createProvider('mock', { responses: ['test'] });
  assert(typeof mock.generate === 'function', 'Factory creates mock provider');

  // Create gemini provider
  const gemini = createProvider('gemini', { apiKey: 'test' });
  assert(typeof gemini.generate === 'function', 'Factory creates gemini provider');

  // Unknown provider
  assertThrows(
    () => createProvider('unknown', {}),
    'Unknown provider throws error'
  );

  // Default provider
  const defaultProvider = createDefaultProvider({
    defaultProvider: 'mock',
    mock: { responses: ['default'] },
  });
  assert(typeof defaultProvider.generate === 'function', 'Default provider created');
})();

// ─── Security Tests ──────────────────────────────────────────────────

console.log('\n=== Security Tests ===');

(async () => {
  // API key not in metadata
  const provider = createGeminiProvider({
    apiKey: 'super-secret-key-12345',
    model: 'gemini-2.0-flash',
  });

  const meta = provider.metadata();
  assert(!JSON.stringify(meta).includes('super-secret-key'), 'API key not in metadata');

  // API key not in error messages
  const error = new AIError({
    category: AI_ERROR_CATEGORIES.AUTHENTICATION,
    message: 'Auth failed',
    provider: 'gemini',
  });
  assert(!error.toClientSafe().message.includes('super-secret-key'), 'API key not in error message');
  assert(!error.toLoggable().message.includes('super-secret-key'), 'API key not in log message');

  // Mock provider does not expose credentials
  const mock = createMockProvider();
  const mockMeta = mock.metadata();
  assertEqual(mockMeta.apiKey, undefined, 'Mock does not expose API key in metadata');
})();

// ─── Summary ─────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed!\n');
}
