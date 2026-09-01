/**
 * agent-orchestrator.js
 * Agent Orchestrator — the controlled runtime loop.
 *
 * Uses an ExecutionPlan to guide the Agent Job through a structured pipeline:
 *   Plan → Step Execution → AI/Tools → Refinement → Artifacts → Review Package
 *
 * The AI does NOT control the application.
 * The orchestrator is the central controller.
 *
 * Safety:
 *   - Hard iteration limits
 *   - Hard time limits
 *   - Hard tool-call limits
 *   - Hard AI-call limits
 *   - Job state transitions only through state machine
 *   - Tool execution only through Tool Runtime
 *   - All authorization server-side
 *   - Step dependencies enforced
 *   - Requirement coverage verified
 */

const {
  JOB_STATES,
  isTerminalState,
  getStateMetadata,
  classifyError,
} = require('./job-state-machine');

const {
  STEP_STATES,
  STEP_TYPES,
  PLAN_STATES,
  createExecutionPlan,
  validatePlan,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  checkRequirementCoverage,
  markRequirementsCovered,
  getPlanProgress,
  buildReviewPackage,
  canResume,
  getResumeStep,
} = require('./execution-plan');

const {
  buildAssignmentUnderstanding,
  buildAnalyzeContext,
  buildGenerateContext,
  buildRefineContext,
  buildSystemInstruction: buildContextSystemInstruction,
  buildValidationConstraints,
  validateContent,
  // Phase 27: Token-efficient architecture
  buildStepSystemInstruction,
  filterToolsForStep,
  buildStepPrompt,
  getStepOutputLimit,
} = require('./agent-context');

// ─── Default Limits ────────────────────────────────────────────────

const DEFAULT_LIMITS = {
  maxIterations: 10,          // Max loop iterations
  maxToolCalls: 8,            // Max total tool executions
  maxAiCalls: 10,             // Max total AI requests
  maxExecutionTimeMs: 300000, // 5 minutes
  maxStepRetries: 2,          // Max retries per step
  maxHistoryTurns: 10,        // Max conversation turns sent as AI history
  maxHistoryChars: 8000,      // Max chars in conversation history
};

// ─── Precomputed Context ──────────────────────────────────────────

/**
 * Precompute and cache values that don't change during a job run.
 * Avoids redundant `buildAssignmentUnderstanding` calls.
 *
 * @param {object} manifest - Assignment Manifest
 * @param {object} plan - Execution Plan
 * @param {object[]} toolDefs - Available tool definitions
 * @returns {object} Cached context
 */
function precomputeContext(manifest, plan, toolDefs) {
  const understanding = buildAssignmentUnderstanding(manifest);
  const systemInstruction = buildSystemInstruction(manifest, plan);
  const validationConstraints = buildValidationConstraints(understanding);

  return {
    understanding,
    systemInstruction,
    validationConstraints,
    toolDefs,
  };
}

/**
 * Produce a focused, bounded conversation-history slice for an AI call.
 * Prevents unbounded context growth across multi-step jobs.
 *
 * @param {Array} conversation - Full conversation array
 * @param {object} limits - Limits config
 * @returns {Array} Bounded conversation history
 */
function getBoundedHistory(conversation, limits) {
  if (!conversation || conversation.length === 0) return undefined;

  const maxTurns = (limits && limits.maxHistoryTurns) || 10;
  const maxChars = (limits && limits.maxHistoryChars) || 8000;

  // Take the most recent turns (pairs of user+model)
  const recent = conversation.slice(-(maxTurns * 2));

  // Truncate if total chars exceed limit
  let totalChars = 0;
  const result = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const entry = recent[i];
    const entryChars = typeof entry.content === 'string' ? entry.content.length : 0;
    if (totalChars + entryChars > maxChars && result.length > 0) break;
    totalChars += entryChars;
    result.unshift(entry);
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Generate a deterministic analysis when manifest already has sufficient detail.
 * Skips the ANALYZE AI call entirely, saving 1 AI request.
 *
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} manifest - Assignment Manifest
 * @returns {string} Analysis summary
 */
