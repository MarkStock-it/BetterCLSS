/**
 * refinement-pipeline.test.js
 * Tests for the Content Refinement Pipeline.
 *
 * Tests: refinement model, requirement validator, and
 * the refinement pipeline with mock AI provider.
 */

const assert = require('assert');
const {
  REFINEMENT_STAGES,
  STAGE_ORDER,
  createRefinementResult,
  normalizeForRefinement,
  toArtifactContent,
  countWords,
  getNextStage,
  isFinalStage,
  REFINEMENT_RESPONSE_SCHEMA,
} = require('../refinement-model');
const {
  createRequirementValidator,
  extractWordCountRequirement,
  extractRequiredSections,
  extractReferenceRequirement,
  extractFullText,
} = require('../requirement-validator');
const {
  createRefinementPipeline,
  buildRefinementSystemInstruction,
  buildRefinementPrompt,
} = require('../refinement-pipeline');

let passed = 0;
let total = 0;

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

// ─── Model Tests ───────────────────────────────────────────────────

console.log('\n=== Refinement Model Tests ===');

(() => {
  // countWords
  eq(countWords('hello world'), 2, 'countWords counts two words');
  eq(countWords(''), 0, 'countWords empty string');
  eq(countWords(null), 0, 'countWords null');
  eq(countWords('one'), 1, 'countWords single word');

  // getNextStage
  eq(getNextStage(REFINEMENT_STAGES.CONTENT_REVIEW), REFINEMENT_STAGES.STYLE_REFINEMENT, 'Next after CONTENT_REVIEW is STYLE_REFINEMENT');
  eq(getNextStage(REFINEMENT_STAGES.FINAL_VALIDATION), null, 'Next after FINAL_VALIDATION is null');
  eq(getNextStage('INVALID'), null, 'Next after invalid is null');

  // isFinalStage
  ok(isFinalStage(REFINEMENT_STAGES.FINAL_VALIDATION), 'FINAL_VALIDATION is final');
  ok(!isFinalStage(REFINEMENT_STAGES.CONTENT_REVIEW), 'CONTENT_REVIEW is not final');

  // createRefinementResult
  const result = createRefinementResult({
    originalContent: 'Original text here.',
    refinedContent: 'Refined text here.',
    stages: [REFINEMENT_STAGES.CONTENT_REVIEW],
    changes: [{ stage: 'CONTENT_REVIEW', description: 'Improved clarity' }],
    warnings: [],
  });

  eq(result.originalContent, 'Original text here.', 'Result has original content');
  eq(result.refinedContent, 'Refined text here.', 'Result has refined content');
  ok(result.contentChanged === true, 'contentChanged is true when different');
  eq(result.wordCount, 3, 'wordCount is correct');
  ok(result.timestamp !== undefined, 'timestamp is set');

  // No-op refinement
  const noop = createRefinementResult({
    originalContent: 'Same text.',
    refinedContent: 'Same text.',
  });
  ok(noop.contentChanged === false, 'contentChanged is false when identical');

  // normalizeForRefinement
  const norm1 = normalizeForRefinement({
    title: 'Test',
    paragraphs: [{ text: 'Para 1' }, { text: 'Para 2' }],
  });
  eq(norm1.title, 'Test', 'Normalized title');
  eq(norm1.paragraphs.length, 2, 'Normalized paragraphs count');
  eq(norm1.paragraphs[0].text, 'Para 1', 'First paragraph text');

  const norm2 = normalizeForRefinement({
    rawText: 'Line one\n\nLine two',
  });
  eq(norm2.paragraphs.length, 2, 'Raw text split into paragraphs');
  eq(norm2.paragraphs[0].text, 'Line one', 'First paragraph from raw text');

  const norm3 = normalizeForRefinement(null);
  eq(norm3.title, '', 'Null content normalizes to empty');

  // toArtifactContent
  const artifact = toArtifactContent({
    title: 'My Title',
    paragraphs: [{ text: 'Hello', style: 'normal' }],
  });
  eq(artifact.title, 'My Title', 'toArtifactContent preserves title');
  eq(artifact.paragraphs.length, 1, 'toArtifactContent preserves paragraphs');
  ok(artifact.rawText.includes('Hello'), 'toArtifactContent has rawText');

  // REFINEMENT_RESPONSE_SCHEMA has required fields
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.content !== undefined, 'Schema has content property');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.changes !== undefined, 'Schema has changes property');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.warnings !== undefined, 'Schema has warnings property');
})();

