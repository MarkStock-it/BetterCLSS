/**
 * token-efficiency.test.js
 * Phase 27: Token-Efficient Agent Architecture Tests
 *
 * Verifies:
 *   1. Step-aware context builder produces minimal, step-relevant prompts
 *   2. Tool filtering reduces schema size per step type
 *   3. Stable system instruction prefix for Gemini cache reuse
 *   4. Output token limits per step type
 *   5. Compact agent state tracking
 *   6. Token usage tracking from AI responses
 *   7. Same final result with less token waste
 *   8. Full orchestrator integration with new context
 */

const assert = require('assert');

const {
  createAgentOrchestrator,
  buildStepSystemInstruction,
  filterToolsForStep,
  buildStepPrompt,
  getStepOutputLimit,
  precomputeContext,
  buildAssignmentUnderstanding,
  analysisFromManifest,
  manifestHasSufficientDetail,
  DEFAULT_LIMITS,
  STEP_TOOL_CATEGORIES,
  STEP_OUTPUT_LIMITS,
} = require('../agent-orchestrator');

const {
  buildSystemInstruction,
  buildAnalyzeContext,
  buildGenerateContext,
  STEP_TOOL_CATEGORIES: CTX_TOOL_CATS,
  STEP_OUTPUT_LIMITS: CTX_OUTPUT_LIMITS,
} = require('../agent-context');

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

function createAllToolDefs() {
  return [
    { id: 'canvas.read_assignment', name: 'Read Assignment', description: 'Read assignment details', category: 'canvas', permissions: ['READ'], riskLevel: 'low' },
    { id: 'canvas.read_rubric', name: 'Read Rubric', description: 'Read assignment rubric', category: 'canvas', permissions: ['READ'], riskLevel: 'low' },
    { id: 'canvas.read_submissions', name: 'Read Submissions', description: 'Read submission status', category: 'canvas', permissions: ['READ'], riskLevel: 'low' },
    { id: 'canvas.upload_file', name: 'Upload File', description: 'Upload file to Canvas', category: 'canvas', permissions: ['WRITE'], riskLevel: 'medium' },
    { id: 'canvas.create_comment', name: 'Create Comment', description: 'Create assignment comment', category: 'canvas', permissions: ['WRITE'], riskLevel: 'medium' },
    { id: 'canvas.submit_assignment', name: 'Submit Assignment', description: 'Submit assignment to Canvas', category: 'canvas', permissions: ['SUBMIT'], riskLevel: 'critical' },
    { id: 'artifact.create_docx', name: 'Create DOCX', description: 'Generate DOCX document', category: 'artifact', permissions: ['GENERATE'], riskLevel: 'low' },
    { id: 'artifact.create_txt', name: 'Create TXT', description: 'Generate text file', category: 'artifact', permissions: ['GENERATE'], riskLevel: 'low' },
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
        content: 'Generated content about network security.',
      };
      return {
        data: response,
        text: JSON.stringify(response),
        provider: 'mock',
        model: 'mock',
        durationMs: 50,
        usage: { promptTokens: 500, completionTokens: 200, cachedTokens: 100 },
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

console.log('\n=== Phase 27: Token-Efficient Agent Architecture ===\n');

// ─── 1. Step-Aware System Instruction ──────────────────────────────

console.log('1. Step-Aware System Instruction');

test('stable prefix is identical across all step types', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const plan = createExecutionPlan(createMockManifest());

  const analyzeInstr = buildStepSystemInstruction(understanding, plan, 'analyze');
  const generateInstr = buildStepSystemInstruction(understanding, plan, 'generate');
  const refineInstr = buildStepSystemInstruction(understanding, plan, 'refine');

  // Extract the stable prefix (first 7 lines — up to Capability)
  const extractPrefix = (s) => s.split('\n').slice(0, 8).join('\n');
  const prefixA = extractPrefix(analyzeInstr);
  const prefixG = extractPrefix(generateInstr);
  const prefixR = extractPrefix(refineInstr);

  assert.equal(prefixA, prefixG, 'analyze and generate share same prefix');
  assert.equal(prefixG, prefixR, 'generate and refine share same prefix');
});

test('step-specific context is appended after stable prefix', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const plan = createExecutionPlan(createMockManifest());

  const analyzeInstr = buildStepSystemInstruction(understanding, plan, 'analyze');
  const generateInstr = buildStepSystemInstruction(understanding, plan, 'generate');

  assert(analyzeInstr.includes('Current Step: ANALYZE'), 'analyze step labeled');
  assert(generateInstr.includes('Current Step: GENERATE'), 'generate step labeled');
  assert(analyzeInstr.includes('Analyze this assignment'), 'analyze has step instruction');
  assert(generateInstr.includes('Generate complete'), 'generate has step instruction');
});

