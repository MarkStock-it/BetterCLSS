/**
 * artifact-system.test.js
 * Tests for the Artifact Generation System.
 *
 * Tests: artifact model, DOCX generator, TXT generator,
 * artifact storage, artifact tools, and security.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const assert = require('assert');
const {
  ARTIFACT_TYPES,
  ARTIFACT_STATES,
  createArtifact,
  markArtifactReady,
  markArtifactFailed,
  sanitizeFilename,
  checkArtifactTypeSupport,
} = require('../artifact-model');
const { createArtifactStorage } = require('../artifact-storage');
const { createDocxGenerator, createDocxZip } = require('../docx-generator');
const { createTxtGenerator } = require('../txt-generator');
const { registerArtifactTools, registerGenerators } = require('../artifact-tools');
const { clearTools, TOOL_PERMISSIONS } = require('../../tools/tool-registry');
const { createToolRuntime } = require('../../tools/tool-runtime');

let passed = 0;
let total = 0;
let tmpDir;

function ok(condition, msg) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

function eq(actual, expected, msg) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ FAIL: ${msg} — expected "${expected}", got "${actual}"`);
    process.exit(1);
  }
}

// ─── Setup / Teardown ──────────────────────────────────────────────

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bclss_artifact_test_'));
}

function cleanupTmpDir() {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ─── Artifact Model Tests ─────────────────────────────────────────

console.log('\n=== Artifact Model Tests ===');

(() => {
  const artifact = createArtifact({
    jobId: 'ajob_test_001',
    userId: 100,
    type: 'docx',
    filename: 'report.docx',
  });

  ok(artifact.id.startsWith('art_'), 'Artifact ID has correct prefix');
  eq(artifact.jobId, 'ajob_test_001', 'Job ID is set');
  eq(artifact.userId, 100, 'User ID is set');
  eq(artifact.type, 'docx', 'Type is set');
  eq(artifact.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'MIME type is correct');
  eq(artifact.status, ARTIFACT_STATES.GENERATING, 'Initial status is GENERATING');
  ok(artifact.createdAt !== undefined, 'createdAt is set');

  // Test markArtifactReady
  const ready = markArtifactReady(artifact, '.betterclss_data/artifacts/100/art_abc_report.docx', 12345);
  eq(ready.status, ARTIFACT_STATES.READY, 'Ready status is READY');
  eq(ready.size, 12345, 'Size is set');
  eq(ready.storagePath, '.betterclss_data/artifacts/100/art_abc_report.docx', 'Storage path is set');

  // Test markArtifactFailed
  const failed = markArtifactFailed(artifact, 'Generation error');
  eq(failed.status, ARTIFACT_STATES.FAILED, 'Failed status is FAILED');
  eq(failed.error, 'Generation error', 'Error message is set');

  // Test sanitizeFilename
  eq(sanitizeFilename('report.docx', 'docx'), 'report.docx', 'Valid filename preserved');
  eq(sanitizeFilename('../../etc/passwd', 'docx'), 'etcpasswd.docx', 'Path traversal removed');
  eq(sanitizeFilename('a/b/c.txt', 'txt'), 'abc.txt', 'Slashes removed');
  eq(sanitizeFilename('<>:?*|.docx', 'docx'), '.docx', 'Invalid chars removed');
  eq(sanitizeFilename('', 'docx'), 'document.docx', 'Empty filename gets default');
  eq(sanitizeFilename(null, 'docx'), 'document.docx', 'Null filename gets default');
  eq(sanitizeFilename('file', 'txt'), 'file.txt', 'Extension appended when missing');
  ok(sanitizeFilename('a'.repeat(300) + '.docx', 'docx').length <= 205, 'Long filename is truncated');

  // Test checkArtifactTypeSupport
  const docxSupport = checkArtifactTypeSupport('docx');
  ok(docxSupport.supported, 'DOCX is supported');

  const txtSupport = checkArtifactTypeSupport('txt');
  ok(txtSupport.supported, 'TXT is supported');

  const pdfSupport = checkArtifactTypeSupport('pdf');
  ok(!pdfSupport.supported, 'PDF is not supported');
  ok(pdfSupport.reason.includes('not yet implemented'), 'PDF reason mentions not implemented');

  const pktSupport = checkArtifactTypeSupport('pkt');
  ok(!pktSupport.supported, 'PKT is not supported');
})();

// ─── Storage Tests ─────────────────────────────────────────────────

console.log('\n=== Artifact Storage Tests ===');

(() => {
  setupTmpDir();

  const storage = createArtifactStorage(tmpDir);

  // Save an artifact
  const testContent = Buffer.from('Hello, world!', 'utf8');
  const { storagePath, size } = storage.saveArtifact(100, 'art_test_001', 'test.txt', testContent);

  ok(storagePath.length > 0, 'Storage path is returned');
  eq(size, testContent.length, 'Size matches content length');

  // Read the artifact
  const readContent = storage.readArtifact(100, storagePath);
  ok(readContent !== null, 'Artifact is readable');
  eq(readContent.toString('utf8'), 'Hello, world!', 'Content matches');

  // Check artifact exists
  ok(storage.artifactExists(100, storagePath), 'Artifact exists');
  ok(!storage.artifactExists(999, storagePath), 'Wrong user cannot see artifact');

  // Get info
  const info = storage.getArtifactInfo(100, storagePath);
  ok(info.exists, 'Info shows exists');
  eq(info.size, testContent.length, 'Info size matches');

  // Delete
  ok(storage.deleteArtifact(100, storagePath), 'Delete succeeds');
  ok(!storage.artifactExists(100, storagePath), 'Artifact no longer exists after delete');

  // Path traversal security
  const traversalPath = '../../../etc/passwd';
  const traversalResult = storage.readArtifact(100, traversalPath);
  eq(traversalResult, null, 'Path traversal returns null');

  ok(!storage.deleteArtifact(100, traversalPath), 'Path traversal delete returns false');

  cleanupTmpDir();
})();

// ─── TXT Generator Tests ───────────────────────────────────────────

console.log('\n=== TXT Generator Tests ===');

(async () => {
  setupTmpDir();

  const storage = createArtifactStorage(tmpDir);
  const generator = createTxtGenerator({ artifactStorage: storage });

  // Generate with title and paragraphs
  const artifact1 = await generator.generate({
    jobId: 'ajob_txt_001',
    userId: 100,
    filename: 'essay.txt',
    content: {
      title: 'Database Normalization',
      paragraphs: [
        { text: 'Introduction paragraph.' },
        { text: 'Main content paragraph.' },
      ],
    },
  });

  eq(artifact1.status, ARTIFACT_STATES.READY, 'TXT generation succeeds');
  eq(artifact1.type, 'txt', 'Artifact type is txt');
  ok(artifact1.size > 0, 'Artifact has non-zero size');
  ok(artifact1.storagePath !== null, 'Storage path is set');

  // Read and verify content
  const content = storage.readArtifact(100, artifact1.storagePath);
  const text = content.toString('utf8');
  ok(text.includes('Database Normalization'), 'Title is present');
  ok(text.includes('Introduction paragraph.'), 'First paragraph is present');
  ok(text.includes('Main content paragraph.'), 'Second paragraph is present');

  // Generate with rawText
  const artifact2 = await generator.generate({
    jobId: 'ajob_txt_002',
    userId: 100,
    filename: 'notes.txt',
    content: {
      rawText: 'Simple raw text content.',
    },
  });

  eq(artifact2.status, ARTIFACT_STATES.READY, 'Raw text generation succeeds');

  // Generate with empty content (should fail)
  const artifact3 = await generator.generate({
    jobId: 'ajob_txt_003',
    userId: 100,
    filename: 'empty.txt',
    content: {},
  });

  eq(artifact3.status, ARTIFACT_STATES.FAILED, 'Empty content produces FAILED');

  cleanupTmpDir();
})();

// ─── DOCX Generator Tests ─────────────────────────────────────────

console.log('\n=== DOCX Generator Tests ===');

(async () => {
  setupTmpDir();

  const storage = createArtifactStorage(tmpDir);
  const generator = createDocxGenerator({ artifactStorage: storage });

  // Generate with title and paragraphs
  const artifact1 = await generator.generate({
    jobId: 'ajob_docx_001',
    userId: 100,
    filename: 'report.docx',
    content: {
      title: 'Test Report',
      paragraphs: [
        { text: 'This is the introduction.', style: 'heading1' },
        { text: 'This is a normal paragraph with bold text.', bold: true },
        { text: 'Another paragraph.' },
      ],
    },
  });

  eq(artifact1.status, ARTIFACT_STATES.READY, 'DOCX generation succeeds');
  eq(artifact1.type, 'docx', 'Artifact type is docx');
  ok(artifact1.size > 100, 'DOCX has meaningful size');
  ok(artifact1.mimeType.includes('wordprocessingml'), 'MIME type is DOCX');

  // Read and validate ZIP structure
  const zipBuffer = storage.readArtifact(100, artifact1.storagePath);
  ok(zipBuffer !== null, 'DOCX file is readable');

  // Check ZIP signature (PK header)
  eq(zipBuffer[0], 0x50, 'ZIP signature byte 1 is 0x50 (P)');
  eq(zipBuffer[1], 0x4B, 'ZIP signature byte 2 is 0x4B (K)');

  // Try to unzip and verify contents
  try {
    // Use Node.js to read the ZIP entries
    const entries = readZipEntries(zipBuffer);
    const names = entries.map((e) => e.name);
    ok(names.includes('[Content_Types].xml'), 'ZIP contains [Content_Types].xml');
    ok(names.includes('_rels/.rels'), 'ZIP contains _rels/.rels');
    ok(names.includes('word/document.xml'), 'ZIP contains word/document.xml');
    ok(names.includes('word/_rels/document.xml.rels'), 'ZIP contains word/_rels/document.xml.rels');

    // Verify document.xml contains our content
    const docEntry = entries.find((e) => e.name === 'word/document.xml');
    const docContent = docEntry.data.toString('utf8');
    ok(docContent.includes('Test Report'), 'Document XML contains title');
    ok(docContent.includes('introduction'), 'Document XML contains paragraph text');
    ok(docContent.includes('bold text'), 'Document XML contains bold paragraph');
  } catch (err) {
    ok(false, `DOCX ZIP validation failed: ${err.message}`);
  }

  // Generate with raw text
  const artifact2 = await generator.generate({
    jobId: 'ajob_docx_002',
    userId: 100,
    filename: 'simple.docx',
    content: {
      rawText: 'Line one\nLine two\nLine three',
    },
  });

  eq(artifact2.status, ARTIFACT_STATES.READY, 'Raw text DOCX generation succeeds');
  ok(artifact2.size > 0, 'Raw text DOCX has size');

  // User isolation: user 200 cannot read user 100's artifact
  const isolatedRead = storage.readArtifact(200, artifact1.storagePath);
  eq(isolatedRead, null, 'Different user cannot read artifact');

  cleanupTmpDir();
})();

// ─── Artifact Tools Tests ──────────────────────────────────────────

console.log('\n=== Artifact Tools Registration Tests ===');

(() => {
  clearTools();

  // Register generators
  registerGenerators({
    docxGenerator: { generate: async () => ({ status: 'READY', id: 'mock', filename: 'mock.docx', type: 'docx', size: 100, mimeType: 'application/docx' }) },
    txtGenerator: { generate: async () => ({ status: 'READY', id: 'mock', filename: 'mock.txt', type: 'txt', size: 50, mimeType: 'text/plain' }) },
  });

  registerArtifactTools({ artifactStorage: {} });

  // Check tools are registered
  const toolIds = ['artifact.generate_docx', 'artifact.generate_txt', 'artifact.generate_pdf'];
  for (const id of toolIds) {
    const { hasTool } = require('../../tools/tool-registry');
    ok(hasTool(id), `${id} is registered`);
  }

  // Check permissions
  const { getTool } = require('../../tools/tool-registry');
  const docxTool = getTool('artifact.generate_docx');
  ok(docxTool.permissions.includes(TOOL_PERMISSIONS.GENERATE), 'DOCX tool has GENERATE permission');

  const pdfTool = getTool('artifact.generate_pdf');
  ok(pdfTool !== undefined, 'PDF tool is registered (as stub)');
})();

// ─── Artifact Tools Execution Tests ────────────────────────────────

console.log('\n=== Artifact Tools Execution Tests ===');

(async () => {
  setupTmpDir();

  clearTools();

  const storage = createArtifactStorage(tmpDir);
  const docxGen = createDocxGenerator({ artifactStorage: storage });
  const txtGen = createTxtGenerator({ artifactStorage: storage });

  registerGenerators({ docxGenerator: docxGen, txtGenerator: txtGen });
  registerArtifactTools({ artifactStorage: storage });

  // Create a mock tool runtime
  const agentService = { isAgenticHelperEnabled: () => true };
  const agentJobService = {
    getJob: (userId, jobId) => ({
      id: jobId, userId, courseId: 200, assignmentId: 101,
      state: 'EXECUTING', capabilityStatus: 'SUPPORTED', manifest: {},
    }),
  };

  const runtime = createToolRuntime({
    agentService,
    agentJobService,
    onEvent: () => {},
  });

  // Test DOCX generation via tool
  const docxResult = await runtime.execute(
    {
      tool: 'artifact.generate_docx',
      arguments: {
        jobId: 'ajob_tool_001',
        filename: 'tool-report.docx',
        content: {
          title: 'Tool Generated Report',
          paragraphs: [{ text: 'Generated through the tool runtime.' }],
        },
      },
      jobId: 'ajob_tool_001',
    },
    100
  );

  ok(docxResult.success, 'DOCX tool execution succeeds');
  ok(docxResult.data.artifactId.startsWith('art_'), 'Returns artifact ID');
  eq(docxResult.data.type, 'docx', 'Returns correct type');
  ok(docxResult.data.size > 0, 'Returns size');

  // Test TXT generation via tool
  const txtResult = await runtime.execute(
    {
      tool: 'artifact.generate_txt',
      arguments: {
        jobId: 'ajob_tool_002',
        filename: 'tool-notes.txt',
        content: { rawText: 'Generated through the tool runtime.' },
      },
      jobId: 'ajob_tool_002',
    },
    100
  );

  ok(txtResult.success, 'TXT tool execution succeeds');
  eq(txtResult.data.type, 'txt', 'Returns correct type');

  // Test PDF stub (should fail gracefully)
  const pdfResult = await runtime.execute(
    {
      tool: 'artifact.generate_pdf',
      arguments: { jobId: 'ajob_tool_003', filename: 'test.pdf', content: {} },
      jobId: 'ajob_tool_003',
    },
    100
  );

  eq(pdfResult.success, false, 'PDF tool returns failure');
  eq(pdfResult.error.code, 'NOT_IMPLEMENTED', 'PDF returns NOT_IMPLEMENTED');

  // Test invalid arguments (missing content)
  const invalidResult = await runtime.execute(
    {
      tool: 'artifact.generate_docx',
      arguments: { jobId: 'ajob_tool_004' },  // missing content
      jobId: 'ajob_tool_004',
    },
    100
  );

  // Should fail validation since content is required
  ok(!invalidResult.success || invalidResult.error, 'Missing content produces error');

  cleanupTmpDir();
})();

// ─── ZIP Helper ────────────────────────────────────────────────────

/**
 * Read ZIP entries from a buffer (simple local-header parser for testing).
 * @param {Buffer} zipBuffer
 * @returns {Array<{ name: string, data: Buffer }>}
 */
function readZipEntries(zipBuffer) {
  const entries = [];
  let offset = 0;

  while (offset < zipBuffer.length - 30) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break; // Not a local file header

    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + nameLen + extraLen;

    const name = zipBuffer.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const compressedData = zipBuffer.slice(dataOffset, dataOffset + compressedSize);

    // Decompress (deflate)
    let data;
    try {
      data = zlib.inflateRawSync(compressedData);
    } catch {
      data = compressedData;
    }

    entries.push({ name, data });
    offset = dataOffset + compressedSize;
  }

  return entries;
}

// ─── Summary ──────────────────────────────────────────────────────

async function runSummary() {
  // Wait a tick for async tests
  await new Promise((r) => setTimeout(r, 100));

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed}/${total} passed, ${total - passed} failed`);
  console.log('='.repeat(50));

  if (total - passed > 0) {
    process.exit(1);
  } else {
    console.log('\nAll tests passed!\n');
  }
}

runSummary();
