/**
 * canvas-tools.js
 * Canvas Read-Only Tools for Agentic Helper.
 *
 * These tools provide controlled, authorized access to Canvas data
 * through the existing canvas-service.js functions.
 *
 * NO MUTATION TOOLS are implemented yet.
 * All tools are read-only.
 */

const { registerTool, TOOL_PERMISSIONS } = require('./tool-registry');
const { createSuccessResult, createErrorResult } = require('./tool-runtime');

/**
 * Register all Canvas read-only tools.
 *
 * @param {object} canvasService - Existing canvas service
 */
function registerCanvasTools(canvasService) {

  // ─── canvas.read_assignment ──────────────────────────────────────

  registerTool({
    id: 'canvas.read_assignment',
    name: 'Read Assignment',
    description: 'Fetch assignment details from Canvas including title, description, due date, points, and submission types.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
      },
      required: ['courseId', 'assignmentId'],
    },
    maxResultSize: 30000,
    execute: async (args, context) => {
      try {
        // Build auth from user context
        // The runtime has verified the user and job
        // Canvas service will use the token from the request
        const auth = { token: '', domain: '' };

        // We need to get auth from the context
        // For now, use a placeholder that will be resolved by the caller
        if (!context.canvasAuth) {
          return createErrorResult('NO_AUTH', 'Canvas authentication not available');
        }

        const assignment = await canvasService.fetchOne(
          `/courses/${args.courseId}/assignments/${args.assignmentId}`,
          { include: ['submission', 'overrides', 'rubric', 'discussion_topic'] },
          context.canvasAuth
        );

        // Normalize the response
        const normalized = {
          id: assignment.id,
          name: assignment.name,
          description: assignment.description,
          dueAt: assignment.due_at,
          lockAt: assignment.lock_at,
          pointsPossible: assignment.points_possible,
          submissionTypes: assignment.submission_types,
          allowedExtensions: assignment.allowed_extensions || [],
          hasRubric: Boolean(assignment.rubric_settings || assignment.rubric),
          canvasUrl: assignment.html_url,
          courseId: args.courseId,
        };

        return createSuccessResult(normalized, { source: 'canvas' });
      } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
          return createErrorResult('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
        }
        return createErrorResult('CANVAS_ERROR', error.message);
      }
    },
  });

  // ─── canvas.read_rubric ──────────────────────────────────────────

  registerTool({
    id: 'canvas.read_rubric',
    name: 'Read Rubric',
    description: 'Fetch the rubric/grading criteria for an assignment.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
      },
      required: ['courseId', 'assignmentId'],
    },
    maxResultSize: 20000,
    execute: async (args, context) => {
      try {
        if (!context.canvasAuth) {
          return createErrorResult('NO_AUTH', 'Canvas authentication not available');
        }

        const assignment = await canvasService.fetchOne(
          `/courses/${args.courseId}/assignments/${args.assignmentId}`,
          { include: ['rubric'] },
          context.canvasAuth
        );

        if (!assignment.rubric) {
          return createSuccessResult(null, { hasRubric: false });
        }

        return createSuccessResult(assignment.rubric, { source: 'canvas', hasRubric: true });
      } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
          return createErrorResult('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
        }
        return createErrorResult('CANVAS_ERROR', error.message);
      }
    },
  });

  // ─── canvas.read_submission ──────────────────────────────────────

  registerTool({
    id: 'canvas.read_submission',
    name: 'Read Submission',
    description: 'Fetch submission metadata for an assignment.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
      },
      required: ['courseId', 'assignmentId'],
    },
    maxResultSize: 15000,
    execute: async (args, context) => {
      try {
        if (!context.canvasAuth) {
          return createErrorResult('NO_AUTH', 'Canvas authentication not available');
        }

        // Get submissions for the assignment
        const submissions = await canvasService.fetchAll(
          `/courses/${args.courseId}/assignments/${args.assignmentId}/submissions`,
          { include: ['user', 'comments'] },
          context.canvasAuth
        );

        // Find the current user's submission
        const userId = context.userId;
        const submission = submissions.find(
          (s) => String(s.user_id) === String(userId)
        );

        if (!submission) {
          return createSuccessResult(null, { hasSubmission: false });
        }

        const normalized = {
          id: submission.id,
          workflowState: submission.workflow_state,
          submittedAt: submission.submitted_at,
          score: submission.score,
          grade: submission.grade,
          commentCount: submission.comments?.length || 0,
          hasSubmission: true,
        };

        return createSuccessResult(normalized, { source: 'canvas' });
      } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
          return createErrorResult('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
        }
        return createErrorResult('CANVAS_ERROR', error.message);
      }
    },
  });

  // ─── canvas.read_course ──────────────────────────────────────────

  registerTool({
    id: 'canvas.read_course',
    name: 'Read Course',
    description: 'Fetch course information including name, code, and enrollment status.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
      },
      required: ['courseId'],
    },
    maxResultSize: 10000,
    execute: async (args, context) => {
      try {
        if (!context.canvasAuth) {
          return createErrorResult('NO_AUTH', 'Canvas authentication not available');
        }

        const course = await canvasService.fetchOne(
          `/courses/${args.courseId}`,
          { include: ['total_scores', 'current_grading_period_scores', 'term'] },
          context.canvasAuth
        );

        const normalized = {
          id: course.id,
          name: course.name,
          courseCode: course.course_code,
          currentScore: course.enrollments?.[0]?.computed_current_score ?? null,
          finalScore: course.enrollments?.[0]?.computed_final_score ?? null,
        };

        return createSuccessResult(normalized, { source: 'canvas' });
      } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
          return createErrorResult('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
        }
        return createErrorResult('CANVAS_ERROR', error.message);
      }
    },
  });

  // ─── canvas.read_comments ────────────────────────────────────────

  registerTool({
    id: 'canvas.read_comments',
    name: 'Read Comments',
    description: 'Fetch comments/feedback on a submission.',
    category: 'canvas',
    permissions: [TOOL_PERMISSIONS.READ],
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'number', description: 'Canvas course ID' },
        assignmentId: { type: 'number', description: 'Canvas assignment ID' },
      },
      required: ['courseId', 'assignmentId'],
    },
    maxResultSize: 20000,
    execute: async (args, context) => {
      try {
        if (!context.canvasAuth) {
          return createErrorResult('NO_AUTH', 'Canvas authentication not available');
        }

        // Get submissions to find submission ID
        const submissions = await canvasService.fetchAll(
          `/courses/${args.courseId}/assignments/${args.assignmentId}/submissions`,
          { include: ['comments'] },
          context.canvasAuth
        );

        const userId = context.userId;
        const submission = submissions.find(
          (s) => String(s.user_id) === String(userId)
        );

        if (!submission) {
          return createSuccessResult([], { hasComments: false });
        }

        const comments = (submission.comments || []).map((c) => ({
          id: c.id,
          author: c.author?.display_name || 'Unknown',
          message: c.comment,
          createdAt: c.created_at,
        }));

        return createSuccessResult(comments, { source: 'canvas', count: comments.length });
      } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
          return createErrorResult('CANVAS_UNAUTHORIZED', 'Canvas token is invalid or expired');
        }
        return createErrorResult('CANVAS_ERROR', error.message);
      }
    },
  });
}

module.exports = { registerCanvasTools };
