/**
 * refinement-pipeline.js
 * Content Refinement Pipeline.
 *
 * Improves generated content for clarity, naturalness, and
 * requirement alignment. This is NOT an AI-detector bypass.
 *
 * Flow:
 *   Generated Content
 *          ↓
 *   AI Refinement (via AIProvider)
 *          ↓
 *   Deterministic Requirement Validation
 *          ↓
 *   Validated Content
 *
 * Safety:
 *   - Bounded retries (max 2 refinement passes)
 *   - Deterministic validation after each AI pass
 *   - Requirement preservation checks
 *   - No factual invention
 *   - No AI-detector bypass
 */

const {
  REFINEMENT_STAGES,
  STAGE_ORDER,
  createRefinementResult,
  normalizeForRefinement,
  toArtifactContent,
  REFINEMENT_RESPONSE_SCHEMA,
} = require('./refinement-model');
const { createRequirementValidator } = require('./requirement-validator');

// ─── Default Config ────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  maxRefinementPasses: 2,
  temperature: 0.3,
};

// ─── Refinement Pipeline ───────────────────────────────────────────

/**
 * Create a Content Refinement Pipeline.
 *
 * @param {object} options
 * @param {object} options.aiProvider - AIProvider instance
 * @param {object} [options.manifest] - Assignment Manifest for requirement checks
 * @param {object} [options.config] - Pipeline configuration overrides
 * @param {function} [options.emitEvent] - Event callback (jobId, type, metadata)
 * @returns {object} Pipeline API
 */