function analysisFromManifest(understanding, manifest) {
  const parts = [];
  parts.push(`Assignment: ${understanding.title}`);
  parts.push(`Course: ${understanding.course}`);
  if (understanding.dueDate) parts.push(`Due: ${understanding.dueDate}`);
  if (understanding.pointsPossible) parts.push(`Points: ${understanding.pointsPossible}`);
  parts.push(`Objective: ${understanding.objective}`);
  parts.push(`Capability: ${understanding.capabilityStatus}`);

  if (understanding.requirements.length > 0) {
    parts.push(`Requirements (${understanding.requirements.length}):`);
    for (const r of understanding.requirements) {
      parts.push(`  - [${r.priority}] ${r.description}`);
    }
  }

  if (understanding.constraints.length > 0) {
    parts.push(`Constraints (${understanding.constraints.length}):`);
    for (const c of understanding.constraints) {
      parts.push(`  - ${c.description}`);
    }
  }

  if (understanding.deliverables.length > 0) {
    parts.push(`Deliverables (${understanding.deliverables.length}):`);
    for (const d of understanding.deliverables) {
      parts.push(`  - ${d.description} (${d.format})`);
    }
  }

  if (understanding.uncertainties.length > 0) {
    parts.push(`Uncertainties: ${understanding.uncertainties.join('; ')}`);
  }

  return parts.join('\n');
}

/**
 * Check if manifest has sufficient detail to skip the ANALYZE AI call.
 * Criteria: has a description >50 chars OR has explicit requirement details.
 *
 * @param {object} manifest - Assignment Manifest
 * @returns {boolean}
 */
function manifestHasSufficientDetail(manifest) {
  const meta = manifest?.metadata || {};
  const description = meta.plainDescription || meta.description || '';
  const details = manifest?.requirements?.details || [];
  return description.length > 50 || details.length >= 2;
}

// ─── Orchestrator ─────────────────────────────────────────────────

/**
 * Create an Agent Orchestrator.
 *
 * @param {object} options
 * @param {object} options.aiProvider - AIProvider instance
 * @param {object} options.agentJobService - Job service for state management
 * @param {object} options.agentService - Agent service for feature gate
 * @param {object} options.toolRuntime - Tool Runtime instance
 * @param {function} [options.emitEvent] - Event callback (jobId, type, metadata)
 * @param {function} [options.createRefinementPipeline] - Factory: (manifest) => pipeline
 * @param {object} [options.docxGenerator] - DOCX generator instance
 * @param {object} [options.txtGenerator] - TXT generator instance
 * @param {object} [options.limits] - Override default limits
 * @returns {object} Orchestrator API
 */
