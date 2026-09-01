/**
 * job-state-machine.test.js
 * Tests for the Agent Job state machine and job lifecycle.
 *
 * Run with: node server/agent/__tests__/job-state-machine.test.js
 */

const {
  JOB_STATES,
  TERMINAL_STATES,
  isValidTransition,
  isTerminalState,
  getStateMetadata,
  getStateProgress,
  transition,
  classifyError,
  ERROR_CATEGORIES,
} = require('../job-state-machine');

const {
  createAgentJobService,
} = require('../agent-job-service');

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

// ─── State Machine Tests ─────────────────────────────────────────────

console.log('\n=== State Definitions ===');

(() => {
  assertEqual(Object.keys(JOB_STATES).length, 14, '14 states defined');
  assert(TERMINAL_STATES.has('COMPLETED'), 'COMPLETED is terminal');
  assert(TERMINAL_STATES.has('FAILED'), 'FAILED is terminal');
  assert(TERMINAL_STATES.has('UNSUPPORTED'), 'UNSUPPORTED is terminal');
  assert(TERMINAL_STATES.has('CANCELLED'), 'CANCELLED is terminal');
  assert(!TERMINAL_STATES.has('DISCOVERED'), 'DISCOVERED is not terminal');
  assert(!TERMINAL_STATES.has('GENERATING'), 'GENERATING is not terminal');
  assert(!TERMINAL_STATES.has('USER_ACTION_REQUIRED'), 'USER_ACTION_REQUIRED is not terminal');
})();

console.log('\n=== Valid Transitions ===');

(() => {
  // Happy path
  assert(isValidTransition('DISCOVERED', 'ANALYZING'), 'DISCOVERED → ANALYZING');
  assert(isValidTransition('ANALYZING', 'CAPABILITY_CHECK'), 'ANALYZING → CAPABILITY_CHECK');
  assert(isValidTransition('CAPABILITY_CHECK', 'PLANNING'), 'CAPABILITY_CHECK → PLANNING');
  assert(isValidTransition('PLANNING', 'GENERATING'), 'PLANNING → GENERATING');
  assert(isValidTransition('GENERATING', 'REFINING'), 'GENERATING → REFINING');
  assert(isValidTransition('REFINING', 'VALIDATING'), 'REFINING → VALIDATING');
  assert(isValidTransition('VALIDATING', 'READY'), 'VALIDATING → READY');
  assert(isValidTransition('READY', 'EXECUTING'), 'READY → EXECUTING');
  assert(isValidTransition('EXECUTING', 'COMPLETED'), 'EXECUTING → COMPLETED');

  // Capability check branches
  assert(isValidTransition('CAPABILITY_CHECK', 'UNSUPPORTED'), 'CAPABILITY_CHECK → UNSUPPORTED');
  assert(isValidTransition('CAPABILITY_CHECK', 'USER_ACTION_REQUIRED'), 'CAPABILITY_CHECK → USER_ACTION_REQUIRED');

  // Cancellation from non-terminal states
  assert(isValidTransition('DISCOVERED', 'CANCELLED'), 'DISCOVERED → CANCELLED');
  assert(isValidTransition('PLANNING', 'CANCELLED'), 'PLANNING → CANCELLED');
  assert(isValidTransition('GENERATING', 'CANCELLED'), 'GENERATING → CANCELLED');
  assert(isValidTransition('USER_ACTION_REQUIRED', 'CANCELLED'), 'USER_ACTION_REQUIRED → CANCELLED');

  // Failure from non-terminal states
  assert(isValidTransition('ANALYZING', 'FAILED'), 'ANALYZING → FAILED');
  assert(isValidTransition('GENERATING', 'FAILED'), 'GENERATING → FAILED');
  assert(isValidTransition('EXECUTING', 'FAILED'), 'EXECUTING → FAILED');
})();

console.log('\n=== Invalid Transitions ===');

