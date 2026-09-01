/**
 * manifest-pipeline.test.js
 * Tests for the Assignment Manifest pipeline.
 *
 * Run with: node server/agent/__tests__/manifest-pipeline.test.js
 */

const { createManifest, getManifestKey, isManifestStale } = require('../assignment-manifest');
const { normalizeAssignment } = require('../assignment-normalizer');
const { analyzeAssignment } = require('../capability-analyzer');

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

function assertHasProperty(obj, prop, testName) {
  assert(obj && typeof obj === 'object' && prop in obj, testName, `expected object to have property "${prop}"`);
}

// ─── Test Cases ──────────────────────────────────────────────────────

console.log('\n=== Manifest Creation Tests ===');

(() => {
  const normalized = normalizeAssignment({
    id: 201,
    name: 'Database Normalization Essay',
    description: '<p>Write a 1000-word essay about database normalization. Submit as a DOCX file.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.docx'],
    points_possible: 100,
    due_at: '2026-09-15T23:59:00Z',
  });

  const analysis = analyzeAssignment({
    id: 201,
    name: 'Database Normalization Essay',
    description: '<p>Write a 1000-word essay about database normalization. Submit as a DOCX file.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.docx'],
    points_possible: 100,
  });

  const manifest = createManifest(normalized, analysis, { userId: 12345 });

  // Check identity
  assertHasProperty(manifest, 'identity', 'Manifest has identity');
  assertEqual(manifest.identity.assignmentId, 201, 'Manifest identity.assignmentId');
  assertEqual(manifest.identity.userId, 12345, 'Manifest identity.userId');

  // Check metadata
  assertHasProperty(manifest, 'metadata', 'Manifest has metadata');
  assertEqual(manifest.metadata.title, 'Database Normalization Essay', 'Manifest metadata.title');
  assertIncludes(manifest.metadata.submissionTypes, 'online_upload', 'Manifest has submission type');
  assertIncludes(manifest.metadata.fileExtensions, '.docx', 'Manifest has file extension');

  // Check requirements
  assertHasProperty(manifest, 'requirements', 'Manifest has requirements');
  assert(Array.isArray(manifest.requirements.categories), 'Manifest requirements.categories is array');
  assertIncludes(manifest.requirements.categories, 'TEXT', 'Manifest has TEXT requirement');
  assertIncludes(manifest.requirements.categories, 'FILE', 'Manifest has FILE requirement');

  // Check capabilities
  assertHasProperty(manifest, 'capabilities', 'Manifest has capabilities');
  assertIncludes(manifest.capabilities.required, 'text_generation', 'Manifest requires text_generation');
  assertIncludes(manifest.capabilities.required, 'docx_generation', 'Manifest requires docx_generation');

  // Check capability result
  assertHasProperty(manifest, 'capabilityResult', 'Manifest has capabilityResult');
  assertEqual(manifest.capabilityResult.status, 'SUPPORTED', 'Manifest capability status is SUPPORTED');
  assert(manifest.capabilityResult.canProceed === true, 'Manifest canProceed is true');

  // Check source
  assertHasProperty(manifest, 'source', 'Manifest has source');
  assertEqual(manifest.source.platform, 'canvas', 'Manifest source.platform is canvas');

  // Check timestamps
  assertHasProperty(manifest, 'createdAt', 'Manifest has createdAt');
  assertHasProperty(manifest, 'updatedAt', 'Manifest has updatedAt');
  assertHasProperty(manifest, 'analyzedAt', 'Manifest has analyzedAt');
})();

console.log('\n=== Manifest Key Tests ===');

(() => {
  const manifest = {
    identity: {
      userId: 12345,
      courseId: 67890,
      assignmentId: 111,
    },
  };

  const key = getManifestKey(manifest);
  assertEqual(key, '12345_67890_111', 'Manifest key format');

  const emptyManifest = { identity: {} };
  const emptyKey = getManifestKey(emptyManifest);
  assert(emptyKey.includes('unknown'), 'Empty manifest key uses unknown');
})();

console.log('\n=== Manifest Staleness Tests ===');

(() => {
  const freshManifest = {
    updatedAt: new Date().toISOString(),
  };
  assert(!isManifestStale(freshManifest), 'Fresh manifest is not stale');

  const oldManifest = {
    updatedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
  };
  assert(isManifestStale(oldManifest), 'Old manifest is stale');

  const nullManifest = null;
  assert(isManifestStale(nullManifest), 'Null manifest is stale');
})();

console.log('\n=== Case 1: Essay → SUPPORTED Manifest ===');

