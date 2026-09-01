/**
 * txt-generator.js
 * Text Artifact Generator.
 *
 * Generates plain text files from structured content.
 * This is the simplest generator and serves as a baseline
 * for testing the artifact pipeline.
 */

const { createArtifact, markArtifactReady, markArtifactFailed } = require('./artifact-model');

/**
 * Create a text file generator.
 *
 * @param {object} options
 * @param {object} options.artifactStorage - Artifact storage service
 * @returns {object} Generator API
 */
function createTxtGenerator({ artifactStorage }) {
  /**
   * Generate a text file from structured content.
   *
   * @param {object} params
   * @param {string} params.jobId
   * @param {number} params.userId
   * @param {string} params.filename
   * @param {object} params.content - Content to generate
   * @param {string} [params.content.title]
   * @param {Array} [params.content.paragraphs] - [{text, style?}]
   * @param {string} [params.content.text] - Plain text
   * @param {string} [params.content.rawText] - Raw text
   * @returns {Promise<object>} Artifact record
   */
  async function generate({ jobId, userId, filename, content }) {
    const artifact = createArtifact({
      jobId,
      userId,
      type: 'txt',
      filename: filename || 'document.txt',
    });

    try {
      const text = buildTextContent(content || {});

      if (!text || text.trim().length === 0) {
        throw new Error('Generated text content is empty');
      }

      const buffer = Buffer.from(text, 'utf8');

      const { storagePath, size } = artifactStorage.saveArtifact(
        userId,
        artifact.id,
        artifact.filename,
        buffer
      );

      return markArtifactReady(artifact, storagePath, size);

    } catch (error) {
      return markArtifactFailed(artifact, error.message);
    }
  }

  return { generate };
}

/**
 * Build plain text content from structured content.
 *
 * @param {object} content
 * @returns {string}
 */
function buildTextContent(content) {
  const parts = [];

  if (content.title) {
    parts.push(content.title);
    parts.push('='.repeat(content.title.length));
    parts.push('');
  }

  // Structured paragraphs
  if (Array.isArray(content.paragraphs) && content.paragraphs.length > 0) {
    for (const para of content.paragraphs) {
      const prefix = para.style === 'heading1' ? '# '
        : para.style === 'heading2' ? '## '
        : para.style === 'heading3' ? '### '
        : '';
      parts.push(`${prefix}${para.text || ''}`);
      if (para.style && para.style.startsWith('heading')) {
        parts.push('');
      }
    }
  } else if (content.text) {
    // Simple text (may contain newlines)
    parts.push(content.text);
  } else if (content.rawText) {
    parts.push(content.rawText);
  }

  return parts.join('\n');
}

module.exports = { createTxtGenerator, buildTextContent };
