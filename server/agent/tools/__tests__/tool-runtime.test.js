/**
 * tool-runtime.test.js
 * Tests for the Agentic Helper Tool Runtime.
 *
 * Run with: node server/agent/tools/__tests__/tool-runtime.test.js
 */

const {
  registerTool,
  getTool,
  hasTool,
  getToolCount,
  getToolDefinitions,
  clearTools,
  TOOL_PERMISSIONS,
} = require('../tool-registry');

const {
  createToolRuntime,
  validateToolRequest,
  validateArguments,
  authorizeTool,
  createSuccessResult,
  createErrorResult,
  normalizeResultSize,
} = require('../tool-runtime');

const { registerCanvasTools } = require('../canvas-tools');

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

// ─── Tool Registry Tests ─────────────────────────────────────────────

console.log('\n=== Tool Registry Tests ===');

(() => {
  clearTools();

  registerTool({
    id: 'test.tool1',
    name: 'Test Tool 1',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    permissions: [TOOL_PERMISSIONS.READ],
    category: 'test',
    execute: async () => createSuccessResult('ok'),
  });

  assert(hasTool('test.tool1'), 'Tool registered');
  assertEqual(getToolCount(), 1, 'Tool count correct');

  const tool = getTool('test.tool1');
  assertEqual(tool.name, 'Test Tool 1', 'Tool name correct');
  assertEqual(tool.category, 'test', 'Tool category correct');

  const defs = getToolDefinitions();
  assertEqual(defs.length, 1, 'Tool definitions returned');
  assert(!defs[0].execute, 'Definitions do not include execute function');

  // Duplicate registration
  assertThrows(
    () => registerTool({}),
    'Tool without ID throws'
  );

  clearTools();
  assertEqual(getToolCount(), 0, 'Clear removes all tools');
})();

// ─── Request Validation Tests ────────────────────────────────────────

console.log('\n=== Request Validation Tests ===');

(() => {
  const valid = validateToolRequest({ tool: 'test.tool', arguments: {} });
  assert(valid.valid === true, 'Valid request passes');

  const noTool = validateToolRequest({});
  assert(noTool.valid === false, 'Missing tool fails');
  assert(noTool.errors.some((e) => e.includes('tool')), 'Error mentions tool');

  const badArgs = validateToolRequest({ tool: 'test', arguments: 'bad' });
  assert(badArgs.valid === false, 'Non-object arguments fail');

  const nullReq = validateToolRequest(null);
  assert(nullReq.valid === false, 'Null request fails');
})();

// ─── Argument Validation Tests ───────────────────────────────────────

console.log('\n=== Argument Validation Tests ===');

(() => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
    },
    required: ['name'],
  };

  const valid = validateArguments({ name: 'test', count: 5 }, schema);
  assert(valid.valid === true, 'Valid args pass');

  const missing = validateArguments({ count: 5 }, schema);
  assert(missing.valid === false, 'Missing required field fails');
  assert(missing.errors.some((e) => e.includes('name')), 'Error mentions field');

  const wrongType = validateArguments({ name: 123 }, schema);
  assert(wrongType.valid === false, 'Wrong type fails');
  assert(wrongType.errors.some((e) => e.includes('string')), 'Error mentions type');

  const noSchema = validateArguments({ anything: true }, null);
  assert(noSchema.valid === true, 'No schema = no validation');
})();

// ─── Authorization Tests ─────────────────────────────────────────────

console.log('\n=== Authorization Tests ===');

(() => {
  // Mock agent service
  const agentService = {
    isAgenticHelperEnabled: (userId) => userId !== 999,
  };

  const tool = { id: 'test.tool', permissions: [TOOL_PERMISSIONS.READ] };

  // Authorized
  const job = { userId: 100, state: 'PLANNING' };
  const auth = authorizeTool(tool, job, 100, agentService);
  assert(auth.authorized === true, 'Authorized for valid job');

  // Agent disabled
  const disabledAuth = authorizeTool(tool, job, 999, agentService);
  assert(disabledAuth.authorized === false, 'Rejected when agent disabled');

  // Wrong user
  const wrongUser = authorizeTool(tool, job, 200, agentService);
  assert(wrongUser.authorized === false, 'Rejected for wrong user');

  // Wrong state
  const completedJob = { userId: 100, state: 'COMPLETED' };
  const terminalAuth = authorizeTool(tool, completedJob, 100, agentService);
  assert(terminalAuth.authorized === false, 'Rejected for terminal state');

  // Unknown tool
  const unknownAuth = authorizeTool(null, job, 100, agentService);
  assert(unknownAuth.authorized === false, 'Rejected for unknown tool');

  // DISCOVERED state (not executable)
  const discoveredJob = { userId: 100, state: 'DISCOVERED' };
  const discoveredAuth = authorizeTool(tool, discoveredJob, 100, agentService);
  assert(discoveredAuth.authorized === false, 'Rejected for DISCOVERED state');
})();

// ─── Result Tests ────────────────────────────────────────────────────

console.log('\n=== Result Tests ===');

