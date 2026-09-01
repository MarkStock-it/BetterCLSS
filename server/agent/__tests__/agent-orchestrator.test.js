/**
 * agent-orchestrator.test.js
 * Tests for the Agent Orchestrator.
 *
 * Uses mock AI provider, mock tool runtime, and mock services
 * to test the orchestration loop without network access.
 */

const nodeAssert = require('assert'); // Node built-in assert (unused, local assert is used)
const { createMockProvider } = require('../../ai/providers/mock-provider');
const { createToolRuntime, createSuccessResult, createErrorResult } = require('../tools/tool-runtime');
const { registerTool, clearTools, TOOL_PERMISSIONS } = require('../tools/tool-registry');
const {
  createAgentOrchestrator,
  buildSystemInstruction,
  buildInitialPrompt,
  buildAgentResponseSchema,
  DEFAULT_LIMITS,
  AgentLimitError,
} = require('../agent-orchestrator');
const {
  JOB_STATES,
  isTerminalState,
} = require('../job-state-machine');

let passed = 0;
let total = 0;
const asyncTests = []; // Collect async tests to run at the end

function assert(condition, msg) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

function assertEqual(actual, expected, msg) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg} — expected "${expected}", got "${actual}"`);
    process.exit(1);
  }
}

function assertDeepContains(obj, key, msg) {
  total++;
  if (obj && obj[key] !== undefined) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg} — key "${key}" not found`);
    process.exit(1);
  }
}

/** Register an async test to be run later */
function asyncTest(name, fn) {
  asyncTests.push({ name, fn });
}

// ─── Mock Services ─────────────────────────────────────────────────

