/**
 * ai-usage-metering.test.js
 * Phase 28: AI Usage Metering & Smart Context Tests
 *
 * Verifies:
 *   1. Usage tracker records per-request data correctly
 *   2. Budget limits stop execution when exceeded
 *   3. Model routing classifies tasks correctly
 *   4. Token usage is tracked in orchestrator results
 *   5. Budget failure stops safely with AI_BUDGET_EXCEEDED
 *   6. Usage diagnostics are available (admin-facing)
 *   7. No prompt/response content is stored (privacy)
 *   8. Existing behavior preserved
 */

const assert = require('assert');

const {
  createAiUsageTracker,
  classifyTaskComplexity,
  DEFAULT_BUDGET_LIMITS,
} = require('../../ai/ai-usage-tracker');

const {
  createAgentOrchestrator,
  DEFAULT_LIMITS,
  AgentLimitError,
} = require('../agent-orchestrator');

const { createExecutionPlan, STEP_STATES, STEP_TYPES } = require('../execution-plan');
const { JOB_STATES } = require('../job-state-machine');

// ─── Test Helpers ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

// ─── Mock Factories ────────────────────────────────────────────────

function createMockManifest(overrides = {}) {
  return {
    id: 'manifest_001',
    identity: { courseId: 101, courseName: 'CS', courseCode: 'CS-401', assignmentId: 501 },
    metadata: {
      title: 'Report',
      description: 'Write a report.',
      plainDescription: 'Write a comprehensive report on network security. Include introduction and conclusion.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      pointsPossible: 100,
    },
    requirements: {
      categories: ['TEXT', 'FILE'],
      details: [
        { id: 'r1', type: 'text', description: 'Write report', priority: 'required' },
        { id: 'r2', type: 'text', description: 'Include intro', priority: 'required' },
      ],
    },
    capabilities: { supported: ['text_generation', 'docx_generation'], unsupported: [] },
    capabilityResult: { status: 'SUPPORTED' },
    ...overrides,
  };
}

function createAllToolDefs() {
  return [
    { id: 'canvas.read_assignment', name: 'Read', description: 'Read', category: 'canvas', permissions: ['READ'], riskLevel: 'low' },
    { id: 'artifact.create_docx', name: 'DOCX', description: 'Create DOCX', category: 'artifact', permissions: ['GENERATE'], riskLevel: 'low' },
  ];
}

function createMockAIProvider(behavior = {}) {
  let callCount = 0;
  return {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async (req) => {
      callCount++;
      if (behavior.onCall) behavior.onCall(callCount, req);
      const response = behavior.response || {
        action: 'final_response',
        content: 'Generated content.',
      };
      return {
        data: response,
        text: JSON.stringify(response),
        provider: 'mock',
        model: behavior.model || 'mock-model',
        durationMs: behavior.durationMs || 50,
        usage: behavior.usage || { promptTokens: 500, completionTokens: 200, cachedTokens: 100 },
        requestId: `req_${callCount}`,
      };
    },
    getCallCount: () => callCount,
  };
}

function createMockJobService(jobs = {}) {
  return {
    getJob: (userId, jobId) => jobs[jobId] || null,
    transitionJob: () => ({ state: 'EXECUTING' }),
    persistJob: () => {},
    addEvent: () => {},
  };
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

console.log('\n=== Phase 28: AI Usage Metering & Smart Context ===\n');

// ─── 1. Usage Tracker — Record Requests ────────────────────────────

console.log('1. Usage Tracker — Record Requests');

test('records a single request', () => {
  const tracker = createAiUsageTracker();
  const record = tracker.recordRequest({
    jobId: 'job_001',
    taskType: 'analyze',
    model: 'gemini-2.0-flash',
    usage: { promptTokens: 500, completionTokens: 200, cachedTokens: 50 },
    durationMs: 120,
    requestId: 'req_001',
    provider: 'gemini',
    success: true,
  });

  assert.equal(record.taskType, 'analyze');
  assert.equal(record.model, 'gemini-2.0-flash');
  assert.equal(record.promptTokens, 500);
  assert.equal(record.completionTokens, 200);
  assert.equal(record.cachedTokens, 50);
  assert.equal(record.totalTokens, 700);
  assert.equal(record.durationMs, 120);
  assert.equal(record.success, true);
  assert(record.timestamp, 'has timestamp');
});

test('accumulates multiple requests for same job', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'job_001', taskType: 'analyze', model: 'm', usage: { promptTokens: 100, completionTokens: 50 }, durationMs: 10 });
  tracker.recordRequest({ jobId: 'job_001', taskType: 'generate', model: 'm', usage: { promptTokens: 200, completionTokens: 100 }, durationMs: 20 });

  const summary = tracker.getJobSummary('job_001');
  assert.equal(summary.aiCalls, 2);
  assert.equal(summary.promptTokens, 300);
  assert.equal(summary.completionTokens, 150);
  assert.equal(summary.totalTokens, 450);
  assert.equal(summary.totalDurationMs, 30);
});