(() => {
  assert(!isValidTransition('COMPLETED', 'GENERATING'), 'COMPLETED → GENERATING invalid');
  assert(!isValidTransition('FAILED', 'PLANNING'), 'FAILED → PLANNING invalid');
  assert(!isValidTransition('UNSUPPORTED', 'EXECUTING'), 'UNSUPPORTED → EXECUTING invalid');
  assert(!isValidTransition('CANCELLED', 'ANALYZING'), 'CANCELLED → ANALYZING invalid');
  assert(!isValidTransition('GENERATING', 'DISCOVERED'), 'GENERATING → DISCOVERED invalid');
  assert(!isValidTransition('EXECUTING', 'GENERATING'), 'EXECUTING → GENERATING invalid');
  assert(!isValidTransition('PLANNING', 'COMPLETED'), 'PLANNING → COMPLETED invalid (must go through EXECUTING)');
})();

console.log('\n=== Transition Function ===');

(() => {
  const result1 = transition('DISCOVERED', 'ANALYZING');
  assert(result1.valid, 'Valid transition returns valid=true');
  assertEqual(result1.from, 'DISCOVERED', 'Transition from correct');
  assertEqual(result1.to, 'ANALYZING', 'Transition to correct');

  const result2 = transition('COMPLETED', 'GENERATING');
  assert(!result2.valid, 'Invalid transition returns valid=false');
  assert(result2.reason.length > 0, 'Invalid transition has reason');

  const result3 = transition('INVALID_STATE', 'ANALYZING');
  assert(!result3.valid, 'Invalid current state returns valid=false');

  const result4 = transition('DISCOVERED', 'INVALID_STATE');
  assert(!result4.valid, 'Invalid requested state returns valid=false');
})();

console.log('\n=== State Metadata ===');

(() => {
  const meta = getStateMetadata('GENERATING');
  assert(meta !== null, 'getStateMetadata returns data');
  assertEqual(meta.label, 'Generating', 'Label correct');
  assert(meta.percent === 50, 'Progress percent correct');
  assert(!meta.isTerminal, 'GENERATING is not terminal');

  const completedMeta = getStateMetadata('COMPLETED');
  assert(completedMeta.isTerminal, 'COMPLETED is terminal');
  assertEqual(completedMeta.percent, 100, 'COMPLETED is 100%');

  const unknownMeta = getStateMetadata('NONEXISTENT');
  assert(unknownMeta === null, 'Unknown state returns null');
})();

console.log('\n=== Error Classification ===');

(() => {
  const retryable1 = classifyError({ code: 'ECONNRESET', message: 'Connection reset' });
  assertEqual(retryable1, ERROR_CATEGORIES.RETRYABLE, 'ECONNRESET is RETRYABLE');

  const retryable2 = classifyError({ code: 'RATE_LIMIT', message: 'Rate limit exceeded' });
  assertEqual(retryable2, ERROR_CATEGORIES.RETRYABLE, 'RATE_LIMIT is RETRYABLE');

  const retryable3 = classifyError({ code: 'TIMEOUT', message: 'Request timeout' });
  assertEqual(retryable3, ERROR_CATEGORIES.RETRYABLE, 'TIMEOUT is RETRYABLE');

  const nonRetryable1 = classifyError({ code: 'UNAUTHORIZED', message: 'Invalid token' });
  assertEqual(nonRetryable1, ERROR_CATEGORIES.NON_RETRYABLE, 'UNAUTHORIZED is NON_RETRYABLE');

  const nonRetryable2 = classifyError({ code: 'FORBIDDEN', message: 'Permission denied' });
  assertEqual(nonRetryable2, ERROR_CATEGORIES.NON_RETRYABLE, 'FORBIDDEN is NON_RETRYABLE');

  const nonRetryable3 = classifyError({ code: 'NOT_FOUND', message: 'Assignment not found' });
  assertEqual(nonRetryable3, ERROR_CATEGORIES.NON_RETRYABLE, 'NOT_FOUND is NON_RETRYABLE');

  const userAction = classifyError({ code: 'USER_ACTION_REQUIRED', message: 'Needs input' });
  assertEqual(userAction, ERROR_CATEGORIES.USER_ACTION_REQUIRED, 'USER_ACTION_REQUIRED classified');

  const unknown = classifyError({ code: 'SOME_ERROR', message: 'Something happened' });
  assertEqual(unknown, ERROR_CATEGORIES.NON_RETRYABLE, 'Unknown error defaults to NON_RETRYABLE');
})();

// ─── Job Service Tests ───────────────────────────────────────────────

console.log('\n=== Job Service: Feature Gate ===');