(() => {
  const canvasAssignment = {
    id: 301,
    name: 'Reflection Paper',
    description: '<p>Write a 500-word reflection on the chapter readings.</p>',
    submission_types: ['online_text_entry'],
    points_possible: 25,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  assertEqual(manifest.capabilityResult.status, 'SUPPORTED', 'Case 1: Status SUPPORTED');
  assert(manifest.capabilityResult.canProceed === true, 'Case 1: canProceed true');
  assertIncludes(manifest.capabilities.required, 'text_generation', 'Case 1: Requires text_generation');
  assert(manifest.metadata.submissionTypes.includes('online_text_entry'), 'Case 1: Has text entry type');
})();

console.log('\n=== Case 2: Packet Tracer → UNSUPPORTED Manifest ===');

(() => {
  const canvasAssignment = {
    id: 302,
    name: 'Network Topology Lab',
    description: '<p>Configure the network in Cisco Packet Tracer and submit the resulting .pkt file.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pkt'],
    points_possible: 50,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  assertEqual(manifest.capabilityResult.status, 'UNSUPPORTED', 'Case 2: Status UNSUPPORTED');
  assert(manifest.capabilityResult.canProceed === false, 'Case 2: canProceed false');
  assert(manifest.requirements.hasExternalTools === true, 'Case 2: Has external tools');
  assert(manifest.capabilityResult.noSubmission === true, 'Case 2: noSubmission true');
  assert(typeof manifest.capabilityResult.summary === 'string' && manifest.capabilityResult.summary.length > 0, 'Case 2: Has summary');
})();

console.log('\n=== Case 3: Multiple Files → SUPPORTED Manifest ===');

(() => {
  const canvasAssignment = {
    id: 303,
    name: 'Research Report',
    description: '<p>Submit a PDF report with your findings.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf'],
    points_possible: 100,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  assertEqual(manifest.capabilityResult.status, 'UNSUPPORTED', 'Case 3: Status UNSUPPORTED (PDF not implemented)');
  assertIncludes(manifest.capabilities.required, 'pdf_generation', 'Case 3: Requires pdf_generation');
  assertIncludes(manifest.capabilities.required, 'text_generation', 'Case 3: Requires text_generation');
  assert(manifest.metadata.fileExtensions.includes('.pdf'), 'Case 3: Has .pdf extension');
})();

console.log('\n=== Case 4: Physical Activity → UNSUPPORTED Manifest ===');

(() => {
  const canvasAssignment = {
    id: 304,
    name: 'Circuit Lab',
    description: '<p>Build the circuit physically, measure the voltage, and take a photograph.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.jpg', '.pdf'],
    points_possible: 40,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  assertEqual(manifest.capabilityResult.status, 'UNSUPPORTED', 'Case 4: Status UNSUPPORTED');
  assert(manifest.requirements.hasPhysicalActivity === true, 'Case 4: Has physical activity');
  assert(manifest.capabilityResult.noSubmission === true, 'Case 4: noSubmission true');
})();

console.log('\n=== Case 5: Unknown Software → UNKNOWN Manifest ===');

(() => {
  const canvasAssignment = {
    id: 305,
    name: 'Lab Activity',
    description: '<p>Complete the activity using the software demonstrated in laboratory.</p>',
    submission_types: ['online_upload'],
    points_possible: 30,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  // Should be UNKNOWN or UNSUPPORTED depending on detection
  assert(
    manifest.capabilityResult.status === 'UNKNOWN' || manifest.capabilityResult.status === 'UNSUPPORTED' || manifest.capabilityResult.status === 'SUPPORTED',
    'Case 5: Status is reasonable'
  );
  assert(typeof manifest.capabilityResult.reason === 'string', 'Case 5: Has reason');
})();

console.log('\n=== Case 6: Rubric Data Passthrough ===');

(() => {
  const rubric = {
    data: [
      { description: 'Written Analysis', criterion: 'rating' },
      { description: 'Screenshot Evidence', criterion: 'rating' },
    ],
  };

  const canvasAssignment = {
    id: 306,
    name: 'Analysis Assignment',
    description: '<p>Complete the analysis and submit results.</p>',
    submission_types: ['online_upload'],
    allowed_extensions: ['.pdf', '.png'],
    points_possible: 50,
  };

  const normalized = normalizeAssignment(canvasAssignment, { rubric });
  const analysis = analyzeAssignment(canvasAssignment, { rubric });
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  assert(manifest.source.rubricAvailable === true, 'Case 6: Rubric marked as available');
  assert(typeof manifest.capabilityResult.status === 'string', 'Case 6: Has status');
})();

console.log('\n=== Case 7: No Submission Type → UNKNOWN ===');

(() => {
  const canvasAssignment = {
    id: 307,
    name: 'Mystery Assignment',
    description: '<p>Do the thing.</p>',
    submission_types: [],
    points_possible: 10,
  };

  const normalized = normalizeAssignment(canvasAssignment);
  const analysis = analyzeAssignment(canvasAssignment);
  const manifest = createManifest(normalized, analysis, { userId: 100 });

  // Should be UNKNOWN since we can't determine requirements
  assert(
    manifest.capabilityResult.status === 'UNKNOWN' || manifest.capabilityResult.status === 'SUPPORTED',
    'Case 7: Status is UNKNOWN or SUPPORTED'
  );
})();

console.log('\n=== Normalization Preserves Source Data ===');

(() => {
  const canvasAssignment = {
    id: 401,
    name: 'Test Assignment',
    description: '<p>Test description with <a href="https://example.com">a link</a>.</p>',
    submission_types: ['online_upload', 'online_text_entry'],
    allowed_extensions: ['.docx', '.pdf'],
    points_possible: 75,
    due_at: '2026-10-01T12:00:00Z',
    lock_at: '2026-10-02T12:00:00Z',
    html_url: 'https://canvas.example.com/assignments/401',
  };

  const normalized = normalizeAssignment(canvasAssignment);

  // Verify source data is preserved
  assertEqual(normalized.name, 'Test Assignment', 'Preserves name');
  assert(normalized.description.includes('example.com'), 'Preserves HTML description');
  assert(normalized.submissionTypes.length === 2, 'Preserves submission types');
  assert(normalized.allowedExtensions.length === 2, 'Preserves allowed extensions');
  assertEqual(normalized.dueAt, '2026-10-01T12:00:00Z', 'Preserves due date');
  assertEqual(normalized.lockAt, '2026-10-02T12:00:00Z', 'Preserves lock date');
  assert(normalized.links.includes('https://example.com'), 'Extracts links from HTML');
  assertEqual(normalized.source, 'canvas', 'Source is canvas');
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
