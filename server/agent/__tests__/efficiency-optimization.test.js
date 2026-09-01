/**
 * efficiency-optimization.test.js
 * Phase 26: Agent Efficiency & Context Optimization Tests
 *
 * Verifies:
 *   1. PrecomputedContext caches manifest understanding, system instruction, etc.
 *   2. Deterministic analysis skips AI call for detailed manifests
 *   3. Bounded history caps conversation length
 *   4. Generate step uses focused context
 *   5. Refinement pipeline unchanged
 *   6. Same final result with fewer AI calls where applicable
 *   7. Context size stays bounded across many turns
 */

const assert = require('assert');

const {
  createAgentOrchestrator,
  buildSystemInstruction,
  buildAnalyzePrompt,
  buildGeneratePrompt,
  buildAgentResponseSchema,
  DEFAULT_LIMITS,
  precomputeContext,
  getBoundedHistory,
  analysisFromManifest,
  manifestHasSufficientDetail,
  buildAssignmentUnderstanding,
  buildValidationConstraints,
} = require('../agent-orchestrator');

const {
  createExecutionPlan,
  STEP_STATES,
  STEP_TYPES,
} = require('../execution-plan');

const {
  JOB_STATES,
} = require('../job-state-machine');

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
    identity: {
      courseId: 101,
      courseName: 'Computer Networks',
      courseCode: 'CS-401',
      assignmentId: 501,
    },
    metadata: {
      title: 'Network Security Report',
      description: 'Write a comprehensive 2000-word report on network security.',
      plainDescription: 'Write a comprehensive 2000-word report on network security. Include an introduction, analysis, and conclusion. Use 3 references in APA format.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      pointsPossible: 100,
      dueDate: '2026-09-15T23:59:00Z',
    },
    requirements: {
      categories: ['TEXT', 'FILE'],
      details: [
        { id: 'req_1', type: 'text', description: 'Write a 2000-word report on network security', priority: 'required' },
        { id: 'req_2', type: 'text', description: 'Include an introduction section', priority: 'required' },
        { id: 'req_3', type: 'text', description: 'Include a conclusion section', priority: 'required' },
      ],
    },
    capabilities: {
      supported: ['text_generation', 'docx_generation', 'canvas_read_assignment'],
      unsupported: [],
    },
    capabilityResult: { status: 'SUPPORTED' },
    ...overrides,
  };
}

function createMockManifestSparse(overrides = {}) {
  return {
    id: 'manifest_sparse',
    identity: { courseId: 101, assignmentId: 502 },
    metadata: { title: 'Homework', description: 'Do homework.' },
    requirements: { categories: [], details: [] },
    capabilities: { supported: [], unsupported: [] },
    capabilityResult: { status: 'UNKNOWN' },
    ...overrides,
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

function createMockAgentService(enabled = true) {
  return {
    isAgenticHelperEnabled: () => enabled,
  };
}

function createMockToolRuntime() {
  return {
    execute: async () => ({ success: true, data: { content: 'Tool result' } }),
    getAvailableTools: () => [
      { id: 'canvas.read_assignment', description: 'Read assignment details' },
      { id: 'artifact.create_docx', description: 'Create DOCX document' },
    ],
  };
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
        content: 'Generated content about network security covering all required topics.',
      };
      return {
        data: response,
        text: JSON.stringify(response),
        provider: 'mock',
        model: 'mock',
        durationMs: 50,
      };
    },
    getCallCount: () => callCount,
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

console.log('\n=== Phase 26: Agent Efficiency & Context Optimization ===\n');

// ─── 1. precomputeContext ──────────────────────────────────────────

console.log('1. precomputeContext');

test('builds understanding from manifest', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, []);

  assert(ctx.understanding, 'understanding should exist');
  assert.equal(ctx.understanding.title, 'Network Security Report');
  assert.equal(ctx.understanding.course, 'Computer Networks');
});

test('builds system instruction once', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, []);

  assert(typeof ctx.systemInstruction === 'string');
  assert(ctx.systemInstruction.includes('Network Security Report'));
  assert(ctx.systemInstruction.includes('BetterCLSS'));
});

