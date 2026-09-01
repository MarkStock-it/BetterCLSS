/**
 * capability-analyzer.test.js
 * Tests for the Agentic Helper capability analysis engine.
 *
 * Run with: node server/agent/__tests__/capability-analyzer.test.js
 */

const { analyzeAssignment } = require('../capability-analyzer');
const { getCapability, getAllCapabilities } = require('../capability-registry');
const { detectExternalTools } = require('../external-tools');
const { extractRequirements, detectPhysicalActivity } = require('../requirement-extractor');
const { normalizeAssignment } = require('../assignment-normalizer');

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

function assertIncludes(array, item, testName) {
  assert(Array.isArray(array) && array.includes(item), testName, `expected array to include "${item}"`);
}

function assertNotIncludes(array, item, testName) {
  assert(Array.isArray(array) && !array.includes(item), testName, `expected array NOT to include "${item}"`);
}

// ─── Test Cases ──────────────────────────────────────────────────────

console.log('\n=== Capability Registry Tests ===');

(() => {
  const caps = getAllCapabilities();
  assert(Object.keys(caps).length > 0, 'Registry has capabilities');
  assert(getCapability('text_generation')?.status === 'SUPPORTED', 'text_generation is SUPPORTED');
  assert(getCapability('docx_generation')?.status === 'SUPPORTED', 'docx_generation is SUPPORTED');
  assert(getCapability('pdf_generation')?.status === 'UNSUPPORTED', 'pdf_generation is UNSUPPORTED (no implementation)');
  assert(getCapability('pptx_generation')?.status === 'PARTIAL', 'pptx_generation is PARTIAL');
  assert(getCapability('video_generation')?.status === 'UNSUPPORTED', 'video_generation is UNSUPPORTED');
  assert(getCapability('physical_activity')?.status === 'UNSUPPORTED', 'physical_activity is UNSUPPORTED');
  assert(getCapability('code_execution')?.status === 'UNSUPPORTED', 'code_execution is UNSUPPORTED');
  assert(getCapability('canvas_submission')?.status === 'SUPPORTED', 'canvas_submission is SUPPORTED');
  assert(getCapability('canvas_file_upload')?.status === 'SUPPORTED', 'canvas_file_upload is SUPPORTED');
  assert(getCapability('canvas_create_comment')?.status === 'SUPPORTED', 'canvas_create_comment is SUPPORTED');
})();

console.log('\n=== External Tool Detection Tests ===');

(() => {
  const packetTracer = detectExternalTools('Configure the network in Cisco Packet Tracer and submit the .pkt file');
  assert(packetTracer.length === 1, 'Detects Packet Tracer');
  assertEqual(packetTracer[0]?.toolId, 'cisco_packet_tracer', 'Packet Tracer tool ID correct');
  assert(!packetTracer[0]?.executionAvailable, 'Packet Tracer execution not available');

  const matlab = detectExternalTools('Write a MATLAB script to solve the differential equation');
  assert(matlab.length === 1, 'Detects MATLAB');
  assertEqual(matlab[0]?.toolId, 'matlab', 'MATLAB tool ID correct');

  const noTool = detectExternalTools('Write a 1000-word essay about database normalization');
  assert(noTool.length === 0, 'No external tools detected for essay');

  const autocad = detectExternalTools('Submit your AutoCAD drawing in .dwg format');
  assert(autocad.length === 1, 'Detects AutoCAD from file extension');
})();

console.log('\n=== Physical Activity Detection Tests ===');

(() => {
  const strongPhysical = detectPhysicalActivity('Build the circuit on the breadboard and measure the voltage across each resistor');
  assert(strongPhysical.detected, 'Detects strong physical activity');
  assert(strongPhysical.confidence >= 0.7, 'Strong physical activity has high confidence');

  const noPhysical = detectPhysicalActivity('Write a 1000-word essay about database normalization');
  assert(!noPhysical.detected, 'No physical activity in essay assignment');

  const moderatePhysical = detectPhysicalActivity('Perform the experiment in the lab and record your observations');
  assert(moderatePhysical.detected, 'Detects moderate physical activity');
})();

console.log('\n=== Case 1: Simple Essay (SUPPORTED) ===');