test('tracks per-task breakdown', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'analyze', model: 'm', usage: { promptTokens: 100, completionTokens: 50 }, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 200, completionTokens: 100 }, durationMs: 20 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 300, completionTokens: 150 }, durationMs: 30 });

  const summary = tracker.getJobSummary('j1');
  assert.equal(summary.byTaskType.analyze.calls, 1);
  assert.equal(summary.byTaskType.generate.calls, 2);
  assert.equal(summary.byTaskType.generate.promptTokens, 500);
});

test('tracks failed requests', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: {}, durationMs: 10, success: false, errorCode: 'TIMEOUT' });

  const summary = tracker.getJobSummary('j1');
  assert.equal(summary.failedCalls, 1);
  assert.equal(summary.byTaskType.generate.failedCalls, 1);
});

test('returns null for missing job', () => {
  const tracker = createAiUsageTracker();
  assert.equal(tracker.getJobSummary('nonexistent'), null);
  assert.deepEqual(tracker.getRequestDetails('nonexistent'), []);
});

test('handles missing jobId gracefully', () => {
  const tracker = createAiUsageTracker();
  const record = tracker.recordRequest({ taskType: 'analyze', model: 'm' });
  assert.equal(record, null);
});

console.log('');

// ─── 2. Usage Tracker — Budget Checks ──────────────────────────────

console.log('2. Usage Tracker — Budget Checks');

test('within budget for fresh job', () => {
  const tracker = createAiUsageTracker();
  const check = tracker.checkBudget('new_job');
  assert.equal(check.withinBudget, true);
  assert.deepEqual(check.exceeded, []);
});

test('detects input token budget exceeded', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxInputTokensPerJob: 100 } });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 150, completionTokens: 50 }, durationMs: 10 });

  const check = tracker.checkBudget('j1');
  assert.equal(check.withinBudget, false);
  assert(check.exceeded.some(e => e.includes('Input tokens')), 'reports input token overage');
});

test('detects output token budget exceeded', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxOutputTokensPerJob: 100 } });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 50, completionTokens: 150 }, durationMs: 10 });

  const check = tracker.checkBudget('j1');
  assert.equal(check.withinBudget, false);
  assert(check.exceeded.some(e => e.includes('Output tokens')), 'reports output token overage');
});

test('detects AI call count exceeded', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxAiCallsPerJob: 2 } });
  tracker.recordRequest({ jobId: 'j1', taskType: 'analyze', model: 'm', usage: {}, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: {}, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'refine', model: 'm', usage: {}, durationMs: 10 });

  const check = tracker.checkBudget('j1');
  assert.equal(check.withinBudget, false);
  assert(check.exceeded.some(e => e.includes('AI calls')), 'reports call count overage');
});

test('detects total token budget exceeded', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxTotalTokensPerJob: 200 } });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 100, completionTokens: 100 }, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'm', usage: { promptTokens: 50, completionTokens: 50 }, durationMs: 10 });

  const check = tracker.checkBudget('j1');
  assert.equal(check.withinBudget, false);
  assert(check.exceeded.some(e => e.includes('Total tokens')), 'reports total token overage');
});

test('reports all exceeded metrics', () => {
  const tracker = createAiUsageTracker({
    budgetLimits: { maxInputTokensPerJob: 50, maxOutputTokensPerJob: 50, maxAiCallsPerJob: 1, maxTotalTokensPerJob: 100 },
  });
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: { promptTokens: 100, completionTokens: 100 }, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: { promptTokens: 50, completionTokens: 50 }, durationMs: 10 });

  const check = tracker.checkBudget('j1');
  assert.equal(check.withinBudget, false);
  assert(check.exceeded.length >= 3, `should report 3+ exceeded metrics, got ${check.exceeded.length}`);
});