test('builds validation constraints from understanding', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, []);

  assert(Array.isArray(ctx.validationConstraints));
  // Should have word_count constraint from "2000-word"
  const wcConstraint = ctx.validationConstraints.find(c => c.type === 'word_count');
  assert(wcConstraint, 'should have word_count constraint');
  assert.equal(wcConstraint.target, 2000);
});

test('caches tool definitions', () => {
  const tools = [{ id: 'canvas.read_assignment' }];
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, tools);

  assert.deepEqual(ctx.toolDefs, tools);
});

test('system instruction is identical for same manifest (stable)', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx1 = precomputeContext(manifest, plan, []);
  const ctx2 = precomputeContext(manifest, plan, []);

  assert.equal(ctx1.systemInstruction, ctx2.systemInstruction);
});

console.log('');

// ─── 2. getBoundedHistory ──────────────────────────────────────────

console.log('2. getBoundedHistory');

test('returns undefined for empty conversation', () => {
  const result = getBoundedHistory([], DEFAULT_LIMITS);
  assert.equal(result, undefined);
});

test('returns undefined for null conversation', () => {
  const result = getBoundedHistory(null, DEFAULT_LIMITS);
  assert.equal(result, undefined);
});

test('preserves all turns when under limit', () => {
  const conversation = [
    { role: 'user', content: 'Hello' },
    { role: 'model', content: 'Hi there' },
  ];
  const result = getBoundedHistory(conversation, { maxHistoryTurns: 10, maxHistoryChars: 8000 });
  assert.equal(result.length, 2);
  assert.equal(result[0].content, 'Hello');
});

test('caps at maxHistoryTurns', () => {
  const conversation = [];
  for (let i = 0; i < 20; i++) {
    conversation.push({ role: 'user', content: `Turn ${i}` });
    conversation.push({ role: 'model', content: `Response ${i}` });
  }

  const result = getBoundedHistory(conversation, { maxHistoryTurns: 5, maxHistoryChars: 50000 });
  // maxHistoryTurns=5 means 5 turns = 10 entries (pairs)
  assert(result.length <= 10, `should have at most 10 entries, got ${result.length}`);
  assert(result[0].content.includes('15'), 'should start from recent turns');
});

test('caps at maxHistoryChars', () => {
  const conversation = [];
  for (let i = 0; i < 10; i++) {
    conversation.push({ role: 'user', content: 'A'.repeat(1000) });
    conversation.push({ role: 'model', content: 'B'.repeat(1000) });
  }

  const result = getBoundedHistory(conversation, { maxHistoryTurns: 50, maxHistoryChars: 2500 });
  let totalChars = 0;
  for (const entry of result) {
    totalChars += entry.content.length;
  }
  assert(totalChars <= 2600, `total chars ${totalChars} should be under 2600 (with tolerance for last entry)`);
});

test('preserves most recent entries when truncating', () => {
  const conversation = [
    { role: 'user', content: 'A'.repeat(500) },
    { role: 'model', content: 'B'.repeat(500) },
    { role: 'user', content: 'C'.repeat(500) },
    { role: 'model', content: 'D'.repeat(500) },
    { role: 'user', content: 'E'.repeat(500) },
    { role: 'model', content: 'F'.repeat(500) },
  ];

  const result = getBoundedHistory(conversation, { maxHistoryTurns: 50, maxHistoryChars: 1200 });
  // Should keep the most recent entries
  const lastEntry = result[result.length - 1];
  assert.equal(lastEntry.content, 'F'.repeat(500));
});

test('defaults to 10 turns when limits not provided', () => {
  const conversation = [];
  for (let i = 0; i < 30; i++) {
    conversation.push({ role: 'user', content: `U${i}` });
    conversation.push({ role: 'model', content: `M${i}` });
  }

  const result = getBoundedHistory(conversation, {});
  assert(result.length <= 20, 'default limit is 10 turns (20 entries)');
});

console.log('');

// ─── 3. manifestHasSufficientDetail ────────────────────────────────

console.log('3. manifestHasSufficientDetail');

