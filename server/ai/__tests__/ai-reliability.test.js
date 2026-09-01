/**
 * ai-reliability.test.js
 * Comprehensive tests for Phase 31: AI Provider Reliability.
 *
 * Tests:
 * 1. Retry logic and backoff
 * 2. Structured output repair
 * 3. Provider wrapper with retry
 * 4. Error classification for job states
 * 5. Fallback behavior
 * 6. Integration with orchestrator
 */

const assert = require('assert');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ─── Load modules ─────────────────────────────────────────────────

const {
  DEFAULT_RETRY_CONFIG,
  withRetry,
  calculateRetryDelay,
  isRetryable,
  createReliableProvider,
  repairStructuredOutput,
  validateAndRepair,
  classifyAiFailure,
} = require('../ai-reliability');

const { AIError, AI_ERROR_CATEGORIES } = require('../ai-errors');

// ─── Mock AI Provider ─────────────────────────────────────────────

function createMockProvider(options = {}) {
  let generateCount = 0;
  let structuredCount = 0;
  const generateResponses = options.generateResponses || options.responses || [];
  const structuredResponses = options.structuredResponses || options.responses || [];
  const generateErrors = options.generateErrors || options.errors || [];
  const structuredErrors = options.structuredErrors || options.errors || [];

  return {
    generate: async (request) => {
      if (generateCount < generateErrors.length) {
        const err = generateErrors[generateCount];
        generateCount++;
        throw err;
      }
      if (generateCount - generateErrors.length < generateResponses.length) {
        const resp = generateResponses[generateCount - generateErrors.length];
        generateCount++;
        return resp;
      }
      generateCount++;
      return {
        text: 'Mock response',
        provider: 'mock',
        model: 'mock-model',
        usage: { promptTokens: 10, completionTokens: 5 },
        requestId: 'mock_req',
        durationMs: 100,
      };
    },
    structuredGenerate: async (request) => {
      if (structuredCount < structuredErrors.length) {
        const err = structuredErrors[structuredCount];
        structuredCount++;
        throw err;
      }
      if (structuredCount - structuredErrors.length < structuredResponses.length) {
        const resp = structuredResponses[structuredCount - structuredErrors.length];
        structuredCount++;
        return resp;
      }
      structuredCount++;
      return {
        data: { action: 'final_response', content: 'Mock content' },
        text: '{"action":"final_response","content":"Mock content"}',
        provider: 'mock',
        model: 'mock-model',
        usage: { promptTokens: 10, completionTokens: 5 },
        requestId: 'mock_req',
        durationMs: 100,
      };
    },
    metadata: () => ({ name: 'mock', model: 'mock-model', hasApiKey: true }),
    isReady: () => ({ ready: true, reason: '' }),
    getCallCount: () => generateCount + structuredCount,
    getGenerateCount: () => generateCount,
    getStructuredCount: () => structuredCount,
    reset: () => { generateCount = 0; structuredCount = 0; },
  };
}

// ─── 1. Retry Delay Calculation ───────────────────────────────────

console.log('\n1. Retry Delay Calculation');

test('calculateRetryDelay returns positive value', () => {
  const delay = calculateRetryDelay(0);
  assert(delay > 0);
});

test('calculateRetryDelay increases with attempt', () => {
  const d0 = calculateRetryDelay(0, { jitterFraction: 0 });
  const d1 = calculateRetryDelay(1, { jitterFraction: 0 });
  const d2 = calculateRetryDelay(2, { jitterFraction: 0 });
  assert(d0 < d1);
  assert(d1 < d2);
});

test('calculateRetryDelay respects maxDelayMs', () => {
  const delay = calculateRetryDelay(10, { maxDelayMs: 5000, jitterFraction: 0 });
  assert(delay <= 5000);
});

test('calculateRetryDelay applies jitter', () => {
  // With jitter, delays should vary
  const delays = new Set();
  for (let i = 0; i < 20; i++) {
    delays.add(calculateRetryDelay(0, { baseDelayMs: 1000, jitterFraction: 0.3 }));
  }
  // Should have at least 2 different values due to jitter
  assert(delays.size >= 2);
});