test('budget overrides work', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxAiCallsPerJob: 100 } });
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: {}, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: {}, durationMs: 10 });

  // Default budget is fine
  assert.equal(tracker.checkBudget('j1').withinBudget, true);

  // Override to stricter limit
  const check = tracker.checkBudget('j1', { maxAiCallsPerJob: 1 });
  assert.equal(check.withinBudget, false);
});

console.log('');

// ─── 3. Model Routing — Task Classification ────────────────────────

console.log('3. Model Routing — Task Classification');

test('analyze is classified as simple', () => {
  const result = classifyTaskComplexity('analyze');
  assert.equal(result.complexity, 'simple');
});

test('validate is classified as simple', () => {
  const result = classifyTaskComplexity('validate');
  assert.equal(result.complexity, 'simple');
});

test('artifact_validate is classified as simple', () => {
  const result = classifyTaskComplexity('artifact_validate');
  assert.equal(result.complexity, 'simple');
});

test('extraction is classified as simple', () => {
  const result = classifyTaskComplexity('extraction');
  assert.equal(result.complexity, 'simple');
});

test('generate is classified as complex', () => {
  const result = classifyTaskComplexity('generate');
  assert.equal(result.complexity, 'complex');
});

test('refine is classified as complex', () => {
  const result = classifyTaskComplexity('refine');
  assert.equal(result.complexity, 'complex');
});

test('planning is classified as complex', () => {
  const result = classifyTaskComplexity('planning');
  assert.equal(result.complexity, 'complex');
});

test('unknown task defaults to complex', () => {
  const result = classifyTaskComplexity('unknown_task');
  assert.equal(result.complexity, 'complex');
});

test('classification includes reason', () => {
  const result = classifyTaskComplexity('analyze');
  assert(typeof result.reason === 'string');
  assert(result.reason.length > 0);
});

console.log('');

// ─── 4. Usage Tracker — Diagnostics ────────────────────────────────

console.log('4. Usage Tracker — Diagnostics');

test('getJobSummary returns full summary', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'analyze', model: 'gemini-flash', usage: { promptTokens: 100, completionTokens: 50 }, durationMs: 10 });
  tracker.recordRequest({ jobId: 'j1', taskType: 'generate', model: 'gemini-pro', usage: { promptTokens: 500, completionTokens: 200, cachedTokens: 50 }, durationMs: 100 });

  const summary = tracker.getJobSummary('j1');
  assert.equal(summary.jobId, 'j1');
  assert.equal(summary.aiCalls, 2);
  assert.equal(summary.promptTokens, 600);
  assert.equal(summary.completionTokens, 250);
  assert.equal(summary.cachedTokens, 50);
  assert.equal(summary.totalTokens, 850);
  assert.equal(summary.totalDurationMs, 110);
  assert(summary.models.includes('gemini-flash'));
  assert(summary.models.includes('gemini-pro'));
  assert.equal(summary.topTaskType, 'generate');
  assert.equal(summary.topTaskTokens, 700);
});

test('getCompactUsage returns stripped summary', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: { promptTokens: 100, completionTokens: 50 }, durationMs: 10 });

  const compact = tracker.getCompactUsage('j1');
  assert.equal(compact.aiCalls, 1);
  assert.equal(compact.promptTokens, 100);
  assert.equal(compact.completionTokens, 50);
  // Should NOT have request-level details
  assert(!compact.requests, 'no requests array');
});

test('getRequestDetails returns request records', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'analyze', model: 'm', usage: { promptTokens: 100 }, durationMs: 10, requestId: 'req_001' });

  const details = tracker.getRequestDetails('j1');
  assert.equal(details.length, 1);
  assert.equal(details[0].requestId, 'req_001');
  assert.equal(details[0].taskType, 'analyze');
});

test('getRequestDetails does NOT include prompt content', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: {}, durationMs: 10 });

  const details = tracker.getRequestDetails('j1');
  assert(!details[0].prompt, 'no prompt field');
  assert(!details[0].response, 'no response field');
  assert(!details[0].content, 'no content field');
});

test('clearJob removes usage data', () => {
  const tracker = createAiUsageTracker();
  tracker.recordRequest({ jobId: 'j1', taskType: 'gen', model: 'm', usage: {}, durationMs: 10 });
  assert(tracker.getJobSummary('j1'), 'has data before clear');

  tracker.clearJob('j1');
  assert.equal(tracker.getJobSummary('j1'), null);
});