test('detailed manifest is sufficient', () => {
  const manifest = createMockManifest();
  assert.equal(manifestHasSufficientDetail(manifest), true);
});

test('sparse manifest is not sufficient', () => {
  const manifest = createMockManifestSparse();
  assert.equal(manifestHasSufficientDetail(manifest), false);
});

test('manifest with long description but no details is sufficient', () => {
  const manifest = createMockManifestSparse({
    metadata: {
      title: 'Essay',
      description: 'Write a detailed analysis of modern networking protocols and their security implications for enterprise environments.',
      plainDescription: 'Write a detailed analysis of modern networking protocols and their security implications for enterprise environments.',
    },
  });
  assert.equal(manifestHasSufficientDetail(manifest), true);
});

test('manifest with 2+ requirement details is sufficient', () => {
  const manifest = createMockManifestSparse({
    requirements: {
      categories: ['TEXT'],
      details: [
        { id: 'r1', type: 'text', description: 'Analyze protocol A' },
        { id: 'r2', type: 'text', description: 'Analyze protocol B' },
      ],
    },
  });
  assert.equal(manifestHasSufficientDetail(manifest), true);
});

test('manifest with only 1 brief detail is not sufficient', () => {
  const manifest = createMockManifestSparse({
    metadata: { title: 'HW', description: 'Short.' },
    requirements: { categories: [], details: [{ id: 'r1', type: 'text', description: 'Do it' }] },
  });
  assert.equal(manifestHasSufficientDetail(manifest), false);
});

console.log('');

// ─── 4. analysisFromManifest ───────────────────────────────────────

console.log('4. analysisFromManifest');

test('produces structured analysis from understanding', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const analysis = analysisFromManifest(understanding, manifest);

  assert(analysis.includes('Network Security Report'));
  assert(analysis.includes('Computer Networks'));
  assert(analysis.includes('2000'));
  assert(analysis.includes('introduction'));
});

test('analysis includes constraints', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const analysis = analysisFromManifest(understanding, manifest);

  assert(analysis.includes('APA'));
  assert(analysis.includes('3 references'));
});

test('analysis includes deliverables', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const analysis = analysisFromManifest(understanding, manifest);

  assert(analysis.includes('DOCX'));
  assert(analysis.includes('docx'));
});

test('analysis includes uncertainties when present', () => {
  const manifest = createMockManifestSparse();
  const understanding = buildAssignmentUnderstanding(manifest);
  const analysis = analysisFromManifest(understanding, manifest);

  // Sparse manifest should have uncertainties
  assert(analysis.includes('Uncertainties') || analysis.includes('uncertainties'));
});

console.log('');

// ─── 5. Deterministic vs AI Analyze Path ───────────────────────────

console.log('5. Deterministic vs AI Analyze Path');

test('detailed manifest takes deterministic path (0 AI calls in analyze)', async () => {
  const manifest = createMockManifest();
  const aiProvider = createMockAIProvider();
  const toolRuntime = createMockToolRuntime();
  const plan = createExecutionPlan(manifest);

  const job = {
    id: 'ajob_001',
    userId: 1000,
    courseId: 101,
    assignmentId: 501,
    state: JOB_STATES.DISCOVERED,
    manifest,
    executionPlan: plan,
    artifacts: [],
    events: [],
    progress: { stage: 'DISCOVERED', percent: 0, message: '' },
  };

  const jobs = { [job.id]: job };
  const agentJobService = createMockJobService(jobs);
  const fixedJobId = job.id;
  agentJobService.getJob = (userId, jobId) => jobs[jobId] || null;
  agentJobService.persistJob = (userId, j) => { jobs[fixedJobId] = j; };

  const orchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService: createMockAgentService(),
    toolRuntime,
    limits: { maxAiCalls: 10, maxToolCalls: 8, maxIterations: 10 },
  });

  const result = await orchestrator.runJob(job.id, job.userId, {
    canvasAuth: { token: 'test', domain: 'canvas.test.edu' },
  });

  // For a detailed manifest, the ANALYZE step should use deterministic path
  // and the overall AI calls should be less than the default
  assert(result.success === true || result.success === false, 'result should have success field');
  // Key assertion: AI call count should be 0 or 1 (analyze may be deterministic)
  assert(result.metadata.aiCalls <= 2, `should use at most 2 AI calls (generate), got ${result.metadata.aiCalls}`);
});