function createMockManifest(overrides = {}) {
  return {
    identity: {
      assignmentId: 101,
      courseId: 201,
      courseName: 'Test Course',
      courseCode: 'CS101',
      userId: 100,
      ...overrides.identity,
    },
    metadata: {
      title: 'Test Assignment',
      description: '<p>Write a 1000-word essay.</p>',
      plainDescription: 'Write a 1000-word essay.',
      dueDate: '2026-09-15T23:59:00Z',
      pointsPossible: 100,
      submissionTypes: ['online_upload'],
      allowedExtensions: ['docx'],
      ...overrides.metadata,
    },
    requirements: {
      categories: ['TEXT', 'FILE'],
      details: [],
      hasExternalTools: false,
      hasPhysicalActivity: false,
      externalTools: [],
      ...overrides.requirements,
    },
    capabilities: {
      required: ['text_generation', 'docx_generation', 'canvas_file_upload', 'canvas_submission'],
      supported: ['text_generation', 'docx_generation', 'canvas_file_upload', 'canvas_submission'],
      partial: [],
      unsupported: [],
      ...overrides.capabilities,
    },
    capabilityResult: {
      status: 'SUPPORTED',
      confidence: 0.95,
      canProceed: true,
      reason: '',
      summary: 'Assignment is fully supported',
      noSubmission: false,
      ...overrides.capabilityResult,
    },
    source: {
      platform: 'canvas',
      assignmentId: 101,
      courseId: 201,
      rubricAvailable: false,
      submissionAvailable: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createMockJob(overrides = {}) {
  const manifest = 'manifest' in overrides ? overrides.manifest : createMockManifest();
  return {
    id: overrides.id || 'ajob_test_123',
    userId: overrides.userId || 100,
    courseId: overrides.courseId || 201,
    assignmentId: overrides.assignmentId || 101,
    assignmentTitle: 'Test Assignment',
    courseName: 'Test Course',
    state: overrides.state || JOB_STATES.EXECUTING,
    previousState: overrides.previousState || null,
    capabilityStatus: overrides.capabilityStatus || 'SUPPORTED',
    manifest,
    progress: { stage: overrides.state || JOB_STATES.EXECUTING, percent: 95, message: '' },
    currentStep: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    lastError: null,
    nextRetryAt: null,
    events: [],
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function createMockAgentService(enabled = true) {
  return {
    isAgenticHelperEnabled: () => enabled,
    getSettings: () => ({ enabled }),
  };
}

function createMockAgentJobService(existingJobs = {}) {
  const jobs = new Map();
  for (const [id, job] of Object.entries(existingJobs)) {
    jobs.set(id, { ...job });
  }

  return {
    getJob: (userId, jobId) => {
      const job = jobs.get(jobId);
      if (job && job.userId === userId) return job;
      return null;
    },
    transitionJob: (userId, jobId, newState, options = {}) => {
      const job = jobs.get(jobId);
      if (!job) throw new Error('JOB_NOT_FOUND');
      if (job.userId !== userId) throw new Error('UNAUTHORIZED');
      job.previousState = job.state;
      job.state = newState;
      job.updatedAt = new Date().toISOString();
      if (isTerminalState(newState)) {
        job.completedAt = new Date().toISOString();
      }
      return job;
    },
    addEvent: () => {},
    persistJob: () => {},
    sanitizeJob: (job) => job,
  };
}

function createMockToolRuntime(tools = {}) {
  clearTools();

  // Register default test tools
  registerTool({
    id: 'canvas.read_assignment',
    name: 'Read Assignment',
    description: 'Fetch assignment details',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number' },
        assignmentId: { type: 'number' },
      },
      required: ['courseId', 'assignmentId'],
    },
    execute: async (args) => {
      const customExecute = tools['canvas.read_assignment'];
      if (customExecute) return customExecute(args);
      return createSuccessResult({
        id: args.assignmentId,
        name: 'Test Assignment',
        description: 'Write a 1000-word essay.',
        due_at: '2026-09-15T23:59:00Z',
        points_possible: 100,
        submission_types: ['online_upload'],
        allowed_extensions: ['docx'],
      });
    },
  });

  registerTool({
    id: 'canvas.read_rubric',
    name: 'Read Rubric',
    description: 'Fetch assignment rubric',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number' },
        assignmentId: { type: 'number' },
      },
      required: ['courseId', 'assignmentId'],
    },
    execute: async () => createSuccessResult({ rubric: [] }),
  });

  const runtime = createToolRuntime({
    agentService: createMockAgentService(),
    agentJobService: createMockAgentJobService(),
    onEvent: () => {},
  });

  return runtime;
}

// ─── Test: Schema Builders ─────────────────────────────────────────

console.log('\n=== Schema Builder Tests ===');

(() => {
  const manifest = createMockManifest();
  const sysInstr = buildSystemInstruction(manifest);
  assert(typeof sysInstr === 'string', 'System instruction is string');
  assert(sysInstr.includes('BetterCLSS'), 'System instruction mentions BetterCLSS');
  assert(sysInstr.includes('tool_call'), 'System instruction mentions tool_call');
  assert(sysInstr.includes('final_response'), 'System instruction mentions final_response');
  assert(sysInstr.includes('needs_input'), 'System instruction mentions needs_input');

  const prompt = buildInitialPrompt(manifest);
  assert(typeof prompt === 'string', 'Initial prompt is string');
  assert(prompt.includes('Test Assignment'), 'Initial prompt includes title');
  assert(prompt.includes('Write a 1000-word essay'), 'Initial prompt includes instructions');
  assert(prompt.includes('CS101'), 'Initial prompt includes course code');

  const toolDefs = [
    { id: 'canvas.read_assignment', inputSchema: { type: 'object' } },
    { id: 'canvas.read_rubric', inputSchema: { type: 'object' } },
  ];
  const schema = buildAgentResponseSchema(toolDefs);
  assert(schema.type === 'object', 'Schema is object type');
  assert(schema.properties.action !== undefined, 'Schema has action property');
  assert(schema.properties.tool_calls !== undefined, 'Schema has tool_calls property');
  assert(schema.properties.content !== undefined, 'Schema has content property');
  assert(schema.required.includes('action'), 'Schema requires action');
})();

// ─── Test: Unsupported Job ─────────────────────────────────────────

console.log('\n=== Unsupported Job Tests ===');

asyncTest('Unsupported job stops execution', async () => {
  const manifest = createMockManifest({
    capabilityResult: {
      status: 'UNSUPPORTED',
      confidence: 0.9,
      canProceed: false,
      reason: 'Requires Packet Tracer .pkt file',
      summary: 'Cannot complete this assignment',
      noSubmission: true,
    },
  });

  const job = createMockJob({
    state: JOB_STATES.PLANNING,
    manifest,
    capabilityStatus: 'UNSUPPORTED',
  });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Unsupported job returns failure');
  assertEqual(result.error, 'UNSUPPORTED', 'Error code is UNSUPPORTED');
  assert(result.message.includes('Packet Tracer') || result.message.includes('not supported'), 'Error mentions reason');
});

// ─── Test: Unknown Capability ──────────────────────────────────────

console.log('\n=== Unknown Capability Tests ===');

asyncTest('Unknown capability stops execution', async () => {
  const manifest = createMockManifest({
    capabilityResult: {
      status: 'UNKNOWN',
      confidence: 0.3,
      canProceed: false,
      reason: 'Cannot determine assignment requirements',
      summary: 'Unknown requirements',
      noSubmission: true,
    },
  });

  const job = createMockJob({
    state: JOB_STATES.PLANNING,
    manifest,
    capabilityStatus: 'UNKNOWN',
  });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Unknown capability returns failure');
  assertEqual(result.error, 'UNKNOWN_CAPABILITY', 'Error code is UNKNOWN_CAPABILITY');
});

// ─── Test: Partial Capability ──────────────────────────────────────

console.log('\n=== Partial Capability Tests ===');

asyncTest('Partial capability stops execution', async () => {
  const manifest = createMockManifest({
    capabilityResult: {
      status: 'PARTIAL',
      confidence: 0.7,
      canProceed: false,
      reason: 'Can generate text but not video',
      summary: 'Partial capability',
      noSubmission: false,
    },
    capabilities: {
      required: ['text_generation', 'video_generation'],
      supported: ['text_generation'],
      partial: [],
      unsupported: ['video_generation'],
    },
  });

  const job = createMockJob({
    state: JOB_STATES.PLANNING,
    manifest,
    capabilityStatus: 'PARTIAL',
  });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Partial capability returns failure');
  assertEqual(result.error, 'PARTIAL_CAPABILITY', 'Error code is PARTIAL_CAPABILITY');
});

// ─── Test: Agentic Helper Disabled ─────────────────────────────────

console.log('\n=== Agent Disabled Tests ===');

asyncTest('Disabled agent stops execution', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(false), // disabled
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Disabled agent returns failure');
  assertEqual(result.error, 'AGENT_DISABLED', 'Error code is AGENT_DISABLED');
});

