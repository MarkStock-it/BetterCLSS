/**
 * provider-router.js
 * Hybrid AI Provider Router.
 *
 * Routes each request to one of two underlying providers based on the
 * request's `routing` hint:
 *
 *   - `routing: 'tools'`  -> toolsProvider (Groq) — fast, cheap tool/agentic turns
 *   - anything else       -> chatProvider (Gemini) — chat / tokenization
 *
 * This lets one job use both providers ("they communicate"): Groq drives the
 * tool-call loop while Gemini handles analysis, refinement and chat. If the
 * tools provider is not configured/ready, the router transparently falls back
 * to the chat provider so the app never breaks.
 *
 * It is a drop-in for the single `aiProvider` currently passed to the agent
 * orchestrator and refinement pipeline, so no consumer code needs to change.
 */

/**
 * Create a hybrid provider router.
 *
 * @param {object} options
 * @param {object} options.toolsProvider - Provider used for tool/agentic turns (e.g. Groq)
 * @param {object} options.chatProvider - Provider used for chat/tokenization (e.g. Gemini)
 * @returns {object} Router implementing the AI Provider interface
 */
function createProviderRouter({ toolsProvider, chatProvider }) {
  /**
   * Pick the provider for a given request based on the routing hint.
   * Falls back to the chat provider when the tools provider isn't ready.
   * @param {object} request - AIRequest (may carry `routing`)
   * @returns {object} Provider to use
   */
  function pickProvider(request) {
    const wantsTools = request && request.routing === 'tools';
    if (!wantsTools) return chatProvider;

    const ready = toolsProvider && toolsProvider.isReady ? toolsProvider.isReady(request) : null;
    if (ready && ready.ready) return toolsProvider;
    // Tools provider not ready — never block the job, use the chat provider.
    return chatProvider;
  }

  return {
    /**
     * Provider metadata for observability.
     */
    metadata() {
      const toolsMeta = toolsProvider && toolsProvider.metadata ? toolsProvider.metadata() : {};
      const chatMeta = chatProvider && chatProvider.metadata ? chatProvider.metadata() : {};
      return {
        name: 'router',
        model: `${toolsMeta.model || '?'}+${chatMeta.model || '?'}`,
        hasApiKey: Boolean(toolsMeta.hasApiKey || chatMeta.hasApiKey),
        maxOutputTokens: chatMeta.maxOutputTokens || null,
        temperature: chatMeta.temperature || null,
      };
    },

    /**
     * Ready if at least one underlying provider is configured.
     * @returns {{ ready: boolean, reason: string }}
     */
    isReady() {
      const toolsReady = toolsProvider && toolsProvider.isReady ? toolsProvider.isReady() : { ready: false, reason: 'tools provider not set' };
      const chatReady = chatProvider && chatProvider.isReady ? chatProvider.isReady() : { ready: false, reason: 'chat provider not set' };
      if (toolsReady.ready || chatReady.ready) {
        return { ready: true, reason: '' };
      }
      return {
        ready: false,
        reason: `No AI provider configured. Tools: ${toolsReady.reason} Chat: ${chatReady.reason}`,
      };
    },

    /**
     * Generate text using the routed provider.
     * @param {object} request - AIRequest
     * @returns {Promise<AIResponse>}
     */
    async generate(request) {
      return pickProvider(request).generate(request);
    },

    /**
     * Generate structured JSON using the routed provider.
     * @param {object} request - StructuredAIRequest (may carry `routing`)
     * @returns {Promise<StructuredAIResponse>}
     */
    async structuredGenerate(request) {
      return pickProvider(request).structuredGenerate(request);
    },
  };
}

module.exports = { createProviderRouter };