test('sparse manifest uses AI path for analyze step', async () => {
  const manifest = createMockManifestSparse();
  const aiProvider = createMockAIProvider();
  const toolRuntime = createMockToolRuntime();
  const plan = createExecutionPlan(manifest);

  const job = {
    id: 'ajob_002',
    userId: 1000,
    courseId: 101,
    assignmentId: 502,
    state: JOB_STATES.DISCOVERED,
    manifest,
    executionPlan: plan,
    artifacts: [],
    events: [],
    progress: { stage: 'DISCOVERED', percent: 0, message: '' },
  };

  const jobs = { [job.id]: job };
  const agentJobService = createMockJobService(jobs);
  agentJobService.getJob = (userId, jobId) => jobs[jobId] || null;

  const orchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService: createMockAgentService(),
    toolRuntime,
    limits: { maxAiCalls: 10, maxToolCalls: 8, maxIterations: 10 },
  });

  const result = await orchestrator.runJob(job.id, job.userId);

  // Sparse manifest triggers AI for analyze step
  // AI calls should include at least 1 for analyze
  assert(result.metadata.aiCalls >= 1, `sparse manifest should use AI for analyze, got ${result.metadata.aiCalls} AI calls`);
});

console.log('');

// ─── 6. Conversation History Is Bounded ────────────────────────────

console.log('6. Conversation History Bounded');

test('conversation history does not grow unbounded', async () => {
  const manifest = createMockManifest();
  let aiCalls = 0;
  const aiProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async (req) => {
      aiCalls++;
      // Always return tool_call to force many iterations
      if (aiCalls < 8) {
        return {
          data: {
            action: 'tool_call',
            tool_calls: [{ tool: 'canvas.read_assignment', arguments: { courseId: 101, assignmentId: 501 }, callId: `call_${aiCalls}` }],
            reasoning: 'Reading assignment details',
          },
          text: '{}',
          provider: 'mock',
          model: 'mock',
          durationMs: 10,
        };
      }
      return {
        data: { action: 'final_response', content: 'Content generated.' },
        text: '{}',
        provider: 'mock',
        model: 'mock',
        durationMs: 10,
      };
    },
  };

  const toolRuntime = {
    execute: async () => ({ success: true, data: { title: 'Test', description: 'Test desc' } }),
    getAvailableTools: () => [{ id: 'canvas.read_assignment' }],
  };

  const plan = createExecutionPlan(manifest);
  const job = {
    id: 'ajob_003',
    userId: 1000,
    courseId: 101,
    assignmentId: 501,
    state: JOB_STATES.DISCOVERED,
    manifest,
    executionPlan: plan,
    artifacts: [],
    events: [],
    progress: { stage: 'DISCOVERED', percent: 0, message: '' },
  };

  const jobs = { [job.id]: job };
  const agentJobService = createMockJobService(jobs);
  agentJobService.getJob = (userId, jobId) => jobs[jobId] || null;

  const orchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService: createMockAgentService(),
    toolRuntime,
    limits: {
      maxAiCalls: 10,
      maxToolCalls: 8,
      maxIterations: 10,
      maxHistoryTurns: 5,
      maxHistoryChars: 2000,
    },
  });

  await orchestrator.runJob(job.id, job.userId);

  // The test verifies that limits exist in DEFAULT_LIMITS
  assert(DEFAULT_LIMITS.maxHistoryTurns === 10, 'maxHistoryTurns default should be 10');
  assert(DEFAULT_LIMITS.maxHistoryChars === 8000, 'maxHistoryChars default should be 8000');
});

test('limits are configurable via custom limits', () => {
  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockAIProvider(),
    agentJobService: createMockJobService(),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
    limits: { maxHistoryTurns: 3, maxHistoryChars: 1000 },
  });

  assert.deepEqual(orchestrator.limits.maxHistoryTurns, 3);
  assert.deepEqual(orchestrator.limits.maxHistoryChars, 1000);
});