function createRefinementPipeline({ aiProvider, manifest, config: pipelineConfig, emitEvent }) {
  const config = { ...DEFAULT_CONFIG, ...pipelineConfig };
  const validator = createRequirementValidator({ manifest });

  /**
   * Refine content through the pipeline.
   *
   * @param {object} content - Structured content to refine
   * @param {object} [options]
   * @param {string} [options.jobId] - Agent Job ID for tracking
   * @param {object} [options.styleContext] - Optional writing style context
   * @returns {Promise<object>} Refinement result
   */
  async function refine(content, options = {}) {
    const { jobId, styleContext, aiKeys } = options;
    const startTime = Date.now();

    // Normalize content
    const normalized = normalizeForRefinement(content);

    // If content is empty, nothing to refine
    if (!normalized.title && normalized.paragraphs.length === 0 && !normalized.rawText) {
      return createRefinementResult({
        originalContent: '',
        refinedContent: '',
        stages: [],
        warnings: [{ type: 'empty', message: 'No content to refine', severity: 'critical' }],
      });
    }

    // Check if AI provider is available
    const providerStatus = aiProvider.isReady();
    if (!providerStatus.ready) {
      // AI unavailable — return original content with validation
      const validation = validator.validate(normalized);
      return createRefinementResult({
        originalContent: extractText(normalized),
        refinedContent: extractText(normalized),
        stages: [REFINEMENT_STAGES.REQUIREMENT_CHECK],
        warnings: [
          { type: 'provider_unavailable', message: `AI refinement skipped: ${providerStatus.reason}`, severity: 'info' },
          ...validation.warnings,
        ],
        validation,
      });
    }

    // ─── Refinement Loop ───────────────────────────────────────
    let currentContent = normalized;
    let lastResult = null;
    let allChanges = [];
    let allWarnings = [];
    let stagesRun = [];

    for (let pass = 0; pass < config.maxRefinementPasses; pass++) {
      emitJobEvent(jobId, 'REFINEMENT_PASS_STARTED', { pass: pass + 1 });

      // ─── AI Refinement ─────────────────────────────────────
      let aiResult;
      try {
        aiResult = await callRefinementAI(currentContent, styleContext, jobId, aiKeys);
      } catch (error) {
        allWarnings.push({
          type: 'ai_error',
          message: `AI refinement failed: ${error.message}`,
          severity: 'warning',
        });
        emitJobEvent(jobId, 'REFINEMENT_AI_ERROR', { error: error.message, pass: pass + 1 });
        break;
      }

      stagesRun.push(REFINEMENT_STAGES.CONTENT_REVIEW);
      stagesRun.push(REFINEMENT_STAGES.STYLE_REFINEMENT);

      // Apply AI result
      if (aiResult.content && aiResult.content.paragraphs) {
        currentContent = {
          title: aiResult.content.title || currentContent.title,
          paragraphs: aiResult.content.paragraphs,
          rawText: aiResult.content.paragraphs.map((p) => p.text).join('\n\n'),
          metadata: currentContent.metadata,
        };
      }

      if (Array.isArray(aiResult.changes)) {
        allChanges.push(...aiResult.changes);
      }
      if (Array.isArray(aiResult.warnings)) {
        allWarnings.push(...aiResult.warnings);
      }

      // ─── Deterministic Validation ──────────────────────────
      stagesRun.push(REFINEMENT_STAGES.REQUIREMENT_CHECK);
      const validation = validator.validate(currentContent);

      emitJobEvent(jobId, 'REFINEMENT_VALIDATION', {
        pass: pass + 1,
        isValid: validation.isValid,
        warnings: validation.warnings.length,
      });

      // If validation passes, we're done
      if (validation.isValid) {
        stagesRun.push(REFINEMENT_STAGES.FINAL_VALIDATION);
        lastResult = createRefinementResult({
          originalContent: extractText(normalized),
          refinedContent: extractText(currentContent),
          stages: [...new Set(stagesRun)],
          changes: allChanges,
          warnings: [...allWarnings, ...validation.warnings],
          validation,
        });

        emitJobEvent(jobId, 'REFINEMENT_COMPLETED', {
          contentChanged: lastResult.contentChanged,
          wordCount: lastResult.wordCount,
          changesCount: allChanges.length,
          durationMs: Date.now() - startTime,
        });

        return lastResult;
      }

      // Validation failed — if we have passes left, try again
      if (pass < config.maxRefinementPasses - 1) {
        allWarnings.push({
          type: 'validation_retry',
          message: `Validation failed, retrying refinement (pass ${pass + 2}/${config.maxRefinementPasses})`,
          severity: 'info',
        });
      }
    }

    // ─── Final result (even if validation didn't fully pass) ──
    const finalValidation = validator.validate(currentContent);
    lastResult = createRefinementResult({
      originalContent: extractText(normalized),
      refinedContent: extractText(currentContent),
      stages: [...new Set(stagesRun)],
      changes: allChanges,
      warnings: [...allWarnings, ...finalValidation.warnings],
      validation: finalValidation,
    });

    emitJobEvent(jobId, 'REFINEMENT_COMPLETED', {
      contentChanged: lastResult.contentChanged,
      wordCount: lastResult.wordCount,
      changesCount: allChanges.length,
      durationMs: Date.now() - startTime,
    });

    return lastResult;
  }

  /**
   * Call the AI provider for content refinement.
   *
   * @param {object} content - Normalized content
   * @param {object} [styleContext] - Writing style context
   * @param {string} [jobId]
   * @returns {Promise<object>} AI refinement response
   */
  async function callRefinementAI(content, styleContext, jobId, aiKeys) {
    const systemInstruction = buildRefinementSystemInstruction(manifest, styleContext);
    const prompt = buildRefinementPrompt(content, manifest);

    const response = await aiProvider.structuredGenerate({
      systemInstruction,
      prompt,
      schema: REFINEMENT_RESPONSE_SCHEMA,
      jobId,
      aiKeys,  // BYOK: per-user AI keys from request headers
      generationConfig: {
        temperature: config.temperature,
      },
    });

    return response.data;
  }

  /**
   * Emit an event.
   */
  function emitJobEvent(jobId, type, metadata) {
    if (typeof emitEvent === 'function' && jobId) {
      try { emitEvent(jobId, type, metadata); } catch { /* ignore */ }
    }
  }

  return { refine, config };
}