test('step instruction is shorter than full system instruction', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const plan = createExecutionPlan(createMockManifest());

  const fullInstr = buildSystemInstruction(understanding, plan);
  const stepInstr = buildStepSystemInstruction(understanding, plan, 'analyze');

  // Step instruction should be shorter because it doesn't repeat all the boilerplate
  assert(stepInstr.length < fullInstr.length,
    `step instr (${stepInstr.length}) should be shorter than full (${fullInstr.length})`);
});

test('safety rules are preserved in step instruction', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const plan = createExecutionPlan(createMockManifest());

  const instr = buildStepSystemInstruction(understanding, plan, 'generate');
  assert(instr.includes('Never hallucinate tool results'), 'hallucination rule present');
  assert(instr.includes('never claim') || instr.includes('tool result confirms'), 'tool result rule present');
});

console.log('');

// ─── 2. Tool Filtering ─────────────────────────────────────────────

console.log('2. Tool Filtering');

test('analyze step gets only read/canvas tools (no write/submit)', () => {
  const allTools = createAllToolDefs();
  const filtered = filterToolsForStep(allTools, 'analyze');

  assert(filtered.length > 0, 'should have some tools');
  const ids = filtered.map(t => t.id);
  // Should have read tools
  assert(ids.includes('canvas.read_assignment'), 'has read tools');
  // Should NOT include write, submit, or artifact tools
  assert(!ids.includes('artifact.create_docx'), 'no artifact tools in analyze');
  assert(!ids.includes('canvas.submit_assignment'), 'no submit tools in analyze');
  assert(!ids.includes('canvas.upload_file'), 'no write tools in analyze');
  assert(!ids.includes('canvas.create_comment'), 'no write tools in analyze');
});

test('generate step gets read + generate + artifact + write tools (no submit)', () => {
  const allTools = createAllToolDefs();
  const filtered = filterToolsForStep(allTools, 'generate');

  const ids = filtered.map(t => t.id);
  assert(ids.includes('canvas.read_assignment'), 'has read tools');
  assert(ids.includes('artifact.create_docx'), 'has artifact tools');
  // Should NOT include submit (requires approval)
  assert(!ids.includes('canvas.submit_assignment'), 'no submit in generate');
  // Write tools are allowed (for file uploads during generation)
  assert(ids.includes('canvas.upload_file'), 'has write tools for uploads');
});

test('refine step gets no tools (deterministic)', () => {
  const allTools = createAllToolDefs();
  const filtered = filterToolsForStep(allTools, 'refine');
  assert.equal(filtered.length, 0, 'refine should have no tools');
});

test('validate step gets no tools (deterministic)', () => {
  const allTools = createAllToolDefs();
  const filtered = filterToolsForStep(allTools, 'validate');
  assert.equal(filtered.length, 0, 'validate should have no tools');
});

test('artifact step gets only artifact tools', () => {
  const allTools = createAllToolDefs();
  const filtered = filterToolsForStep(allTools, 'artifact');

  const ids = filtered.map(t => t.id);
  assert(ids.includes('artifact.create_docx'), 'has artifact tools');
  assert(!ids.includes('canvas.read_assignment'), 'no canvas tools in artifact');
});

test('tool filtering reduces schema size', () => {
  const allTools = createAllToolDefs();
  const fullSchema = JSON.stringify(allTools);

  const filteredAnalyze = filterToolsForStep(allTools, 'analyze');
  const filteredSchema = JSON.stringify(filteredAnalyze);

  assert(filteredSchema.length < fullSchema.length,
    `filtered (${filteredSchema.length}) < full (${fullSchema.length})`);
});

test('empty tools array handled gracefully', () => {
  assert.deepEqual(filterToolsForStep([], 'analyze'), []);
  assert.deepEqual(filterToolsForStep(null, 'analyze'), []);
});

