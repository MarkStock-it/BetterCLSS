/**
 * agent-routes.js
 * Agentic Helper API routes.
 *
 * Handles:
 *   - GET  /api/agent/config                    — Get public agent configuration
 *   - GET  /api/agent/capabilities               — List registered capabilities
 *   - GET  /api/agent/settings/:userId           — Get agent settings
 *   - POST /api/agent/settings/:userId           — Update agent settings
 *   - GET  /api/agent/settings/:userId/permissions — Get permissions
 *   - POST /api/agent/settings/:userId/permissions — Update permissions
 *   - GET  /api/agent/status/:userId             — Get agent enabled status
 *   - POST /api/agent/analyze                    — Analyze assignment (stateless)
 *   - POST /api/agent/ingest/:userId             — Ingest assignment
 *   - GET  /api/agent/manifests/:userId          — Get all cached manifests
 *   - GET  /api/agent/manifests/:userId/:courseId/:assignmentId — Get specific manifest
 *   - POST /api/agent/jobs/:userId               — Create a new agent job
 *   - GET  /api/agent/jobs/:userId               — List all jobs for a user
 *   - GET  /api/agent/jobs/:userId/:jobId        — Get a specific job
 *   - GET  /api/agent/jobs/:userId/:jobId/events — Get job events
 *   - POST /api/agent/jobs/:userId/:jobId/cancel — Cancel a job
 *   - POST /api/agent/execute/:userId/:jobId     — Execute an agent job
 *   - GET  /api/agent/summary/:userId            — Get job count summary
 */

const { writeBodyError } = require('../lib/http');
const { analyzeAssignment } = require('../agent/capability-analyzer');
const { getAllCapabilities } = require('../agent/capability-registry');
const { createApprovalRequest, approveRequest, denyRequest, validateApproval, APPROVAL_TYPES } = require('../agent/approval/approval-model');

