/**
 * requirement-validator.js
 * Deterministic Requirement Validator.
 *
 * Validates refined content against assignment requirements
 * without using AI. This is the safety net that ensures
 * refinement does not accidentally remove required content.
 *
 * Uses the Assignment Manifest as the source of truth.
 */

const { countWords } = require('./refinement-model');

// ─── Validation Rules ──────────────────────────────────────────────

/**
 * Extract word count requirements from assignment description.
 * @param {string} description
 * @returns {object|null}
 */
function extractWordCountRequirement(description) {
  if (!description) return null;

  // Match patterns like "500 words", "1000-word", "at least 500 words"
  const patterns = [
    /(?:at\s+least|minimum\s+of|no\s+fewer\s+than)\s+(\d+)\s*-?\s*words?/i,
    /(\d+)\s*-?\s*words?\s*(?:minimum|at\s+least)/i,
    /(\d+)\s*-\s*word/i,
    /(\d+)\s+words?/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count < 100000) {
        // Determine if it's a minimum or exact requirement
        const isMinimum = /at\s+least|minimum|no\s+fewer/i.test(match[0]);
        return {
          type: 'word_count',
          minWords: isMinimum ? count : null,
          exactWords: !isMinimum ? count : null,
          source: match[0],
        };
      }
    }
  }

  return null;
}

/**
 * Extract section/heading requirements from description.
 * @param {string} description
 * @returns {string[]}
 */
function extractRequiredSections(description) {
  if (!description) return [];

  const sections = [];

  // Look for patterns like "include an introduction", "must have a conclusion"
  const sectionPatterns = [
    /(?:include|have|contain|must\s+have|require)\s+(?:an?\s+)?(.+?)(?:\s+section|\s+paragraph|\s+part)/gi,
    /(?:introduction|conclusion|abstract|summary|overview|background|methodology|results|discussion|references)/gi,
  ];

  for (const pattern of sectionPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const section = (match[1] || match[0]).trim().toLowerCase();
      if (section.length > 2 && section.length < 100) {
        sections.push(section);
      }
    }
  }

  return [...new Set(sections)];
}

/**
 * Extract reference requirements from description.
 * @param {string} description
 * @returns {object|null}
 */
function extractReferenceRequirement(description) {
  if (!description) return null;

  const patterns = [
    /(?:at\s+least|minimum\s+of)\s+(\d+)\s+(?:references?|sources?|citations?)/i,
    /(\d+)\s+(?:references?|sources?|citations?)\s*(?:required|minimum|at\s+least)/i,
    /(\d+)\s+(?:references?|sources?|citations?)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count < 1000) {
        return {
          type: 'references',
          minCount: count,
          source: match[0],
        };
      }
    }
  }

  return null;
}

// ─── Validator ─────────────────────────────────────────────────────

/**
 * Create a requirement validator.
 *
 * @param {object} options
 * @param {object} [options.manifest] - Assignment Manifest
 * @returns {object} Validator API
 */