// ─── 2. Retryable Detection ───────────────────────────────────────

console.log('\n2. Retryable Detection');

test('rate limit error is retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.RATE_LIMIT, message: 'rate limit' });
  assert.strictEqual(isRetryable(error), true);
});

test('timeout error is retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.TIMEOUT, message: 'timeout' });
  assert.strictEqual(isRetryable(error), true);
});

test('network error is retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network' });
  assert.strictEqual(isRetryable(error), true);
});

test('auth error is NOT retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.AUTHENTICATION, message: 'auth' });
  assert.strictEqual(isRetryable(error), false);
});

test('invalid request is NOT retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.INVALID_REQUEST, message: 'invalid' });
  assert.strictEqual(isRetryable(error), false);
});

test('schema validation error is NOT retryable', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION, message: 'schema' });
  assert.strictEqual(isRetryable(error), false);
});

test('explicitly retryable flag overrides category', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.MODEL_ERROR, message: 'model', retryable: true });
  assert.strictEqual(isRetryable(error), true);
});

// ─── 3. With Retry ────────────────────────────────────────────────

console.log('\n3. With Retry');

test('withRetry succeeds on first attempt', async () => {
  let callCount = 0;
  const result = await withRetry(async () => {
    callCount++;
    return 'success';
  }, { maxRetries: 2 });
  assert.strictEqual(result, 'success');
  assert.strictEqual(callCount, 1);
});

test('withRetry retries on retryable error', async () => {
  let callCount = 0;
  const result = await withRetry(async () => {
    callCount++;
    if (callCount < 3) {
      throw new AIError({ category: AI_ERROR_CATEGORIES.RATE_LIMIT, message: 'rate limit', retryable: true });
    }
    return 'success';
  }, { maxRetries: 3, retryConfig: { baseDelayMs: 10, maxDelayMs: 50 } });
  assert.strictEqual(result, 'success');
  assert.strictEqual(callCount, 3);
});

test('withRetry fails after maxRetries', async () => {
  let callCount = 0;
  try {
    await withRetry(async () => {
      callCount++;
      throw new AIError({ category: AI_ERROR_CATEGORIES.RATE_LIMIT, message: 'rate limit', retryable: true });
    }, { maxRetries: 2, retryConfig: { baseDelayMs: 10, maxDelayMs: 50 } });
    assert.fail('Should have thrown');
  } catch (err) {
    assert(err instanceof AIError);
    assert.strictEqual(callCount, 3); // 1 initial + 2 retries
  }
});

test('withRetry does NOT retry non-retryable errors', async () => {
  let callCount = 0;
  try {
    await withRetry(async () => {
      callCount++;
      throw new AIError({ category: AI_ERROR_CATEGORIES.AUTHENTICATION, message: 'auth', retryable: false });
    }, { maxRetries: 3, retryConfig: { baseDelayMs: 10 } });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(callCount, 1); // No retries
  }
});

test('withRetry calls onRetry callback', async () => {
  let retryCount = 0;
  try {
    await withRetry(async () => {
      throw new AIError({ category: AI_ERROR_CATEGORIES.TIMEOUT, message: 'timeout', retryable: true });
    }, {
      maxRetries: 1,
      retryConfig: { baseDelayMs: 10, maxDelayMs: 50 },
      onRetry: (attempt, delay, error) => { retryCount = attempt; },
    });
  } catch { /* expected */ }
  assert.strictEqual(retryCount, 1);
});

test('withRetry calls onFinalError when exhausted', async () => {
  let finalError = null;
  try {
    await withRetry(async () => {
      throw new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network', retryable: true });
    }, {
      maxRetries: 1,
      retryConfig: { baseDelayMs: 10, maxDelayMs: 50 },
      onFinalError: (error) => { finalError = error; },
    });
  } catch { /* expected */ }
  assert(finalError !== null);
});

// ─── 4. Structured Output Repair ──────────────────────────────────

console.log('\n4. Structured Output Repair');

