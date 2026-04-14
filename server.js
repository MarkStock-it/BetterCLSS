const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');

function loadEnv() {
  const envCandidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '.env.example'),
  ];

  const envPath = envCandidates.find((p) => fs.existsSync(p));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;

    const eq = normalized.indexOf('=');
    if (eq === -1) return;

    const key = normalized.slice(0, eq).trim();
    let value = normalized.slice(eq + 1).trim();

    // Support values wrapped in single or double quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnv();

const PORT = Number(process.env.PORT || 5500);
const CANVAS_DOMAIN = process.env.CANVAS_DOMAIN || 'usc.instructure.com';
const CANVAS_TOKEN = process.env.CANVAS_TOKEN || '';
const MAX_OVERDUE_DAYS = Number(process.env.MAX_OVERDUE_DAYS || 30);
const OPENCLAUDE_BASE_URL = (process.env.OPENCLAUDE_BASE_URL || 'http://127.0.0.1:1337/v1').replace(/\/+$/, '');
const OPENCLAUDE_MODEL = process.env.OPENCLAUDE_MODEL || 'qwen2.5-coder:7b';
const OPENCLAUDE_API_KEY = process.env.OPENCLAUDE_API_KEY || '';
const AI_AUTOSTART_OLLAMA = process.env.AI_AUTOSTART_OLLAMA === '1';
const AI_MODEL_KEEP_ALIVE = process.env.AI_MODEL_KEEP_ALIVE || '0m';
const CORS_ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || 'https://MarkStock-it.';

let ollamaBootPromise = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, x-canvas-token, x-canvas-domain',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(data));
}

function extractNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
  return match ? match[1] : null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('BODY_TOO_LARGE'));
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', () => reject(new Error('BODY_READ_ERROR')));
  });
}

function isLocalOllamaBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && String(u.port || '11434') === '11434';
  } catch {
    return false;
  }
}

async function pingOllama(timeoutMs = 1200) {
  const base = OPENCLAUDE_BASE_URL.replace(/\/v1$/i, '');
  const response = await fetch(`${base}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.ok;
}

async function ensureOllamaRunning() {
  if (!AI_AUTOSTART_OLLAMA) return;
  if (!isLocalOllamaBaseUrl(OPENCLAUDE_BASE_URL)) return;

  try {
    if (await pingOllama()) return;
  } catch {
    // Continue to autostart flow.
  }

  if (!ollamaBootPromise) {
    ollamaBootPromise = (async () => {
      try {
        const child = spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } catch {
        // Spawn failure will surface as ping timeout below.
      }

      const maxAttempts = 16;
      for (let i = 0; i < maxAttempts; i += 1) {
        try {
          if (await pingOllama(1000)) return;
        } catch {
          // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('OLLAMA_NOT_AVAILABLE');
    })().finally(() => {
      ollamaBootPromise = null;
    });
  }

  await ollamaBootPromise;
}

async function assistantChat(message, context = {}, history = []) {
  await ensureOllamaRunning();

  const safeHistory = Array.isArray(history)
    ? history.slice(-12).filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
    : [];

  const systemPrompt = [
    'You are BetterCLSS Assistant inside a student dashboard.',
    'Answer briefly and practically.',
    'Use the provided dashboard context as source-of-truth when relevant.',
    'If context lacks detail, state that clearly and suggest the next click or sync step.',
  ].join(' ');

  const payload = {
    model: OPENCLAUDE_MODEL,
    temperature: 0.4,
    max_tokens: 700,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Dashboard context JSON: ${JSON.stringify(context).slice(0, 12000)}` },
      ...safeHistory,
      { role: 'user', content: String(message || '').slice(0, 4000) },
    ],
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (OPENCLAUDE_API_KEY) {
    headers.Authorization = `Bearer ${OPENCLAUDE_API_KEY}`;
  }

  const response = await fetch(`${OPENCLAUDE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // Some Ollama builds expose only native routes (/api/chat) and not OpenAI /v1.
  if (response.status === 404) {
    const apiBase = OPENCLAUDE_BASE_URL.replace(/\/v1$/i, '');
    const ollamaResp = await fetch(`${apiBase}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: OPENCLAUDE_MODEL,
        messages: payload.messages,
        stream: false,
        keep_alive: AI_MODEL_KEEP_ALIVE,
        options: {
          temperature: payload.temperature,
          num_predict: payload.max_tokens,
        },
      }),
    });

    if (!ollamaResp.ok) {
      const detail = await ollamaResp.text().catch(() => '');
      throw new Error(`AI_HTTP_${ollamaResp.status}${detail ? `:${detail.slice(0, 300)}` : ''}`);
    }

    const ollamaData = await ollamaResp.json();
    const ollamaContent = ollamaData?.message?.content;
    if (!ollamaContent) throw new Error('AI_EMPTY');
    return String(ollamaContent);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI_HTTP_${response.status}${detail ? `:${detail.slice(0, 300)}` : ''}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI_EMPTY');
  return String(content);
}

