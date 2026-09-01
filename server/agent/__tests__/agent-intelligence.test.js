/**
 * agent-intelligence.test.js
 * Agent Intelligence Tests — realistic assignment scenarios
 *
 * Tests:
 *   A: Written report → DOCX (SUPPORTED)
 *   B: Short text response (SUPPORTED)
 *   C: Packet Tracer (UNSUPPORTED)
 *   D: Personal reflection (USER_ACTION_REQUIRED)
 *   E: Assignment with references (fabrication prevention)
 *   F: Assignment with sections
 *   G: Assignment with citation format
 *   H: Context builder tests
 *   I: Validation tests
 *   J: Requirement extraction tests
 */

// ─── Test Harness ────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ FAIL: ${message}`);
    failures.push(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    const msg = `${message} — got "${actual}", expected "${expected}"`;
    console.log(`  ✗ FAIL: ${msg}`);
    failures.push(msg);
  }
}

function assertIncludes(haystack, needle, message) {
  if (haystack && haystack.includes(needle)) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    const msg = `${message} — "${needle}" not found in "${String(haystack).slice(0, 100)}"`;
    console.log(`  ✗ FAIL: ${msg}`);
    failures.push(msg);
  }
}

function assertArrayIncludes(arr, predicate, message) {
  if (arr && arr.some(predicate)) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ FAIL: ${message}`);
    failures.push(message);
  }
}

// ─── Imports ─────────────────────────────────────────────────────────

const {
  buildAssignmentUnderstanding,
  buildAnalyzeContext,
  buildGenerateContext,
  buildRefineContext,
  buildSystemInstruction,
  buildValidationConstraints,
  validateContent,
  extractDetailedRequirements,
} = require('../agent-context');

const {
  createExecutionPlan,
  extractRequirements,
  STEP_TYPES,
  PLAN_STATES,
} = require('../execution-plan');

const {
  JOB_STATES,
  isValidTransition,
} = require('../job-state-machine');

// ─── Mock Manifests ─────────────────────────────────────────────────

function createManifest(overrides = {}) {
  return {
    identity: {
      assignmentId: 999,
      courseId: 201,
      courseName: 'Introduction to Computer Science',
      courseCode: 'CS101',
      userId: 100,
      ...overrides.identity,
    },
    metadata: {
      title: 'Test Assignment',
      description: 'Write a report.',
      plainDescription: 'Write a report.',
      dueDate: null,
      lockAt: null,
      pointsPossible: 100,
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      ...overrides.metadata,
    },
    requirements: {
      categories: ['TEXT'],
      details: [],
      ...overrides.requirements,
    },
    capabilities: {
      required: ['text_generation'],
      supported: ['text_generation', 'docx_generation'],
      partial: [],
      unsupported: [],
      ...overrides.capabilities,
    },
    capabilityResult: {
      status: 'SUPPORTED',
      confidence: 0.9,
      canProceed: true,
      reason: '',
      summary: 'Assignment can be completed',
      ...overrides.capabilityResult,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Test A: Written Report → DOCX (SUPPORTED)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test A: Written Report → DOCX ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Network Security Report',
      description: 'Write a 1500-word report on network security best practices. Include an introduction, methodology section, analysis, and conclusion. Use APA format. Must include at least 5 references.',
      plainDescription: 'Write a 1500-word report on network security best practices. Include an introduction, methodology section, analysis, and conclusion. Use APA format. Must include at least 5 references.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      pointsPossible: 100,
    },
    requirements: {
      categories: ['TEXT', 'FILE'],
      details: [],
    },
    capabilities: {
      required: ['text_generation', 'docx_generation'],
      supported: ['text_generation', 'docx_generation', 'canvas_file_upload'],
      partial: [],
      unsupported: [],
    },
  });

  // Build understanding
  const understanding = buildAssignmentUnderstanding(manifest);
  assertEqual(understanding.title, 'Network Security Report', 'Title extracted correctly');
  assertEqual(understanding.objective.includes('DOCX'), true, 'Objective includes DOCX');
  assertEqual(understanding.capabilityStatus, 'SUPPORTED', 'Capability status is SUPPORTED');
  assertEqual(understanding.referencesRequired, true, 'References detected');
  assertEqual(understanding.constraints.length > 0, true, 'Constraints extracted');

  // Check constraints include word count
  assertArrayIncludes(understanding.constraints, c => c.type === 'word_count', 'Word count constraint detected');
  assertArrayIncludes(understanding.constraints, c => c.type === 'sections', 'Section constraints detected');
  assertArrayIncludes(understanding.constraints, c => c.type === 'citation_format', 'Citation format detected');
  assertArrayIncludes(understanding.constraints, c => c.type === 'references', 'Reference constraint detected');

  // Check deliverables
  assertArrayIncludes(understanding.deliverables, d => d.format === 'docx', 'DOCX deliverable detected');

  // Build analyze context
  const analyzeCtx = buildAnalyzeContext(understanding, manifest);
  assertIncludes(analyzeCtx, 'Network Security Report', 'Analyze context includes title');
  assertIncludes(analyzeCtx, 'APA', 'Analyze context mentions APA format');

  // Build generate context
  const generateCtx = buildGenerateContext(understanding, manifest);
  assertIncludes(generateCtx, '1500', 'Generate context mentions word count');
  assertIncludes(generateCtx, 'introduction', 'Generate context mentions introduction');

  // System instruction
  const sysInstruction = buildSystemInstruction(understanding, null);
  assertIncludes(sysInstruction, 'Network Security Report', 'System instruction includes assignment title');
  assertIncludes(sysInstruction, 'DO NOT fabricate citations', 'System instruction warns about citation fabrication');

  // Validation constraints
  const validationConstraints = buildValidationConstraints(understanding);
  assert(validationConstraints.length > 0, 'Validation constraints created');
  assertArrayIncludes(validationConstraints, c => c.type === 'word_count', 'Word count validation constraint');

  // Validate good content
  const goodContent = 'This is a report about network security. '.repeat(50) +
    '\n\n## Introduction\nNetwork security is important. '.repeat(10) +
    '\n\n## Methodology\nWe used the following approach. '.repeat(10) +
    '\n\n## Analysis\nThe analysis reveals several findings. '.repeat(10) +
    '\n\n## Conclusion\nIn conclusion, network security requires attention. '.repeat(10) +
    '\n\n## References\n(Johnson, 2024) (Smith, 2024) (Williams, 2024) (Brown, 2024) (Davis, 2024)';
  const validation = validateContent(goodContent, validationConstraints);
  assert(validation.passed.length > 0, 'Content validation passes for good content');

  // Check execution plan
  const plan = createExecutionPlan(manifest);
  assert(plan !== null, 'Execution plan created');
  assert(plan.steps.length >= 4, 'Plan has at least 4 steps');

  const stepTypes = plan.steps.map(s => s.type);
  assert(stepTypes.includes(STEP_TYPES.ANALYZE), 'Plan has ANALYZE step');
  assert(stepTypes.includes(STEP_TYPES.GENERATE), 'Plan has GENERATE step');
  assert(stepTypes.includes(STEP_TYPES.REFINE), 'Plan has REFINE step');
  assert(stepTypes.includes(STEP_TYPES.ARTIFACT), 'Plan has ARTIFACT step');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test B: Short Text Response (SUPPORTED)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test B: Short Text Response ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Discussion Board Post',
      description: 'Respond to the following question in 200-300 words: What are the benefits of cloud computing?',
      plainDescription: 'Respond to the following question in 200-300 words: What are the benefits of cloud computing?',
      submissionTypes: ['online_text_entry'],
      allowedExtensions: [],
      pointsPossible: 25,
    },
    requirements: {
      categories: ['TEXT'],
      details: [],
    },
    capabilities: {
      required: ['text_generation'],
      supported: ['text_generation'],
      partial: [],
      unsupported: [],
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  assertEqual(understanding.title, 'Discussion Board Post', 'Title extracted');
  assertEqual(understanding.submissionType, 'online_text_entry', 'Text entry submission type');
  assert(understanding.deliverables.length > 0, 'Has deliverables');
  assertEqual(understanding.personalInfoRequired, false, 'No personal info required');
  assertEqual(understanding.referencesRequired, false, 'No references required');

  // Should have word count constraint
  const wordConstraint = understanding.constraints.find(c => c.type === 'word_count');
  assert(wordConstraint !== undefined, 'Word count constraint detected');

  // Build generate context
  const generateCtx = buildGenerateContext(understanding, manifest);
  assertIncludes(generateCtx, '200-300 words', 'Generate context mentions word range');
  assertIncludes(generateCtx, 'cloud computing', 'Generate context mentions topic');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test C: Packet Tracer (UNSUPPORTED)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test C: Packet Tracer (UNSUPPORTED) ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Packet Tracer Lab',
      description: 'Create a network topology in Cisco Packet Tracer. Submit the .pkt file.',
      plainDescription: 'Create a network topology in Cisco Packet Tracer. Submit the .pkt file.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.pkt'],
      pointsPossible: 100,
    },
    requirements: {
      categories: ['FILE'],
      details: [],
    },
    capabilities: {
      required: ['packet_tracer'],
      supported: [],
      partial: [],
      unsupported: ['packet_tracer'],
    },
    capabilityResult: {
      status: 'UNSUPPORTED',
      confidence: 0.95,
      canProceed: false,
      reason: 'Packet Tracer (.pkt) generation is not supported',
      summary: 'Cannot create Packet Tracer files',
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  assertEqual(understanding.capabilityStatus, 'UNSUPPORTED', 'Capability status is UNSUPPORTED');
  assertEqual(understanding.unsupportedCapabilities.includes('packet_tracer'), true, 'Packet tracer listed as unsupported');

  // The agent should stop here — no execution should proceed
  const sysInstruction = buildSystemInstruction(understanding, null);
  assertIncludes(sysInstruction, 'UNSUPPORTED', 'System instruction reflects unsupported status');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test D: Personal Reflection (USER_ACTION_REQUIRED)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test D: Personal Reflection ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Personal Reflection Essay',
      description: 'Reflect on your own experience with remote learning. Share your personal observations and how it has affected your study habits.',
      plainDescription: 'Reflect on your own experience with remote learning. Share your personal observations and how it has affected your study habits.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      pointsPossible: 50,
    },
    requirements: {
      categories: ['TEXT'],
      details: [],
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  assertEqual(understanding.personalInfoRequired, true, 'Personal info detected');
  assert(understanding.personalInfoQuestions.length > 0, 'Has personal info questions');

  // Generate context should warn about personal info
  const generateCtx = buildGenerateContext(understanding, manifest);
  assertIncludes(generateCtx, 'Personal Information Required', 'Generate context warns about personal info');
  assertIncludes(generateCtx, 'Do NOT fabricate', 'Generate context says not to fabricate');

  // System instruction should include personal info policy
  const sysInstruction = buildSystemInstruction(understanding, null);
  assertIncludes(sysInstruction, 'Personal Information Policy', 'System instruction includes personal info policy');
  assertIncludes(sysInstruction, 'DO NOT fabricate personal', 'System instruction warns against fabrication');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test E: References (Fabrication Prevention)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test E: References (Fabrication Prevention) ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Research Paper',
      description: 'Write a research paper on machine learning. Must include at least 10 references in IEEE format.',
      plainDescription: 'Write a research paper on machine learning. Must include at least 10 references in IEEE format.',
      submissionTypes: ['online_upload'],
      allowedExtensions: ['.docx'],
      pointsPossible: 150,
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  assertEqual(understanding.referencesRequired, true, 'References required detected');
  assertIncludes(understanding.referencesNote, '10', 'Reference count detected');
  assertArrayIncludes(understanding.constraints, c => c.type === 'citation_format', 'Citation format detected');
  assertArrayIncludes(understanding.constraints, c => c.type === 'references', 'Reference constraint detected');

  // System instruction should warn about fabrication
  const sysInstruction = buildSystemInstruction(understanding, null);
  assertIncludes(sysInstruction, 'DO NOT fabricate citations', 'System instruction warns about citation fabrication');
  assertIncludes(sysInstruction, 'DO NOT fabricate citations, URLs, authors', 'System instruction specifically mentions URLs and authors');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test F: Sections
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test F: Section Requirements ===');

(() => {
  const desc = 'Analyze the case study. Include an introduction, methodology, analysis, discussion, and conclusion. Must have a bibliography.';
  const manifest = createManifest({
    metadata: {
      title: 'Case Study Analysis',
      description: desc,
      plainDescription: desc,
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  const sectionConstraint = understanding.constraints.find(c => c.type === 'sections');
  assert(sectionConstraint !== undefined, 'Section constraint detected');
  assert(sectionConstraint.value.includes('introduction'), 'Introduction section detected');
  assert(sectionConstraint.value.includes('conclusion'), 'Conclusion section detected');
  assert(sectionConstraint.value.includes('bibliography'), 'Bibliography section detected');

  // Validate content with required sections
  const contentWithSections = '## Introduction\nThis is the introduction.\n## Methodology\nWe used methods.\n## Analysis\nHere is the analysis.\n## Discussion\nDiscussion of results.\n## Conclusion\nFinal thoughts.\n## Bibliography\nReferences here.';
  const constraints = buildValidationConstraints(understanding);
  const sectionValidation = validateContent(contentWithSections, constraints);
  assert(sectionValidation.passed.some(c => c.type === 'sections'), 'Section validation passes for complete content');

  // Validate content missing sections
  const contentMissingSections = '## Introduction\nThis is the introduction. No other sections.';
  const missingValidation = validateContent(contentMissingSections, constraints);
  assert(missingValidation.failed.some(c => c.type === 'sections') || missingValidation.warnings.length > 0,
    'Section validation catches missing sections');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test G: Citation Format
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test G: Citation Format ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Literature Review',
      description: 'Write a literature review using MLA format. Include at least 5 references.',
      plainDescription: 'Write a literature review using MLA format. Include at least 5 references.',
    },
  });

  const understanding = buildAssignmentUnderstanding(manifest);
  assertArrayIncludes(understanding.constraints, c => c.type === 'citation_format' && c.value === 'MLA',
    'MLA citation format detected');

  const generateCtx = buildGenerateContext(understanding, manifest);
  assertIncludes(generateCtx, 'MLA', 'Generate context mentions MLA format');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test H: Context Builder
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test H: Context Builder ===');

(() => {
  const manifest = createManifest();
  const understanding = buildAssignmentUnderstanding(manifest);

  assert(typeof understanding.title === 'string', 'Title is a string');
  assert(typeof understanding.objective === 'string', 'Objective is a string');
  assert(Array.isArray(understanding.requirements), 'Requirements is an array');
  assert(Array.isArray(understanding.constraints), 'Constraints is an array');
  assert(Array.isArray(understanding.deliverables), 'Deliverables is an array');
  assert(typeof understanding.capabilityStatus === 'string', 'Capability status is a string');
  assert(Array.isArray(understanding.supportedCapabilities), 'Supported capabilities is an array');
  assert(Array.isArray(understanding.unsupportedCapabilities), 'Unsupported capabilities is an array');
  assert(typeof understanding.personalInfoRequired === 'boolean', 'Personal info required is boolean');
  assert(typeof understanding.referencesRequired === 'boolean', 'References required is boolean');
  assert(Array.isArray(understanding.uncertainties), 'Uncertainties is an array');

  // Refine context
  const refineCtx = buildRefineContext('Generated content here.', understanding);
  assertIncludes(refineCtx, 'Refine Content', 'Refine context has header');
  assertIncludes(refineCtx, 'Generated content here.', 'Refine context includes content');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test I: Validation
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test I: Content Validation ===');

(() => {
  // Word count validation
  const constraints = [
    { type: 'word_count', target: 100, tolerance: 15, description: 'At least 100 words' },
  ];

  // Too short
  const shortContent = 'This is too short.';
  const shortResult = validateContent(shortContent, constraints);
  assert(shortResult.failed.some(c => c.type === 'word_count'), 'Short content fails word count');

  // Good length
  const goodContent = 'word '.repeat(100);
  const goodResult = validateContent(goodContent, constraints);
  assert(goodResult.passed.some(c => c.type === 'word_count'), 'Good length passes word count');

  // Empty content
  const emptyResult = validateContent('', constraints);
  assert(emptyResult.valid === false, 'Empty content fails validation');
  assert(emptyResult.failed.length > 0, 'Empty content has failures');

  // Null content
  const nullResult = validateContent(null, constraints);
  assert(nullResult.valid === false, 'Null content fails validation');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test J: Requirement Extraction
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test J: Requirement Extraction ===');

(() => {
  const manifest = createManifest({
    metadata: {
      title: 'Complex Assignment',
      description: 'Write a 2000-word essay. Include an introduction, methodology, analysis, and conclusion. Use APA format. Must include at least 8 references. Reflect on your own experience with the topic.',
      plainDescription: 'Write a 2000-word essay. Include an introduction, methodology, analysis, and conclusion. Use APA format. Must include at least 8 references. Reflect on your own experience with the topic.',
    },
  });

  // Test extractDetailedRequirements
  const extracted = extractDetailedRequirements(manifest);
  assert(extracted.constraints.length >= 4, 'Multiple constraints extracted');
  assert(extracted.referencesRequired === true, 'References required detected');
  assert(extracted.personalInfoRequired === true, 'Personal info required detected');
  assertArrayIncludes(extracted.constraints, c => c.type === 'word_count', 'Word count extracted');
  assertArrayIncludes(extracted.constraints, c => c.type === 'sections', 'Sections extracted');
  assertArrayIncludes(extracted.constraints, c => c.type === 'citation_format', 'Citation format extracted');
  assertArrayIncludes(extracted.constraints, c => c.type === 'references', 'References extracted');

  // Test extractRequirements (from execution-plan.js)
  const planReqs = extractRequirements(manifest);
  assert(planReqs.length >= 5, 'Plan requirements extracted');
  assertArrayIncludes(planReqs, r => r.type === 'length', 'Word count requirement in plan');
  assertArrayIncludes(planReqs, r => r.type === 'section', 'Section requirements in plan');
  assertArrayIncludes(planReqs, r => r.type === 'content' && r.id === 'references', 'Reference requirement in plan');
  assertArrayIncludes(planReqs, r => r.type === 'personal', 'Personal requirement in plan');
  assertArrayIncludes(planReqs, r => r.type === 'format' && r.id === 'citation_format', 'Citation format in plan');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test K: Job Resumption
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test K: Job Resumption ===');

(() => {
  // USER_ACTION_REQUIRED → EXECUTING should now be valid
  assert(isValidTransition(JOB_STATES.USER_ACTION_REQUIRED, JOB_STATES.EXECUTING),
    'USER_ACTION_REQUIRED → EXECUTING is now valid (resume)');
  assert(isValidTransition(JOB_STATES.USER_ACTION_REQUIRED, JOB_STATES.CANCELLED),
    'USER_ACTION_REQUIRED → CANCELLED still works');
  assert(isValidTransition(JOB_STATES.EXECUTING, JOB_STATES.USER_ACTION_REQUIRED),
    'EXECUTING → USER_ACTION_REQUIRED is valid (pause)');
})();

// ═══════════════════════════════════════════════════════════════════════
// Test L: Tool Registry Enhancements
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test L: Tool Registry Enhancements ===');

(async () => {
  const { registerTool, getToolDefinitions, clearTools, TOOL_PERMISSIONS } = require('../tools/tool-registry');

  clearTools();

  registerTool({
    id: 'test.read_tool',
    name: 'Read Tool',
    description: 'Reads data',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  });

  registerTool({
    id: 'test.write_tool',
    name: 'Write Tool',
    description: 'Writes data',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.WRITE],
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  });

  registerTool({
    id: 'test.submit_tool',
    name: 'Submit Tool',
    description: 'Submits assignment',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.SUBMIT],
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  });

  const defs = getToolDefinitions();
  const readDef = defs.find(d => d.id === 'test.read_tool');
  const writeDef = defs.find(d => d.id === 'test.write_tool');
  const submitDef = defs.find(d => d.id === 'test.submit_tool');

  assertEqual(readDef.riskLevel, 'low', 'READ tool has low risk');
  assertEqual(writeDef.riskLevel, 'medium', 'WRITE tool has medium risk');
  assertEqual(submitDef.riskLevel, 'critical', 'SUBMIT tool has critical risk');
  assertEqual(readDef.availability, 'available', 'Tool availability is available');
})();

// ─── Results ─────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${testsPassed}/${testsPassed + testsFailed} passed, ${testsFailed} failed`);
console.log('='.repeat(50));

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nAll agent intelligence tests passed!');
  process.exit(0);
}