// ─── Requirement Extractor Tests ──────────────────────────────────

console.log('\n=== Requirement Extractor Tests ===');

(() => {
  // Word count extraction
  const wc1 = extractWordCountRequirement('Write a 1000-word essay.');
  ok(wc1 !== null, 'Extracts word count from "1000-word"');
  eq(wc1.exactWords, 1000, 'Exact word count is 1000');

  const wc2 = extractWordCountRequirement('At least 500 words.');
  ok(wc2 !== null, 'Extracts word count from "at least 500 words"');
  eq(wc2.minWords, 500, 'Minimum word count is 500');

  const wc3 = extractWordCountRequirement('Submit a 3-page paper.');
  eq(wc3, null, 'No word count for page-based requirement');

  const wc4 = extractWordCountRequirement('');
  eq(wc4, null, 'Empty description returns null');

  // Section extraction
  const sections = extractRequiredSections('Include an introduction, body, and conclusion.');
  ok(sections.length > 0, 'Extracts sections');
  ok(sections.some((s) => s.includes('introduction')), 'Extracts introduction');
  ok(sections.some((s) => s.includes('conclusion')), 'Extracts conclusion');

  // Reference extraction
  const ref1 = extractReferenceRequirement('Include at least 3 references.');
  ok(ref1 !== null, 'Extracts reference count');
  eq(ref1.minCount, 3, 'Minimum references is 3');

  const ref2 = extractReferenceRequirement('No references needed.');
  eq(ref2, null, 'No reference requirement');

  // extractFullText
  eq(extractFullText({ rawText: 'hello' }), 'hello', 'extractFullText rawText');
  eq(extractFullText({ paragraphs: [{ text: 'a' }, { text: 'b' }] }), 'a b', 'extractFullText paragraphs');
  eq(extractFullText(null), '', 'extractFullText null');
})();

// ─── Validator Tests ───────────────────────────────────────────────

console.log('\n=== Requirement Validator Tests ===');

(() => {
  // Validator with word count requirement
  const manifest1 = {
    metadata: {
      title: 'Essay',
      description: 'Write a 100-word essay about database normalization.',
      plainDescription: 'Write a 100-word essay about database normalization.',
    },
    requirements: { categories: ['TEXT'] },
  };

  const validator1 = createRequirementValidator({ manifest: manifest1 });

  // Content that meets requirement
  const result1 = validator1.validate({
    paragraphs: [{ text: 'word '.repeat(100).trim() }], // exactly 100 words
  });
  ok(result1.isValid, 'Content meeting word count passes');
  ok(result1.wordCount >= 100, 'Word count is reasonable');

  // Content that is too short
  const result2 = validator1.validate({
    paragraphs: [{ text: 'Too short.' }],
  });
  ok(result2.warnings.some((w) => w.type === 'word_count'), 'Short content produces word_count warning');

  // Empty content
  const result3 = validator1.validate({});
  ok(result3.warnings.some((w) => w.type === 'empty_content'), 'Empty content produces empty warning');
  ok(!result3.isValid, 'Empty content fails validation');

  // Validator with section requirement
  const manifest2 = {
    metadata: {
      title: 'Report',
      description: 'Write a report with an introduction and conclusion.',
    },
    requirements: { categories: ['TEXT'] },
  };

  const validator2 = createRequirementValidator({ manifest: manifest2 });

  const result4 = validator2.validate({
    rawText: 'This is the introduction. Main content here. This is the conclusion.',
  });
  ok(result4.isValid, 'Content with required sections passes');

  const result5 = validator2.validate({
    rawText: 'Just some random content without sections.',
  });
  ok(result5.warnings.some((w) => w.type === 'section'), 'Missing section produces warning');

  // Validator with reference requirement
  const manifest3 = {
    metadata: {
      title: 'Research Paper',
      description: 'Include at least 2 references.',
    },
    requirements: { categories: ['TEXT'] },
  };

  const validator3 = createRequirementValidator({ manifest: manifest3 });

  const result6 = validator3.validate({
    rawText: 'According to (Smith, 2020) and (Jones, 2021), this is true.',
  });
  ok(result6.isValid, 'Content with references passes');

  const result7 = validator3.validate({
    rawText: 'No references here.',
  });
  ok(result7.warnings.some((w) => w.type === 'references'), 'Missing references produces warning');

  // No manifest = no specific checks
  const validator4 = createRequirementValidator({});
  const result8 = validator4.validate({
    rawText: 'Some content that should pass basic checks.',
  });
  ok(result8.isValid, 'Basic content passes without manifest');
})();