// ─── Prompt Builders ───────────────────────────────────────────────

/**
 * Build the system instruction for the refinement AI.
 *
 * @param {object} manifest
 * @param {object} [styleContext]
 * @returns {string}
 */
function buildRefinementSystemInstruction(manifest, styleContext) {
  const metadata = manifest?.metadata || {};
  const parts = [
    'You are a content refinement assistant for BetterCLSS Agentic Helper.',
    '',
    'Your job is to improve the clarity, naturalness, and structure of generated content.',
    '',
    '## CRITICAL RULES',
    '1. NEVER invent facts, citations, sources, statistics, or personal experiences.',
    '2. NEVER remove required sections or content specified by the assignment.',
    '3. NEVER change the fundamental meaning or arguments of the content.',
    '4. If something is uncertain, preserve it as-is rather than guessing.',
    '5. Focus on: clarity, flow, grammar, structure, conciseness.',
    '6. Do NOT attempt to bypass AI detectors or make content "undetectable".',
    '7. You are improving quality, not disguising authorship.',
    '',
    '## Assignment Context',
    `Title: ${metadata.title || 'Unknown'}`,
    metadata.pointsPossible ? `Points: ${metadata.pointsPossible}` : '',
    '',
    '## Refinement Focus',
    '- Improve sentence clarity and readability',
    '- Fix awkward phrasing',
    '- Improve paragraph transitions',
    '- Ensure consistent tone',
    '- Remove unnecessary repetition',
    '- Maintain all required content',
    '',
  ];

  if (styleContext) {
    parts.push('## Student Style Preferences');
    if (styleContext.formality) parts.push(`Formality: ${styleContext.formality}`);
    if (styleContext.tone) parts.push(`Tone: ${styleContext.tone}`);
    if (styleContext.complexity) parts.push(`Complexity: ${styleContext.complexity}`);
    parts.push('');
  }

  parts.push('## Response Format');
  parts.push('Return a JSON object with:');
  parts.push('- "content": refined content with title and paragraphs');
  parts.push('- "changes": list of changes you made');
  parts.push('- "warnings": any concerns about the content');
  parts.push('- "summary": brief summary of what you changed');

  return parts.join('\n');
}

/**
 * Build the refinement prompt.
 *
 * @param {object} content - Normalized content
 * @param {object} manifest
 * @returns {string}
 */
function buildRefinementPrompt(content, manifest) {
  const parts = [
    '## Content to Refine',
    '',
  ];

  if (content.title) {
    parts.push(`Title: ${content.title}`);
    parts.push('');
  }

  parts.push('### Current Content');
  parts.push('');

  if (content.paragraphs && content.paragraphs.length > 0) {
    for (let i = 0; i < content.paragraphs.length; i++) {
      const p = content.paragraphs[i];
      const prefix = p.style === 'heading1' ? '# '
        : p.style === 'heading2' ? '## '
        : p.style === 'heading3' ? '### '
        : '';
      parts.push(`[${i}] ${prefix}${p.text}`);
    }
  } else if (content.rawText) {
    parts.push(content.rawText);
  }

  parts.push('');
  parts.push('## Instructions');
  parts.push('Refine this content for clarity and naturalness while preserving all required information.');
  parts.push('Do not invent facts or citations. Do not remove any required sections.');
  parts.push('Return the refined content in the specified JSON format.');

  return parts.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract plain text from normalized content.
 * @param {object} content
 * @returns {string}
 */
function extractText(content) {
  if (!content) return '';
  if (content.rawText) return content.rawText;
  if (Array.isArray(content.paragraphs)) {
    return content.paragraphs.map((p) => p.text || '').join('\n\n');
  }
  return '';
}

module.exports = {
  createRefinementPipeline,
  buildRefinementSystemInstruction,
  buildRefinementPrompt,
  DEFAULT_CONFIG,
};