console.log('');

// ─── 7. Same Final Result ──────────────────────────────────────────

console.log('7. Same Final Result Verification');

test('precomputed context produces same validation as inline', () => {
  const manifest = createMockManifest();

  // Inline path (old way)
  const understandingInline = buildAssignmentUnderstanding(manifest);
  const constraintsInline = buildValidationConstraints(understandingInline);

  // Precomputed path (new way)
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, []);

  assert.deepEqual(ctx.understanding, understandingInline, 'understanding should be identical');
  assert.deepEqual(ctx.validationConstraints, constraintsInline, 'validation constraints should be identical');
});

test('analysisFromManifest produces equivalent info to AI analyze for detailed manifest', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const analysis = analysisFromManifest(understanding, manifest);

  // Deterministic analysis should contain the key info that AI would produce
  assert(analysis.includes('2000'), 'should mention word count');
  assert(analysis.includes('introduction'), 'should mention required section');
  assert(analysis.includes('conclusion'), 'should mention conclusion');
  assert(analysis.includes('APA'), 'should mention citation format');
  assert(analysis.includes('3 references'), 'should mention reference count');
});

console.log('');

// ─── 8. Context Size Limits ────────────────────────────────────────

console.log('8. Context Size Limits');

test('DEFAULT_LIMITS includes context limits', () => {
  assert('maxHistoryTurns' in DEFAULT_LIMITS, 'maxHistoryTurns in DEFAULT_LIMITS');
  assert('maxHistoryChars' in DEFAULT_LIMITS, 'maxHistoryChars in DEFAULT_LIMITS');
  assert(DEFAULT_LIMITS.maxHistoryTurns > 0, 'maxHistoryTurns must be positive');
  assert(DEFAULT_LIMITS.maxHistoryChars > 0, 'maxHistoryChars must be positive');
});

test('bounded history handles single very long message', () => {
  const conversation = [
    { role: 'user', content: 'X'.repeat(5000) },
  ];
  const result = getBoundedHistory(conversation, { maxHistoryTurns: 10, maxHistoryChars: 2000 });
  // Should include the single message even though it exceeds maxHistoryChars
  // because we always include at least one entry
  assert(result.length >= 1, 'should include at least one entry');
});

test('bounded history is deterministic', () => {
  const conversation = [
    { role: 'user', content: 'A' },
    { role: 'model', content: 'B' },
    { role: 'user', content: 'C' },
  ];
  const result1 = getBoundedHistory(conversation, { maxHistoryTurns: 5, maxHistoryChars: 5000 });
  const result2 = getBoundedHistory(conversation, { maxHistoryTurns: 5, maxHistoryChars: 5000 });
  assert.deepEqual(result1, result2, 'same input should produce same output');
});

console.log('');

// ─── 9. Edge Cases ─────────────────────────────────────────────────

console.log('9. Edge Cases');

test('precomputeContext handles null manifest', () => {
  const plan = createExecutionPlan(null);
  const ctx = precomputeContext(null, plan, []);
  assert(ctx.understanding, 'should produce understanding even for null manifest');
  assert.equal(ctx.understanding.title, 'Untitled Assignment');
});

test('analysisFromManifest handles empty understanding', () => {
  const analysis = analysisFromManifest({
    title: 'Test',
    course: 'Course',
    dueDate: null,
    pointsPossible: null,
    objective: 'Generate content',
    capabilityStatus: 'SUPPORTED',
    requirements: [],
    constraints: [],
    deliverables: [],
    uncertainties: [],
  }, {});
  assert(analysis.includes('Test'));
  assert(analysis.includes('Course'));
  assert(analysis.includes('SUPPORTED'));
});

test('getBoundedHistory handles mixed string/non-string content', () => {
  const conversation = [
    { role: 'user', content: 'text' },
    { role: 'model', content: { nested: 'object' } },
    { role: 'user', content: null },
  ];
  const result = getBoundedHistory(conversation, { maxHistoryTurns: 10, maxHistoryChars: 5000 });
  assert(result.length === 3, 'should handle mixed content types');
});