// ─── Pipeline Tests ────────────────────────────────────────────────

console.log('\n=== Refinement Pipeline Tests ===');

(async () => {
  // Mock AI provider that refines content
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => ({
      data: {
        content: {
          title: 'Improved Title',
          paragraphs: [
            { text: 'This is a refined paragraph with better clarity.', style: 'normal' },
            { text: 'The second paragraph has been improved for flow.', style: 'normal' },
          ],
        },
        changes: [
          { stage: 'CONTENT_REVIEW', description: 'Improved sentence clarity', paragraphIndex: 0 },
          { stage: 'STYLE_REFINEMENT', description: 'Improved transitions', paragraphIndex: 1 },
        ],
        warnings: [],
        summary: 'Improved clarity and flow of two paragraphs.',
      },
      text: '{}',
      provider: 'mock',
      model: 'mock',
      durationMs: 100,
    }),
  };

  const manifest = {
    metadata: {
      title: 'Test Assignment',
      description: 'Write a short essay.',
      pointsPossible: 100,
    },
    requirements: { categories: ['TEXT'] },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest,
  });

  // Test successful refinement
  const result = await pipeline.refine(
    {
      title: 'Original Title',
      paragraphs: [
        { text: 'This is the original paragraph.', style: 'normal' },
        { text: 'This is another paragraph.', style: 'normal' },
      ],
    },
    { jobId: 'ajob_refine_001' }
  );

  ok(result !== null, 'Refinement returns result');
  ok(result.refinedContent.includes('refined paragraph'), 'Content was refined');
  ok(result.contentChanged === true, 'Content changed flag is true');
  ok(result.changes.length > 0, 'Changes were recorded');
  ok(result.stages.includes(REFINEMENT_STAGES.CONTENT_REVIEW), 'CONTENT_REVIEW stage ran');
  ok(result.stages.includes(REFINEMENT_STAGES.STYLE_REFINEMENT), 'STYLE_REFINEMENT stage ran');
  ok(result.stages.includes(REFINEMENT_STAGES.REQUIREMENT_CHECK), 'REQUIREMENT_CHECK stage ran');
  ok(result.stages.includes(REFINEMENT_STAGES.FINAL_VALIDATION), 'FINAL_VALIDATION stage ran');
  ok(result.validation !== null, 'Validation result is present');
})();

// ─── Pipeline: Empty Content ──────────────────────────────────────

console.log('\n=== Pipeline: Edge Cases ===');

(async () => {
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => { throw new Error('Should not be called'); },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest: { metadata: {} },
  });

  // Empty content
  const result1 = await pipeline.refine({});
  ok(result1 !== null, 'Empty content returns result');
  ok(result1.warnings.some((w) => w.type === 'empty'), 'Empty content produces warning');

  // Null content
  const result2 = await pipeline.refine(null);
  ok(result2 !== null, 'Null content returns result');
})();

// ─── Pipeline: AI Provider Unavailable ─────────────────────────────

(async () => {
  const mockProvider = {
    isReady: () => ({ ready: false, reason: 'API key missing' }),
    structuredGenerate: async () => { throw new Error('Should not be called'); },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest: { metadata: {} },
  });

  const result = await pipeline.refine({
    paragraphs: [{ text: 'Some content that should pass through.' }],
  });

  ok(result !== null, 'Unavailable AI returns result');
  ok(result.refinedContent.includes('Some content'), 'Content passes through unchanged');
  ok(result.warnings.some((w) => w.type === 'provider_unavailable'), 'Warning about unavailable provider');
})();

// ─── Pipeline: AI Failure ─────────────────────────────────────────

(async () => {
  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => { throw new Error('AI service error'); },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest: { metadata: {} },
  });

  const result = await pipeline.refine({
    paragraphs: [{ text: 'Content before AI failure.' }],
  });

  ok(result !== null, 'AI failure returns result');
  ok(result.refinedContent.includes('Content before AI failure'), 'Original content preserved');
  ok(result.warnings.some((w) => w.type === 'ai_error'), 'AI error warning present');
})();

// ─── Pipeline: Validation Retry ────────────────────────────────────