(() => {
  // Mock services
  const mockUserStorage = {
    _users: {},
    loadOrCreateUser(userId) {
      if (!this._users[userId]) {
        this._users[userId] = {
          userId,
          agentSettings: { enabled: false },
          agentJobs: [],
          agentManifests: [],
        };
      }
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled(userId) {
      const user = this._users[userId];
      return Boolean(user?.agentSettings?.enabled);
    },
  };

  const mockAgentService = {
    isAgenticHelperEnabled(userId) {
      return mockUserStorage.isAgentEnabled(userId);
    },
  };

  const mockIngestion = {
    getCachedManifest() { return null; },
  };

  const jobService = createAgentJobService(mockAgentService, mockIngestion, mockUserStorage);

  // Test: Agent disabled → job creation rejected
  assertThrows(
    () => jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 }),
    'Job creation rejected when agent disabled'
  );

  // Enable agent
  mockUserStorage._users[100] = {
    userId: 100,
    agentSettings: { enabled: true },
    agentJobs: [],
    agentManifests: [],
  };

  // Test: Agent enabled → job creation succeeds
  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  assert(job !== null, 'Job created when agent enabled');
  assertEqual(job.state, 'DISCOVERED', 'Job starts in DISCOVERED state');
  assertEqual(job.userId, 100, 'Job has correct userId');
  assertEqual(job.courseId, 200, 'Job has correct courseId');
  assertEqual(job.assignmentId, 300, 'Job has correct assignmentId');
  assert(job.id.startsWith('ajob_'), 'Job ID has correct prefix');
  assert(Array.isArray(job.events), 'Job has events array');
  assert(job.events.length >= 1, 'Job has at least 1 event');
})();

console.log('\n=== Job Service: Idempotency ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  // Create first job
  const job1 = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });

  // Attempt duplicate
  const job2 = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });

  assertEqual(job1.id, job2.id, 'Duplicate request returns same job');
})();

console.log('\n=== Job Service: State Transitions ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  assertEqual(job.state, 'DISCOVERED', 'Initial state: DISCOVERED');

  // Valid transition
  const job2 = jobService.transitionJob(100, job.id, 'ANALYZING');
  assertEqual(job2.state, 'ANALYZING', 'After transition: ANALYZING');
  assertEqual(job2.previousState, 'DISCOVERED', 'Previous state recorded');

  // Continue valid transitions
  const job3 = jobService.transitionJob(100, job.id, 'CAPABILITY_CHECK');
  assertEqual(job3.state, 'CAPABILITY_CHECK', 'After transition: CAPABILITY_CHECK');

  const job4 = jobService.transitionJob(100, job.id, 'PLANNING');
  assertEqual(job4.state, 'PLANNING', 'After transition: PLANNING');

  // Invalid transition
  assertThrows(
    () => jobService.transitionJob(100, job.id, 'COMPLETED'),
    'Invalid transition COMPLETED from PLANNING throws error'
  );
})();

console.log('\n=== Job Service: Unsupported Job ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const mockManifest = {
    identity: { courseName: 'CSCI 101' },
    metadata: { title: 'Packet Tracer Lab' },
    capabilityResult: {
      status: 'UNSUPPORTED',
      reason: 'Cannot create Packet Tracer files',
    },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => mockManifest },
    mockUserStorage
  );

  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  assertEqual(job.state, 'UNSUPPORTED', 'Unsupported assignment starts in UNSUPPORTED');
  assertEqual(job.capabilityStatus, 'UNSUPPORTED', 'capabilityStatus is UNSUPPORTED');
  assert(job.completedAt !== null, 'Unsupported job has completedAt');
})();

console.log('\n=== Job Service: Cancellation ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  jobService.transitionJob(100, job.id, 'ANALYZING');

  // Cancel from non-terminal
  const cancelled = jobService.cancelJob(100, job.id);
  assertEqual(cancelled.state, 'CANCELLED', 'Job cancelled');
  assert(cancelled.completedAt !== null, 'Cancelled job has completedAt');

  // Cannot cancel a terminal job
  assertThrows(
    () => jobService.cancelJob(100, job.id),
    'Cannot cancel already-cancelled job'
  );
})();

