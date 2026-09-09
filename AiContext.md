# AiContext.md — Session State for AI Assistants

> Purpose: bring any AI agent up to speed on BetterCLSS's current state and the
> changes recently completed and verified in this working tree. All changes are
> **on disk, uncommitted** (see `git status`). Do not reintroduce the patterns
> listed under "Architecture Invariants" — they were deliberately removed.

## Project Snapshot

- **Stack**: Vanilla JS desktop PWA (`index.html` + `desktop-app/*`), React mobile
  app (`studenthub-app/`, built to `studenthub/`), Node.js backend (`server/`).
- **Health check**: `npm run check` (must pass; currently green).
- **AI model defaults (verified live 2026-09)**: Gemini `gemini-3.8-flash`,
  Groq `openai/gpt-oss-120b`.

---

## 1. AI is strictly Bring-Your-Own-Key (BYOK) — completed & verified

The app previously had legacy server-side AI fallbacks that caused
"AI endpoint was not found" errors. These are fully removed. The system now
works **only** with user-supplied keys sent per request.

### What changed (server)
- `server/services/assistant-service.js`
  - Chat requires a user key: `x-ai-key` header (Gemini) or `x-groq-key` (Groq).
    With neither → HTTP 400 `no_ai_key` with a clear hint.
  - Deleted the entire OpenClaude/Ollama fallback (spawn, ping, autostart, 404
    retry against `OPENCLAUDE_BASE_URL`).
  - All error hints now point to the user's own key in Settings — never to
    "backend URL / deployed environment variables".
  - **New: transient retry** — chat fetches retry up to 2× on HTTP
    408/429/500/502/503/504 and network errors (700ms×n + jitter backoff).
    Gemini's intermittent 503 "high demand" no longer reaches users.
  - **New: hard timeout** — every attempt aborts at 25s (`AbortSignal.timeout`);
    previously a stalled provider connection hung the request indefinitely.
- `server/ai/providers/gemini-provider.js`, `groq-provider.js`
  - `resolveKey()` honors **only** the per-request key (`request.aiKeys.*`).
    No server-env fallback key. `config.apiKey` is ignored by design.
- `server/routes/agent-routes.js`
  - `/api/agent/execute/:userId/:jobId` and the approval-approve endpoint
    (which triggers the orchestrator) now return HTTP 400 `no_ai_key` when the
    request carries no user AI key. No silent server fallback.
- `server/middleware/cors.js`
  - `x-groq-key` added to allowed CORS preflight headers (was missing → mobile
    Groq key would fail preflight).
- `server/config.js`, `.env.example`, `render.yaml`, `README.md`
  - Removed dead config: `OPENCLAUDE_*`, `AI_AUTOSTART_OLLAMA`,
    `AI_MODEL_KEEP_ALIVE`, server-side `GEMINI_API_KEY`/`GROQ_API_KEY`,
    `AI_DEFAULT_PROVIDER`.
  - Docs now describe BYOK explicitly.

### What changed (clients)
- `desktop-app/assistant.js`
  - Sends both keys: `x-ai-key` (Gemini, `bclss_ai_key`) and `x-groq-key`
    (Groq, `bclss_groq_key`).
  - Error messages show the server's message + hint; HTTP 400 renders a
    "no key — open the gear icon" instruction. The old
    "Check your backend URL and deployed environment variables" text is gone.
- `index.html` (desktop settings)
  - Gemini key input placeholder now says "(required)"; hint explains BYOK,
    local-only storage, and the Groq option.
- `studenthub-app/src/lib/dashboard-data.js`
  - `approveAgentRequest` now sends `getAiKeyHeaders()` (approvals trigger the
    orchestrator server-side — without this, mobile agent jobs ran keyless).
  - `executeAgentJob` surfaces server BYOK errors (`no_ai_key` hint) instead of
    silently returning null.
- `studenthub-app/src/components/agent/AgentCenter.jsx`
  - Displays execution errors inline via `setError`.
- Rebuilt bundle: `studenthub/assets/index-Dn8GsyTk.js` (replaces
  `index-3XAIXglV.js`).

### Verification
- Live end-to-end with a real `AQ.`-format Gemini key: the app's actual
  `assistantService.chat()` path returned HTTP 200 and a real reply via
  `gemini-3.8-flash`.
- `ListModels` confirmed `gemini-flash-latest` also exists but was returning
  transient 503s, hence the pinned stable model.
- Suites green: provider-layer (68 checks), ai-reliability 47/47,
  agent-orchestrator 64/64, execution-pipeline 76/76,
  integration-hardening 101/101, permissions 52/52, plus the rest.
- ⚠️ Pre-existing (NOT caused by these changes, reproducible on a clean tree):
  `server/agent/__tests__/canvas-integrity.test.js` prints a trailing
  `TypeError: Cannot read properties of undefined (reading 'changes')` after
  its 45/45 passing results.