function normalizeCanvasDomain(value) {
  const domain = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');

  if (!domain) return null;
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) return null;
  return domain.toLowerCase();
}

function resolveCanvasAuth(req) {
  const headerToken = String(req.headers['x-canvas-token'] || '').trim();
  const headerDomain = String(req.headers['x-canvas-domain'] || '').trim();

  const token = headerToken || CANVAS_TOKEN;
  const domain = normalizeCanvasDomain(headerDomain) || normalizeCanvasDomain(CANVAS_DOMAIN);

  if (!token) throw new Error('MISSING_CANVAS_TOKEN');
  if (!domain) throw new Error('INVALID_CANVAS_DOMAIN');
  return { token, domain };
}

async function canvasFetchAll(apiPath, params = {}, auth) {
  const all = [];
  const base = `https://${auth.domain}/api/v1`;
  const q = new URLSearchParams({ per_page: '100', ...params }).toString();
  let nextUrl = `${base}${apiPath}?${q}`;

  while (nextUrl) {
    const resp = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
      },
    });

    if (resp.status === 401) throw new Error('UNAUTHORIZED');
    if (!resp.ok) throw new Error(`HTTP_${resp.status}`);

    const data = await resp.json();
    if (Array.isArray(data)) all.push(...data);
    nextUrl = extractNextLink(resp.headers.get('link'));
  }

  return all;
}