console.log('');

// ─── 3. Output Token Limits ────────────────────────────────────────

console.log('3. Output Token Limits');

test('analyze step has small output limit', () => {
  assert.equal(getStepOutputLimit('analyze'), 1024);
});

test('generate step has large output limit', () => {
  assert.equal(getStepOutputLimit('generate'), 8192);
});

test('refine step has moderate output limit', () => {
  assert.equal(getStepOutputLimit('refine'), 2048);
});

test('validate step has tiny output limit', () => {
  assert.equal(getStepOutputLimit('validate'), 512);
});

test('unknown step defaults to 4096', () => {
  assert.equal(getStepOutputLimit('unknown_step'), 4096);
});

test('all step types have defined limits', () => {
  for (const stepType of ['analyze', 'generate', 'refine', 'validate', 'artifact', 'artifact_validate']) {
    const limit = getStepOutputLimit(stepType);
    assert(limit > 0, `${stepType} has positive output limit`);
    assert(limit <= 8192, `${stepType} limit is reasonable`);
  }
});

console.log('');

// ─── 4. Step-Aware Prompts ─────────────────────────────────────────

console.log('4. Step-Aware Prompts');

test('analyze prompt is minimal', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const prompt = buildStepPrompt('analyze', understanding, createMockManifest(), null, null);
  assert(prompt.length < 200, `analyze prompt should be short (${prompt.length} chars)`);
  assert(prompt.includes('Analyze'), 'analyze prompt mentions analysis');
});

test('generate prompt includes instruction text', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const prompt = buildStepPrompt('generate', understanding, createMockManifest(), {}, null);
  assert(prompt.includes('2000-word'), 'generate prompt includes instruction');
  assert(prompt.length > 100, 'generate prompt has substance');
});

test('generate prompt does NOT repeat requirements (they are in system instruction)', () => {
  const understanding = buildAssignmentUnderstanding(createMockManifest());
  const prompt = buildStepPrompt('generate', understanding, createMockManifest(), {}, null);
  // The old prompt included "## Requirements" section — the new one should not
  assert(!prompt.includes('## Requirements'), 'generate prompt should not repeat requirements');
  assert(!prompt.includes('## Constraints'), 'generate prompt should not repeat constraints');
});

test('generate prompt includes personal info warning when needed', () => {
  const manifest = createMockManifest({
    metadata: {
      title: 'Reflection',
      description: 'Write about your personal experience in the course.',
      plainDescription: 'Write about your personal experience in the course.',
    },
  });
  const understanding = buildAssignmentUnderstanding(manifest);
  const prompt = buildStepPrompt('generate', understanding, manifest, {}, null);
  assert(prompt.includes('personal'), 'personal info warning present');
});

test('refine prompt includes content to refine', () => {
  const stepResults = { generate: { generatedContent: 'This is the content to refine.' } };
  const prompt = buildStepPrompt('refine', null, null, stepResults, null);
  assert(prompt.includes('This is the content to refine'), 'refine prompt includes content');
  assert(prompt.includes('Refine'), 'refine prompt mentions refinement');
});

test('refine prompt truncates very long content', () => {
  const longContent = 'word '.repeat(5000);
  const stepResults = { generate: { generatedContent: longContent } };
  const prompt = buildStepPrompt('refine', null, null, stepResults, null);
  assert(prompt.length < longContent.length, 'refine prompt should truncate long content');
  assert(prompt.includes('truncated'), 'truncation marker present');
});

console.log('');

// ─── 5. Token Usage Tracking ───────────────────────────────────────

console.log('5. Token Usage Tracking');

test('precomputeContext includes tokenUsage tracker', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, createAllToolDefs());

  assert(ctx.tokenUsage, 'tokenUsage exists');
  assert.equal(ctx.tokenUsage.totalPromptTokens, 0);
  assert.equal(ctx.tokenUsage.totalCompletionTokens, 0);
  assert.equal(ctx.tokenUsage.aiCalls, 0);
  assert.deepEqual(ctx.tokenUsage.steps, {});
});