test('repairStructuredOutput handles valid JSON', () => {
  const { repaired, strategy } = repairStructuredOutput('{"action":"final_response"}', { type: 'object' });
  assert(repaired !== null);
  assert.strictEqual(repaired.action, 'final_response');
  assert.strictEqual(strategy, 'direct_parse');
});

test('repairStructuredOutput extracts JSON from code block', () => {
  const text = 'Here is the response:\n```json\n{"action":"final_response","content":"test"}\n```\nDone.';
  const { repaired, strategy } = repairStructuredOutput(text, { type: 'object' });
  assert(repaired !== null);
  assert.strictEqual(repaired.action, 'final_response');
  assert.strictEqual(strategy, 'code_block_extract');
});

test('repairStructuredOutput extracts JSON from boundaries', () => {
  const text = 'The response is: {"action":"final_response","content":"test"} and that is all.';
  const { repaired, strategy } = repairStructuredOutput(text, { type: 'object' });
  assert(repaired !== null);
  assert.strictEqual(repaired.action, 'final_response');
  assert.strictEqual(strategy, 'boundary_extract');
});

test('repairStructuredOutput fixes trailing commas', () => {
  const text = '{"action":"final_response","content":"test",}';
  const { repaired, strategy } = repairStructuredOutput(text, { type: 'object' });
  assert(repaired !== null);
  assert.strictEqual(repaired.action, 'final_response');
  assert.strictEqual(strategy, 'fix_common_issues');
});

test('repairStructuredOutput returns null for unrecoverable input', () => {
  const { repaired, strategy } = repairStructuredOutput('This is not JSON at all', { type: 'object' });
  assert.strictEqual(repaired, null);
  assert.strictEqual(strategy, null);
});

test('repairStructuredOutput handles null input', () => {
  const { repaired } = repairStructuredOutput(null, { type: 'object' });
  assert.strictEqual(repaired, null);
});

test('repairStructuredOutput handles empty input', () => {
  const { repaired } = repairStructuredOutput('', { type: 'object' });
  assert.strictEqual(repaired, null);
});

// ─── 5. Validate and Repair ───────────────────────────────────────

console.log('\n5. Validate and Repair');

test('validateAndRepair returns direct parse for valid JSON', () => {
  const schema = { type: 'object', properties: { action: { type: 'string' } } };
  const { data, repaired, strategy, error } = validateAndRepair('{"action":"test"}', schema);
  assert(data !== null);
  assert.strictEqual(repaired, false);
  assert.strictEqual(strategy, 'direct_parse');
  assert.strictEqual(error, null);
});

test('validateAndRepair repairs code block JSON', () => {
  const schema = { type: 'object', properties: { action: { type: 'string' } } };
  const text = '```json\n{"action":"test"}\n```';
  const { data, repaired, strategy } = validateAndRepair(text, schema);
  assert(data !== null);
  assert.strictEqual(repaired, true);
  assert.strictEqual(strategy, 'code_block_extract');
});

test('validateAndRepair uses custom validation', () => {
  const schema = { type: 'object' };
  const validateFn = (data) => {
    if (!data.action) return 'Missing action';
    return null;
  };
  const { data, error } = validateAndRepair('{"action":"test"}', schema, validateFn);
  assert(data !== null);
  assert.strictEqual(error, null);
});

test('validateAndRepair fails when custom validation fails', () => {
  const schema = { type: 'object' };
  const validateFn = (data) => {
    if (!data.action) return 'Missing action';
    return null;
  };
  const { data, error } = validateAndRepair('{"content":"test"}', schema, validateFn);
  assert.strictEqual(data, null);
  assert(error !== null);
});

// ─── 6. Reliable Provider ─────────────────────────────────────────

console.log('\n6. Reliable Provider');

test('createReliableProvider wraps primary provider', async () => {
  const mock = createMockProvider();
  const reliable = createReliableProvider(mock, { retryConfig: { baseDelayMs: 10 } });
  const result = await reliable.generate({ prompt: 'test' });
  assert.strictEqual(result.text, 'Mock response');
});