// ─── Test: Job Not Found ──────────────────────────────────────────

console.log('\n=== Job Not Found Tests ===');

asyncTest('Missing job returns failure', async () => {
  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({}),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob('nonexistent_job', 100);
  assert(result.success === false, 'Missing job returns failure');
  assertEqual(result.error, 'JOB_NOT_FOUND', 'Error code is JOB_NOT_FOUND');
});

// ─── Test: Terminal State ─────────────────────────────────────────

console.log('\n=== Terminal State Tests ===');

asyncTest('Terminal state stops execution', async () => {
  const job = createMockJob({ state: JOB_STATES.COMPLETED });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Terminal state returns failure');
  assertEqual(result.error, 'JOB_TERMINAL', 'Error code is JOB_TERMINAL');
});

// ─── Test: Already Running ────────────────────────────────────────

console.log('\n=== Already Running Tests ===');

asyncTest('Already running returns failure', async () => {
  const job = createMockJob({ state: JOB_STATES.EXECUTING });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Already running returns failure');
  assertEqual(result.error, 'JOB_ALREADY_RUNNING', 'Error code is JOB_ALREADY_RUNNING');
});

// ─── Test: No Manifest ────────────────────────────────────────────

console.log('\n=== No Manifest Tests ===');

asyncTest('No manifest stops execution', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING, manifest: null });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'No manifest returns failure');
  assertEqual(result.error, 'NO_MANIFEST', 'Error code is NO_MANIFEST');
});