async function canvasFetchOne(apiPath, params = {}, auth) {
  const base = `https://${auth.domain}/api/v1`;
  const q = new URLSearchParams(params).toString();
  const url = `${base}${apiPath}${q ? `?${q}` : ''}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/json',
    },
  });

  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
  return resp.json();
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function isTooOldAssignment(dueAt) {
  if (!dueAt) return false;

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const overdueDays = Math.floor((today - due) / 86400000);
  return overdueDays > MAX_OVERDUE_DAYS;
}

async function getCourses(auth) {
  const courses = await canvasFetchAll('/courses', {
    enrollment_type: 'student',
    enrollment_state: 'active',
    include: ['total_scores', 'current_grading_period_scores', 'term'],
  }, auth);
  return courses.filter((c) => c.name && !c.access_restricted_by_date);
}

async function getAllAssignments(auth) {
  const courses = await getCourses(auth);
  const all = [];

  await Promise.all(courses.map(async (course) => {
    try {
      const assignments = await canvasFetchAll(`/courses/${course.id}/assignments`, {
        include: ['submission', 'overrides'],
        order_by: 'due_at',
      }, auth);
      assignments.forEach((a) => {
        if (isTooOldAssignment(a.due_at)) return;

        all.push({
          id: `canvas_${a.id}`,
          canvasId: a.id,
          courseId: course.id,
          courseName: course.name,
          courseCode: course.course_code,
          title: a.name,
          dueAt: a.due_at,
          pointsPossible: a.points_possible,
          submissionTypes: a.submission_types,
          submitted: a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded',
          graded: a.submission?.workflow_state === 'graded',
          submissionState: a.submission?.workflow_state ?? null,
          submittedAt: a.submission?.submitted_at ?? null,
          score: a.submission?.score ?? null,
          grade: a.submission?.grade ?? null,
          canvasUrl: a.html_url,
          lockAt: a.lock_at,
          source: 'canvas',
        });
      });
    } catch (err) {
      console.warn(`Skipping course ${course.id}:`, err.message);
    }
  }));

  all.sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt) - new Date(b.dueAt);
  });
  return all;
}

async function getAllAnnouncements(auth) {
  const courses = await getCourses(auth);
  const all = [];

  await Promise.all(courses.map(async (course) => {
    try {
      const posts = await canvasFetchAll('/announcements', {
        context_codes: [`course_${course.id}`],
        per_page: 20,
      }, auth);
      posts.forEach((p) => {
        all.push({
          id: `canvas_ann_${p.id}`,
          canvasId: p.id,
          courseId: course.id,
          courseName: course.name,
          title: p.title,
          message: stripHtml(p.message),
          postedAt: p.posted_at,
          author: p.author?.display_name || 'Instructor',
          canvasUrl: p.html_url,
          source: 'canvas',
        });
      });
    } catch (err) {
      console.warn(`Skipping announcements for ${course.id}:`, err.message);
    }
  }));

  all.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  return all;
}

async function getGrades(auth) {
  const courses = await getCourses(auth);
  return courses.map((c) => ({
    courseId: c.id,
    courseName: c.name,
    courseCode: c.course_code,
    currentScore: c.enrollments?.[0]?.computed_current_score ?? null,
    finalScore: c.enrollments?.[0]?.computed_final_score ?? null,
    currentGrade: c.enrollments?.[0]?.computed_current_grade ?? null,
  }));
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === '/') pathname = '/index.html';

  const segments = pathname.split('/').filter(Boolean);
  const hasDotfileSegment = segments.some((s) => s.startsWith('.'));
  const blockedFiles = new Set([
    'server.js',
    'package.json',
    'package-lock.json',
    'README.md',
  ]);

  if (hasDotfileSegment || (segments.length === 1 && blockedFiles.has(segments[0]))) {
    json(res, 403, { error: 'forbidden' });
    return;
  }

  const filePath = path.join(__dirname, pathname);
  if (!filePath.startsWith(__dirname)) {
    json(res, 403, { error: 'forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      json(res, 404, { error: 'not_found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === '/api/assistant/chat') {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method_not_allowed' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const context = body.context && typeof body.context === 'object' ? body.context : {};
      const history = Array.isArray(body.history) ? body.history : [];

      if (!message) {
        json(res, 400, { error: 'missing_message' });
        return;
      }

      const reply = await assistantChat(message, context, history);
      json(res, 200, { reply });
      return;
    } catch (err) {
      const known = ['INVALID_JSON', 'BODY_TOO_LARGE', 'BODY_READ_ERROR'];
      if (known.includes(err.message)) {
        json(res, 400, { error: err.message.toLowerCase() });
        return;
      }
      json(res, 502, { error: 'assistant_error', message: err.message });
      return;
    }
  }

  try {
    const canvasAuth = resolveCanvasAuth(req);

    if (reqUrl.pathname === '/api/canvas/test') {
      const profile = await canvasFetchOne('/users/self/profile', {}, canvasAuth);
      json(res, 200, profile);
      return;
    }

    if (reqUrl.pathname === '/api/canvas/assignments') {
      const data = await getAllAssignments(canvasAuth);
      json(res, 200, data);
      return;
    }

    if (reqUrl.pathname === '/api/canvas/announcements') {
      const data = await getAllAnnouncements(canvasAuth);
      json(res, 200, data);
      return;
    }

    if (reqUrl.pathname === '/api/canvas/grades') {
      const data = await getGrades(canvasAuth);
      json(res, 200, data);
      return;
    }

    json(res, 404, { error: 'not_found' });
  } catch (err) {
    if (err.message === 'MISSING_CANVAS_TOKEN') {
      json(res, 400, { error: 'missing_canvas_token', message: 'Provide Canvas token from website settings.' });
      return;
    }
    if (err.message === 'INVALID_CANVAS_DOMAIN') {
      json(res, 400, { error: 'invalid_canvas_domain', message: 'Canvas domain is invalid.' });
      return;
    }
    if (err.message === 'UNAUTHORIZED') {
      json(res, 401, { error: 'unauthorized', message: 'Canvas token is invalid or expired.' });
      return;
    }
    json(res, 502, { error: 'canvas_error', message: err.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, x-canvas-token, x-canvas-domain',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`BetterCLSS running on http://localhost:${PORT}`);
});
