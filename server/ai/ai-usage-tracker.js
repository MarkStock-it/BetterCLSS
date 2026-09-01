/**
 * ai-usage-tracker.js
 * AI Usage Metering & Diagnostics
 *
 * Tracks every AI request with:
 *   - model used
 *   - input tokens (prompt)
 *   - output tokens (completion)
 *   - cached input tokens (if provider reports them)
 *   - request duration
 *   - job ID
 *   - task type (analyze, generate, refine, etc.)
 *   - request ID (for provider debugging)
 *
 * Does NOT store:
 *   - prompt contents (privacy)
 *   - response contents (privacy)
 *   - API keys or secrets
 *
 * Usage:
 *   const tracker = createAiUsageTracker();
 *   tracker.recordRequest({ jobId, taskType, model, usage, durationMs, requestId });
 *   const summary = tracker.getJobSummary(jobId);
 *   const budgetCheck = tracker.checkBudget(jobId, limits);
 */

// ─── Default Budget Limits ─────────────────────────────────────────

const DEFAULT_BUDGET_LIMITS = {
  maxInputTokensPerJob: 500000,      // 500K input tokens per job
  maxOutputTokensPerJob: 100000,     // 100K output tokens per job
  maxAiCallsPerJob: 20,             // 20 AI calls per job
  maxTotalTokensPerJob: 600000,     // 600K total tokens per job
  maxDurationMsPerJob: 600000,      // 10 minutes total AI time per job
};

// ─── Task Type Classification ──────────────────────────────────────

/**
 * Classify a task type as simple or complex for model routing.
 * Simple tasks can use a lighter/cheaper model.
 * Complex tasks need the full model.
 *
 * @param {string} taskType
 * @returns {{ complexity: 'simple' | 'complex', reason: string }}
 */
function classifyTaskComplexity(taskType) {
  const simple = new Set([
    'analyze',          // Structured extraction from manifest
    'validate',         // Deterministic checks (usually no AI)
    'artifact_validate', // Deterministic validation
    'classification',   // Categorization tasks
    'extraction',       // Data extraction
  ]);

  const complex = new Set([
    'generate',         // Full content generation
    'refine',           // Content refinement (needs understanding)
    'planning',         // Strategic planning
    'reasoning',        // Complex reasoning tasks
  ]);

  if (simple.has(taskType)) {
    return { complexity: 'simple', reason: `Task "${taskType}" is deterministic or extraction-focused` };
  }
  if (complex.has(taskType)) {
    return { complexity: 'complex', reason: `Task "${taskType}" requires full reasoning or content generation` };
  }
  // Default to complex for unknown tasks (safer)
  return { complexity: 'complex', reason: `Unknown task "${taskType}" — defaulting to complex` };
}

// ─── Usage Tracker ─────────────────────────────────────────────────

/**
 * Create an AI Usage Tracker.
 *
 * @param {object} [options]
 * @param {object} [options.budgetLimits] - Override default budget limits
 * @returns {object} Usage tracker API
 */
