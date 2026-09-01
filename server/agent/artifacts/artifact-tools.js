/**
 * artifact-tools.js
 * Artifact Generation Tools for Agentic Helper.
 *
 * Registers artifact generation tools in the Tool Runtime.
 * These tools allow the AI to request document generation
 * through the controlled tool interface.
 *
 * NO Canvas mutations — only local file generation.
 */

const { registerTool, TOOL_PERMISSIONS } = require('../tools/tool-registry');
const { createSuccessResult, createErrorResult } = require('../tools/tool-runtime');
const { checkArtifactTypeSupport, ARTIFACT_TYPES } = require('./artifact-model');

// ─── Generator Registry ────────────────────────────────────────────

const generators = {};

/**
 * Register artifact generators.
 * Call this after generators are created.
 *
 * @param {object} params
 * @param {object} [params.docxGenerator]
 * @param {object} [params.txtGenerator]
 */
function registerGenerators({ docxGenerator, txtGenerator }) {
  if (docxGenerator) generators.docx = docxGenerator;
  if (txtGenerator) generators.txt = txtGenerator;
}

/**
 * Register all artifact generation tools.
 *
 * @param {object} deps
 * @param {object} deps.artifactStorage - Storage service (for tool validation)
 * @param {object} [deps.agentJobService] - Job service for artifact-to-job linkage
 */
function registerArtifactTools(deps = {}) {
  const { agentJobService } = deps;

  /**
   * Link an artifact to the job's artifacts array.
   * @param {string} jobId
   * @param {number} userId
   * @param {object} artifact
   */
  function linkArtifactToJob(jobId, userId, artifact) {
    if (!agentJobService) return;
    try {
      const job = agentJobService.getJob(userId, jobId);
      if (job) {
        if (!Array.isArray(job.artifacts)) job.artifacts = [];
        job.artifacts.push({
          id: artifact.id,
          type: artifact.type,
          filename: artifact.filename,
          size: artifact.size,
          status: artifact.status,
          mimeType: artifact.mimeType,
          storagePath: artifact.storagePath,
          createdAt: artifact.createdAt,
        });
        agentJobService.persistJob(userId, job);
      }
    } catch { /* ignore — artifact generation should not fail due to linkage */ }
  }

  // ─── artifact.generate_docx ────────────────────────────────────
  registerTool({
    id: 'artifact.generate_docx',
    name: 'Generate DOCX Document',
    description: 'Generate a Word document (.docx) from structured content. Returns the generated artifact record.',
    category: 'artifact',
    permissions: [TOOL_PERMISSIONS.GENERATE],
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Desired filename (e.g., "report.docx")' },
        content: {
          type: 'object',
          description: 'Structured document content',
          properties: {
            title: { type: 'string', description: 'Document title' },
            paragraphs: {
              type: 'array',
              description: 'Array of paragraphs',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'Paragraph text' },
                  style: { type: 'string', enum: ['heading1', 'heading2', 'heading3', 'normal'], description: 'Paragraph style' },
                  bold: { type: 'boolean', description: 'Bold text' },
                  italic: { type: 'boolean', description: 'Italic text' },
                },
                required: ['text'],
              },
            },
            text: { type: 'string', description: 'Alternative: plain text content (split by newlines into paragraphs)' },
          },
          required: [],
        },
      },
      required: ['content'],
    },
    maxResultSize: 10000,
    execute: async (args, context) => {
      const { filename, content } = args;
      const { jobId } = context;

      // Check support
      const support = checkArtifactTypeSupport(ARTIFACT_TYPES.DOCX);
      if (!support.supported) {
        return createErrorResult('UNSUPPORTED_FORMAT', support.reason);
      }

      // Check generator is available
      if (!generators.docx) {
        return createErrorResult('GENERATOR_UNAVAILABLE', 'DOCX generator is not initialized.');
      }

      try {
        const artifact = await generators.docx.generate({
          jobId,
          userId: context.userId,
          filename: filename || 'document.docx',
          content,
        });

        if (artifact.status === 'FAILED') {
          return createErrorResult('GENERATION_FAILED', artifact.error);
        }

        // Link artifact to the agent job
        linkArtifactToJob(jobId, context.userId, artifact);

        return createSuccessResult({
          artifactId: artifact.id,
          filename: artifact.filename,
          type: artifact.type,
          size: artifact.size,
          status: artifact.status,
          mimeType: artifact.mimeType,
        });

      } catch (error) {
        return createErrorResult('GENERATION_FAILED', error.message);
      }
    },
  });

  // ─── artifact.generate_txt ─────────────────────────────────────
  registerTool({
    id: 'artifact.generate_txt',
    name: 'Generate Text File',
    description: 'Generate a plain text file (.txt) from structured content.',
    category: 'artifact',
    permissions: [TOOL_PERMISSIONS.GENERATE],
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Desired filename (e.g., "notes.txt")' },
        content: {
          type: 'object',
          description: 'Text content',
          properties: {
            title: { type: 'string' },
            paragraphs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  style: { type: 'string' },
                },
                required: ['text'],
              },
            },
            text: { type: 'string' },
            rawText: { type: 'string' },
          },
        },
      },
      required: ['content'],
    },
    maxResultSize: 10000,
    execute: async (args, context) => {
      const { filename, content } = args;
      const { jobId } = context;

      const support = checkArtifactTypeSupport(ARTIFACT_TYPES.TXT);
      if (!support.supported) {
        return createErrorResult('UNSUPPORTED_FORMAT', support.reason);
      }

      if (!generators.txt) {
        return createErrorResult('GENERATOR_UNAVAILABLE', 'TXT generator is not initialized.');
      }

      try {
        const artifact = await generators.txt.generate({
          jobId,
          userId: context.userId,
          filename: filename || 'document.txt',
          content,
        });

        if (artifact.status === 'FAILED') {
          return createErrorResult('GENERATION_FAILED', artifact.error);
        }

        // Link artifact to the agent job
        linkArtifactToJob(jobId, context.userId, artifact);

        return createSuccessResult({
          artifactId: artifact.id,
          filename: artifact.filename,
          type: artifact.type,
          size: artifact.size,
          status: artifact.status,
          mimeType: artifact.mimeType,
        });

      } catch (error) {
        return createErrorResult('GENERATION_FAILED', error.message);
      }
    },
  });

  // ─── artifact.generate_pdf (stub — unimplemented) ─────────────
  registerTool({
    id: 'artifact.generate_pdf',
    name: 'Generate PDF (Not Implemented)',
    description: 'PDF generation is not yet available. This tool returns an error indicating the format is not supported.',
    category: 'artifact',
    permissions: [TOOL_PERMISSIONS.GENERATE],
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        filename: { type: 'string' },
        content: { type: 'object' },
      },
      required: ['content'],
    },
    execute: async () => {
      return createErrorResult(
        'NOT_IMPLEMENTED',
        'PDF generation is not yet implemented. Please generate a DOCX or TXT file instead.'
      );
    },
  });
}

module.exports = {
  registerArtifactTools,
  registerGenerators,
};