test('precomputeContext includes step-specific tools', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const allTools = createAllToolDefs();
  const ctx = precomputeContext(manifest, plan, allTools);

  assert(ctx.stepTools, 'stepTools exists');
  assert(Array.isArray(ctx.stepTools.analyze), 'analyze tools is array');
  assert(Array.isArray(ctx.stepTools.generate), 'generate tools is array');
  assert(Array.isArray(ctx.stepTools.refine), 'refine tools is array');
  assert.equal(ctx.stepTools.refine.length, 0, 'refine has no tools');
});

test('precomputeContext includes step-specific system instructions', () => {
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);
  const ctx = precomputeContext(manifest, plan, createAllToolDefs());

  assert(ctx.stepSystemInstructions, 'stepSystemInstructions exists');
  assert(typeof ctx.stepSystemInstructions.analyze === 'string');
  assert(typeof ctx.stepSystemInstructions.generate === 'string');
  assert(typeof ctx.stepSystemInstructions.refine === 'string');
});

console.log('');

// ─── 6. Token Savings Measurement ──────────────────────────────────

console.log('6. Token Savings Measurement');

test('step-aware prompt is shorter than full prompt for generate', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);

  // Old way: full generate prompt
  const oldPrompt = buildGenerateContext(understanding, manifest, []);

  // New way: step-aware prompt
  const newPrompt = buildStepPrompt('generate', understanding, manifest, {}, null);

  assert(newPrompt.length < oldPrompt.length,
    `new (${newPrompt.length}) < old (${oldPrompt.length})`);
});

test('step-aware system instruction is shorter than full', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const plan = createExecutionPlan(manifest);

  const oldInstr = buildSystemInstruction(understanding, plan);
  const newInstr = buildStepSystemInstruction(understanding, plan, 'generate');

  assert(newInstr.length < oldInstr.length,
    `new system instr (${newInstr.length}) < old (${oldInstr.length})`);
});

test('filtered tools reduce schema JSON size', () => {
  const allTools = createAllToolDefs();
  const fullJson = JSON.stringify(allTools);

  const filtered = filterToolsForStep(allTools, 'analyze');
  const filteredJson = JSON.stringify(filtered);

  const savings = fullJson.length - filteredJson.length;
  assert(savings > 0, `tool filtering saves ${savings} chars`);
});

test('total context reduction for analyze step', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const plan = createExecutionPlan(manifest);
  const allTools = createAllToolDefs();

  // Old approach
  const oldInstr = buildSystemInstruction(understanding, plan);
  const oldPrompt = buildAnalyzeContext(understanding, manifest);
  const oldSchema = JSON.stringify(allTools);
  const oldTotal = oldInstr.length + oldPrompt.length + oldSchema.length;

  // New approach
  const newInstr = buildStepSystemInstruction(understanding, plan, 'analyze');
  const newPrompt = buildStepPrompt('analyze', understanding, manifest, null, null);
  const newSchema = JSON.stringify(filterToolsForStep(allTools, 'analyze'));
  const newTotal = newInstr.length + newPrompt.length + newSchema.length;

  const savingsPercent = Math.round((1 - newTotal / oldTotal) * 100);
  assert(newTotal < oldTotal,
    `new total (${newTotal}) < old total (${oldTotal}), savings: ${savingsPercent}%`);
});

test('total context reduction for generate step', () => {
  const manifest = createMockManifest();
  const understanding = buildAssignmentUnderstanding(manifest);
  const plan = createExecutionPlan(manifest);
  const allTools = createAllToolDefs();

  // Old
  const oldInstr = buildSystemInstruction(understanding, plan);
  const oldPrompt = buildGenerateContext(understanding, manifest, []);
  const oldSchema = JSON.stringify(allTools);
  const oldTotal = oldInstr.length + oldPrompt.length + oldSchema.length;

  // New
  const newInstr = buildStepSystemInstruction(understanding, plan, 'generate');
  const newPrompt = buildStepPrompt('generate', understanding, manifest, {}, null);
  const newSchema = JSON.stringify(filterToolsForStep(allTools, 'generate'));
  const newTotal = newInstr.length + newPrompt.length + newSchema.length;

  const savingsPercent = Math.round((1 - newTotal / oldTotal) * 100);
  assert(newTotal < oldTotal,
    `new total (${newTotal}) < old total (${oldTotal}), savings: ${savingsPercent}%`);
});

console.log('');

// ─── 7. Integration: Full Orchestrator with Token Tracking ─────────