function createAgentRoutes({
  agentJobService,
  agentService,
  agentOrchestrator,
  assignmentIngestion,
  artifactStorage,
  canvasService,
  json,
  parseRequestBody,
  toolRuntime,
}) {
  return async function handleAgentRoute(req, res, pathname) {
    // Bring-your-own-key: read the per-user AI keys sent by the client
    // (mirrors the assistant `x-ai-key` flow). Keys are optional — when
    // absent, the server falls back to its own configured provider.
    const aiKeys = (() => {
      const gemini = String(req.headers['x-ai-key'] || '').trim();
      const groq = String(req.headers['x-groq-key'] || '').trim();
      return { gemini: gemini || undefined, groq: groq || undefined };
    })();

    // GET /api/agent/config — public config, no auth required
    if (pathname === '/api/agent/config' && req.method === 'GET') {
      try {
        json(res, 200, agentService.getPublicConfig());
      } catch (error) {
        if (!writeBodyError(json, res, error)) {
          json(res, 500, { error: 'config_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/capabilities — list all registered capabilities
    if (pathname === '/api/agent/capabilities' && req.method === 'GET') {
      try {
        const capabilities = getAllCapabilities();
        json(res, 200, { success: true, capabilities });
      } catch (error) {
        if (!writeBodyError(json, res, error)) {
          json(res, 500, { error: 'capabilities_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/settings/:userId
    const settingsGetMatch = pathname.match(/^\/api\/agent\/settings\/(\d+)$/);
    if (settingsGetMatch && req.method === 'GET') {
      const userId = parseInt(settingsGetMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const settings = agentService.getSettings(userId);
        json(res, 200, { success: true, settings });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'settings_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/settings/:userId — toggle enabled/disabled
    if (settingsGetMatch && req.method === 'POST') {
      const userId = parseInt(settingsGetMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        const enabled = Boolean(body.enabled);
        const settings = agentService.updateSettings(userId, enabled);
        json(res, 200, { success: true, settings });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'settings_error', message: error.message });
        }
      }
      return true;
    }

    // ─── Permissions Endpoints ───────────────────────────────────────

    // GET /api/agent/settings/:userId/permissions — get permissions
    const permissionsGetMatch = pathname.match(/^\/api\/agent\/settings\/(\d+)\/permissions$/);
    if (permissionsGetMatch && req.method === 'GET') {
      const userId = parseInt(permissionsGetMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const permissions = agentService.getPermissions(userId);
        json(res, 200, { success: true, permissions });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'permissions_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/settings/:userId/permissions — update permissions
    if (permissionsGetMatch && req.method === 'POST') {
      const userId = parseInt(permissionsGetMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        const result = agentService.updatePermissions(userId, body.permissions || {});
        if (!result.success) {
          json(res, 400, { success: false, errors: result.errors });
          return true;
        }
        json(res, 200, { success: true, permissions: result.permissions });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'permissions_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/status/:userId — lightweight enabled check
    const statusMatch = pathname.match(/^\/api\/agent\/status\/(\d+)$/);
    if (statusMatch && req.method === 'GET') {
      const userId = parseInt(statusMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const enabled = agentService.isAgenticHelperEnabled(userId);
        json(res, 200, { success: true, enabled });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'status_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/analyze — Stateless analysis (no persistence)
    if (pathname === '/api/agent/analyze' && req.method === 'POST') {
      try {
        const body = await parseRequestBody(req);
        const assignment = body.assignment;
        const course = body.course || {};
        const rubric = body.rubric || null;
        const submission = body.submission || null;

        if (!assignment) {
          json(res, 400, { error: 'missing_assignment', message: 'Assignment data is required.' });
          return true;
        }

        canvasService.resolveAuth(req);
        const analysis = analyzeAssignment(assignment, { course, rubric, submission });
        json(res, 200, { success: true, analysis });
      } catch (error) {
        if (error.message === 'MISSING_CANVAS_TOKEN') {
          json(res, 401, { error: 'missing_credentials', message: 'Canvas credentials required.' });
          return true;
        }
        if (error.message === 'INVALID_CANVAS_DOMAIN') {
          json(res, 400, { error: 'invalid_domain', message: 'Canvas domain is invalid.' });
          return true;
        }
        if (!writeBodyError(json, res, error)) {
          json(res, 500, { error: 'analyze_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/ingest/:userId — Fetch from Canvas, analyze, persist manifest
    const ingestMatch = pathname.match(/^\/api\/agent\/ingest\/(\d+)$/);
    if (ingestMatch && req.method === 'POST') {
      const userId = parseInt(ingestMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        if (!agentService.isAgenticHelperEnabled(userId)) {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        const body = await parseRequestBody(req);
        const { courseId, assignmentId, forceRefresh } = body;
        if (!courseId || !assignmentId) {
          json(res, 400, { error: 'missing_parameters', message: 'courseId and assignmentId required.' });
          return true;
        }
        const auth = canvasService.resolveAuth(req);
        const manifest = await assignmentIngestion.ingestAssignment(
          auth, userId, courseId, assignmentId, { forceRefresh: Boolean(forceRefresh) }
        );
        json(res, 200, { success: true, manifest });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          if (!writeBodyError(json, res, error)) {
            json(res, 500, { error: 'ingest_error', message: error.message });
          }
        }
      }
      return true;
    }

    // GET /api/agent/manifests/:userId — Get all cached manifests
    const manifestsMatch = pathname.match(/^\/api\/agent\/manifests\/(\d+)$/);
    if (manifestsMatch && req.method === 'GET') {
      const userId = parseInt(manifestsMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const manifests = assignmentIngestion.getUserManifests(userId);
        json(res, 200, { success: true, manifests, count: manifests.length });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'manifests_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/manifests/:userId/:courseId/:assignmentId — Get specific manifest
    const specificManifestMatch = pathname.match(/^\/api\/agent\/manifests\/(\d+)\/(\d+)\/(\d+)$/);
    if (specificManifestMatch && req.method === 'GET') {
      const userId = parseInt(specificManifestMatch[1]);
      const courseId = parseInt(specificManifestMatch[2]);
      const assignmentId = parseInt(specificManifestMatch[3]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const manifest = assignmentIngestion.getCachedManifest(userId, courseId, assignmentId);
        if (!manifest) {
          json(res, 404, { error: 'manifest_not_found', message: 'No cached manifest.' });
          return true;
        }
        json(res, 200, { success: true, manifest });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'manifest_error', message: error.message });
        }
      }
      return true;
    }

    // ─── Job Endpoints ─────────────────────────────────────────────

    // POST /api/agent/jobs/:userId — Create a new agent job
    const createJobMatch = pathname.match(/^\/api\/agent\/jobs\/(\d+)$/);
    if (createJobMatch && req.method === 'POST') {
      const userId = parseInt(createJobMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        const { courseId, assignmentId, manifest } = body;

        if (!courseId || !assignmentId) {
          json(res, 400, { error: 'missing_parameters', message: 'courseId and assignmentId required.' });
          return true;
        }

        const job = agentJobService.createJob({ userId, courseId, assignmentId, manifest });
        const sanitized = agentJobService.sanitizeJob(job);
        json(res, 201, { success: true, job: sanitized });
      } catch (error) {
        if (error.message === 'AGENT_DISABLED') {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        if (!canvasService.writeUserAuthError(res, error)) {
          if (!writeBodyError(json, res, error)) {
            json(res, 500, { error: 'job_create_error', message: error.message });
          }
        }
      }
      return true;
    }

    // GET /api/agent/jobs/:userId — List all jobs for a user
    if (createJobMatch && req.method === 'GET') {
      const userId = parseInt(createJobMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const jobs = agentJobService.getUserJobs(userId);
        const sanitized = jobs.map(agentJobService.sanitizeJob);
        json(res, 200, { success: true, jobs: sanitized, count: sanitized.length });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'jobs_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/jobs/:userId/:jobId — Get a specific job
    const jobDetailMatch = pathname.match(/^\/api\/agent\/jobs\/(\d+)\/([^/]+)$/);
    if (jobDetailMatch && req.method === 'GET') {
      const userId = parseInt(jobDetailMatch[1]);
      const jobId = jobDetailMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const job = agentJobService.getJob(userId, jobId);
        if (!job) {
          json(res, 404, { error: 'job_not_found', message: 'Job not found.' });
          return true;
        }
        json(res, 200, { success: true, job: agentJobService.sanitizeJob(job) });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'job_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/jobs/:userId/:jobId/events — Get job events
    const jobEventsMatch = pathname.match(/^\/api\/agent\/jobs\/(\d+)\/([^/]+)\/events$/);
    if (jobEventsMatch && req.method === 'GET') {
      const userId = parseInt(jobEventsMatch[1]);
      const jobId = jobEventsMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const events = agentJobService.getJobEvents(userId, jobId);
        json(res, 200, { success: true, events, count: events.length });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'events_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/jobs/:userId/:jobId/cancel — Cancel a job
    const jobCancelMatch = pathname.match(/^\/api\/agent\/jobs\/(\d+)\/([^/]+)\/cancel$/);
    if (jobCancelMatch && req.method === 'POST') {
      const userId = parseInt(jobCancelMatch[1]);
      const jobId = jobCancelMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const job = agentJobService.cancelJob(userId, jobId);
        json(res, 200, { success: true, job: agentJobService.sanitizeJob(job) });
      } catch (error) {
        if (error.message === 'JOB_NOT_FOUND') {
          json(res, 404, { error: 'job_not_found', message: 'Job not found.' });
          return true;
        }
        if (error.message && error.message.startsWith('INVALID_TRANSITION')) {
          json(res, 409, { error: 'invalid_transition', message: error.message });
          return true;
        }
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'cancel_error', message: error.message });
        }
      }
      return true;
    }

    // ─── Approval Endpoints ─────────────────────────────────────────

    // POST /api/agent/approvals/:userId — Create an approval request
    const approvalCreateMatch = pathname.match(/^\/api\/agent\/approvals\/(\d+)$/);
    if (approvalCreateMatch && req.method === 'POST') {
      const userId = parseInt(approvalCreateMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        const { jobId, type, artifactId, artifactVersion } = body;

        if (!jobId || !type || !artifactId) {
          json(res, 400, { error: 'missing_parameters', message: 'jobId, type, and artifactId required.' });
          return true;
        }

        // Validate approval type
        if (!Object.values(APPROVAL_TYPES).includes(type)) {
          json(res, 400, { error: 'invalid_type', message: `Invalid approval type: ${type}` });
          return true;
        }

        // Verify job ownership
        const job = agentJobService.getJob(userId, jobId);
        if (!job) {
          json(res, 404, { error: 'job_not_found', message: 'Job not found.' });
          return true;
        }

        // Create approval request
        const approval = createApprovalRequest({
          jobId,
          userId,
          type,
          artifactId,
          artifactVersion: artifactVersion || 1,
        });

        // Store approval on the job
        job.approval = approval;
        agentJobService.persistJob(userId, job);

        agentJobService.addEvent(jobId, 'APPROVAL_REQUESTED', {
          approvalId: approval.id,
          type,
          artifactId,
        });

        json(res, 201, { success: true, approval });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'approval_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/approvals/:userId/:approvalId/approve — Approve
    const approvalApproveMatch = pathname.match(/^\/api\/agent\/approvals\/(\d+)\/([^/]+)\/approve$/);
    if (approvalApproveMatch && req.method === 'POST') {
      const userId = parseInt(approvalApproveMatch[1]);
      const approvalId = approvalApproveMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req).catch(() => ({}));

        // Find the job with this approval
        const jobs = agentJobService.getUserJobs(userId);
        let foundJob = null;
        for (const job of jobs) {
          if (job.approval && job.approval.id === approvalId) {
            foundJob = job;
            break;
          }
        }

        if (!foundJob) {
          json(res, 404, { error: 'approval_not_found', message: 'Approval request not found.' });
          return true;
        }

        // Approve
        foundJob.approval = approveRequest(foundJob.approval, userId);
        agentJobService.persistJob(userId, foundJob);

        agentJobService.addEvent(foundJob.id, 'APPROVAL_GRANTED', {
          approvalId,
          artifactId: foundJob.approval.artifactId,
          artifactVersion: foundJob.approval.artifactVersion,
        });

        // Trigger orchestrator execution in background after approval
        // (fire-and-forget — the response goes back immediately)
        let canvasAuth = null;
        try {
          canvasAuth = canvasService.resolveAuth(req);
        } catch { /* auth may not be available */ }
        agentOrchestrator.runJob(foundJob.id, userId, { canvasAuth, aiKeys }).catch((err) => {
          agentJobService.addEvent(foundJob.id, 'APPROVAL_EXECUTION_FAILED', {
            error: err.message || 'Execution failed after approval',
          });
        });

        json(res, 200, { success: true, approval: foundJob.approval });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'approval_error', message: error.message });
        }
      }
      return true;
    }

    // POST /api/agent/approvals/:userId/:approvalId/deny — Deny
    const approvalDenyMatch = pathname.match(/^\/api\/agent\/approvals\/(\d+)\/([^/]+)\/deny$/);
    if (approvalDenyMatch && req.method === 'POST') {
      const userId = parseInt(approvalDenyMatch[1]);
      const approvalId = approvalDenyMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req).catch(() => ({}));

        const jobs = agentJobService.getUserJobs(userId);
        let foundJob = null;
        for (const job of jobs) {
          if (job.approval && job.approval.id === approvalId) {
            foundJob = job;
            break;
          }
        }

        if (!foundJob) {
          json(res, 404, { error: 'approval_not_found', message: 'Approval request not found.' });
          return true;
        }

        foundJob.approval = denyRequest(foundJob.approval, body.reason || 'Denied by user');
        agentJobService.persistJob(userId, foundJob);

        agentJobService.addEvent(foundJob.id, 'APPROVAL_DENIED', {
          approvalId,
          reason: foundJob.approval.denialReason,
        });

        json(res, 200, { success: true, approval: foundJob.approval });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'approval_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/approvals/:userId/:jobId — Get approval for a job
    const approvalGetMatch = pathname.match(/^\/api\/agent\/approvals\/(\d+)\/([^/]+)$/);
    if (approvalGetMatch && req.method === 'GET') {
      const userId = parseInt(approvalGetMatch[1]);
      const jobId = approvalGetMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const job = agentJobService.getJob(userId, jobId);
        if (!job) {
          json(res, 404, { error: 'job_not_found', message: 'Job not found.' });
          return true;
        }
        json(res, 200, {
          success: true,
          approval: job.approval || null,
          hasApproval: Boolean(job.approval && job.approval.status === 'APPROVED'),
        });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'approval_error', message: error.message });
        }
      }
      return true;
    }

    // ─── Tool Endpoints ─────────────────────────────────────────────

    // POST /api/agent/tools/execute/:userId — Execute a tool request
    const toolExecMatch = pathname.match(/^\/api\/agent\/tools\/execute\/(\d+)$/);
    if (toolExecMatch && req.method === 'POST') {
      const userId = parseInt(toolExecMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        if (!agentService.isAgenticHelperEnabled(userId)) {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        const body = await parseRequestBody(req);
        if (!body.tool || !body.jobId) {
          json(res, 400, { error: 'missing_parameters', message: 'tool and jobId required.' });
          return true;
        }
        const result = await toolRuntime.execute(
          { tool: body.tool, arguments: body.arguments || {}, jobId: body.jobId },
          userId
        );
        json(res, result.success ? 200 : 400, { success: result.success, result });
      } catch (error) {
        if (error.message === 'AGENT_DISABLED') {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        if (!canvasService.writeUserAuthError(res, error)) {
          if (!writeBodyError(json, res, error)) {
            json(res, 500, { error: 'tool_error', message: error.message });
          }
        }
      }
      return true;
    }

    // GET /api/agent/tools — List available tools
    if (pathname === '/api/agent/tools' && req.method === 'GET') {
      try {
        const tools = toolRuntime.getAvailableTools();
        json(res, 200, { success: true, tools, count: tools.length });
      } catch (error) {
        json(res, 500, { error: 'tools_error', message: error.message });
      }
      return true;
    }

    // ─── Orchestrator Endpoint ────────────────────────────────────

    // POST /api/agent/execute/:userId/:jobId — Execute an agent job through the orchestrator
    const executeMatch = pathname.match(/^\/api\/agent\/execute\/(\d+)\/([^/]+)$/);
    if (executeMatch && req.method === 'POST') {
      const userId = parseInt(executeMatch[1]);
      const jobId = executeMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        if (!agentService.isAgenticHelperEnabled(userId)) {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        const body = await parseRequestBody(req).catch(() => ({}));

        // Get canvas auth for tool execution
        let canvasAuth = null;
        try {
          canvasAuth = canvasService.resolveAuth(req);
        } catch { /* auth may not be available */ }

        const result = await agentOrchestrator.runJob(jobId, userId, {
          systemInstruction: body?.systemInstruction,
          canvasAuth,
          aiKeys,
        });

        const statusCode = result.success ? 200 : 400;
        json(res, statusCode, {
          success: result.success,
          result: result.result || null,
          error: result.error || null,
          message: result.message || null,
          metadata: result.metadata || null,
        });
      } catch (error) {
        if (error.message === 'AGENT_DISABLED') {
          json(res, 403, { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' });
          return true;
        }
        if (!canvasService.writeUserAuthError(res, error)) {
          if (!writeBodyError(json, res, error)) {
            json(res, 500, { error: 'execute_error', message: error.message });
          }
        }
      }
      return true;
    }

    // GET /api/agent/summary/:userId — Get job count summary
    const summaryMatch = pathname.match(/^\/api\/agent\/summary\/(\d+)$/);
    if (summaryMatch && req.method === 'GET') {
      const userId = parseInt(summaryMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const summary = agentJobService.getJobSummary(userId);
        json(res, 200, { success: true, summary });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'summary_error', message: error.message });
        }
      }
      return true;
    }

    // ─── Artifact Endpoints ──────────────────────────────────────

    // GET /api/agent/artifacts/:userId/:artifactId — Get artifact info
    const artifactMatch = pathname.match(/^\/api\/agent\/artifacts\/(\d+)\/([^/]+)$/);
    if (artifactMatch && req.method === 'GET') {
      const userId = parseInt(artifactMatch[1]);
      const artifactId = artifactMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        // Find artifact in user's job artifacts
        const jobs = agentJobService.getUserJobs(userId);
        let foundArtifact = null;
        for (const job of jobs) {
          if (Array.isArray(job.artifacts)) {
            foundArtifact = job.artifacts.find((a) => a.id === artifactId);
            if (foundArtifact) break;
          }
        }
        if (!foundArtifact) {
          json(res, 404, { error: 'artifact_not_found', message: 'Artifact not found.' });
          return true;
        }
        json(res, 200, { success: true, artifact: foundArtifact });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'artifact_error', message: error.message });
        }
      }
      return true;
    }

    // GET /api/agent/artifacts/:userId/:artifactId/download — Download artifact file
    const artifactDownloadMatch = pathname.match(/^\/api\/agent\/artifacts\/(\d+)\/([^/]+)\/download$/);
    if (artifactDownloadMatch && req.method === 'GET') {
      const userId = parseInt(artifactDownloadMatch[1]);
      const artifactId = artifactDownloadMatch[2];
      try {
        await canvasService.verifyUserRequest(req, userId);
        const jobs = agentJobService.getUserJobs(userId);
        let foundArtifact = null;
        for (const job of jobs) {
          if (Array.isArray(job.artifacts)) {
            foundArtifact = job.artifacts.find((a) => a.id === artifactId);
            if (foundArtifact) break;
          }
        }
        if (!foundArtifact || !foundArtifact.storagePath) {
          json(res, 404, { error: 'artifact_not_found', message: 'Artifact not found.' });
          return true;
        }
        const content = artifactStorage.readArtifact(userId, foundArtifact.storagePath);
        if (!content) {
          json(res, 404, { error: 'file_not_found', message: 'Artifact file not found in storage.' });
          return true;
        }
        res.writeHead(200, {
          'Content-Type': foundArtifact.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${foundArtifact.filename}"`,
          'Content-Length': content.length,
        });
        res.end(content);
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 500, { error: 'download_error', message: error.message });
        }
      }
      return true;
    }

    return false;
  };
}

module.exports = { createAgentRoutes };