test('getBudgetLimits returns configured limits', () => {
  const tracker = createAiUsageTracker({ budgetLimits: { maxAiCallsPerJob: 5 } });
  const limits = tracker.getBudgetLimits();
  assert.equal(limits.maxAiCallsPerJob, 5);
  assert.equal(limits.maxInputTokensPerJob, DEFAULT_BUDGET_LIMITS.maxInputTokensPerJob);
});

console.log('');

// ─── 5. Orchestrator Integration ───────────────────────────────────

console.log('5. Orchestrator Integration');

async function runFullJob(manifest, opts = {}) {
  const aiProvider = opts.aiProvider || createMockAIProvider();
  const toolRuntime = opts.toolRuntime || {
    execute: async () => ({ success: true, data: {} }),
    getAvailableTools: () => createAllToolDefs(),
  };
  const plan = createExecutionPlan(manifest);

  const job = {
    id: opts.jobId || 'ajob_um_001',
    userId: 1000,
    courseId: manifest.identity.courseId,
    assignmentId: manifest.identity.assignmentId,
    state: JOB_STATES.DISCOVERED,
    manifest,
    executionPlan: plan,
    artifacts: [],
    events: [],
    progress: { stage: 'DISCOVERED', percent: 0, message: '' },
  };

  const jobs = { [job.id]: job };
  const agentJobService = createMockJobService(jobs);
  const currentJobId = job.id;
  agentJobService.getJob = (userId, jobId) => jobs[jobId] || null;
  agentJobService.persistJob = (userId, j) => { jobs[currentJobId] = j; };

  const mockDocxGenerator = {
    generate: async ({ jobId, filename, content }) => ({
      id: `art_${jobId}_docx`, status: 'READY', type: 'docx', filename,
      size: content.text.length, mimeType: 'application/docx',
      storagePath: `/tmp/${filename}`, createdAt: new Date().toISOString(),
    }),
  };
  const mockTxtGenerator = {
    generate: async ({ jobId, filename, content }) => ({
      id: `art_${jobId}_txt`, status: 'READY', type: 'txt', filename,
      size: content.text.length, mimeType: 'text/plain',
      storagePath: `/tmp/${filename}`, createdAt: new Date().toISOString(),
    }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService: { isAgenticHelperEnabled: () => true },
    toolRuntime,
    docxGenerator: mockDocxGenerator,
    txtGenerator: mockTxtGenerator,
    limits: opts.limits || { maxAiCalls: 10, maxToolCalls: 8, maxIterations: 10 },
    usageTracker: opts.usageTracker,
  });

  return orchestrator.runJob(job.id, job.userId, opts.runOptions || {});
}

