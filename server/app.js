const express = require('express');
const userStorage = require('../user-storage');
const { createConfig } = require('./config');
const { createHttpHelpers } = require('./lib/http');
const { createCorsMiddleware } = require('./middleware/cors');
const { createApiHandler } = require('./routes/api');
const { createAgentJobService } = require('./agent/agent-job-service');
const { createAssignmentIngestion } = require('./agent/assignment-ingestion');
const { createToolRuntime } = require('./agent/tools/tool-runtime');
const { registerCanvasTools } = require('./agent/tools/canvas-tools');
const { registerCanvasWriteTools } = require('./agent/tools/canvas-write-tools');
const { createArtifactStorage } = require('./agent/artifacts/artifact-storage');
const { createDocxGenerator } = require('./agent/artifacts/docx-generator');
const { createTxtGenerator } = require('./agent/artifacts/txt-generator');
const { registerArtifactTools, registerGenerators } = require('./agent/artifacts/artifact-tools');
const { createAgentOrchestrator } = require('./agent/agent-orchestrator');
const { createRefinementPipeline } = require('./agent/refinement/refinement-pipeline');
const { createAIConfig } = require('./ai/ai-config');
const { createDefaultProvider, createProvider } = require('./ai/provider-factory');
const { createProviderRouter } = require('./ai/provider-router');
const { createAgentService } = require('./services/agent-service');
const { createAssistantService } = require('./services/assistant-service');
const { createCanvasService } = require('./services/canvas-service');
const { createNotificationService } = require('./services/notification-service');
const { createStaticHandler } = require('./services/static-service');

function isApiRequest(url) {
  return (
    url.startsWith('/api/')
    || url === '/register-token'
    || url === '/send-notification'
  );
}

function createApp(rootDir) {
  const config = createConfig(rootDir);
  const { json } = createHttpHelpers(config.corsAllowOrigin);
  const canvasService = createCanvasService(config, json);
  const assistantService = createAssistantService(config);
  const notificationService = createNotificationService(config.firebaseServiceAccountJson);
  const agentService = createAgentService(config, userStorage);
  const assignmentIngestion = createAssignmentIngestion(canvasService, userStorage);
  const agentJobService = createAgentJobService(agentService, assignmentIngestion, userStorage);

  // Register canvas read-only tools for the tool runtime
  registerCanvasTools(canvasService);

  // Create artifact storage and generators
  const path = require('path');
  const dataDir = path.join(rootDir, '.betterclss_data');
  const artifactStorage = createArtifactStorage(dataDir);
  const docxGenerator = createDocxGenerator({ artifactStorage });
  const txtGenerator = createTxtGenerator({ artifactStorage });

  // Register artifact generation tools (with job linkage support)
  registerArtifactTools({ artifactStorage, agentJobService });
  registerGenerators({ docxGenerator, txtGenerator });

  // Register canvas write tools (with approval gate enforcement)
  registerCanvasWriteTools({
    canvasService,
    artifactStorage,
    getJob: (userId, jobId) => agentJobService.getJob(userId, jobId),
    addEvent: (jobId, type, meta) => {
      try { agentJobService.addEvent(jobId, type, meta); } catch { /* ignore */ }
    },
  });

  // Create the tool runtime — security boundary between AI and application
  const toolRuntime = createToolRuntime({
    agentService,
    agentJobService,
    onEvent: (jobId, type, meta, userId) => {
      if (jobId) {
        try { agentJobService.addEvent(jobId, type, meta, userId); } catch { /* ignore */ }
      }
    },
  });
  // Create AI provider from configuration.
  // Hybrid routing: route the agentic tool-call turns to Groq (fast/free tool
  // utilization) and keep chat/tokenization on the default provider (Gemini).
  // Keys are bring-your-own (per-request from the client), so the router is
  // always used; the router transparently falls back to the chat provider if
  // Groq is unavailable, so the app never breaks.
  const aiConfig = createAIConfig(config);
  const chatProvider = createDefaultProvider(aiConfig);
  const aiProvider = createProviderRouter({
    toolsProvider: createProvider('groq', aiConfig.groq),
    chatProvider,
  });

  // Create the refinement pipeline factory (manifest is set per-job)
  function createRefinementPipelineForManifest(manifest) {
    return createRefinementPipeline({
      aiProvider,
      manifest,
      emitEvent: (jobId, type, meta) => {
        if (jobId) {
          try { agentJobService.addEvent(jobId, type, meta); } catch { /* ignore */ }
        }
      },
    });
  }

  // Create the agent orchestrator
  const agentOrchestrator = createAgentOrchestrator({
    aiProvider,
    agentJobService,
    agentService,
    toolRuntime,
    createRefinementPipeline: createRefinementPipelineForManifest,
    docxGenerator,
    txtGenerator,
    emitEvent: (jobId, type, meta) => {
      if (jobId) {
        try { agentJobService.addEvent(jobId, type, meta); } catch { /* ignore */ }
      }
    },
  });

  const handleApi = createApiHandler({
    agentJobService,
    agentService,
    agentOrchestrator,
    assignmentIngestion,
    artifactStorage,
    assistantService,
    canvasService,
    config,
    json,
    notificationService,
    rootDir,
    toolRuntime,
    userStorage,
  });
  const serveStatic = createStaticHandler(rootDir, json);

  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware(config.corsAllowOrigin));
  app.use((req, res) => {
    if (isApiRequest(req.url)) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });

  return { app, config };
}

module.exports = { createApp, isApiRequest };