test('createReliableProvider retries on transient failure', async () => {
  const mock = createMockProvider({
    errors: [
      new AIError({ category: AI_ERROR_CATEGORIES.TIMEOUT, message: 'timeout', retryable: true }),
    ],
    responses: [{ text: 'recovered', provider: 'mock', model: 'mock', durationMs: 50 }],
  });
  const reliable = createReliableProvider(mock, { retryConfig: { baseDelayMs: 10, maxDelayMs: 50 } });
  const result = await reliable.generate({ prompt: 'test' });
  assert.strictEqual(result.text, 'recovered');
  assert.strictEqual(mock.getCallCount(), 2);
});

test('createReliableProvider does NOT retry on auth failure', async () => {
  const mock = createMockProvider({
    errors: [
      new AIError({ category: AI_ERROR_CATEGORIES.AUTHENTICATION, message: 'auth', retryable: false }),
    ],
  });
  const reliable = createReliableProvider(mock, { retryConfig: { baseDelayMs: 10 } });
  try {
    await reliable.generate({ prompt: 'test' });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.strictEqual(err.category, AI_ERROR_CATEGORIES.AUTHENTICATION);
    assert.strictEqual(mock.getCallCount(), 1);
  }
});

test('createReliableProvider uses fallback on exhausted retries', async () => {
  const primary = createMockProvider({
    errors: [
      new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network', retryable: true }),
      new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network', retryable: true }),
    ],
  });
  const fallback = createMockProvider({
    responses: [{ text: 'from fallback', provider: 'fallback', model: 'fallback-model', durationMs: 50 }],
  });
  const reliable = createReliableProvider(primary, {
    retryConfig: { baseDelayMs: 10, maxRetries: 1 },
    fallbackProvider: fallback,
  });
  const result = await reliable.generate({ prompt: 'test' });
  assert.strictEqual(result.text, 'from fallback');
});

test('createReliableProvider structuredGenerateWithRepair repairs invalid JSON', async () => {
  const primary = createMockProvider({
    errors: [
      new AIError({
        category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
        message: 'schema mismatch',
        retryable: false,
        detail: '{"action":"final_response","content":"test"}',
      }),
    ],
  });
  const reliable = createReliableProvider(primary, { retryConfig: { baseDelayMs: 10 } });
  const result = await reliable.structuredGenerateWithRepair({
    prompt: 'test',
    schema: { type: 'object', properties: { action: { type: 'string' } } },
  });
  assert(result.data !== null);
  assert.strictEqual(result._repaired, true);
});

test('createReliableProvider metadata includes retry config', () => {
  const mock = createMockProvider();
  const reliable = createReliableProvider(mock, { retryConfig: { maxRetries: 5 } });
  const meta = reliable.metadata();
  assert.strictEqual(meta.retryConfig.maxRetries, 5);
  assert.strictEqual(meta.hasFallback, false);
});

test('createReliableProvider with fallback reports hasFallback', () => {
  const primary = createMockProvider();
  const fallback = createMockProvider();
  const reliable = createReliableProvider(primary, { fallbackProvider: fallback });
  const meta = reliable.metadata();
  assert.strictEqual(meta.hasFallback, true);
});

// ─── 7. Error Classification ──────────────────────────────────────

console.log('\n7. Error Classification');

test('classifyAiFailure: rate limit → USER_ACTION_REQUIRED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.RATE_LIMIT, message: 'rate limit' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'USER_ACTION_REQUIRED');
  assert.strictEqual(result.retryable, true);
  assert(result.message.includes('rate limit') || result.message.includes('Rate'));
});

test('classifyAiFailure: timeout → USER_ACTION_REQUIRED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.TIMEOUT, message: 'timeout' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'USER_ACTION_REQUIRED');
  assert.strictEqual(result.retryable, true);
});

test('classifyAiFailure: network → USER_ACTION_REQUIRED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'USER_ACTION_REQUIRED');
  assert.strictEqual(result.retryable, true);
});

test('classifyAiFailure: auth → FAILED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.AUTHENTICATION, message: 'auth' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'FAILED');
  assert.strictEqual(result.retryable, false);
});