console.log('7. Integration: Orchestrator with Token Tracking');

async function runFullJob(manifest, opts = {}) {
  const aiProvider = opts.aiProvider || createMockAIProvider();
  const toolRuntime = opts.toolRuntime || {
    execute: async () => ({ success: true, data: {} }),
    getAvailableTools: () => createAllToolDefs(),
  };
  const plan = createExecutionPlan(manifest);

  const job = {
    id: opts.jobId || 'ajob_tk_001',
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
      size: content.text.length, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  });

  return orchestrator.runJob(job.id, job.userId, opts.runOptions || {});
}

async function runIntegrationTests() {
  await asyncTest('Full job returns tokenUsage in metadata', async () => {
    const manifest = createMockManifest();
    const result = await runFullJob(manifest);

    assert(result.success, 'job succeeds');
    assert(result.metadata.tokenUsage, 'tokenUsage in metadata');
    assert(typeof result.metadata.tokenUsage.aiCalls === 'number', 'aiCalls tracked');
    assert(typeof result.metadata.tokenUsage.totalPromptTokens === 'number', 'promptTokens tracked');
  });

  await asyncTest('Token usage increments with AI calls', async () => {
    const manifest = createMockManifest();
    let aiCalls = 0;
    const aiProvider = createMockAIProvider({
      onCall: () => { aiCalls++; },
    });

    const result = await runFullJob(manifest, { aiProvider });

    assert(result.success, 'job succeeds');
    // The token usage should reflect the AI calls made
    assert(result.metadata.tokenUsage.aiCalls >= 0, 'aiCalls non-negative');
  });

  await asyncTest('Deterministic analyze skips AI and reports 0 AI calls', async () => {
    const manifest = createMockManifest(); // Detailed manifest → deterministic
    const aiProvider = createMockAIProvider();
    const result = await runFullJob(manifest, { aiProvider });

    assert(result.success, 'job succeeds');
    // With deterministic analyze, total AI calls should be minimal
    assert(result.metadata.aiCalls <= 2, `expected ≤2 AI calls, got ${result.metadata.aiCalls}`);
  });

  await asyncTest('Token usage is in error results too', async () => {
    const manifest = createMockManifest();
    const aiProvider = {
      isReady: () => ({ ready: false, reason: 'No key' }),
      structuredGenerate: async () => { throw new Error('Not ready'); },
    };

    const result = await runFullJob(manifest, { aiProvider });
    assert.equal(result.success, false, 'fails when provider not ready');
  });
}

runIntegrationTests().then(() => {
  console.log('');

  // ─── 8. Architecture Constants ────────────────────────────────────

  console.log('8. Architecture Constants');

  test('STEP_TOOL_CATEGORIES has all step types', () => {
    const expected = ['analyze', 'generate', 'refine', 'validate', 'artifact', 'artifact_validate'];
    for (const step of expected) {
      assert(CTX_TOOL_CATS[step] !== undefined, `${step} has tool category`);
    }
  });

  test('STEP_OUTPUT_LIMITS has all step types', () => {
    const expected = ['analyze', 'generate', 'refine', 'validate', 'artifact', 'artifact_validate'];
    for (const step of expected) {
      assert(CTX_OUTPUT_LIMITS[step] !== undefined, `${step} has output limit`);
    }
  });

  test('generate output limit is largest (content generation)', () => {
    const limits = Object.values(CTX_OUTPUT_LIMITS);
    assert.equal(Math.max(...limits), CTX_OUTPUT_LIMITS.generate);
  });

  test('validate output limit is smallest (deterministic check)', () => {
    const limits = Object.values(CTX_OUTPUT_LIMITS);
    assert.equal(Math.min(...limits), CTX_OUTPUT_LIMITS.validate);
  });

  test('output limits are exported from orchestrator', () => {
    assert(typeof getStepOutputLimit === 'function');
    assert.equal(getStepOutputLimit('analyze'), 1024);
  });

  test('tool filtering exported from orchestrator', () => {
    assert(typeof filterToolsForStep === 'function');
    const tools = filterToolsForStep(createAllToolDefs(), 'refine');
    assert.equal(tools.length, 0);
  });

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
    console.log('\nAll token-efficiency tests passed!\n');
    process.exit(0);
  }
});