console.log('\n=== Job Service: User Isolation ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
      200: {
        userId: 200,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  // Create jobs for different users
  const jobA = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  const jobB = jobService.createJob({ userId: 200, courseId: 200, assignmentId: 300 });

  // User A can see their own job
  const foundA = jobService.getJob(100, jobA.id);
  assert(foundA !== null, 'User A can retrieve their own job');

  // User A cannot see User B's job
  const stolen = jobService.getJob(100, jobB.id);
  assert(stolen === null, 'User A cannot retrieve User B job');

  // User B cannot see User A's job
  const stolen2 = jobService.getJob(200, jobA.id);
  assert(stolen2 === null, 'User B cannot retrieve User A job');

  // User A's job list does not include User B's job
  const listA = jobService.getUserJobs(100);
  assert(!listA.some((j) => j.id === jobB.id), 'User A job list excludes User B jobs');
})();

console.log('\n=== Job Service: Error Handling & Retry ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  jobService.transitionJob(100, job.id, 'ANALYZING');
  jobService.transitionJob(100, job.id, 'CAPABILITY_CHECK');
  jobService.transitionJob(100, job.id, 'PLANNING');
  jobService.transitionJob(100, job.id, 'GENERATING');

  // Handle retryable error
  const retryableError = { code: 'TIMEOUT', message: 'Request timeout' };
  const afterRetry = jobService.handleJobFailure(100, job.id, retryableError);
  assertEqual(afterRetry.state, 'GENERATING', 'Retryable error keeps job in current state');
  assert(afterRetry.retryCount === 1, 'Retry count incremented');
  assert(afterRetry.nextRetryAt !== null, 'Next retry time set');

  // Handle non-retryable error
  const nonRetryableError = { code: 'UNAUTHORIZED', message: 'Invalid token' };
  const afterFail = jobService.handleJobFailure(100, job.id, nonRetryableError);
  assertEqual(afterFail.state, 'FAILED', 'Non-retryable error fails job');
  assertEqual(afterFail.error.category, 'NON_RETRYABLE', 'Error category correct');
})();

console.log('\n=== Job Service: Sanitize Job ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  const job = jobService.createJob({ userId: 100, courseId: 200, assignmentId: 300 });
  const sanitized = jobService.sanitizeJob(job);

  // Should not expose internal details
  assert(sanitized.id === job.id, 'Sanitized has id');
  assert(sanitized.state === job.state, 'Sanitized has state');
  assert(sanitized.stateLabel !== undefined, 'Sanitized has stateLabel');
  assert(!sanitized.events, 'Sanitized does NOT expose events');
  assert(!sanitized.manifest, 'Sanitized does NOT expose full manifest');
  assert(!sanitized.lastError, 'Sanitized does NOT expose lastError internals');
})();

console.log('\n=== Job Service: Job Summary ===');

(() => {
  const mockUserStorage = {
    _users: {
      100: {
        userId: 100,
        agentSettings: { enabled: true },
        agentJobs: [],
        agentManifests: [],
      },
    },
    loadOrCreateUser(userId) {
      return { ...this._users[userId] };
    },
    saveUserData(userId, data) {
      this._users[userId] = { ...data };
    },
    isAgentEnabled() { return true; },
  };

  const jobService = createAgentJobService(
    { isAgenticHelperEnabled: () => true },
    { getCachedManifest: () => null },
    mockUserStorage
  );

  // Create various jobs
  const job1 = jobService.createJob({ userId: 100, courseId: 1, assignmentId: 1 });
  jobService.transitionJob(100, job1.id, 'ANALYZING');

  const job2 = jobService.createJob({ userId: 100, courseId: 2, assignmentId: 2 });
  // job2 stays in DISCOVERED

  const job3 = jobService.createJob({
    userId: 100, courseId: 3, assignmentId: 3,
    manifest: {
      identity: { courseName: 'Test' },
      metadata: { title: 'Test' },
      capabilityResult: { status: 'UNSUPPORTED', reason: 'test' },
    },
  });
  // job3 is UNSUPPORTED

  const summary = jobService.getJobSummary(100);
  assert(summary.total >= 3, 'Summary total >= 3');
  assert(summary.running >= 2, 'Summary running >= 2');
  assert(summary.unsupported >= 1, 'Summary unsupported >= 1');
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