// ─── Test: AI Provider Unavailable ────────────────────────────────

console.log('\n=== AI Provider Unavailable Tests ===');

asyncTest('Unavailable AI stops execution', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  const mockProvider = {
    isReady: () => ({ ready: false, reason: 'API key not configured' }),
    structuredGenerate: async () => { throw new Error('Should not be called'); },
    generate: async () => { throw new Error('Should not be called'); },
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Unavailable AI returns failure');
  assertEqual(result.error, 'AI_PROVIDER_UNAVAILABLE', 'Error code is AI_PROVIDER_UNAVAILABLE');
});

// ─── Test: Successful Final Response ──────────────────────────────

console.log('\n=== Successful Final Response Tests ===');

asyncTest('Final response completes successfully', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  // Mock AI that returns a final response immediately
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        action: 'final_response',
        content: 'This assignment requires a 1000-word essay about database normalization.',
        reasoning: 'I have enough information to provide a summary.',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 100,
    }),
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const mockTxtGenerator = {
    generate: async ({ jobId, userId, filename, content }) => ({
      id: 'art_001', type: 'txt', filename, size: 100, status: 'READY',
      mimeType: 'text/plain', storagePath: '.betterclss_data/artifacts/test/art_001.txt',
      createdAt: new Date().toISOString(),
    }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
    txtGenerator: mockTxtGenerator,
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === true, 'Final response returns success');
  assert(result.result !== null, 'Result has content');
  assertEqual(result.result.content, 'This assignment requires a 1000-word essay about database normalization.', 'Content matches');
  assert(result.metadata.aiCalls === 2, 'Two AI calls made (analyze + generate)');
  assert(result.metadata.toolCalls === 0, 'No tool calls made');
});

// ─── Test: Tool Call Flow ─────────────────────────────────────────

console.log('\n=== Tool Call Flow Tests ===');

asyncTest('Tool call flow works end-to-end', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  let callCount = 0;
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async (req) => {
      callCount++;
      if (callCount === 1) {
        // Call 1 (ANALYZE): return analysis
        return {
          data: {
            action: 'final_response',
            content: 'This is a text-based assignment requiring a written essay.',
            reasoning: 'Analyzed the assignment',
          },
          text: '{}', provider: 'mock', model: 'mock',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }, durationMs: 100,
        };
      } else if (callCount === 2) {
        // Call 2 (GENERATE): request a tool
        return {
          data: {
            action: 'tool_call',
            tool_calls: [{ tool: 'canvas.read_assignment', arguments: { courseId: 201, assignmentId: 101 }, callId: 'call_1' }],
            reasoning: 'Need to read the assignment details',
          },
          text: '{}', provider: 'mock', model: 'mock',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }, durationMs: 100,
        };
      } else {
        // Call 3 (GENERATE): final response
        return {
          data: {
            action: 'final_response',
            content: 'Based on the assignment data, this requires a 1000-word essay.',
            reasoning: 'I have the assignment details now',
          },
          text: '{}', provider: 'mock', model: 'mock',
          usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 }, durationMs: 100,
        };
      }
    },
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const mockTxtGenerator = {
    generate: async ({ jobId, userId, filename, content }) => ({
      id: 'art_002', type: 'txt', filename, size: 100, status: 'READY',
      mimeType: 'text/plain', storagePath: '.betterclss_data/artifacts/test/art_002.txt',
      createdAt: new Date().toISOString(),
    }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
    txtGenerator: mockTxtGenerator,
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === true, 'Tool call flow returns success');
  assert(result.metadata.aiCalls === 3, 'Three AI calls made (analyze + generate tool_call + generate final)');
  assert(result.metadata.toolCalls === 1, 'One tool call made');
  assert(result.result.content.includes('1000-word essay'), 'Final response contains analysis');
});