function createRequirementValidator({ manifest } = {}) {
  const metadata = manifest?.metadata || {};
  const requirements = manifest?.requirements || {};

  /**
   * Validate content against assignment requirements.
   *
   * @param {object} content - Structured content { title, paragraphs, rawText }
   * @returns {object} Validation result
   */
  function validate(content) {
    const warnings = [];
    const passed = [];
    const fullText = extractFullText(content);
    const wordCount = countWords(fullText);

    // ─── Word Count Check ───────────────────────────────────────
    const wordReq = extractWordCountRequirement(metadata.description || metadata.plainDescription || '');
    if (wordReq) {
      if (wordReq.minWords && wordCount < wordReq.minWords) {
        warnings.push({
          type: 'word_count',
          message: `Content has ${wordCount} words, minimum required is ${wordReq.minWords}`,
          severity: 'warning',
          actual: wordCount,
          expected: wordReq.minWords,
        });
      } else if (wordReq.exactWords) {
        const tolerance = Math.floor(wordReq.exactWords * 0.1); // 10% tolerance
        if (Math.abs(wordCount - wordReq.exactWords) > tolerance) {
          warnings.push({
            type: 'word_count',
            message: `Content has ${wordCount} words, expected approximately ${wordReq.exactWords}`,
            severity: 'warning',
            actual: wordCount,
            expected: wordReq.exactWords,
          });
        } else {
          passed.push({ type: 'word_count', message: `Word count ${wordCount} meets requirement` });
        }
      } else {
        passed.push({ type: 'word_count', message: `Word count ${wordCount} meets requirement` });
      }
    }

    // ─── Section Check ─────────────────────────────────────────
    const requiredSections = extractRequiredSections(metadata.description || metadata.plainDescription || '');
    const lowerText = fullText.toLowerCase();

    for (const section of requiredSections) {
      if (lowerText.includes(section)) {
        passed.push({ type: 'section', message: `Required section "${section}" found` });
      } else {
        warnings.push({
          type: 'section',
          message: `Required section or concept "${section}" not found in content`,
          severity: 'warning',
        });
      }
    }

    // ─── Reference Check ───────────────────────────────────────
    const refReq = extractReferenceRequirement(metadata.description || metadata.plainDescription || '');
    if (refReq) {
      // Count potential references (URLs, "(Author, Year)" patterns, numbered citations)
      const urlCount = (fullText.match(/https?:\/\/[^\s]+/g) || []).length;
      const citationCount = (fullText.match(/\([A-Z][a-z]+,\s*\d{4}\)/g) || []).length;
      const numberedCount = (fullText.match(/\[\d+\]/g) || []).length;
      const totalRefs = Math.max(urlCount, citationCount, numberedCount);

      if (totalRefs < refReq.minCount) {
        warnings.push({
          type: 'references',
          message: `Found approximately ${totalRefs} references, minimum required is ${refReq.minCount}`,
          severity: 'warning',
          actual: totalRefs,
          expected: refReq.minCount,
        });
      } else {
        passed.push({ type: 'references', message: `Reference count ${totalRefs} meets requirement` });
      }
    }

    // ─── Content Quality Checks ────────────────────────────────
    if (wordCount === 0) {
      warnings.push({
        type: 'empty_content',
        message: 'Content is empty',
        severity: 'critical',
      });
    }

    if (content.paragraphs && content.paragraphs.length === 0 && !content.rawText) {
      warnings.push({
        type: 'no_paragraphs',
        message: 'Content has no paragraphs',
        severity: 'critical',
      });
    }

    // Check for very short content
    if (wordCount > 0 && wordCount < 20) {
      warnings.push({
        type: 'very_short',
        message: `Content is very short (${wordCount} words)`,
        severity: 'info',
      });
    }

    // ─── Requirement Categories ────────────────────────────────
    const categories = requirements.categories || [];
    if (categories.includes('TEXT') && wordCount === 0) {
      warnings.push({
        type: 'requirement_category',
        message: 'Assignment requires text content but none was provided',
        severity: 'critical',
      });
    }

    const criticalWarnings = warnings.filter((w) => w.severity === 'critical');
    const isValid = criticalWarnings.length === 0;

    return {
      isValid,
      wordCount,
      warnings,
      passed,
      summary: isValid
        ? `Validation passed. ${passed.length} checks OK, ${warnings.length} warnings.`
        : `Validation failed. ${criticalWarnings.length} critical issues found.`,
    };
  }

  return { validate };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract full text from structured content.
 * @param {object} content
 * @returns {string}
 */
function extractFullText(content) {
  if (!content) return '';

  if (content.rawText) return content.rawText;

  if (Array.isArray(content.paragraphs)) {
    return content.paragraphs.map((p) => p.text || '').join(' ');
  }

  if (typeof content.text === 'string') return content.text;

  return '';
}

module.exports = {
  createRequirementValidator,
  extractWordCountRequirement,
  extractRequiredSections,
  extractReferenceRequirement,
  extractFullText,
};