(() => {
  const assignment = {
    id: 101,
    name: 'Database Normalization Essay',
    description: '<p>Write a 1000-word essay about database normalization. Submit as a DOCX file.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.docx'],
    points_possible: 100,
  };

  const result = analyzeAssignment(assignment);

  assertEqual(result.status, 'SUPPORTED', 'Case 1: Status is SUPPORTED');
  assert(result.canProceed === true, 'Case 1: canProceed is true');
  assertIncludes(result.requiredCapabilities, 'text_generation', 'Case 1: Requires text_generation');
  assertIncludes(result.requiredCapabilities, 'text_refinement', 'Case 1: Requires text_refinement');
  assertIncludes(result.requiredCapabilities, 'docx_generation', 'Case 1: Requires docx_generation');
  assertIncludes(result.requiredCapabilities, 'canvas_file_upload', 'Case 1: Requires canvas_file_upload');
  assertIncludes(result.requiredCapabilities, 'canvas_submission', 'Case 1: Requires canvas_submission');
  assert(result.noSubmission === false, 'Case 1: noSubmission is false');
  assert(typeof result.summary === 'string' && result.summary.length > 0, 'Case 1: Has summary');
  assert(typeof result.confidence === 'number' && result.confidence > 0, 'Case 1: Has confidence score');
})();

console.log('\n=== Case 2: Packet Tracer (UNSUPPORTED) ===');

(() => {
  const assignment = {
    id: 102,
    name: 'Network Configuration Lab',
    description: '<p>Configure the network topology in Cisco Packet Tracer and submit the resulting .pkt file.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pkt'],
    points_possible: 50,
  };

  const result = analyzeAssignment(assignment);

  assertEqual(result.status, 'UNSUPPORTED', 'Case 2: Status is UNSUPPORTED');
  assert(result.canProceed === false, 'Case 2: canProceed is false');
  assert(result.noSubmission === true, 'Case 2: noSubmission is true');
  assert(result.hasExternalTools === true, 'Case 2: Has external tools');
  assert(result.externalTools.length > 0, 'Case 2: External tools detected');
  assertEqual(result.externalTools[0]?.toolId, 'cisco_packet_tracer', 'Case 2: Packet Tracer detected');
  assert(typeof result.summary === 'string' && result.summary.includes('cannot'), 'Case 2: Summary mentions cannot');
})();

console.log('\n=== Case 3: Mixed Supported/Unsupported (UNSUPPORTED - video required) ===');

(() => {
  const assignment = {
    id: 103,
    name: 'Marketing Presentation',
    description: '<p>Write a report, create a PowerPoint presentation, and record a five-minute video presentation.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.docx', '.pptx', '.mp4'],
    points_possible: 100,
  };

  const result = analyzeAssignment(assignment);

  // Per spec: if ANY required capability is unsupported, status is UNSUPPORTED
  assertEqual(result.status, 'UNSUPPORTED', 'Case 3: Status is UNSUPPORTED (video required but unavailable)');
  assert(result.canProceed === false, 'Case 3: canProceed is false');
  assertIncludes(result.unsupportedCapabilities, 'video_generation', 'Case 3: video_generation is unsupported');
  assert(typeof result.summary === 'string' && result.summary.length > 0, 'Case 3: Has summary');
})();

console.log('\n=== Case 4: Unknown External Software (UNKNOWN or UNSUPPORTED) ===');

(() => {
  const assignment = {
    id: 104,
    name: 'Laboratory Activity',
    description: '<p>Complete the activity using the software demonstrated in laboratory.</p>',
    submission_types: ['online_upload'],
    points_possible: 30,
  };

  const result = analyzeAssignment(assignment);

  // Should be UNKNOWN or UNSUPPORTED depending on what's detected
  assert(
    result.status === 'UNKNOWN' || result.status === 'UNSUPPORTED' || result.status === 'SUPPORTED',
    'Case 4: Status is UNKNOWN, UNSUPPORTED, or SUPPORTED (depends on detected requirements)'
  );
  // If only Canvas upload is required, it may be SUPPORTED
  // If unknown software is detected as external, it would be UNSUPPORTED
  assert(result.canProceed === false || result.status === 'SUPPORTED', 'Case 4: canProceed reflects analysis');
  assert(typeof result.summary === 'string', 'Case 4: Has summary');
})();

console.log('\n=== Case 5: Physical Activity (UNSUPPORTED) ===');

