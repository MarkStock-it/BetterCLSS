const fs = require('fs');
const path = require('path');

function loadEnv(rootDir) {
  const envCandidates = [
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.example'),
  ];

  const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex === -1) return;

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    const quoted = (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    );
    if (quoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  });
}

function createConfig(rootDir) {
  loadEnv(rootDir);
  return {
    rootDir,
    port: Number(process.env.PORT || 5500),
    canvasDomain: process.env.CANVAS_DOMAIN || 'usc.instructure.com',
    canvasToken: process.env.CANVAS_TOKEN || '',
    maxOverdueDays: Number(process.env.MAX_OVERDUE_DAYS || 30),
    // gemini-flash-latest auto-tracks the newest stable Flash model, so the
    // app survives Google's model shutdowns (gemini-2.0-flash retired 2026-03).
    geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 60000),
    geminiMaxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
    geminiTemperature: Number(process.env.GEMINI_TEMPERATURE || 0.4),
    // Groq decommissioned llama-3.3-70b-versatile on free/developer plans
    // (2026-08-16); gpt-oss-120b is their documented replacement.
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    groqTimeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 60000),
    groqMaxOutputTokens: Number(process.env.GROQ_MAX_OUTPUT_TOKENS || 8192),
    groqTemperature: Number(process.env.GROQ_TEMPERATURE || 0.3),
    aiMaxRetries: Number(process.env.AI_MAX_RETRIES || 2),
    aiRetryBaseDelayMs: Number(process.env.AI_RETRY_BASE_DELAY_MS || 1000),
    aiLogRequests: process.env.AI_LOG_REQUESTS === '1',
    corsAllowOrigin: process.env.CORS_ALLOW_ORIGIN || 'https://betterclss.onrender.com',
    notificationAdminKey: process.env.NOTIFICATION_ADMIN_KEY || '',
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    // Agentic Helper configuration
    agentEnabled: process.env.AGENT_ENABLED !== '0',
    agentMaxFileSizeMb: Number(process.env.AGENT_MAX_FILE_SIZE_MB || 10),
    agentMaxConcurrentJobs: Number(process.env.AGENT_MAX_CONCURRENT_JOBS || 3),
    agentMaxRetries: Number(process.env.AGENT_MAX_RETRY_COUNT || 2),
    agentFileRetentionDays: Number(process.env.AGENT_FILE_RETENTION_DAYS || 30),
  };
}

module.exports = { createConfig, loadEnv };