// ─── Test: Tool Failure ───────────────────────────────────────────

console.log('\n=== Tool Failure Tests ===');

asyncTest('Tool failure is handled gracefully', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  let callCount = 0;
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async (req) => {
      callCount++;
      if (callCount === 1) {
        // Call 1 (ANALYZE): return analysis
        return {
          data: { action: 'final_response', content: 'Analyzing.', reasoning: 'Analyzed' },
          text: '{}', provider: 'mock', model: 'mock', durationMs: 100,
        };
      } else if (callCount === 2) {
        // Call 2 (GENERATE): try to read assignment (will fail)
        return {
          data: {
            action: 'tool_call',
            tool_calls: [{ tool: 'canvas.read_assignment', arguments: { courseId: 201, assignmentId: 999 }, callId: 'call_1' }],
            reasoning: 'Try to read assignment',
          },
          text: '{}', provider: 'mock', model: 'mock', durationMs: 100,
        };
      } else {
        // Call 3 (GENERATE): final response after tool failure
        return {
          data: { action: 'final_response', content: 'The assignment could not be read.', reasoning: 'Tool failed' },
          text: '{}', provider: 'mock', model: 'mock', durationMs: 100,
        };
      }
    },
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  // Tool that always fails
  clearTools();
  registerTool({
    id: 'canvas.read_assignment', name: 'Read Assignment', description: 'Fetch assignment details',
    category: 'canvas', permissions: [TOOL_PERMISSIONS.READ], inputSchema: { type: 'object' },
    execute: async () => createErrorResult('CANVAS_ERROR', 'Assignment not found'),
  });

  const toolRuntime = createToolRuntime({
    agentService: createMockAgentService(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    onEvent: () => {},
  });

  const mockTxtGenerator = {
    generate: async ({ jobId, userId, filename, content }) => ({
      id: 'art_004', type: 'txt', filename, size: 100, status: 'READY',
      mimeType: 'text/plain', storagePath: '.betterclss_data/artifacts/test/art_004.txt',
      createdAt: new Date().toISOString(),
    }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime,
    txtGenerator: mockTxtGenerator,
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === true, 'Tool failure is handled gracefully');
  assert(result.metadata.toolCalls === 1, 'One tool call was made');
});

// ─── Test: Iteration Limit ────────────────────────────────────────

console.log('\n=== Iteration Limit Tests ===');

asyncTest('Iteration limit stops execution', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  // AI that always requests more tools
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        action: 'tool_call',
        tool_calls: [{
          tool: 'canvas.read_assignment',
          arguments: { courseId: 201, assignmentId: 101 },
        }],
        reasoning: 'Keep going',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      durationMs: 10,
    }),
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
    limits: { maxIterations: 3, maxToolCalls: 20, maxAiCalls: 20, maxExecutionTimeMs: 60000 },
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Iteration limit stops execution');
  assert(
    result.error === 'TOOL_CALL_LIMIT' || result.error === 'ITERATION_LIMIT' || result.error === 'AI_CALL_LIMIT',
    `Error is TOOL_CALL_LIMIT, ITERATION_LIMIT, or AI_CALL_LIMIT, got ${result.error}`
  );
});

// ─── Test: Malformed AI Response ──────────────────────────────────

console.log('\n=== Malformed AI Response Tests ===');

asyncTest('Malformed AI response returns failure', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        // Missing action field
        content: 'some content',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      durationMs: 100,
    }),
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Malformed AI response returns failure');
  assertEqual(result.error, 'INVALID_AI_RESPONSE', 'Error is INVALID_AI_RESPONSE');
});