test('classifyAiFailure: invalid config → FAILED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.INVALID_CONFIGURATION, message: 'config' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'FAILED');
  assert.strictEqual(result.retryable, false);
});

test('classifyAiFailure: schema validation → FAILED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION, message: 'schema' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'FAILED');
  assert.strictEqual(result.retryable, false);
});

test('classifyAiFailure: provider unavailable → USER_ACTION_REQUIRED', () => {
  const error = new AIError({ category: AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE, message: 'unavailable' });
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'USER_ACTION_REQUIRED');
  assert.strictEqual(result.retryable, true);
});

test('classifyAiFailure: generic error → USER_ACTION_REQUIRED', () => {
  const error = new Error('something went wrong');
  const result = classifyAiFailure(error);
  assert.strictEqual(result.jobState, 'USER_ACTION_REQUIRED');
  assert.strictEqual(result.retryable, true);
});

test('classifyAiFailure messages do NOT expose API keys', () => {
  const categories = [
    AI_ERROR_CATEGORIES.RATE_LIMIT,
    AI_ERROR_CATEGORIES.TIMEOUT,
    AI_ERROR_CATEGORIES.NETWORK,
    AI_ERROR_CATEGORIES.AUTHENTICATION,
    AI_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
  ];
  for (const cat of categories) {
    const error = new AIError({ category: cat, message: 'test with key=abc123secret' });
    const result = classifyAiFailure(error);
    assert(!result.message.includes('abc123secret'), `Message for ${cat} should not contain secrets`);
  }
});

// ─── 8. Integration ───────────────────────────────────────────────

console.log('\n8. Integration');

test('reliable provider works end-to-end with retry', async () => {
  let attempts = 0;
  const mock = createMockProvider({
    errors: [
      new AIError({ category: AI_ERROR_CATEGORIES.TIMEOUT, message: 'timeout', retryable: true }),
    ],
    responses: [{ text: 'recovered', provider: 'mock', model: 'mock', durationMs: 50 }],
  });

  const reliable = createReliableProvider(mock, {
    retryConfig: { baseDelayMs: 10, maxDelayMs: 50 },
    onRetry: (attempt) => { attempts = attempt; },
  });

  const result = await reliable.generate({ prompt: 'test' });
  assert.strictEqual(result.text, 'recovered');
  assert(attempts >= 1);
});

test('reliable provider with fallback on network error', async () => {
  const primary = createMockProvider({
    errors: [
      new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network', retryable: true }),
      new AIError({ category: AI_ERROR_CATEGORIES.NETWORK, message: 'network', retryable: true }),
    ],
  });
  const fallback = createMockProvider({
    responses: [{ text: 'fallback result', provider: 'fallback', model: 'fb', durationMs: 30 }],
  });

  let fallbackUsed = false;
  const reliable = createReliableProvider(primary, {
    retryConfig: { baseDelayMs: 10, maxRetries: 1 },
    fallbackProvider: fallback,
    onFallback: () => { fallbackUsed = true; },
  });

  const result = await reliable.generate({ prompt: 'test' });
  assert.strictEqual(result.text, 'fallback result');
  assert(fallbackUsed);
});

test('reliable provider structuredGenerate with repair cycle', async () => {
  // First call returns invalid JSON, repair should fix it
  const mock = createMockProvider({
    errors: [
      new AIError({
        category: AI_ERROR_CATEGORIES.SCHEMA_VALIDATION,
        message: 'schema',
        retryable: false,
        detail: '{"action":"final_response","content":"repaired content"}',
      }),
    ],
  });

  const reliable = createReliableProvider(mock, { retryConfig: { baseDelayMs: 10 } });
  const result = await reliable.structuredGenerateWithRepair({
    prompt: 'test',
    schema: {
      type: 'object',
      properties: { action: { type: 'string' }, content: { type: 'string' } },
      required: ['action'],
    },
  });

  assert(result.data !== null);
  assert.strictEqual(result.data.action, 'final_response');
  assert.strictEqual(result._repaired, true);
});

// ─── Summary ───────────────────────────────────────────────────────

console.log(`\n==================================================`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
}