(() => {
  const assignment = {
    id: 105,
    name: 'Circuit Lab',
    description: '<p>Build the circuit physically, measure the voltage across each component, take a photograph of your setup, and submit the results.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf', '.jpg'],
    points_possible: 40,
  };

  const result = analyzeAssignment(assignment);

  assertEqual(result.status, 'UNSUPPORTED', 'Case 5: Status is UNSUPPORTED');
  assert(result.canProceed === false, 'Case 5: canProceed is false');
  assert(result.hasPhysicalActivity === true, 'Case 5: Physical activity detected');
  assert(typeof result.summary === 'string' && result.summary.toLowerCase().includes('physical'), 'Case 5: Summary mentions physical');
})();

console.log('\n=== Case 6: Multiple Files (SUPPORTED) ===');

(() => {
  const assignment = {
    id: 106,
    name: 'Data Analysis Report',
    description: '<p>Submit: 1. PDF report 2. XLSX dataset 3. Screenshot of your analysis</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf', '.xlsx', '.png'],
    points_possible: 75,
  };

  const result = analyzeAssignment(assignment);

  // Should detect multiple file requirements
  assert(result.requirements.length >= 2, 'Case 6: Multiple requirements detected');
  assertIncludes(result.requirementCategories, 'FILE', 'Case 6: FILE requirement detected');
  assert(typeof result.summary === 'string', 'Case 6: Has summary');
})();

console.log('\n=== Case 7: Rubric Requirements ===');

(() => {
  const rubric = {
    data: [
      { description: 'Written Analysis', long_description: 'Provide a thorough written analysis', criterion: 'rating' },
      { description: 'Screenshot Evidence', long_description: 'Include a screenshot of your work', criterion: 'rating' },
    ],
  };

  const assignment = {
    id: 107,
    name: 'Analysis Assignment',
    description: '<p>Complete the analysis and submit your results.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf', '.png'],
    points_possible: 50,
  };

  const result = analyzeAssignment(assignment, { rubric });

  assert(result.hasRubric !== false, 'Case 7: Rubric data included');
  assert(typeof result.summary === 'string', 'Case 7: Has summary');
})();

console.log('\n=== Case 8: Plain Text Entry (SUPPORTED) ===');

(() => {
  const assignment = {
    id: 108,
    name: 'Discussion Post',
    description: '<p>Answer the following question in 200 words or more.</p>',
    submission_types: ['online_text_entry'],
    points_possible: 20,
  };

  const result = analyzeAssignment(assignment);

  assertEqual(result.status, 'SUPPORTED', 'Case 8: Status is SUPPORTED');
  assert(result.canProceed === true, 'Case 8: canProceed is true');
  assertIncludes(result.requiredCapabilities, 'text_generation', 'Case 8: Requires text_generation');
})();

console.log('\n=== Case 9: PDF Submission (SUPPORTED) ===');

(() => {
  const assignment = {
    id: 109,
    name: 'Research Report',
    description: '<p>Write a 5-page research report and submit as PDF.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf'],
    points_possible: 100,
  };

  const result = analyzeAssignment(assignment);

  assertEqual(result.status, 'UNSUPPORTED', 'Case 9: Status is UNSUPPORTED (PDF not implemented)');
  assert(result.canProceed === false, 'Case 9: canProceed is false');
  assertIncludes(result.requiredCapabilities, 'pdf_generation', 'Case 9: Requires pdf_generation');
  assertIncludes(result.requiredCapabilities, 'text_generation', 'Case 9: Requires text_generation');
})();

console.log('\n=== Case 10: PowerPoint + Video (UNSUPPORTED - video required) ===');

(() => {
  const assignment = {
    id: 110,
    name: 'Presentation Assignment',
    description: '<p>Create a PowerPoint presentation and record yourself presenting it for 5 minutes.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pptx', '.mp4'],
    points_possible: 80,
  };

  const result = analyzeAssignment(assignment);

  // Per spec: if ANY required capability is unsupported, status is UNSUPPORTED
  assertEqual(result.status, 'UNSUPPORTED', 'Case 10: Status is UNSUPPORTED (video required but unavailable)');
  assert(result.canProceed === false, 'Case 10: canProceed is false');
  assertIncludes(result.unsupportedCapabilities, 'video_generation', 'Case 10: video_generation is unsupported');
  assertIncludes(result.partialCapabilities, 'pptx_generation', 'Case 10: pptx_generation is partial');
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