(() => {
  const success = createSuccessResult({ data: 'test' });
  assert(success.success === true, 'Success result has success=true');
  assert(success.data.data === 'test', 'Success result has data');
  assert(success.metadata.timestamp !== undefined, 'Success result has timestamp');

  const error = createErrorResult('TEST_ERROR', 'Something failed');
  assert(error.success === false, 'Error result has success=false');
  assertEqual(error.error.code, 'TEST_ERROR', 'Error has code');
  assertEqual(error.error.message, 'Something failed', 'Error has message');

  // Size normalization
  const bigData = { content: 'x'.repeat(60000) };
  const bigResult = createSuccessResult(bigData);
  const normalized = normalizeResultSize(bigResult, 1000);
  assert(normalized.metadata.truncated === true, 'Large result is truncated');
})();

// ─── Canvas Tools Registration Tests ─────────────────────────────────

console.log('\n=== Canvas Tools Registration ===');

(() => {
  clearTools();

  // Mock canvas service
  const mockCanvasService = {
    fetchOne: async () => ({ id: 1, name: 'Test Assignment' }),
    fetchAll: async () => [],
  };

  registerCanvasTools(mockCanvasService);

  assert(hasTool('canvas.read_assignment'), 'canvas.read_assignment registered');
  assert(hasTool('canvas.read_rubric'), 'canvas.read_rubric registered');
  assert(hasTool('canvas.read_submission'), 'canvas.read_submission registered');
  assert(hasTool('canvas.read_course'), 'canvas.read_course registered');
  assert(hasTool('canvas.read_comments'), 'canvas.read_comments registered');

  const defs = getToolDefinitions();
  assert(defs.length >= 5, 'At least 5 canvas tools registered');

  // All are READ-only
  for (const def of defs) {
    assert(
      def.permissions.includes(TOOL_PERMISSIONS.READ),
      `${def.id} has READ permission`
    );
  }
})();

// ─── Tool Runtime Execution Tests ────────────────────────────────────

console.log('\n=== Tool Runtime Execution ===');

(async () => {
  clearTools();

  // Register a test tool
  registerTool({
    id: 'test.echo',
    name: 'Echo',
    description: 'Echoes input',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    permissions: [TOOL_PERMISSIONS.READ],
    category: 'test',
    execute: async (args) => createSuccessResult({ echo: args.message }),
  });

  // Register a failing tool
  registerTool({
    id: 'test.fail',
    name: 'Fail',
    description: 'Always fails',
    permissions: [TOOL_PERMISSIONS.READ],
    category: 'test',
    execute: async () => { throw new Error('Intentional failure'); },
  });

  const agentService = { isAgenticHelperEnabled: () => true };
  const agentJobService = {
    getJob: (userId, jobId) => {
      if (jobId === 'job1') return { id: 'job1', userId: 100, courseId: 200, assignmentId: 300, state: 'PLANNING' };
      return null;
    },
  };

  let events = [];
  const runtime = createToolRuntime({
    agentService,
    agentJobService,
    onEvent: (jobId, type, meta) => events.push({ jobId, type, meta }),
  });

  // Valid execution
  events = [];
  const result = await runtime.execute(
    { tool: 'test.echo', arguments: { message: 'hello' }, jobId: 'job1' },
    100
  );
  assert(result.success === true, 'Tool executes successfully');
  assertEqual(result.data.echo, 'hello', 'Tool returns correct data');
  assert(events.some((e) => e.type === 'TOOL_EXECUTED'), 'Execution event emitted');

  // Unknown tool
  const unknownResult = await runtime.execute(
    { tool: 'delete_everything', arguments: {} },
    100
  );
  assert(unknownResult.success === false, 'Unknown tool fails');
  assertEqual(unknownResult.error.code, 'UNKNOWN_TOOL', 'Error code is UNKNOWN_TOOL');

  // Invalid arguments
  const invalidArgs = await runtime.execute(
    { tool: 'test.echo', arguments: {}, jobId: 'job1' },
    100
  );
  assert(invalidArgs.success === false, 'Invalid args fail');
  assertEqual(invalidArgs.error.code, 'INVALID_ARGUMENTS', 'Error code is INVALID_ARGUMENTS');

  // Tool failure
  const failResult = await runtime.execute(
    { tool: 'test.fail', arguments: {}, jobId: 'job1' },
    100
  );
  assert(failResult.success === false, 'Tool failure handled');
  assertEqual(failResult.error.code, 'EXECUTION_ERROR', 'Error code is EXECUTION_ERROR');

  // Unauthorized (wrong user)
  const unauthResult = await runtime.execute(
    { tool: 'test.echo', arguments: { message: 'hi' }, jobId: 'job1' },
    200 // Wrong user
  );
  assert(unauthResult.success === false, 'Wrong user rejected');
  assertEqual(unauthResult.error.code, 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');

  // No job
  const noJobResult = await runtime.execute(
    { tool: 'test.echo', arguments: { message: 'hi' }, jobId: 'nonexistent' },
    100
  );
  assert(noJobResult.success === false, 'Missing job rejected');
  assertEqual(noJobResult.error.code, 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');
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