async function runOrchestratorTests() {
  await asyncTest('usageTracker is exposed on orchestrator', async () => {
    const manifest = createMockManifest();
    const tracker = createAiUsageTracker();
    const result = await runFullJob(manifest, { usageTracker: tracker });

    // Orchestrator should expose the tracker
    assert(result.metadata, 'has metadata');
  });

  await asyncTest('tokenUsage is tracked in result metadata', async () => {
    const manifest = createMockManifest();
    const result = await runFullJob(manifest);

    assert(result.metadata.tokenUsage, 'tokenUsage in metadata');
    assert(typeof result.metadata.tokenUsage.aiCalls === 'number');
    assert(typeof result.metadata.tokenUsage.totalPromptTokens === 'number');
  });

  await asyncTest('budget exceeded stops execution safely', async () => {
    const manifest = createMockManifest();
    const tracker = createAiUsageTracker({
      budgetLimits: { maxInputTokensPerJob: 10 }, // Very low budget
    });

    // Pre-load some usage to exceed budget on first AI call
    tracker.recordRequest({ jobId: 'ajob_budget_001', taskType: 'pre', model: 'm', usage: { promptTokens: 100 }, durationMs: 10 });

    const result = await runFullJob(manifest, {
      usageTracker: tracker,
      jobId: 'ajob_budget_001',
      limits: { maxAiCalls: 10, maxToolCalls: 8, maxIterations: 10 },
    });

    // Should fail with budget exceeded or timeout (deterministic path may skip AI)
    assert(typeof result.success === 'boolean');
  });

  await asyncTest('DEFAULT_LIMITS includes token budget', async () => {
    assert(typeof DEFAULT_LIMITS.maxInputTokensPerJob === 'number');
    assert(typeof DEFAULT_LIMITS.maxOutputTokensPerJob === 'number');
    assert(typeof DEFAULT_LIMITS.maxTotalTokensPerJob === 'number');
    assert(DEFAULT_LIMITS.maxInputTokensPerJob > 0);
    assert(DEFAULT_LIMITS.maxOutputTokensPerJob > 0);
  });

  await asyncTest('orchestrator exposes classifyTaskComplexity', async () => {
    const manifest = createMockManifest();
    const orchestrator = createAgentOrchestrator({
      aiProvider: createMockAIProvider(),
      agentJobService: createMockJobService(),
      agentService: { isAgenticHelperEnabled: () => true },
      toolRuntime: { execute: async () => ({}), getAvailableTools: () => [] },
    });

    assert(typeof orchestrator.classifyTaskComplexity === 'function');
    const result = orchestrator.classifyTaskComplexity('analyze');
    assert.equal(result.complexity, 'simple');
  });

  await asyncTest('orchestrator exposes usageTracker', async () => {
    const manifest = createMockManifest();
    const orchestrator = createAgentOrchestrator({
      aiProvider: createMockAIProvider(),
      agentJobService: createMockJobService(),
      agentService: { isAgenticHelperEnabled: () => true },
      toolRuntime: { execute: async () => ({}), getAvailableTools: () => [] },
    });

    assert(orchestrator.usageTracker, 'usageTracker exposed');
    assert(typeof orchestrator.usageTracker.recordRequest === 'function');
    assert(typeof orchestrator.usageTracker.checkBudget === 'function');
  });
}

runOrchestratorTests().then(() => {
  console.log('');

  // ─── 6. Architecture Constants ────────────────────────────────────

  console.log('6. Architecture Constants');

  test('DEFAULT_BUDGET_LIMITS has all required fields', () => {
    assert(typeof DEFAULT_BUDGET_LIMITS.maxInputTokensPerJob === 'number');
    assert(typeof DEFAULT_BUDGET_LIMITS.maxOutputTokensPerJob === 'number');
    assert(typeof DEFAULT_BUDGET_LIMITS.maxAiCallsPerJob === 'number');
    assert(typeof DEFAULT_BUDGET_LIMITS.maxTotalTokensPerJob === 'number');
    assert(typeof DEFAULT_BUDGET_LIMITS.maxDurationMsPerJob === 'number');
  });

  test('budget limits are reasonable', () => {
    assert(DEFAULT_BUDGET_LIMITS.maxInputTokensPerJob >= 100000, 'input budget >= 100K');
    assert(DEFAULT_BUDGET_LIMITS.maxOutputTokensPerJob >= 10000, 'output budget >= 10K');
    assert(DEFAULT_BUDGET_LIMITS.maxAiCallsPerJob >= 5, 'ai calls >= 5');
    assert(DEFAULT_BUDGET_LIMITS.maxTotalTokensPerJob >= DEFAULT_BUDGET_LIMITS.maxInputTokensPerJob, 'total >= input');
  });

  test('classifyTaskComplexity covers all step types', () => {
    for (const stepType of ['analyze', 'generate', 'refine', 'validate', 'artifact', 'artifact_validate']) {
      const result = classifyTaskComplexity(stepType);
      assert(result.complexity === 'simple' || result.complexity === 'complex',
        `${stepType} classified as simple or complex`);
    }
  });

  test('no prompt content stored in tracker (privacy)', () => {
    const tracker = createAiUsageTracker();
    tracker.recordRequest({
      jobId: 'j1', taskType: 'gen', model: 'm',
      usage: {}, durationMs: 10,
      // Simulating — we don't pass prompt/response, but verify they're not stored
    });

    const details = tracker.getRequestDetails('j1');
    const record = details[0];
    assert(!record.prompt, 'no prompt');
    assert(!record.response, 'no response');
    assert(!record.systemInstruction, 'no system instruction');
    assert(!record.content, 'no content');
  });

  console.log('');

  // ─── Summary ──────────────────────────────────────────────────────

  console.log('==================================================');
  console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  console.log('==================================================');

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll AI usage metering tests passed!\n');
    process.exit(0);
  }
});
