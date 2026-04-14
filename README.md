# BetterCLSS

BetterCLSS is a student dashboard for Canvas (USC) with assignments, grades, announcements, notes, calendar, and study timer.

## Features

- Canvas assignment sync
- Canvas grade sync
- Canvas announcement sync
- Local notes, events, links, and timer
- Per-user Canvas token input from the website UI

## Quick Start

1. Install/start:

```bash
npm run dev
```

2. Open:

- http://localhost:5500

## Public Deployment Notes

If you publish frontend as a static site (for example GitHub Pages), host this Node backend separately and set backend URL in the app's **Connect Canvas** modal.

- Frontend can be static/public
- Backend handles `/api/*` routes (Canvas proxy + AI)
- Each user enters their own Canvas token in the website UI

## Fully Automatic Deploy (No Local Run Needed)

This repo includes automation files:

- `.github/workflows/deploy-pages.yml` for GitHub Pages on every push to `main`
- `render.yaml` for Render backend autodeploy on every push
- `config.js` for frontend runtime API base URL

One-time setup:

1. In GitHub repo settings, enable **Pages** using **GitHub Actions**.
2. In Render, create a Blueprint/Web Service from this repo (it will read `render.yaml`).
3. Put your Render backend URL in `config.js`:

```js
window.BCLSS_API_BASE_URL = 'https://your-render-service.onrender.com';
```

After that, every push to `main` auto-deploys frontend + backend.

## Git Commit + Push

```bash
git add .
git commit -m "Public-ready deploy automation + per-user Canvas auth"
git push origin main
```

## Environment

Create a `.env` file in the project root:

```env
CANVAS_DOMAIN=usc.instructure.com
# Optional fallback token for single-user/self-host mode only
CANVAS_TOKEN=
PORT=5500
MAX_OVERDUE_DAYS=30
OPENCLAUDE_BASE_URL=http://127.0.0.1:1337/v1
OPENCLAUDE_MODEL=qwen2.5-coder:7b
OPENCLAUDE_API_KEY=
AI_AUTOSTART_OLLAMA=1
AI_MODEL_KEEP_ALIVE=0m
```

Do not commit `.env`.

## Token Setup (Multi-User)

In Canvas:

1. Account
2. Settings
3. Approved Integrations
4. New Access Token

Each user pastes their own token in the **Connect Canvas** modal inside the app.
Token is saved in that user's browser storage.

## Security Notes

- For shared/public deployments, prefer per-user token input in UI.
- Do not commit real tokens into repository files.
- If a token is ever pasted in chat/repo, revoke it and create a new one.

## Tech

- Frontend: HTML/CSS/Vanilla JS
- Backend: Node.js HTTP server (`server.js`)
- Canvas API: proxied via backend routes under `/api/canvas/*`

## AI Chatbox (OpenClaude-Compatible)

A small AI chatbox is built into the bottom-right corner of the dashboard.

- It calls backend route: `/api/assistant/chat`
- Backend forwards to an OpenAI-compatible endpoint (OpenClaude setup style)
- It includes live dashboard context (due soon, grades, page state) in prompts

To use it:

1. Run a local OpenAI-compatible model endpoint (for example, Atomic Chat / Ollama / LM Studio style endpoint)
2. Set `OPENCLAUDE_BASE_URL` and `OPENCLAUDE_MODEL` in `.env`
3. Restart `npm run dev`

Efficiency options:

- `AI_AUTOSTART_OLLAMA=1`: backend will try to start Ollama on first prompt if local
- `AI_MODEL_KEEP_ALIVE=0m`: unload model after each response so idle periods use less memory
