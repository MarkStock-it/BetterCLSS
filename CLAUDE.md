# BetterCLSS — Plan of Action

Status: **mid-reconciliation** — do not start new work until the git state below is resolved.

## Current state (2026-09-01)

- Local branch `main` has **diverged** from `origin/main`: **1 local vs 5 remote** commits.
  - Local HEAD: `1875743 Claude Fix this` (our fix).
  - Remote is ahead by 5 commits (a parallel session's work).
- `git push` is blocked (non-fast-forward). The `git pull` did **not** complete a merge.
- Working tree is **clean** — nothing was lost.

## The bug being fixed: "Agentic job fails"

Root cause: the "Enable Agentic Helper" toggle wrote only to browser `localStorage`, never to the
server. The server's job-creation gate `isAgenticHelperEnabled()` reads a *separate* server-side
flag (`userStorage.agentSettings.enabled`, default `false`), so every
`POST /api/agent/jobs/:userId` returned `AGENT_DISABLED` (403), silently surfaced by the frontend
as "Server returned empty job".

## Two competing fixes exist — a decision is required

| | Our fix (local, `1875743`) | Remote's fix (origin/main) |
|---|---|---|
| Approach | Frontend sync: `updateAgentSettings()` POSTs to `/api/agent/settings/:userId` on toggle | Server auto-enable: `user-storage.js` defaults `enabled: true` + migration in `loadOrCreateUser` |
| Semantics | Preserves opt-in (agent stays OFF until toggled) | Turns agent ON for everyone by default |
| Extra | — | `[DIAGNOSTIC] console.log`s left in `dashboard-data.js` + `agent-routes.js`; unrelated "scroll CSS" fix; `BUG_DIAGNOSIS.md` |

**Recommendation (option 1):** keep our toggle-sync fix (correct, preserves the safety opt-in),
discard the remote auto-enable + debug `console.log`s, but retain the remote's unrelated
scroll-CSS fix and `BUG_DIAGNOSIS.md`.

## Step-by-step reconciliation plan

1. `git fetch origin` — confirm the 5 remote commits are still as described.
2. Merge remote into local, resolving conflicts in favor of **our fix** on the files below.
3. Conflicts will occur on (both sides edited these):
   - `studenthub-app/src/lib/dashboard-data.js` — keep `updateAgentSettings()`; drop remote `console.log`s.
   - `studenthub/index.html` — the bundle script hash changed on both sides.
   - `studenthub/assets/index-BHCax3SH.js` — deleted by both; ours rebuilt to `index-CLOyJXL6.js`, remote to `index-dBmVDXvB.js`.
4. Manually revert the remote's auto-enable in `user-storage.js` (restore `enabled: false` default and remove the `loadOrCreateUser` migration) — or keep if the user explicitly chooses option 2.
5. Strip `[DIAGNOSTIC] console.log`s from `server/routes/agent-routes.js` and `dashboard-data.js`.
6. **Rebuild** (`npm run studenthub:build`) — the PWA serves a prebuilt bundle, so any source change must be followed by a rebuild. `npm run check` only compiles/asserts source; it does NOT rebuild.
7. `npm run check` — confirm green.
8. Commit and `git push`.

## What is already done

- **Agent-job fix (source):** `updateAgentSettings()` added to
  `studenthub-app/src/lib/dashboard-data.js`; wired into `handleAgentSettingsChange` in
  `studenthub-app/src/StudentHubMobileDashboard.jsx`. Committed in `1875743`.
- **Bundle rebuilt** to `studenthub/assets/index-CLOyJXL6.js` (contains the `api/agent/settings` call).
- **Plugin marketplaces installed** (restart required to take effect): `caveman` and `xiaolai`
  — cloned under `~/.claude/plugins/marketplaces/` and registered in
  `~/.claude/plugins/known_marketplaces.json`. The `claude` CLI was not on PATH, so this was done
  by direct clone + registry edit (functionally equivalent to `claude plugin marketplace add`).

## Gotchas to remember

- `npm run check` does NOT rebuild the StudentHub bundle — always run `npm run studenthub:build`
  after touching `studenthub-app/src/**`.
- The Agentic Helper is gated by **two** server conditions: `config.agentEnabled` (env `AGENT_ENABLED`,
  defaults on) AND `userStorage.isAgentEnabled(userId)` (defaults off). Our fix addresses the second.
- `getUserId()` reads `localStorage['bclss_student_id']`; agent API calls need `bclss_canvas_token`
  and `bclss_canvas_domain` set, or they silently no-op.
