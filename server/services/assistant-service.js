function createAssistantService(config) {
  // Retry transient provider failures (capacity spikes like Gemini's 503s,
  // rate limits, or network blips) so a single blip never reaches the user.
  // Each attempt gets a hard timeout: a stalled connection must never hang
  // the request handler open-endedly (chat is latency-sensitive).
  const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
  const CHAT_ATTEMPT_TIMEOUT_MS = 25000;

  async function fetchWithTransientRetry(url, init, retries = 2) {
    let lastError = null;
    let response = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(CHAT_ATTEMPT_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = error;
        response = null;
      }
      if (response && (response.ok || !TRANSIENT_HTTP_STATUSES.has(response.status))) {
        return response;
      }
      if (attempt < retries) {
        const delayMs = 700 * (attempt + 1) + Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (!response) throw lastError;
    return response;
  }

  function summarizeDashboardContext(context) {
    const safe = context && typeof context === 'object' ? context : {};
    const totals = safe.totals && typeof safe.totals === 'object' ? safe.totals : {};
    const listToLines = (items, mapper) => (
      Array.isArray(items) && items.length ? items.slice(0, 12).map(mapper).join('\n') : 'none'
    );

    const dueSoon = listToLines(safe.dueSoon, (assignment, index) => {
      const title = assignment?.title || 'Untitled';
      const subject = assignment?.subject || 'Unknown course';
      const due = assignment?.due || 'no due date';
      const dueIn = Number.isFinite(assignment?.dueInDays) ? `${assignment.dueInDays}d` : '?d';
      return `${index + 1}. ${title} (${subject}) due ${due} [${dueIn}]`;
    });
    const overdue = listToLines(safe.overdueAssignments, (assignment, index) => {
      const title = assignment?.title || 'Untitled';
      const subject = assignment?.subject || 'Unknown course';
      const overdueBy = Number.isFinite(assignment?.overdueByDays) ? `${assignment.overdueByDays}d` : '?d';
      return `${index + 1}. ${title} (${subject}) overdue by ${overdueBy}`;
    });
    const grades = listToLines(safe.grades, (grade, index) => {
      const course = grade?.course || 'Course';
      const score = grade?.score != null ? `${Math.round(Number(grade.score))}%` : '--';
      return `${index + 1}. ${course}: ${score}`;
    });

    return [
      `activePage: ${safe.activePage || 'unknown'}`,
      `canvasConnected: ${safe.canvasConnected ? 'yes' : 'no'}`,
      `totals: pending=${Number(totals.pending || 0)}, overdue=${Number(totals.overdue || 0)}, submitted=${Number(totals.submitted || 0)}, announcements=${Number(totals.announcements || 0)}, courses=${Number(totals.courses || 0)}`,
      `dueSoon:\n${dueSoon}`,
      `overdue:\n${overdue}`,
      `grades:\n${grades}`,
    ].join('\n\n');
  }

  function parseAssistantResult(content) {
    const raw = String(content || '');
    const actions = [];
    const actionPattern = /<betterclss_action>([\s\S]*?)<\/betterclss_action>/gi;
    let match;

    while ((match = actionPattern.exec(raw)) && actions.length < 3) {
      try {
        const parsed = JSON.parse(match[1].trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
        if (parsed.type !== 'create_deck' || !Array.isArray(parsed.cards)) continue;
        const cards = parsed.cards
          .slice(0, 50)
          .map((card) => ({
            front: String(card?.front || '').trim().slice(0, 500),
            back: String(card?.back || '').trim().slice(0, 1200),
          }))
          .filter((card) => card.front && card.back);
        if (cards.length) {
          actions.push({
            type: 'create_deck',
            title: String(parsed.title || 'AI study deck').trim().slice(0, 100),
            cards,
          });
        }
      } catch {
        // Ignore malformed actions instead of exposing model syntax to the user.
      }
    }

    const reply = raw
      .replace(actionPattern, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^\s*#{1,6}\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .trim();
    return {
      reply: reply || (actions.length ? 'Your study deck is ready in Cards.' : 'I completed that request.'),
      actions,
    };
  }

  function buildSystemPrompt() {
    return [
      'You are BetterCLSS Assistant inside a student dashboard.',
      'Answer briefly, practically, and in plain language.',
      'Use the provided dashboard context as source-of-truth.',
      'When user asks for priorities or planning, cite specific assignments/courses from context.',
      'Never pretend to have context that is not provided.',
      'If context lacks detail, state that clearly and suggest the next click or sync step.',
      'Use plain text only. Do not use Markdown, asterisks, or heading markers.',
      'When the user asks you to create flashcards or a study deck, create useful question-and-answer cards using lesson details in their message and available dashboard notes or announcements.',
      'For a deck, include exactly one machine action after the user-facing reply using this format: <betterclss_action>{"type":"create_deck","title":"Deck title","cards":[{"front":"Question","back":"Answer"}]}</betterclss_action>.',
      'Never mention the machine action or its tags to the user.',
    ].join(' ');
  }

  async function chat(message, context = {}, history = [], callerApiKey = '', callerGroqKey = '') {
    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter((entry) => (
        entry && typeof entry.role === 'string' && typeof entry.content === 'string'
      ))
      : [];
    const contextSummary = summarizeDashboardContext(context);
    const systemPrompt = buildSystemPrompt();
    const userMessage = String(message || '').slice(0, 4000);
    const fullSystem = `${systemPrompt}\n\nDashboard summary:\n${contextSummary}\n\nDashboard context JSON: ${JSON.stringify(context).slice(0, 12000)}`;

    // Bring-your-own-key (BYOK): chat only ever uses the user's own API keys,
    // saved in Settings and sent per request as `x-ai-key` (Gemini) or
    // `x-groq-key` (Groq). The server never falls back to a shared provider.
    if (!callerApiKey && !callerGroqKey) {
      throw new Error('NO_AI_KEY_CONFIGURED');
    }

    if (callerApiKey) {
      const response = await fetchWithTransientRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-goog-api-key': callerApiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `${systemPrompt}\n\nDashboard summary:\n${contextSummary}\n\nDashboard context JSON: ${JSON.stringify(context).slice(0, 12000)}`,
              }],
            },
            contents: [
              ...safeHistory.map((entry) => ({
                role: entry.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: entry.content }],
              })),
              { role: 'user', parts: [{ text: userMessage }] },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 700,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`AI_HTTP_${response.status}${detail ? `:${detail.slice(0, 300)}` : ''}`);
      }
      const data = await response.json();
      const content = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim();
      if (!content) throw new Error('AI_EMPTY');
      return parseAssistantResult(content);
    }

    // BYOK Groq path (bring-your-own-key): the user's Groq key, saved in
    // Settings and sent as `x-groq-key`, is honored for chat just like Gemini.
    if (callerGroqKey) {
      const response = await fetchWithTransientRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${callerGroqKey}`,
        },
        body: JSON.stringify({
          model: config.groqModel,
          temperature: 0.4,
          max_tokens: 700,
          messages: [
            { role: 'system', content: fullSystem },
            ...safeHistory,
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`AI_HTTP_${response.status}${detail ? `:${detail.slice(0, 300)}` : ''}`);
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('AI_EMPTY');
      return parseAssistantResult(content);
    }
  }

  function normalizeError(error) {
    const rawMessage = String(error?.message || 'UNKNOWN_ASSISTANT_ERROR');
    const rawMessageLower = rawMessage.toLowerCase();

    if (rawMessage === 'NO_AI_KEY_CONFIGURED') {
      return {
        status: 400,
        code: 'no_ai_key',
        message: 'No AI provider key is configured for chat.',
        hint: 'This app is bring-your-own-key: paste your Gemini or Groq API key in Settings (gear icon). The backend does not use server-side AI keys.',
      };
    }

    const networkErrorSignals = [
      'fetch failed', 'econnrefused', 'econnreset', 'enotfound',
      'eai_again', 'getaddrinfo', 'network', 'socket hang up', 'timeout',
    ];
    if (networkErrorSignals.some((signal) => rawMessageLower.includes(signal))) {
      return {
        status: 502,
        code: 'ai_provider_unreachable',
        message: 'The AI provider is unreachable.',
        hint: 'Your Gemini or Groq key is set but the provider could not be reached. Check your connection or paste a fresh key in Settings (gear icon).',
      };
    }

    if (rawMessage === 'AI_EMPTY') {
      return {
        status: 502,
        code: 'assistant_empty_response',
        message: 'AI provider returned an empty response.',
        hint: 'Try again or switch model/provider settings.',
      };
    }
    if (/^AI_HTTP_\d+/.test(rawMessage)) {
      const statusMatch = rawMessage.match(/^AI_HTTP_(\d+)/);
      const providerStatus = statusMatch ? Number(statusMatch[1]) : 502;
      const detail = rawMessage.includes(':') ? rawMessage.slice(rawMessage.indexOf(':') + 1).trim() : '';
      const detailSingleLine = detail.replace(/\s+/g, ' ').slice(0, 300);
      const detailLower = detailSingleLine.toLowerCase();
      const badKeySignals = [
        'api_key_invalid',
        'api key invalid',
        'api key expired',
        'invalid api key',
        'key expired',
        'expired key',
        'invalid authentication',
        'invalid_api_key',
      ];
      const hasBadKeySignal = badKeySignals.some((signal) => detailLower.includes(signal));

      if (providerStatus === 401 || providerStatus === 403 || hasBadKeySignal) {
        return {
          status: 401,
          code: 'ai_auth_error',
          message: 'Your AI API key is invalid or expired.',
          hint: 'Paste a fresh Gemini or Groq key in assistant settings (gear icon). Keys are stored on this device only.',
          providerStatus,
          detail: detailSingleLine || undefined,
        };
      }
      if (providerStatus === 429) {
        return {
          status: 429,
          code: 'ai_rate_limited',
          message: 'AI provider rate limit hit.',
          hint: 'Wait and retry, or switch to a provider/model with higher quota.',
          providerStatus,
          detail: detailSingleLine || undefined,
        };
      }
      if (providerStatus === 404) {
        return {
          status: 502,
          code: 'ai_endpoint_not_found',
          message: 'AI endpoint was not found.',
          hint: 'The AI provider rejected the request. Check that your key in Settings matches the provider (Gemini or Groq) and try again.',
          providerStatus,
          detail: detailSingleLine || undefined,
        };
      }
      return {
        status: 502,
        code: 'ai_provider_http_error',
        message: `AI provider returned HTTP ${providerStatus}.`,
        hint: 'The AI provider reported an error. Check your key in Settings and try again, or switch providers.',
        providerStatus,
        detail: detailSingleLine || undefined,
      };
    }
    return {
      status: 502,
      code: 'assistant_error',
      message: rawMessage,
      hint: 'Check backend logs and AI provider configuration.',
    };
  }

  return {
    chat,
    normalizeError,
    parseAssistantResult,
    summarizeDashboardContext,
  };
}

module.exports = { createAssistantService };