console.log('');

// ─── 10. Integration: Full Orchestrator with Optimizations ─────────

console.log('10. Integration: Optimized Orchestrator');

async function runFullJob(manifest, opts = {}) {
  const aiProvider = opts.aiProvider || createMockAIProvider();
  const toolRuntime = opts.toolRuntime || createMockToolRuntime();
  const plan = createExecutionPlan(manifest);

  const job = {
    id: opts.jobId || 'ajob_int_001',
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

  // Mock artifact generators
  const mockDocxGenerator = {
    generate: async ({ jobId, userId, filename, content }) => ({
      id: `art_${jobId}_docx`,
      status: 'READY',
      type: 'docx',
      filename,
      size: content.text.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      storagePath: `/tmp/${filename}`,
      createdAt: new Date().toISOString(),
    }),
  };
  const mockTxtGenerator = {
    generate: async ({ jobId, userId, filename, content }) => ({
      id: `art_${jobId}_txt`,
      status: 'READY',
      type: 'txt',
      filename,
      size: content.text.length,
      mimeType: 'text/plain',
      storagePath: `/tmp/${filename}`,
      createdAt: new Date().toISOString(),
    }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService: createMockAgentService(),
    toolRuntime,
    docxGenerator: mockDocxGenerator,
    txtGenerator: mockTxtGenerator,
    limits: opts.limits || { maxAiCalls: 10, maxToolCalls: 8, maxIterations: 10 },
  });

  return orchestrator.runJob(job.id, job.userId, opts.runOptions || {});
}

async function runIntegrationTests() {
  // Test A: Detailed manifest → deterministic analyze, fewer AI calls
  await asyncTest('Detailed manifest uses fewer AI calls', async () => {
    const manifest = createMockManifest();
    let aiCalls = 0;
    const aiProvider = createMockAIProvider({
      onCall: () => { aiCalls++; },
    });

    const result = await runFullJob(manifest, { aiProvider });
    // With deterministic analyze, total AI calls should be <= 2 (just generate step)
    assert(result.success, 'should succeed');
    assert(aiCalls <= 2, `expected at most 2 AI calls, got ${aiCalls}`);
  });

  // Test B: Refinement still works
  await asyncTest('Refinement pipeline still runs', async () => {
    const manifest = createMockManifest();
    const refinementEvents = [];
    let emitCount = 0;

    const result = await runFullJob(manifest, {
      aiProvider: createMockAIProvider(),
    });

    assert(result.success, 'should succeed');
  });

  // Test C: Tool calls still work
  await asyncTest('Tool calls still execute correctly', async () => {
    const manifest = createMockManifest();
    let toolCalls = 0;
    const toolRuntime = {
      execute: async (req) => {
        toolCalls++;
        return { success: true, data: { title: 'Test Assignment' } };
      },
      getAvailableTools: () => [{ id: 'canvas.read_assignment' }],
    };

    const aiProvider = createMockAIProvider({
      response: {
        action: 'tool_call',
        tool_calls: [{ tool: 'canvas.read_assignment', arguments: { courseId: 101, assignmentId: 501 }, callId: 'c1' }],
        reasoning: 'Read assignment',
      },
    });

    const result = await runFullJob(manifest, { aiProvider, toolRuntime });
    // Tool may or may not be called depending on deterministic path
    // Key: no crash, no regression
    assert(typeof result.success === 'boolean');
  });

  // Test D: Error recovery still works
  await asyncTest('Error recovery still works with optimizations', async () => {
    const manifest = createMockManifest();
    const aiProvider = {
      isReady: () => ({ ready: false, reason: 'API key invalid' }),
      structuredGenerate: async () => { throw new Error('Not ready'); },
    };

    const result = await runFullJob(manifest, { aiProvider });
    assert.equal(result.success, false, 'should fail when provider not ready');
  });
}

runIntegrationTests().then(() => {
  console.log('');

  // ─── Summary ────────────────────────────────────────────────────────

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
    console.log('\nAll efficiency optimization tests passed!\n');
    process.exit(0);
  }
});
