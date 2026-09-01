const { writeBodyError } = require('../lib/http');

function createAssistantRoute({
  assistantService,
  canvasService,
  json,
  parseRequestBody,
  userStorage,
}) {
  return async function handleAssistantRoute(req, res, pathname) {
    if (pathname !== '/api/assistant/chat') return false;
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method_not_allowed' });
      return true;
    }

    try {
      const body = await parseRequestBody(req);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const context = body.context && typeof body.context === 'object' ? body.context : {};
      const history = Array.isArray(body.history) ? body.history : [];
      if (!message) {
        json(res, 400, { error: 'missing_message' });
        return true;
      }

      const callerApiKey = String(req.headers['x-ai-key'] || '').trim();
      const callerGroqKey = String(req.headers['x-groq-key'] || '').trim();
      const result = await assistantService.chat(message, context, history, callerApiKey, callerGroqKey);
      if (result.actions.length && req.headers['x-canvas-token']) {
        try {
          const canvasAuth = canvasService.resolveAuth(req);
          const profile = await canvasService.fetchOne('/users/self/profile', {}, canvasAuth);
          const userData = userStorage.loadOrCreateUser(profile.id, {
            name: profile.name,
            email: profile.primary_email || profile.email,
          });
          const createdAt = new Date().toISOString();
          result.actions = result.actions.map((action, index) => ({
            ...action,
            id: `${Date.now()}-${index}`,
            createdAt,
          }));
          userStorage.updateUserLocalData(profile.id, {
            studyDecks: [
              ...result.actions.map((action) => ({
                id: action.id,
                title: action.title,
                cards: action.cards.map((card, index) => ({
                  id: `${action.id}-${index}`,
                  ...card,
                  done: false,
                })),
                createdAt: action.createdAt,
                source: 'assistant',
              })),
              ...(Array.isArray(userData.local.studyDecks) ? userData.local.studyDecks : []),
            ].slice(0, 30),
          });
        } catch (persistError) {
          console.warn('Assistant deck backend save skipped:', persistError.message);
        }
      }
      json(res, 200, result);
    } catch (error) {
      if (writeBodyError(json, res, error)) return true;
      const normalized = assistantService.normalizeError(error);
      json(res, normalized.status, {
        error: 'assistant_error',
        code: normalized.code,
        message: normalized.message,
        hint: normalized.hint,
        providerStatus: normalized.providerStatus,
        detail: normalized.detail,
      });
    }
    return true;
  };
}

module.exports = { createAssistantRoute };