function createAgentOrchestrator({
  aiProvider,
  agentJobService,
  agentService,
  toolRuntime,
  emitEvent,
  createRefinementPipeline,
  docxGenerator,
  txtGenerator,
  limits: customLimits,
}) {
  const limits = { ...DEFAULT_LIMITS, ...customLimits };

  /**
   * Run an agent job through the execution plan pipeline.
   *
   * @param {string} jobId - Agent Job ID
   * @param {number} userId - Authenticated user ID
   * @param {object} [options] - Run options
   * @param {string} [options.systemInstruction] - Custom system instruction override
   * @param {object} [options.canvasAuth] - Canvas auth credentials for tool execution
   * @returns {Promise<object>} Run result with final status
   */
  async function runJob(jobId, userId, options = {}) {
    const startTime = Date.now();

    // ─── Step 1: Load and validate job ─────────────────────────────
    const job = agentJobService.getJob(userId, jobId);
    if (!job) {
      return { success: false, error: 'JOB_NOT_FOUND', message: 'Job not found.' };
    }

    if (isTerminalState(job.state)) {
      return {
        success: false,
        error: 'JOB_TERMINAL',
        message: `Job is in terminal state: ${job.state}`,
      };
    }

    // ─── Step 2: Feature gate ──────────────────────────────────────
    if (!agentService.isAgenticHelperEnabled(userId)) {
      return { success: false, error: 'AGENT_DISABLED', message: 'Agentic Helper is not enabled.' };
    }

    // ─── Step 3: Check if already running (idempotency) ───────────
    if (job.state === JOB_STATES.EXECUTING) {
      return { success: false, error: 'JOB_ALREADY_RUNNING', message: 'Job is already executing.' };
    }

    // ─── Step 4: Load manifest ─────────────────────────────────────
    const manifest = job.manifest;
    if (!manifest) {
      return { success: false, error: 'NO_MANIFEST', message: 'Job has no assignment manifest.' };
    }

    // ─── Step 4a: Due-date / lock-date safety ───────────────────────
    const now = new Date();
    const lockAt = manifest.metadata?.lockAt ? new Date(manifest.metadata.lockAt) : null;
    const dueAt = manifest.metadata?.dueDate ? new Date(manifest.metadata.dueDate) : null;

    if (lockAt && !isNaN(lockAt.getTime()) && now > lockAt) {
      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.USER_ACTION_REQUIRED, {
          message: 'This assignment is locked and no longer accepting submissions.',
          metadata: { reason: 'ASSIGNMENT_LOCKED', lockAt: manifest.metadata.lockAt },
        });
      } catch { /* may already be in this state */ }
      return {
        success: false,
        error: 'ASSIGNMENT_LOCKED',
        message: 'This assignment is locked and no longer accepting submissions.',
      };
    }

    if (dueAt && !isNaN(dueAt.getTime()) && now > dueAt) {
      // Assignment is past due — still allow execution but record a warning
      manifest._pastDue = true;
      manifest._dueAt = manifest.metadata.dueDate;
    }

    // ─── Step 5: Capability gate ───────────────────────────────────
    const capabilityStatus = manifest.capabilityResult?.status;
    if (capabilityStatus === 'UNSUPPORTED') {
      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.UNSUPPORTED, {
          message: manifest.capabilityResult?.reason || 'Assignment not supported',
          metadata: { capabilityStatus, reason: manifest.capabilityResult?.reason },
        });
      } catch { /* may already be unsupported */ }
      return {
        success: false,
        error: 'UNSUPPORTED',
        message: manifest.capabilityResult?.reason || 'Assignment not supported.',
        capabilityStatus,
      };
    }

    if (capabilityStatus === 'UNKNOWN') {
      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.USER_ACTION_REQUIRED, {
          message: 'Unable to determine assignment requirements. User review needed.',
          metadata: { capabilityStatus },
        });
      } catch { /* may already be in this state */ }
      return {
        success: false,
        error: 'UNKNOWN_CAPABILITY',
        message: 'Cannot determine assignment requirements.',
        capabilityStatus,
      };
    }

    if (capabilityStatus === 'PARTIAL') {
      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.USER_ACTION_REQUIRED, {
          message: 'Assignment has both supported and unsupported requirements. User review needed.',
          metadata: { capabilityStatus, unsupported: manifest.capabilities?.unsupported },
        });
      } catch { /* may already be in this state */ }
      return {
        success: false,
        error: 'PARTIAL_CAPABILITY',
        message: 'Some assignment requirements are not supported.',
        capabilityStatus,
      };
    }

    // ─── Step 6: Check AI provider ─────────────────────────────────
    const providerStatus = aiProvider.isReady();
    if (!providerStatus.ready) {
      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.FAILED, {
          message: 'AI provider not available',
          error: { code: 'AI_PROVIDER_UNAVAILABLE', message: providerStatus.reason },
        });
      } catch { /* ignore */ }
      return {
        success: false,
        error: 'AI_PROVIDER_UNAVAILABLE',
        message: providerStatus.reason,
      };
    }

    // ─── Step 7: Create or resume execution plan ───────────────────
    let plan = job.executionPlan;
    if (!plan) {
      plan = createExecutionPlan(manifest);
      // Validate plan against capabilities
      const validation = validatePlan(plan, manifest.capabilityResult);
      plan.warnings = validation.warnings;

      if (!validation.valid && plan.steps.every(s => s.state === STEP_STATES.BLOCKED)) {
        // All steps blocked — assignment cannot proceed
        try {
          agentJobService.transitionJob(userId, jobId, JOB_STATES.UNSUPPORTED, {
            message: 'All execution steps are blocked by unsupported capabilities',
            metadata: { planId: plan.id, blockedSteps: validation.blockedSteps },
          });
        } catch { /* ignore */ }
        return {
          success: false,
          error: 'ALL_STEPS_BLOCKED',
          message: 'All execution steps are blocked by unsupported capabilities.',
        };
      }

      // Persist plan on job
      const currentJob = agentJobService.getJob(userId, jobId);
      if (currentJob) {
        currentJob.executionPlan = plan;
        agentJobService.persistJob(userId, currentJob);
      }
    }

    // ─── Step 8: Transition to ANALYZING → PLANNING → EXECUTING ────
    try {
      agentJobService.transitionJob(userId, jobId, JOB_STATES.ANALYZING, {
        message: 'Analyzing assignment requirements',
      });
    } catch { /* ignore */ }

    try {
      agentJobService.transitionJob(userId, jobId, JOB_STATES.PLANNING, {
        message: 'Planning assignment completion',
      });
    } catch { /* ignore */ }

    try {
      agentJobService.transitionJob(userId, jobId, JOB_STATES.EXECUTING, {
        message: 'Starting agent execution',
      });
    } catch (err) {
      return { success: false, error: 'TRANSITION_FAILED', message: err.message };
    }

    plan.state = PLAN_STATES.EXECUTING;

    // ─── Step 9: Execute plan steps ────────────────────────────────
    const conversation = [];
    let iterations = 0;
    let toolCallCount = 0;
    let aiCallCount = 0;
    let generatedContent = null;
    let stepResults = {};

    // ─── Precompute context once ───────────────────────────────────
    // Prevents redundant buildAssignmentUnderstanding calls on every AI request
    const cachedContext = options.systemInstruction
      ? null // Caller provided custom instruction — skip precomputation
      : precomputeContext(manifest, plan, toolRuntime.getAvailableTools());

    try {
      const systemInstruction = options.systemInstruction || cachedContext.systemInstruction;

      while (true) {
        // Check limits
        const now = Date.now();
        if (now - startTime > limits.maxExecutionTimeMs) {
          throw new AgentLimitError('TIMEOUT', `Execution exceeded ${limits.maxExecutionTimeMs}ms`);
        }
        if (iterations >= limits.maxIterations) {
          throw new AgentLimitError('ITERATION_LIMIT', `Exceeded ${limits.maxIterations} iterations`);
        }
        if (toolCallCount >= limits.maxToolCalls) {
          throw new AgentLimitError('TOOL_CALL_LIMIT', `Exceeded ${limits.maxToolCalls} tool calls`);
        }
        if (aiCallCount >= limits.maxAiCalls) {
          throw new AgentLimitError('AI_CALL_LIMIT', `Exceeded ${limits.maxAiCalls} AI calls`);
        }

        // Get next step
        const step = getNextStep(plan);
        if (!step) {
          // No more steps — check if we're done
          break;
        }

        iterations++;

        // Start the step
        startStep(plan, step.id);
        emitJobEvent(jobId, 'PLAN_STEP_STARTED', {
          stepId: step.id,
          stepType: step.type,
          stepLabel: step.label,
          progress: getPlanProgress(plan),
        });

        try {
          // Execute step based on type
          const result = await executeStep(step, {
            jobId,
            userId,
            manifest,
            plan,
            conversation,
            aiCallCount,
            toolCallCount,
            systemInstruction,
            canvasAuth: options.canvasAuth,
            stepResults,
            generatedContent,
            cachedContext,
          });

          // Track counts from step execution
          aiCallCount += result.aiCalls || 0;
          toolCallCount += result.toolCalls || 0;

          // Store step result
          stepResults[step.id] = result;
          if (result.generatedContent) {
            generatedContent = result.generatedContent;
          }

          // If the step needs user input, pause execution
          if (result.needsInput) {
            completeStep(plan, step.id, result);
            plan.state = PLAN_STATES.PAUSED;

            try {
              agentJobService.transitionJob(userId, jobId, JOB_STATES.USER_ACTION_REQUIRED, {
                message: result.inputPrompt || 'User input needed',
                metadata: {
                  stepId: step.id,
                  inputPrompt: result.inputPrompt,
                  inputContent: result.inputContent,
                },
              });
            } catch { /* may already be in this state */ }

            const finalJob = agentJobService.getJob(userId, jobId);
            if (finalJob) {
              finalJob.executionPlan = plan;
              agentJobService.persistJob(userId, finalJob);
            }

            return {
              success: true,
              needsInput: true,
              inputPrompt: result.inputPrompt,
              inputContent: result.inputContent,
              result: { needsInput: true, inputPrompt: result.inputPrompt, content: result.inputContent },
              plan,
              metadata: {
                iterations,
                aiCalls: aiCallCount,
                toolCalls: toolCallCount,
                durationMs: Date.now() - startTime,
              },
            };
          }

          // Complete the step
          completeStep(plan, step.id, result);
          markRequirementsCovered(plan, step.id);

          emitJobEvent(jobId, 'PLAN_STEP_COMPLETED', {
            stepId: step.id,
            stepType: step.type,
            stepLabel: step.label,
            progress: getPlanProgress(plan),
          });

        } catch (error) {
          // Handle step failure
          const category = classifyError(error);

          if (category === 'RETRYABLE' && step.retryCount < limits.maxStepRetries) {
            // Retry
            step.retryCount++;
            step.state = STEP_STATES.PENDING;
            step.error = null;
            step.startedAt = null;

            emitJobEvent(jobId, 'PLAN_STEP_RETRY', {
              stepId: step.id,
              retryCount: step.retryCount,
              error: error.message,
            });
            continue;
          }

          // Fail the step
          failStep(plan, step.id, error);

          emitJobEvent(jobId, 'PLAN_STEP_FAILED', {
            stepId: step.id,
            stepType: step.type,
            stepLabel: step.label,
            error: error.message,
          });

          // If a required step fails, the plan fails
          if (step.requiredRequirements.length > 0) {
            throw error;
          }
        }
      }

      // ─── Step 10: Check requirement coverage ─────────────────────
      const coverage = checkRequirementCoverage(plan);

      if (!coverage.covered && coverage.uncovered.length > 0) {
        // Add warnings for uncovered requirements
        for (const req of coverage.uncovered) {
          plan.warnings.push(`Requirement not covered: ${req.description}`);
        }
      }

      // ─── Step 11: Transition to READY ────────────────────────────
      plan.state = PLAN_STATES.COMPLETED;
      plan.completedAt = new Date().toISOString();

      // Build review package
      const reviewPackage = buildReviewPackage(plan, agentJobService.getJob(userId, jobId));

      try {
        agentJobService.transitionJob(userId, jobId, JOB_STATES.READY, {
          message: 'Content ready for review',
          metadata: {
            planId: plan.id,
            stepsCompleted: plan.steps.filter(s => s.state === STEP_STATES.COMPLETED).length,
            stepsTotal: plan.steps.length,
            requirementCoverage: coverage.covered ? 'complete' : `${coverage.coveredCount}/${coverage.total}`,
            warnings: plan.warnings.length,
            hasArtifact: Boolean(generatedContent),
            reviewPackage,
          },
        });
      } catch { /* may already be in a terminal state */ }

      // Persist updated plan
      const finalJob = agentJobService.getJob(userId, jobId);
      if (finalJob) {
        finalJob.executionPlan = plan;
        agentJobService.persistJob(userId, finalJob);
      }

      emitJobEvent(jobId, 'AGENT_COMPLETED', {
        iterations,
        aiCalls: aiCallCount,
        toolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
        requirementCoverage: coverage,
      });

      return {
        success: true,
        result: generatedContent ? { content: generatedContent } : null,
        plan,
        reviewPackage,
        metadata: {
          iterations,
          aiCalls: aiCallCount,
          toolCalls: toolCallCount,
          durationMs: Date.now() - startTime,
          requirementCoverage: coverage,
        },
      };

    } catch (error) {
      const errorInfo = {
        code: error.code || 'ORCHESTRATOR_ERROR',
        message: error.message || 'An error occurred during agent execution',
        category: classifyError(error),
      };

      const targetState = error instanceof AgentLimitError
        ? JOB_STATES.USER_ACTION_REQUIRED
        : JOB_STATES.FAILED;

      plan.state = error instanceof AgentLimitError ? PLAN_STATES.PAUSED : PLAN_STATES.FAILED;

      try {
        agentJobService.transitionJob(userId, jobId, targetState, {
          message: errorInfo.message,
          error: errorInfo,
        });
      } catch { /* may already be in terminal state */ }

      // Persist plan state
      const errorJob = agentJobService.getJob(userId, jobId);
      if (errorJob) {
        errorJob.executionPlan = plan;
        agentJobService.persistJob(userId, errorJob);
      }

      emitJobEvent(jobId, 'AGENT_FAILED', {
        code: errorInfo.code,
        message: errorInfo.message,
        category: errorInfo.category,
        iterations,
        aiCalls: aiCallCount,
        toolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: errorInfo.code,
        message: errorInfo.message,
        plan,
        metadata: {
          iterations,
          aiCalls: aiCallCount,
          toolCalls: toolCallCount,
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Execute a single plan step.
   */
  async function executeStep(step, ctx) {
    const result = { aiCalls: 0, toolCalls: 0, generatedContent: null };

    switch (step.type) {
      case STEP_TYPES.ANALYZE:
        return await executeAnalyzeStep(step, ctx, result);

      case STEP_TYPES.GENERATE:
        return await executeGenerateStep(step, ctx, result);

      case STEP_TYPES.REFINE:
        return await executeRefineStep(step, ctx, result);

      case STEP_TYPES.VALIDATE:
        return await executeValidateStep(step, ctx, result);

      case STEP_TYPES.ARTIFACT:
        return await executeArtifactStep(step, ctx, result);

      case STEP_TYPES.ARTIFACT_VALIDATE:
        return await executeArtifactValidateStep(step, ctx, result);

      default:
        throw new AgentLimitError('UNKNOWN_STEP_TYPE', `Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute analyze step — AI reads and understands the assignment.
   */
  async function executeAnalyzeStep(step, ctx, result) {
    // Deterministic path: if manifest already has sufficient detail,
    // skip the AI call entirely and save 1 AI request.
    const understanding = (ctx.cachedContext && ctx.cachedContext.understanding)
      || buildAssignmentUnderstanding(ctx.manifest);

    if (manifestHasSufficientDetail(ctx.manifest)) {
      // Deterministic analysis — no AI call needed
      const analysis = analysisFromManifest(understanding, ctx.manifest);
      ctx.conversation.push({ role: 'user', content: `[Deterministic analysis] ${ctx.manifest?.metadata?.title || 'Assignment'}` });
      ctx.conversation.push({ role: 'model', content: analysis });

      return {
        ...result,
        analysis,
        aiCalls: 0,
        toolCalls: 0,
        deterministic: true,
      };
    }

    // AI path: manifest is sparse — ask the AI to analyze
    ctx.aiCallCount++;
    result.aiCalls = 1;

    const prompt = buildAnalyzePrompt(ctx.manifest);

    const aiResponse = await aiProvider.structuredGenerate({
      systemInstruction: ctx.systemInstruction,
      prompt,
      schema: buildAgentResponseSchema(toolRuntime.getAvailableTools()),
      history: getBoundedHistory(ctx.conversation, limits),
      jobId: ctx.jobId,
      generationConfig: { temperature: 0.2 },
    });

    // Record in conversation
    ctx.conversation.push({ role: 'user', content: prompt });
    ctx.conversation.push({ role: 'model', content: JSON.stringify(aiResponse.data) });

    return {
      ...result,
      analysis: aiResponse.data?.content || 'Analysis complete',
      toolCalls: result.toolCalls,
    };
  }

  /**
   * Execute generate step — AI generates content, possibly using tools.
   */
  async function executeGenerateStep(step, ctx, result) {
    const toolDefs = (ctx.cachedContext && ctx.cachedContext.toolDefs) || toolRuntime.getAvailableTools();
    let completed = false;
    let generatedContent = null;
    let turnCount = 0;

    while (!completed) {
      // Check orchestrator limits
      if (ctx.aiCallCount >= limits.maxAiCalls) {
        throw new AgentLimitError('AI_CALL_LIMIT', `Exceeded ${limits.maxAiCalls} AI calls`);
      }
      if (ctx.toolCallCount >= limits.maxToolCalls) {
        throw new AgentLimitError('TOOL_CALL_LIMIT', `Exceeded ${limits.maxToolCalls} tool calls`);
      }

      ctx.aiCallCount++;
      result.aiCalls++;
      turnCount++;

      // First turn: send focused generate context
      // Subsequent turns: send only latest tool results for brevity
      const prompt = turnCount === 1
        ? buildGeneratePrompt(ctx.manifest)
        : 'Continue generating content based on the tool results above.';

      const aiResponse = await aiProvider.structuredGenerate({
        systemInstruction: ctx.systemInstruction,
        prompt,
        schema: buildAgentResponseSchema(toolDefs),
        history: getBoundedHistory(ctx.conversation, limits),
        jobId: ctx.jobId,
        generationConfig: { temperature: 0.3 },
      });

      ctx.conversation.push({ role: 'user', content: prompt });

      const agentAction = aiResponse.data;
      if (!agentAction || !agentAction.action) {
        throw new AgentLimitError('INVALID_AI_RESPONSE', 'AI response missing action field');
      }

      if (agentAction.action === 'final_response') {
        generatedContent = agentAction.content || '';
        completed = true;
        ctx.conversation.push({ role: 'model', content: JSON.stringify(agentAction) });

      } else if (agentAction.action === 'tool_call') {
        const toolRequests = agentAction.tool_calls || [];
        if (toolRequests.length === 0) {
          throw new AgentLimitError('EMPTY_TOOL_CALL', 'AI returned tool_call with no tools');
        }

        const toolResults = [];
        for (const toolReq of toolRequests) {
          result.toolCalls++;
          ctx.toolCallCount++;

          const toolResult = await toolRuntime.execute(
            { tool: toolReq.tool, arguments: toolReq.arguments || {}, jobId: ctx.jobId },
            ctx.userId,
            { canvasAuth: ctx.canvasAuth }
          );

          toolResults.push({
            tool: toolReq.tool,
            callId: toolReq.callId || null,
            result: toolResult,
          });
        }

        ctx.conversation.push({ role: 'model', content: JSON.stringify(agentAction) });
        ctx.conversation.push({
          role: 'user',
          content: JSON.stringify({
            tool_results: toolResults.map(tr => ({
              tool: tr.tool,
              success: tr.result.success,
              data: tr.result.success ? tr.result.data : undefined,
              error: tr.result.error || undefined,
            })),
          }),
        });

      } else if (agentAction.action === 'needs_input') {
        // Return needs_input as a successful result (not an error)
        return {
          ...result,
          generatedContent: null,
          needsInput: true,
          inputPrompt: agentAction.input_prompt || '',
          inputContent: agentAction.content || 'User input needed',
        };

      } else {
        throw new AgentLimitError('UNKNOWN_ACTION', `Unknown AI action: ${agentAction.action}`);
      }
    }

    return {
      ...result,
      generatedContent,
      contentLength: generatedContent?.length || 0,
    };
  }

  /**
   * Execute refine step — run refinement pipeline.
   */
  async function executeRefineStep(step, ctx, result) {
    const prevResult = ctx.stepResults[ctx.plan.steps.find(s =>
      s.type === STEP_TYPES.GENERATE
    )?.id];

    const contentToRefine = prevResult?.generatedContent || ctx.generatedContent;
    if (!contentToRefine || typeof contentToRefine !== 'string') {
      // No content to refine — skip
      return { ...result, refined: false, reason: 'No content to refine' };
    }

    if (!createRefinementPipeline) {
      return { ...result, refined: false, reason: 'Refinement pipeline not available' };
    }

    const pipeline = createRefinementPipeline(ctx.manifest);
    const refinementResult = await pipeline.refine(
      { text: contentToRefine },
      { jobId: ctx.jobId }
    );

    return {
      ...result,
      refined: refinementResult.contentChanged,
      refinedContent: refinementResult.refinedContent,
      originalContent: contentToRefine,
      warnings: refinementResult.warnings || [],
      validation: refinementResult.validation,
    };
  }

  /**
   * Execute validate step — deterministic requirement validation.
   */
  async function executeValidateStep(step, ctx, result) {
    const generateStep = ctx.plan.steps.find(s => s.type === STEP_TYPES.GENERATE);
    const refineStep = ctx.plan.steps.find(s => s.type === STEP_TYPES.REFINE);

    const content = ctx.stepResults[refineStep?.id]?.refinedContent
      || ctx.stepResults[generateStep?.id]?.generatedContent
      || ctx.generatedContent
      || '';

    const validation = {
      passed: true,
      checks: [],
      wordCount: 0,
    };

    // Word count check
    if (typeof content === 'string') {
      validation.wordCount = content.split(/\s+/).filter(Boolean).length;
    }

    // Requirement coverage check
    const coverage = checkRequirementCoverage(ctx.plan);
    validation.requirementCoverage = coverage;

    if (!coverage.covered) {
      validation.passed = false;
      validation.checks.push({
        name: 'requirement_coverage',
        passed: false,
        message: `${coverage.uncovered.length} requirements not covered`,
      });
    }

    validation.checks.push({
      name: 'word_count',
      passed: validation.wordCount > 0,
      message: `${validation.wordCount} words generated`,
    });

    return { ...result, validation };
  }

  /**
   * Execute artifact step — generate DOCX/TXT artifact.
   */
  async function executeArtifactStep(step, ctx, result) {
    const refineStep = ctx.plan.steps.find(s => s.type === STEP_TYPES.REFINE);
    const generateStep = ctx.plan.steps.find(s => s.type === STEP_TYPES.GENERATE);

    const content = ctx.stepResults[refineStep?.id]?.refinedContent
      || ctx.stepResults[generateStep?.id]?.generatedContent
      || ctx.generatedContent
      || '';

    if (!content || typeof content !== 'string' || content.length === 0) {
      throw new AgentLimitError('NO_CONTENT', 'No content available for artifact generation');
    }

    const title = ctx.manifest?.metadata?.title || 'Assignment Response';
    const isDocx = step.artifactType === 'docx';
    const generator = isDocx ? docxGenerator : txtGenerator;

    if (!generator) {
      throw new AgentLimitError('GENERATOR_UNAVAILABLE', `${isDocx ? 'DOCX' : 'TXT'} generator not available`);
    }

    const artifact = await generator.generate({
      jobId: ctx.jobId,
      userId: ctx.userId,
      filename: `${title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)}.${step.artifactType || 'txt'}`,
      content: {
        title,
        text: content,
      },
    });

    if (artifact.status !== 'READY') {
      throw new AgentLimitError('ARTIFACT_FAILED', `Artifact generation failed: ${artifact.error}`);
    }

    // Link artifact to job
    const currentJob = agentJobService.getJob(ctx.userId, ctx.jobId);
    if (currentJob) {
      if (!Array.isArray(currentJob.artifacts)) currentJob.artifacts = [];
      currentJob.artifacts.push({
        id: artifact.id,
        type: artifact.type,
        filename: artifact.filename,
        size: artifact.size,
        status: artifact.status,
        mimeType: artifact.mimeType,
        storagePath: artifact.storagePath,
        createdAt: artifact.createdAt,
      });
      agentJobService.persistJob(ctx.userId, currentJob);
    }

    return {
      ...result,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        filename: artifact.filename,
        size: artifact.size,
      },
    };
  }

  /**
   * Execute artifact validation step — verify artifact is valid.
   */
  async function executeArtifactValidateStep(step, ctx, result) {
    const artifactStep = ctx.plan.steps.find(s => s.type === STEP_TYPES.ARTIFACT);
    const artifactResult = ctx.stepResults[artifactStep?.id];

    if (!artifactResult?.artifact) {
      throw new AgentLimitError('NO_ARTIFACT', 'No artifact to validate');
    }

    // Basic validation
    const validation = {
      passed: true,
      checks: [],
    };

    validation.checks.push({
      name: 'artifact_exists',
      passed: true,
      message: `Artifact ${artifactResult.artifact.id} exists`,
    });

    validation.checks.push({
      name: 'artifact_has_size',
      passed: artifactResult.artifact.size > 0,
      message: `Artifact size: ${artifactResult.artifact.size} bytes`,
    });

    if (artifactResult.artifact.size === 0) {
      validation.passed = false;
    }

    return { ...result, validation };
  }

  /**
   * Emit an event through the orchestrator's event system.
   */
  function emitJobEvent(jobId, type, metadata) {
    if (typeof emitEvent === 'function') {
      try { emitEvent(jobId, type, metadata); } catch { /* ignore */ }
    }
  }

  return { runJob, limits };
}

// ─── Context Builders ─────────────────────────────────────────────

/**
 * Build the system instruction for the AI.
 */
function buildSystemInstruction(manifest, plan) {
  const understanding = buildAssignmentUnderstanding(manifest);
  return buildContextSystemInstruction(understanding, plan);
}

/**
 * Build the analyze step prompt.
 */
function buildAnalyzePrompt(manifest) {
  const understanding = buildAssignmentUnderstanding(manifest);
  return buildAnalyzeContext(understanding, manifest);
}

/**
 * Build the generate step prompt.
 */
function buildGeneratePrompt(manifest, stepResults) {
  const understanding = buildAssignmentUnderstanding(manifest);
  return buildGenerateContext(understanding, manifest, stepResults);
}

/**
 * Build the JSON schema for structured AI responses.
 */
function buildAgentResponseSchema(toolDefs) {
  const toolIds = (toolDefs || []).map((t) => t.id);

  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['tool_call', 'final_response', 'needs_input'],
        description: 'The action to take',
      },
      reasoning: {
        type: 'string',
        description: 'Brief reasoning for the chosen action',
      },
      content: {
        type: 'string',
        description: 'Response content (for final_response or needs_input)',
      },
      input_prompt: {
        type: 'string',
        description: 'Question to ask the user (only for needs_input)',
      },
      tool_calls: {
        type: 'array',
        description: 'Tool calls to execute (only for tool_call)',
        items: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              enum: toolIds.length > 0 ? toolIds : undefined,
              description: 'Tool ID to call',
            },
            arguments: {
              type: 'object',
              description: 'Arguments for the tool',
            },
            callId: {
              type: 'string',
              description: 'Optional call identifier',
            },
          },
          required: ['tool'],
        },
      },
    },
    required: ['action'],
  };
}

// ─── Error Types ──────────────────────────────────────────────────

class AgentLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AgentLimitError';
    this.code = code;
  }
}

module.exports = {
  createAgentOrchestrator,
  buildSystemInstruction,
  buildAnalyzePrompt,
  buildGeneratePrompt,
  buildInitialPrompt: buildGeneratePrompt, // backward compatibility
  buildAgentResponseSchema,
  DEFAULT_LIMITS,
  AgentLimitError,
  // Efficiency helpers
  precomputeContext,
  getBoundedHistory,
  analysisFromManifest,
  manifestHasSufficientDetail,
  // Re-export context builder for direct access
  buildAssignmentUnderstanding: require('./agent-context').buildAssignmentUnderstanding,
  buildValidationConstraints: require('./agent-context').buildValidationConstraints,
  validateContent: require('./agent-context').validateContent,
};
