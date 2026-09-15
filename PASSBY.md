# PASSBY.md — BetterCLSS Session Handoff

> Read this first in any new session. It contains everything needed to work on
> BetterCLSS efficiently without re-discovering the system.

---

## 1. What BetterCLSS is

A student dashboard (assignments, notes, tasks, quicklinks, study tools, AI
assistant, "Agentic Helper") with two frontends sharing one backend:

| Frontend | Entry | Tech |
|---|---|---|
| Desktop web app | `index.html` + `desktop-app/*.js` (no framework, global scripts) | Vanilla JS |
| Mobile app | `StudentHub.html` → `studenthub/` (built bundle) | React + Vite (`studenthub-app/src`) |

Backend: plain Node (no framework) in `server.js` + `server/` — routes in
`server/routes/`, services in `server/services/`. Storage module: `user-storage.js`
(synchronous file working set) + `user-storage-db.js` (MariaDB durable mirror).

---

## 2. Deployment topology (the most important thing)

THREE places, kept in sync via git:

```
Local checkout ──commit/push──▶ GitHub main ──pull──▶ SSH host ~/BetterCLSS
                                                        │
                              ┌─────────────────────────┤
                              ▼                         ▼
                    pm2 "betterclss" :5510      ~/betterclss.dcism.org/
                    (Node backend + MariaDB)    (Apache docroot, static
                    → proxied via .htaccess      frontend + /api/* proxy)
```

| Environment | URL / path | Role |
|---|---|---|
| **dcism host** (primary) | `https://betterclss.dcism.org` | Static frontend + DATA backend (`/api/user/*`, `/api/agent/*`) + MariaDB |
| **Render** | `https://betterclss.onrender.com` | CANVAS/AI backend only (`/api/canvas/*`, `/api/assistant/*`) — it has outbound internet |
| **GitHub** | `github.com/MarkStock-it/BetterCLSS` (branch `main`) | Source of truth for code |

**Why split:** the dcism host has ZERO outbound internet (verified: no Canvas,
no Google, no AI APIs — only inbound works). Render has internet but NO database
and an ephemeral disk. So: browser→dcism for data persistence, browser→Render
for anything needing egress. Routing happens IN THE BROWSER (see §4).

---

## 3. Hosting environment (SSH)

```
ssh -p22077 s25103705@web.dcism.org
```

- Password: the one provided in conversation (**never** put it in any file,
  commit, or log). Everything auth-prompted uses the same credential.
- The SSH tunnel / host access **shuts down at ~9pm daily** — don't schedule
  SSH-dependent work late in the day.
- No sshpass on the machine; use an expect script. Recreate if missing:

```bash
cat > /tmp/bclss_ssh.exp <<'EOF'
#!/usr/bin/expect -f
set timeout 60
set cmd [lindex $argv 0]
spawn ssh -p22077 -o StrictHostKeyChecking=no s25103705@web.dcism.org $cmd
expect {
  "password:" { send "<PASSWORD>\r"; exp_continue }
  eof
}
EOF
chmod +x /tmp/bclss_ssh.exp
# usage: /tmp/bclss_ssh.exp 'remote command'
```
(Write the password into the script at runtime; the script lives in /tmp only.)

Key paths on host:
- `~/BetterCLSS/` — git checkout (run the app from here)
- `~/BetterCLSS/.env` — DB creds + PORT=5510, chmod 600, gitignored
- `~/betterclss.dcism.org/` — Apache docroot (synced via rsync, NOT a checkout)
- `~/.pm2/` — pm2 manages `betterclss` (auto-start saved)

Database: **MariaDB, host `127.0.0.1`, DB name `s25103705_BETTERCLSS`, DB user
`s25103705_BETTERCLSS`** (host pattern: one DB user per project, same password
as SSH). Tables: `users`, `user_data`, `user_activity` (FK cascade on delete).
Remote DB connections are NOT possible — localhost only. Never put DB creds in
git; `.env.example` documents the variable names only.

---

## 4. Dual-API routing (frontend)

`config.js` sets, and `canvas-api.js` consumes:

- `window.BCLSS_DATA_API_BASE_URL = ''` (dcism, same-origin when on the domain)
- `window.BCLSS_CANVAS_API_BASE_URL = 'https://betterclss.onrender.com'`

`CanvasAPI.apiUrl(path)` sends `/api/canvas/*` and `/api/assistant/*` to the
CANVAS base; everything else (user data, agent jobs) to the DATA base.
`user-auth.js` `saveCanvasSync()` also uses the Canvas base.
StudentHub: `getAgentApiBase()` → data base; `AssistantDrawer.jsx` overrides to
the Canvas base for chat.

GitHub-Pages-style deployments fall back to Render for both (see the fallback
branch in `config.js`).

---

## 5. Identity & persistence model

- Login = Canvas token (pasted by user, kept in browser localStorage
  `bclss_canvas_token` — **never stored server-side, never a DB key**).
- `POST /api/user/authenticate` → server verifies token against Canvas
  `/users/self/profile` → returns full name/email + user's saved data.
- Internal key = `SHA-256("<domain>\n<canvasUserId>")` (`user-identity.js`).
  That hash is the `users.id` PK in MariaDB and the working-set filename.
- Isolation: every `/api/user/*` and `/api/agent/*` request re-verifies the
  token via `canvasService.verifyUserRequest(req, userId)` and rejects mismatches
  (`FORBIDDEN_USER`). 15-min verified-user cache keyed by hash(domain+token).

**Storage architecture (important, do not "fix" casually):**
`user-storage.js` is SYNCHRONOUS (file working set under
`.betterclss_data/user_<hash32>.json`) because ~15 agent/route call sites rely
on sync. `user-storage-db.js` mirrors every save write-through to MariaDB
(fire-and-forget) and `restoreAllFromDb()` repopulates files at server startup.
Deleting a user removes BOTH file and DB row.