- Groq path is configured per Groq's docs but was NOT verified with a real
  Groq key.

---

## 2. Model defaults — updated after provider shutdowns

Both previous defaults were retired by their providers (verified via official
docs + live API):

| Provider | Old (dead) | New default | Note |
|---|---|---|---|
| Gemini | `gemini-2.0-flash` (shut down ~2026-03) | `gemini-3.8-flash` | Verified live with an `AQ.`-format key |
| Groq | `llama-3.3-70b-versatile` (decommissioned for free/dev plans 2026-08-16) | `openai/gpt-oss-120b` | Groq's documented replacement |

Where set: `server/config.js`, `server/ai/ai-config.js` (both
`createAIConfig` and `createAIConfigFromEnv`), provider factory defaults,
`.env.example`.

Known data point: `AQ.`-prefix keys are the new (2026) Google AI Studio key
format and work fine with `x-goog-api-key` on `generativelanguage.googleapis.com/v1beta`.

---

## 3. Announcements feed redesign — completed & verified

Implements the user's redesign brief (scannable in <10s, semantic color,
breathing room, smart sidebar, prominent Sync).

### `desktop-app/coursework-views.js`
- `renderAnnouncements()` rewritten:
  - **Semantic tiers** via `announcementTier(a)` → `urgent | due | new | fyi`
    (keyword heuristics + due-date proximity + recency ≤3d = new).
  - **Urgency-first sort** before render (verified order on mock data:
    `urgent → due → due → new → fyi`).
  - Card structure: badge → headline → relative posted time → 2-line clamped
    snippet (`announcementSnippet`, 22 words max) → meta row
    (course · date · author) → "Open in Canvas" link (`a.canvasUrl`) and
    delete button for local posts.
  - Shared exports used by the dashboard mini-feed: `ANNOUNCE_TIER_META`,
    `announcementTier`, `announcementMeta`.
- `renderSidebar()` rewritten:
  - Courses ranked by pending-assignment count (matched by subject name —
    `APP.canvas.courses` entries only carry `{ name }` after sync), count
    pills, capped at 5 with `+ View all N` / `− Show fewer` toggle persisted
    in `localStorage` key `bclss_courses_expanded`
    (`toggleSidebarCoursesExpanded()`).

### `styles/components.css`
- New `.announce-card` system: 1.25rem padding, 1.25rem flex gap between cards,
  12px radius, tier-colored 3px left rail, subtle hover (border + shadow only).
- `.announce-badge.urgent|due|new|fyi` + `.mini` variant for the dashboard feed.
- `.sidebar-course`, `.sidebar-course-count`, `.sidebar-courses-more` styles.
- `.sync-btn` (accent-tinted, icon, `.spinning` rotation animation).

### `index.html`
- Announcements header: prominent `.sync-btn#announceSyncBtn` with refresh SVG
  and `.sync-btn-label` span (label updates target the span, not the SVG),
  subtitle "urgent items first".

### `desktop-app/canvas-and-navigation.js`
- `syncCanvas()` now disables/spins `#announceSyncBtn` during sync and restores
  it in the `finally` path.

### `styles/responsive.css`
- Mobile: badge-first wrapping, 3-line snippets, larger delete tap target,
  course names hidden in sidebar (codes only), compact sync button.

### Verification
- `npm run check` green (25 modules, 108 unique HTML ids).
- Mock-data logic test (the exact announcements from the design brief):
  5 cards, correct badge order, Canvas links present, sidebar ranking +
  "View all" correct, no stale class refs (`announce-icon/body/time` fully
  replaced).

---

## Architecture Invariants (do not regress)

1. **No server-side AI keys.** Users' Gemini/Groq keys travel per request via
   `x-ai-key` / `x-groq-key` and are stored only in their browser
   (`bclss_ai_key`, `bclss_groq_key`). Any env-var key fallback is a bug.
2. **Agent jobs fail fast without a key** (`no_ai_key`, HTTP 400) — never fall
   back to a shared provider.
3. **Model names must stay live.** Pin models verified against the provider;
   check deprecation pages before bumping (Gemini: ai.google.dev/gemini-api/docs;
   Groq: console.groq.com/docs/deprecations).
4. **Assistant chat must keep the transient retry + 25s timeout wrapper**
   (`fetchWithTransientRetry`) — a bare `fetch` here caused real hangs.
5. **Mobile approvals must send `getAiKeyHeaders()`** — the approve endpoint
   fires the orchestrator server-side.
6. `npm run check` must stay green; the StudentHub bundle must be rebuilt
   (`npm run studenthub:build`) after editing `studenthub-app/`.

## Current tree state

- All changes above are **uncommitted** (14 modified files + rebuilt bundle).
- Nothing staged; no commits made this session.
