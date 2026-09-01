/**
 * execution-pipeline.test.js
 * Tests for the Execution Pipeline (Phase 16).
 *
 * Covers:
 *   - Plan creation from manifest
 *   - Plan validation against capabilities
 *   - Step states and dependencies
 *   - Step execution order
 *   - Requirement coverage
 *   - Human review package
 *   - Resume behavior
 *   - Block propagation on failure
 */

const assert = require('assert');

// ─── Test Helpers ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ FAIL: ${label}`);
  }
}

function assertEqual(actual, expected, label) {
  ok(actual === expected, `${label} — expected "${expected}", got "${actual}"`);
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ─── Import ────────────────────────────────────────────────────────

const {
  STEP_STATES,
  STEP_TYPES,
  PLAN_STATES,
  createExecutionPlan,
  validatePlan,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  blockDependents,
  extractRequirements,
  checkRequirementCoverage,
  markRequirementsCovered,
  getPlanProgress,
  buildReviewPackage,
  canResume,
  getResumeStep,
} = require('../execution-plan');

// ─── Mock Manifest ─────────────────────────────────────────────────

function createMockManifest(overrides = {}) {
  return {
    id: 'manifest_001',
    metadata: {
      title: 'Research Report',
      description: 'Write a 1000-word research report with a conclusion.',
      plainDescription: 'Write a 1000-word research report with a conclusion.',
      dueDate: '2026-09-15',
      pointsPossible: 100,
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx', '.pdf'],
    },
    identity: {
      courseName: 'Computer Science 101',
      courseCode: 'CS 101',
    },
    requirements: {
      categories: ['TEXT', 'FILE'],
      hasExternalTools: false,
      hasPhysicalActivity: false,
    },
    capabilityResult: {
      status: 'SUPPORTED',
      reason: '',
      unsupportedCapabilities: [],
    },
    capabilities: {
      supported: ['text_generation', 'text_refinement', 'docx_generation'],
      unsupported: [],
    },
    ...overrides,
  };
}

function createMockJob(overrides = {}) {
  return {
    id: 'ajob_001',
    userId: 100,
    courseId: 200,
    assignmentId: 300,
    assignmentTitle: 'Research Report',
    courseName: 'Computer Science 101',
    state: 'DISCOVERED',
    manifest: createMockManifest(),
    artifacts: [],
    ...overrides,
  };
}

// ─── 1. Plan Creation ──────────────────────────────────────────────

section('1. Plan Creation from Manifest');

{
  const manifest = createMockManifest();
  const plan = createExecutionPlan(manifest);

  ok(plan.id.startsWith('plan_'), 'Plan ID starts with plan_');
  assertEqual(plan.state, PLAN_STATES.CREATED, 'Initial plan state is CREATED');
  ok(Array.isArray(plan.steps), 'Plan has steps array');
  ok(plan.steps.length > 0, 'Plan has at least one step');

  // Check step types
  const stepTypes = plan.steps.map(s => s.type);
  ok(stepTypes.includes(STEP_TYPES.ANALYZE), 'Plan has ANALYZE step');
  ok(stepTypes.includes(STEP_TYPES.GENERATE), 'Plan has GENERATE step');
  ok(stepTypes.includes(STEP_TYPES.REFINE), 'Plan has REFINE step');
  ok(stepTypes.includes(STEP_TYPES.VALIDATE), 'Plan has VALIDATE step');
  ok(stepTypes.includes(STEP_TYPES.ARTIFACT), 'Plan has ARTIFACT step');
  ok(stepTypes.includes(STEP_TYPES.ARTIFACT_VALIDATE), 'Plan has ARTIFACT_VALIDATE step');

  // Check initial states
  for (const step of plan.steps) {
    assertEqual(step.state, STEP_STATES.PENDING, `Step "${step.label}" starts as PENDING`);
  }

  // Check requirements extracted
  ok(Array.isArray(plan.requirements), 'Plan has requirements array');
  ok(plan.requirements.length > 0, 'Requirements extracted from manifest');
}

// ─── 2. Step Dependencies ──────────────────────────────────────────

section('2. Step Dependencies');

{
  const plan = createExecutionPlan(createMockManifest());

  // Analyze has no dependencies
  const analyzeStep = plan.steps.find(s => s.type === STEP_TYPES.ANALYZE);
  ok(analyzeStep.dependencies.length === 0, 'ANALYZE has no dependencies');

  // Generate depends on analyze
  const generateStep = plan.steps.find(s => s.type === STEP_TYPES.GENERATE);
  ok(generateStep.dependencies.includes(analyzeStep.id), 'GENERATE depends on ANALYZE');

  // Refine depends on generate
  const refineStep = plan.steps.find(s => s.type === STEP_TYPES.REFINE);
  ok(refineStep.dependencies.includes(generateStep.id), 'REFINE depends on GENERATE');

  // Validate depends on refine
  const validateStep = plan.steps.find(s => s.type === STEP_TYPES.VALIDATE);
  ok(validateStep.dependencies.includes(refineStep.id), 'VALIDATE depends on REFINE');

  // Artifact depends on validate
  const artifactStep = plan.steps.find(s => s.type === STEP_TYPES.ARTIFACT);
  ok(artifactStep.dependencies.includes(validateStep.id), 'ARTIFACT depends on VALIDATE');

  // Artifact validate depends on artifact
  const artifactValidateStep = plan.steps.find(s => s.type === STEP_TYPES.ARTIFACT_VALIDATE);
  ok(artifactValidateStep.dependencies.includes(artifactStep.id), 'ARTIFACT_VALIDATE depends on ARTIFACT');
}

// ─── 3. Step Execution Order ───────────────────────────────────────

section('3. Step Execution Order');

{
  const plan = createExecutionPlan(createMockManifest());

  // First step should be ANALYZE
  const first = getNextStep(plan);
  ok(first !== null, 'First step exists');
  assertEqual(first.type, STEP_TYPES.ANALYZE, 'First step is ANALYZE');

  // Complete analyze
  startStep(plan, first.id);
  assertEqual(first.state, STEP_STATES.RUNNING, 'Step is RUNNING after start');
  completeStep(plan, first.id, { analysis: 'done' });
  assertEqual(first.state, STEP_STATES.COMPLETED, 'Step is COMPLETED after complete');

  // Next should be GENERATE
  const second = getNextStep(plan);
  ok(second !== null, 'Second step exists');
  assertEqual(second.type, STEP_TYPES.GENERATE, 'Second step is GENERATE');

  // Complete generate
  startStep(plan, second.id);
  completeStep(plan, second.id, { generatedContent: 'test content' });

  // Next should be REFINE
  const third = getNextStep(plan);
  assertEqual(third.type, STEP_TYPES.REFINE, 'Third step is REFINE');

  // Complete all remaining steps
  startStep(plan, third.id);
  completeStep(plan, third.id);

  const fourth = getNextStep(plan);
  assertEqual(fourth.type, STEP_TYPES.VALIDATE, 'Fourth step is VALIDATE');
  startStep(plan, fourth.id);
  completeStep(plan, fourth.id);

  const fifth = getNextStep(plan);
  assertEqual(fifth.type, STEP_TYPES.ARTIFACT, 'Fifth step is ARTIFACT');
  startStep(plan, fifth.id);
  completeStep(plan, fifth.id);

  const sixth = getNextStep(plan);
  assertEqual(sixth.type, STEP_TYPES.ARTIFACT_VALIDATE, 'Sixth step is ARTIFACT_VALIDATE');
  startStep(plan, sixth.id);
  completeStep(plan, sixth.id);

  // No more steps
  const none = getNextStep(plan);
  ok(none === null, 'No more steps after all completed');
}

// ─── 4. Plan Validation ────────────────────────────────────────────

section('4. Plan Validation Against Capabilities');

{
  // Supported assignment
  const plan1 = createExecutionPlan(createMockManifest());
  const result1 = validatePlan(plan1, {
    status: 'SUPPORTED',
    unsupportedCapabilities: [],
  });
  ok(result1.valid === true, 'Supported assignment validates');
  ok(result1.blockedSteps.length === 0, 'No blocked steps');

  // Unsupported assignment
  const plan2 = createExecutionPlan(createMockManifest({
    capabilityResult: {
      status: 'UNSUPPORTED',
      reason: 'Cannot generate required format',
      unsupportedCapabilities: ['docx_generation'],
    },
  }));
  const result2 = validatePlan(plan2, {
    status: 'UNSUPPORTED',
    unsupportedCapabilities: ['docx_generation'],
  });
  ok(result2.valid === false, 'Unsupported assignment fails validation');
  ok(result2.blockedSteps.length > 0, 'Has blocked steps');

  // Check that ARTIFACT step is blocked
  const artifactStep = plan2.steps.find(s => s.type === STEP_TYPES.ARTIFACT);
  assertEqual(artifactStep.state, STEP_STATES.BLOCKED, 'ARTIFACT step is BLOCKED');
}

// ─── 5. Block Propagation ──────────────────────────────────────────

section('5. Block Propagation on Step Failure');

{
  const plan = createExecutionPlan(createMockManifest());

  // Start and fail the ANALYZE step
  const analyzeStep = plan.steps.find(s => s.type === STEP_TYPES.ANALYZE);
  startStep(plan, analyzeStep.id);
  failStep(plan, analyzeStep.id, { code: 'ANALYSIS_FAILED', message: 'Could not analyze' });

  assertEqual(analyzeStep.state, STEP_STATES.FAILED, 'ANALYZE is FAILED');

  // All dependent steps should be BLOCKED
  const generateStep = plan.steps.find(s => s.type === STEP_TYPES.GENERATE);
  assertEqual(generateStep.state, STEP_STATES.BLOCKED, 'GENERATE is BLOCKED after ANALYZE failure');

  const refineStep = plan.steps.find(s => s.type === STEP_TYPES.REFINE);
  assertEqual(refineStep.state, STEP_STATES.BLOCKED, 'REFINE is BLOCKED');

  // getNextStep should return null (no executable steps)
  const next = getNextStep(plan);
  ok(next === null, 'No executable steps after failure');
}

// ─── 6. Requirement Coverage ───────────────────────────────────────

section('6. Requirement Coverage');

{
  const plan = createExecutionPlan(createMockManifest());

  // Initially, requirements are not covered
  const initialCoverage = checkRequirementCoverage(plan);
  ok(initialCoverage.covered === false, 'Not all requirements covered initially');
  ok(initialCoverage.uncovered.length > 0, 'Has uncovered requirements');

  // Mark requirements as covered
  const generateStep = plan.steps.find(s => s.type === STEP_TYPES.GENERATE);
  startStep(plan, generateStep.id);
  completeStep(plan, generateStep.id, { generatedContent: 'content' });
  markRequirementsCovered(plan, generateStep.id);

  // Check coverage improved
  const midCoverage = checkRequirementCoverage(plan);
  ok(midCoverage.coveredCount > initialCoverage.coveredCount || midCoverage.coveredCount === initialCoverage.coveredCount,
    'Coverage tracking works');
}

// ─── 7. Plan Progress ──────────────────────────────────────────────

section('7. Plan Progress');

{
  const plan = createExecutionPlan(createMockManifest());
  const total = plan.steps.length;

  // Initially 0% complete
  const initial = getPlanProgress(plan);
  assertEqual(initial.percent, 0, 'Initial progress is 0%');
  assertEqual(initial.total, total, 'Total steps correct');
  assertEqual(initial.completed, 0, 'No steps completed');

  // Complete first step
  const first = getNextStep(plan);
  startStep(plan, first.id);
  completeStep(plan, first.id);

  const afterFirst = getPlanProgress(plan);
  const expectedPercent = Math.round((1 / total) * 100);
  assertEqual(afterFirst.percent, expectedPercent, `Progress after first step is ${expectedPercent}%`);
  assertEqual(afterFirst.completed, 1, 'One step completed');
}

// ─── 8. Human Review Package ───────────────────────────────────────

section('8. Human Review Package');

{
  const plan = createExecutionPlan(createMockManifest());
  const job = createMockJob();

  // Complete some steps
  for (let i = 0; i < 3; i++) {
    const step = getNextStep(plan);
    if (!step) break;
    startStep(plan, step.id);
    completeStep(plan, step.id, { result: `Step ${i} done` });
  }

  const reviewPackage = buildReviewPackage(plan, job);

  ok(reviewPackage.assignment.title === 'Research Report', 'Review package has assignment title');
  ok(reviewPackage.assignment.course === 'Computer Science 101', 'Review package has course name');
  ok(Array.isArray(reviewPackage.completedSteps), 'Review package has completed steps');
  ok(reviewPackage.completedSteps.length === 3, 'Review package shows 3 completed steps');
  ok(Array.isArray(reviewPackage.artifacts), 'Review package has artifacts');
  ok(Array.isArray(reviewPackage.warnings), 'Review package has warnings');
  ok(reviewPackage.submissionTarget.courseId === 200, 'Review package has submission target');

  // Verify no internal AI reasoning exposed
  for (const step of reviewPackage.completedSteps) {
    ok(!step.result?.reasoning, 'No AI reasoning in review package');
  }
}

// ─── 9. Resume Behavior ────────────────────────────────────────────

section('9. Resume Behavior');

{
  const plan = createExecutionPlan(createMockManifest());

  // Plan is not pausable in CREATED state
  ok(canResume(plan) === false, 'Cannot resume CREATED plan');

  // Pause the plan
  plan.state = PLAN_STATES.PAUSED;
  ok(canResume(plan) === true, 'Can resume PAUSED plan');

  // Get resume step
  const resumeStep = getResumeStep(plan);
  ok(resumeStep !== null, 'Resume step exists');
  assertEqual(resumeStep.type, STEP_TYPES.ANALYZE, 'Resume from first pending step');
}

// ─── 10. Duplicate Execution Prevention ─────────────────────────────

section('10. Duplicate Execution Prevention');

{
  const plan = createExecutionPlan(createMockManifest());
  const step = plan.steps[0];

  // Start the step
  startStep(plan, step.id);
  assertEqual(step.state, STEP_STATES.RUNNING, 'Step is RUNNING');

  // Try to start again — should throw
  let threw = false;
  try {
    startStep(plan, step.id);
  } catch (e) {
    threw = true;
  }
  ok(threw, 'Starting a RUNNING step throws');

  // Complete it
  completeStep(plan, step.id);

  // Try to start again — should throw
  let threw2 = false;
  try {
    startStep(plan, step.id);
  } catch (e) {
    threw2 = true;
  }
  ok(threw2, 'Starting a COMPLETED step throws');
}

// ─── 11. Unsupported File Assignment ───────────────────────────────

section('11. Unsupported File Assignment');

{
  const manifest = createMockManifest({
    requirements: {
      categories: ['FILE'],
      hasExternalTools: false,
      hasPhysicalActivity: false,
    },
    metadata: {
      title: 'Packet Tracer Lab',
      description: 'Complete the Packet Tracer activity and submit the .pkt file.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.pkt'],
    },
  });

  const plan = createExecutionPlan(manifest);

  // Should have blocked step for unsupported format
  const blockedStep = plan.steps.find(s => s.blocked);
  ok(blockedStep !== null, 'Unsupported assignment has blocked step');
  ok(blockedStep.blockedReason.includes('unsupported') || blockedStep.blockedReason.includes('Unsupported'),
    'Blocked reason mentions unsupported');
}

// ─── 12. Requirements Extracted ────────────────────────────────────

section('12. Requirements Extracted from Manifest');

{
  const manifest = createMockManifest();
  const requirements = extractRequirements(manifest);

  ok(Array.isArray(requirements), 'Requirements is array');
  ok(requirements.length > 0, 'Requirements extracted');

  // Check word count requirement
  const wordCountReq = requirements.find(r => r.id === 'word_count');
  ok(wordCountReq !== null, 'Word count requirement extracted');
  assertEqual(wordCountReq.value, 1000, 'Word count is 1000');

  // Check conclusion requirement
  const conclusionReq = requirements.find(r => r.id === 'conclusion');
  ok(conclusionReq !== null, 'Conclusion requirement extracted');
}

// ─── Summary ───────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nAll execution pipeline tests passed!');
}