**Sync to devices:**
- Desktop: every change → `save()` → localStorage + debounced (700ms)
  `flushRemoteSave()` → `POST /api/user/data/:id` with `{ local, prefs }`.
- Mobile (StudentHub): `fetchRemoteLocalData()` pulls the server doc on every
  load (server wins for shared data); `updateStoredLocalData()` pushes
  debounced (800ms) after changes. Last-write-wins per field.
- `prefs` block (theme, accentColor, assignSort, coursesCollapsed,
  tutorialSkipped, studyIntervals) lives inside the `local` doc server-side and
  is applied via `applyRemotePrefs()` on desktop / `fetchUserPrefs()` on mobile.
- Browser-local by design (do NOT persist): Canvas token/domain, AI keys
  (`bclss_ai_key`, `bclss_groq_key` — BYOK), transient UI state.

---

## 6. Deploy procedure (every change)

```bash
# 1. Local checks
npm test                      # 25-module check script; also builds StudentHub check
npm run studenthub:build      # rebuild studenthub/ bundle if studenthub-app changed
node --check <changed files>  # quick syntax sanity for server files

# 2. Commit + push (repo tracks built bundles — include studenthub/ output)

# 3. On host (SSH, only before ~9pm):
cd ~/BetterCLSS && git pull -q origin main
pm2 restart betterclss

# 4. Sync docroot (rsync, not git — docroot is not a checkout):
rsync -a --delete ~/BetterCLSS/studenthub ~/BetterCLSS/desktop-app \
  ~/BetterCLSS/index.html ~/BetterCLSS/StudentHub.html ~/BetterCLSS/config.js \
  ~/BetterCLSS/canvas-api.js ~/BetterCLSS/user-auth.js ~/BetterCLSS/.htaccess \
  ~/betterclss.dcism.org/
# NOTE: .htaccess proxies /api/*, /register-token, /send-notification → 127.0.0.1:5510
# and blocks .env, .betterclss_data/, server/, db/, node_modules/. Keep it in sync.

# 5. Verify:
curl -sk -o /dev/null -w "%{http_code}\n" https://betterclss.dcism.org/
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://betterclss.dcism.org/api/user/x  # 400 = proxy OK
```

After deploying server code, the pm2 log should show
`[user-storage-db] restored N user record(s) from MariaDB`.

**Gotchas learned the hard way:**
- rsync with `--delete` on the whole docroot: fine now, but stray files
  previously accumulated (CLAUDE.md etc.) — docroot should contain ONLY
  frontend files.
- The old raw-ID data files (`user_{canvasId}.json`) are legacy; hashed names
  are canonical. Legacy paths are still checked by the `isNewUser` route check.
- `mysql2.createPool()` is synchronous (no .catch) — earlier bug.
- DB host env must be `DB_HOST=127.0.0.1` (not localhost socket).
- Standalone node scripts on the host don't auto-load `.env` — the pm2 server
  does (via `server/config.js` `loadEnv()`).

---

## 7. Known limitations / open issues

1. **Agentic Helper job execution is broken on dcism** — jobs are stored fine,
   but `/api/agent/execute` runs server-side AI calls (Gemini/Groq) + Canvas
   calls, and dcism has no egress. Assistant CHAT works (routed to Render).
   Options discussed: route execute through Render (job-state drift problem),
   or ask dcism admins to whitelist outbound HTTPS to
   `*.instructure.com`, `generativelanguage.googleapis.com`, `api.groq.com`.
2. **Render backend has no DB** — any data-route traffic hitting Render
   persists to its ephemeral disk only. The `DB_*` env there can't help
   (dcism MariaDB is localhost-only).
3. **Mobile sync is pull-on-load / push-on-change** — no polling; a change on
   another device appears only after reloading StudentHub.
4. Last-write-wins per field; simultaneous edits on two devices can clobber.
5. Full live two-device verification with a real Canvas token has NOT been done
   yet (needs a real login on the deployed site).
6. `.env` on host contains DB creds — gitignored, never commit; also never echo
   it into logs.

---

## 8. Where things live (quick map)

| Thing | File(s) |
|---|---|
| API base routing | `config.js`, `canvas-api.js` |
| Auth (frontend) | `user-auth.js`; login flow in `desktop-app/canvas-and-navigation.js` (`connectCanvas`, `restoreUserSession`) |
| Auth (server) | `server/routes/user-routes.js`, `server/services/canvas-service.js` |
| Identity hash | `user-identity.js` |
| User data store | `user-storage.js` (sync file), `user-storage-db.js` (MariaDB) |
| Mobile data layer | `studenthub-app/src/lib/dashboard-data.js` (+ `StudentHubMobileDashboard.jsx` effects) |
| Prefs sync | `desktop-app/state-and-shell.js` (`setPref`, `applyRemotePrefs`, `mergeLocalData`) |
| Agent routes | `server/routes/agent-routes.js`, orchestrator in `server/agent/` |
| Assistant (AI chat) | `server/services/assistant-service.js` (Gemini/Groq, BYOK via `x-ai-key`/`x-groq-key`) |
| CORS | `server/middleware/cors.js` |

---

## 9. Conventions

- Respond to the user concisely; they watch the live transcript.
- Every meaningful change: edit locally → `npm test` → commit → push → pull on
  SSH → rsync docroot → pm2 restart → verify live URL (when tunnel is open).
- Never commit: `.env`, `.betterclss_data/`, credentials of any kind.
- Commit footer:
  ```
  🤖 Generated with Codebuff
  Co-Authored-By: Codebuff <noreply@codebuff.com>
  ```
