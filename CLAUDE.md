# BetterCLSS — Session Memory & Plan of Action

> **Last updated 2026-09-16.** The old "mid-reconciliation" plan (diverged main,
> agent-toggle bug) is RESOLVED — main is even with origin/main, working tree
> clean at `26084b4`. Do not redo that reconciliation.

## Current state (2026-09-16)

- `main` even with `origin/main`; tree clean. Head `26084b4` (Agentic back-channel
  job-status mirroring, passby §6.4).
- Recent arc: `9810372` passby spec → `5d4fd9f` handoff JWT minting (passby §2.1)
  → `26084b4` back-channel mirror (passby §6.4).
- **betterclss-agentic is NOT deployed** — `https://betterclss-agentic.onrender.com`
  returns Render's `x-render-routing: no-server` 404 (no service bound). The
  BetterCLSS side is ready and URL-agnostic (`AGENTIC_APP_URL` config); the agentic
  app must be created on Render first (web service + managed Postgres, start
  `npm run migrate && npm start`, verify `/readyz` → `{"db":"reachable"}`).
- **dcism GitHub egress is unreliable**: HTTPS and SSH:22 both timed out on
  2026-09-12. If it fails again, deploy via git bundle over SFTP
  (`git bundle create x.bundle main` — WITH the ref, then server-side
  `git pull x.bundle main`), never by direct file edits.

## Deploy (dcism shared hosting)

- `ssh -p22077 s25103705@web.dcism.org` (password shared in chat — the user should
  `passwd`).
- pm2 runs `~/BetterCLSS/server.js` (Express API). PWA docroot
  `~/betterclss.dcism.org/studenthub/` is a **non-git copy** — re-sync it after
  every bundle rebuild (the agentic handoff launcher lives in the PWA).
- Secrets in `~/BetterCLSS/.env` (server only): `AGENTIC_JWT_SECRET` already
  provisioned (generated on the server). If the Render side ever needs the same
  value, copy it from there — same value both sides is required by design.
- Deploy loop: commit/push locally → server `git pull --ff-only` (bundle fallback
  if egress is down) → resync the `studenthub/` docroot → `pm2 restart` → verify
  with `curl` (bundle serves 200; handoff route answers `missing_credentials`
  without Canvas headers).

## Architecture facts that bite

- **PWA bundle is prebuilt.** Editing `studenthub-app/src/**` does nothing until
  `npm run studenthub:build`; the served bundle lives in `studenthub/assets/`.
  `npm run check` compiles/asserts but does NOT rebuild.
- **Identity hash convention (do not change unilaterally):** the agentic handoff
  `sub` = `sha256(\`${domain}\n${canvasUserId}\`)` with domain
  `trim().toLowerCase()` normalized — mirrors BetterCLSS `user-identity.js` and the
  agentic app's verifier recomputes it from the claims. Changing the salt breaks
  the back-channel silently.
- **Handoff JWT:** HS256, `iss=betterclss`, `aud=betterclss-agentic`, TTL **120s**
  (do not lengthen — the token rides in a URL), no Canvas token/email/BYOK keys in
  claims. Minted by `server/services/agentic-handoff-service.js` via
  `POST /api/agent/agentic-handoff/:userId` (agent-routes; live-Canvas verification
  like every other `:userId` route; 503 `agentic_not_configured` when the secret is
  missing). Frontend launcher: Settings → Agentic Helper → "Open Agentic Helper"
  (`SecondaryView.jsx` + `dashboard-data.js` `openAgenticHelper()`).
- **Agentic Helper gating:** env `AGENT_ENABLED` (config.agentEnabled) AND
  per-user `userStorage.isAgentEnabled(userId)` (defaults OFF; toggled in-app via
  `updateAgentSettings()` → `/api/agent/settings/:userId`).
- **Agent API auth:** client sends `x-canvas-token` + `x-canvas-domain` headers;
  `getUserId()` reads `localStorage['bclss_student_id']`; agent calls silently
  no-op without `bclss_canvas_token`/`bclss_canvas_domain` in localStorage.
- Verified 2026-09-12: minted tokens pass the agentic app's *actual* verifier
  (happy path + tampered identity / wrong secret / expired / wrong audience) —
  8/8 offline suite green.

## Sibling repos

- **betterclss-agentic** (`~/Desktop/GIT - PORT/BETTRCLASS/BTTER_AGENTIC`) —
  standalone agentic app, own Postgres, approval-gated Canvas writes. Contract in
  `passby_agentic.md` (BetterCLSS side) and `PASSBY_TO_BETTERCLSS.md` (agentic
  side). Not a git repo; intended for Render. Prompt templates are versioned
  (`src/agent/prompts/*.md.tmpl` — bump the version header on change).
- **CISCO-TEAM** (`~/Desktop/GIT - PORT/CISCO-TEAM` — verify the exact path before
  editing) — the org website, unrelated to BetterCLSS; has its own CLAUDE.md.

## Old reconciliation record (kept for history — DONE, do not redo)

The 2026-09-01 divergence (local `1875743` vs 5 remote commits) was reconciled in
favor of our toggle-sync fix; the toggle now syncs server-side
(`updateAgentSettings()` → `/api/agent/settings/:userId`). All `[DIAGNOSTIC]`
console.logs are gone. The "Agentic job fails" bug (`AGENT_DISABLED` 403) is fixed.
