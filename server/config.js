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
    openClaudeBaseUrl: (process.env.OPENCLAUDE_BASE_URL || 'http://127.0.0.1:1337/v1').replace(/\/+$/, ''),
    openClaudeModel: process.env.OPENCLAUDE_MODEL || 'qwen2.5-coder:7b',
    openClaudeApiKey: process.env.OPENCLAUDE_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    aiAutostartOllama: process.env.AI_AUTOSTART_OLLAMA !== '0',
    aiModelKeepAlive: process.env.AI_MODEL_KEEP_ALIVE || '0m',
    corsAllowOrigin: process.env.CORS_ALLOW_ORIGIN || 'https://betterclss.onrender.com',
    notificationAdminKey: process.env.NOTIFICATION_ADMIN_KEY || '',
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  };
}

module.exports = { createConfig, loadEnv };