function createAiUsageTracker(options = {}) {
  const budgetLimits = { ...DEFAULT_BUDGET_LIMITS, ...options.budgetLimits };

  // In-memory store: jobId → { requests[], totals }
  // Persisted separately via the job service
  const jobUsage = new Map();

  /**
   * Record a single AI request.
   *
   * @param {object} params
   * @param {string} params.jobId - Agent Job ID
   * @param {string} params.taskType - Task type (analyze, generate, refine, etc.)
   * @param {string} params.model - Model name used
   * @param {object} [params.usage] - Token usage { promptTokens, completionTokens, cachedTokens }
   * @param {number} params.durationMs - Request duration in ms
   * @param {string} [params.requestId] - Provider request ID
   * @param {string} [params.provider] - Provider name
   * @param {boolean} [params.success] - Whether request succeeded
   * @param {string} [params.errorCode] - Error code if failed
   * @returns {object} Recorded request summary
   */
  function recordRequest(params) {
    const {
      jobId,
      taskType,
      model,
      usage = {},
      durationMs = 0,
      requestId = null,
      provider = 'unknown',
      success = true,
      errorCode = null,
    } = params;

    if (!jobId) return null;

    const record = {
      taskType,
      model,
      provider,
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      cachedTokens: usage.cachedTokens || 0,
      totalTokens: (usage.promptTokens || 0) + (usage.completionTokens || 0),
      durationMs,
      requestId,
      success,
      errorCode,
      timestamp: new Date().toISOString(),
    };

    // Get or create job usage store
    if (!jobUsage.has(jobId)) {
      jobUsage.set(jobId, {
        requests: [],
        totals: {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          aiCalls: 0,
          failedCalls: 0,
          totalDurationMs: 0,
          byTaskType: {},
          models: new Set(),
        },
      });
    }

    const store = jobUsage.get(jobId);
    store.requests.push(record);

    // Update totals
    const totals = store.totals;
    totals.promptTokens += record.promptTokens;
    totals.completionTokens += record.completionTokens;
    totals.cachedTokens += record.cachedTokens;
    totals.totalTokens += record.totalTokens;
    totals.aiCalls++;
    if (!record.success) totals.failedCalls++;
    totals.totalDurationMs += record.durationMs;
    totals.models.add(record.model);

    // Per-task breakdown
    if (!totals.byTaskType[taskType]) {
      totals.byTaskType[taskType] = {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        failedCalls: 0,
      };
    }
    const taskStats = totals.byTaskType[taskType];
    taskStats.calls++;
    taskStats.promptTokens += record.promptTokens;
    taskStats.completionTokens += record.completionTokens;
    taskStats.totalTokens += record.totalTokens;
    taskStats.durationMs += record.durationMs;
    if (!record.success) taskStats.failedCalls++;

    return record;
  }

  /**
   * Check if a job has exceeded its AI budget.
   *
   * @param {string} jobId
   * @param {object} [overrides] - Override specific budget limits
   * @returns {{ withinBudget: boolean, exceeded: string[], summary: object }}
   */
  function checkBudget(jobId, overrides = {}) {
    const limits = { ...budgetLimits, ...overrides };
    const store = jobUsage.get(jobId);

    if (!store) {
      return { withinBudget: true, exceeded: [], summary: { aiCalls: 0 } };
    }

    const totals = store.totals;
    const exceeded = [];

    if (totals.promptTokens > limits.maxInputTokensPerJob) {
      exceeded.push(`Input tokens: ${totals.promptTokens} > ${limits.maxInputTokensPerJob}`);
    }
    if (totals.completionTokens > limits.maxOutputTokensPerJob) {
      exceeded.push(`Output tokens: ${totals.completionTokens} > ${limits.maxOutputTokensPerJob}`);
    }
    if (totals.aiCalls > limits.maxAiCallsPerJob) {
      exceeded.push(`AI calls: ${totals.aiCalls} > ${limits.maxAiCallsPerJob}`);
    }
    if (totals.totalTokens > limits.maxTotalTokensPerJob) {
      exceeded.push(`Total tokens: ${totals.totalTokens} > ${limits.maxTotalTokensPerJob}`);
    }
    if (totals.totalDurationMs > limits.maxDurationMsPerJob) {
      exceeded.push(`AI duration: ${totals.totalDurationMs}ms > ${limits.maxDurationMsPerJob}ms`);
    }

    return {
      withinBudget: exceeded.length === 0,
      exceeded,
      summary: {
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        cachedTokens: totals.cachedTokens,
        totalTokens: totals.totalTokens,
        aiCalls: totals.aiCalls,
        totalDurationMs: totals.totalDurationMs,
      },
    };
  }

  /**
   * Get a diagnostic summary for a job.
   * This is developer/admin-facing — not shown in student UI.
   *
   * @param {string} jobId
   * @returns {object|null} Usage summary
   */
  function getJobSummary(jobId) {
    const store = jobUsage.get(jobId);
    if (!store) return null;

    const totals = store.totals;

    // Find the most-used task type
    let maxTaskType = null;
    let maxTaskTokens = 0;
    for (const [taskType, stats] of Object.entries(totals.byTaskType)) {
      if (stats.totalTokens > maxTaskTokens) {
        maxTaskTokens = stats.totalTokens;
        maxTaskType = taskType;
      }
    }

    return {
      jobId,
      aiCalls: totals.aiCalls,
      failedCalls: totals.failedCalls,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      cachedTokens: totals.cachedTokens,
      totalTokens: totals.totalTokens,
      totalDurationMs: totals.totalDurationMs,
      models: [...totals.models],
      topTaskType: maxTaskType,
      topTaskTokens: maxTaskTokens,
      byTaskType: { ...totals.byTaskType },
      requestCount: store.requests.length,
    };
  }

  /**
   * Get compact usage metadata for inclusion in job result.
   * Strips request-level detail, keeps aggregates.
   *
   * @param {string} jobId
   * @returns {object|null} Compact usage metadata
   */
  function getCompactUsage(jobId) {
    const summary = getJobSummary(jobId);
    if (!summary) return null;

    return {
      aiCalls: summary.aiCalls,
      promptTokens: summary.promptTokens,
      completionTokens: summary.completionTokens,
      cachedTokens: summary.cachedTokens,
      totalTokens: summary.totalTokens,
      totalDurationMs: summary.totalDurationMs,
      models: summary.models,
      topTaskType: summary.topTaskType,
    };
  }

  /**
   * Get per-request details for debugging.
   * Does NOT include prompt/response content.
   *
   * @param {string} jobId
   * @returns {object[]} Request records
   */
  function getRequestDetails(jobId) {
    const store = jobUsage.get(jobId);
    if (!store) return [];
    return store.requests.map(r => ({ ...r }));
  }

  /**
   * Clear usage data for a job.
   *
   * @param {string} jobId
   */
  function clearJob(jobId) {
    jobUsage.delete(jobId);
  }

  /**
   * Get the budget limits currently configured.
   *
   * @returns {object}
   */
  function getBudgetLimits() {
    return { ...budgetLimits };
  }

  return {
    recordRequest,
    checkBudget,
    getJobSummary,
    getCompactUsage,
    getRequestDetails,
    clearJob,
    getBudgetLimits,
  };
}

module.exports = {
  createAiUsageTracker,
  classifyTaskComplexity,
  DEFAULT_BUDGET_LIMITS,
};