(async () => {
  let callCount = 0;

  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async () => {
      callCount++;
      // First pass: still too short
      // Second pass: adequate length
      const text = callCount === 1
        ? 'Short.'
        : 'This is a much longer response that should have enough words to pass the validation check for word count requirements in the assignment.';
      return {
        data: {
          content: {
            title: 'Test',
            paragraphs: [{ text, style: 'normal' }],
          },
          changes: [{ stage: 'CONTENT_REVIEW', description: 'Expanded content' }],
          warnings: [],
          summary: 'Expanded content.',
        },
        text: '{}',
        provider: 'mock',
        model: 'mock',
        durationMs: 50,
      };
    },
  };

  const manifest = {
    metadata: {
      title: 'Essay',
      description: 'Write at least 10 words.',
    },
    requirements: { categories: ['TEXT'] },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest,
    config: { maxRefinementPasses: 2 },
  });

  const result = await pipeline.refine({
    paragraphs: [{ text: 'Original short text.' }],
  });

  ok(result !== null, 'Retry pipeline returns result');
  ok(callCount >= 1, 'AI was called at least once');
  ok(result.stages.includes(REFINEMENT_STAGES.REQUIREMENT_CHECK), 'Validation was run');
})();

// ─── Pipeline: Style Context ───────────────────────────────────────

(async () => {
  let capturedSystemInstruction = '';

  const mockProvider = {
    isReady: () => ({ ready: true, reason: '' }),
    structuredGenerate: async (req) => {
      capturedSystemInstruction = req.systemInstruction;
      return {
        data: {
          content: {
            title: 'Test',
            paragraphs: [{ text: 'Refined content.', style: 'normal' }],
          },
          changes: [],
          warnings: [],
          summary: 'No changes needed.',
        },
        text: '{}',
        provider: 'mock',
        model: 'mock',
        durationMs: 50,
      };
    },
  };

  const pipeline = createRefinementPipeline({
    aiProvider: mockProvider,
    manifest: { metadata: { title: 'Test' } },
  });

  await pipeline.refine(
    { paragraphs: [{ text: 'Some text.' }] },
    { styleContext: { formality: 'academic', tone: 'formal', complexity: 'high' } }
  );

  ok(capturedSystemInstruction.includes('academic'), 'Style context formality included');
  ok(capturedSystemInstruction.includes('formal'), 'Style context tone included');
  ok(capturedSystemInstruction.includes('high'), 'Style context complexity included');
})();

// ─── Schema Tests ──────────────────────────────────────────────────

console.log('\n=== Schema Tests ===');

(() => {
  ok(REFINEMENT_RESPONSE_SCHEMA.type === 'object', 'Schema is object type');
  ok(REFINEMENT_RESPONSE_SCHEMA.required.includes('content'), 'Schema requires content');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.content.properties.paragraphs !== undefined, 'Content has paragraphs');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.changes !== undefined, 'Schema has changes');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.warnings !== undefined, 'Schema has warnings');
  ok(REFINEMENT_RESPONSE_SCHEMA.properties.summary !== undefined, 'Schema has summary');
})();

// ─── Prompt Builder Tests ──────────────────────────────────────────

console.log('\n=== Prompt Builder Tests ===');

(() => {
  const manifest = {
    metadata: { title: 'Test Assignment', pointsPossible: 100 },
  };

  const sysInstr = buildRefinementSystemInstruction(manifest, null);
  ok(sysInstr.includes('BetterCLSS'), 'System instruction mentions BetterCLSS');
  ok(sysInstr.includes('NEVER invent'), 'System instruction forbids invention');
  ok(sysInstr.includes('Test Assignment'), 'System instruction includes title');

  const sysInstrStyled = buildRefinementSystemInstruction(manifest, { formality: 'casual' });
  ok(sysInstrStyled.includes('casual'), 'Style context in system instruction');

  const prompt = buildRefinementPrompt(
    { title: 'My Essay', paragraphs: [{ text: 'Para 1' }, { text: 'Para 2' }] },
    manifest
  );
  ok(prompt.includes('My Essay'), 'Prompt includes title');
  ok(prompt.includes('[0] Para 1'), 'Prompt includes paragraph index');
  ok(prompt.includes('[1] Para 2'), 'Prompt includes second paragraph');
})();

// ─── Summary ──────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed}/${total} passed, ${total - passed} failed`);
console.log('='.repeat(50));

if (total - passed > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed!\n');
}