// ─── Test: Unknown AI Action ──────────────────────────────────────

console.log('\n=== Unknown AI Action Tests ===');

asyncTest('Unknown AI action returns failure', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        action: 'unknown_action_xyz',
        content: 'test',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      durationMs: 100,
    }),
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === false, 'Unknown action returns failure');
  assertEqual(result.error, 'UNKNOWN_ACTION', 'Error is UNKNOWN_ACTION');
});

// ─── Test: Needs Input ────────────────────────────────────────────

console.log('\n=== Needs Input Tests ===');

asyncTest('Needs input returns input prompt', async () => {
  const job = createMockJob({ state: JOB_STATES.PLANNING });

  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        action: 'needs_input',
        content: 'I need you to specify the essay topic.',
        input_prompt: 'What specific topic should the essay cover?',
        reasoning: 'Insufficient information',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      durationMs: 100,
    }),
    metadata: () => ({ name: 'mock', model: 'mock' }),
  };

  const orchestrator = createAgentOrchestrator({
    aiProvider: mockProvider,
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  const result = await orchestrator.runJob(job.id, job.userId);
  assert(result.success === true, 'Needs input returns success');
  assert(result.result.needsInput === true, 'Result indicates needs input');
  assert(result.result.inputPrompt.includes('topic'), 'Input prompt asks about topic');
});

// ─── Test: User Isolation ─────────────────────────────────────────

console.log('\n=== User Isolation Tests ===');

asyncTest('Wrong user cannot run job', async () => {
  const job = createMockJob({ id: 'ajob_iso_1', userId: 100, state: JOB_STATES.PLANNING });

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService({ [job.id]: job }),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  // User 200 tries to run user 100's job
  const result = await orchestrator.runJob(job.id, 200);
  assert(result.success === false, 'Wrong user cannot run job');
  assertEqual(result.error, 'JOB_NOT_FOUND', 'Returns JOB_NOT_FOUND for wrong user');
});

// ─── Test: Limit Defaults ─────────────────────────────────────────

console.log('\n=== Limit Defaults Tests ===');

(() => {
  assert(DEFAULT_LIMITS.maxIterations === 10, 'Default max iterations is 10');
  assert(DEFAULT_LIMITS.maxToolCalls === 8, 'Default max tool calls is 8');
  assert(DEFAULT_LIMITS.maxAiCalls === 10, 'Default max AI calls is 10');
  assert(DEFAULT_LIMITS.maxExecutionTimeMs === 300000, 'Default max time is 5 minutes');

  const orchestrator = createAgentOrchestrator({
    aiProvider: createMockProvider(),
    agentJobService: createMockAgentJobService(),
    agentService: createMockAgentService(),
    toolRuntime: createMockToolRuntime(),
  });

  assert(orchestrator.limits.maxIterations === 10, 'Orchestrator uses default limits');
})();

// ─── Test: AgentLimitError ────────────────────────────────────────

console.log('\n=== AgentLimitError Tests ===');

(() => {
  const err = new AgentLimitError('TEST_CODE', 'Test message');
  assert(err instanceof Error, 'AgentLimitError is an Error');
  assertEqual(err.code, 'TEST_CODE', 'Error has code');
  assertEqual(err.message, 'Test message', 'Error has message');
  assertEqual(err.name, 'AgentLimitError', 'Error has correct name');
})();

// ─── Run async tests and summary ───────────────────────────────────

async function runAllAsyncTests() {
  for (const test of asyncTests) {
    try {
      await test.fn();
    } catch (err) {
      total++;
      console.log(`  ✗ FAIL [${test.name}]: ${err.message}`);
      console.log(err.stack);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed}/${total} passed, ${total - passed} failed`);
  console.log('='.repeat(50));

  if (total - passed > 0) {
    process.exit(1);
  } else {
    console.log('\nAll tests passed!\n');
  }
}

runAllAsyncTests();
