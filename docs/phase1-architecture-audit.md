# BetterCLSS — Agentic Helper: Phase 1 Architecture Audit

## 1. Repository Structure

### Root-level vanilla JS frontend (original desktop app)

| File | Purpose |
|---|---|
| `index.html` | Main HTML page — all pages rendered here |
| `canvas-api.js` | Browser-side Canvas API client (token/domain in localStorage) |
| `user-auth.js` | Frontend authentication — calls `POST /api/user/authenticate` |
| `user-storage.js` | **Server-side** file-based user data persistence |
| `config.js` | Sets `window.BCLSS_API_BASE_URL` |
| `push-notifications.js` | Firebase push notification setup (browser) |
| `service-worker.js` | PWA service worker with cache-first strategy |
| `styles.css` | Main stylesheet for vanilla JS desktop app |
| `desktop-app/state-and-shell.js` | `APP` global state, save/load, theme, modals, toast |
| `desktop-app/assistant.js` | AI assistant chat (calls `/api/assistant/chat`) |
| `desktop-app/canvas-and-navigation.js` | Canvas sync, page switching, sidebar courses |
| `desktop-app/coursework-views.js` | Assignment, calendar, grades, announcements rendering |
| `desktop-app/study-area.js` | Pomodoro timer, notes, ambient audio, tasks, progress |
| `desktop-app/bootstrap.js` | App initialization, event listeners, mobile touch guards |
| `styles/*.css` | Modular CSS: base, dashboard, coursework, study, components, responsive |

### StudentHub React app (source)

| File | Purpose |
|---|---|
| `studenthub-app/vite.config.js` | Vite + React + Tailwind config. Output to `studenthub/` |
| `studenthub-app/src/main.jsx` | React entry point. Renders `<StudentHubMobileDashboard />` |
| `studenthub-app/src/StudentHubMobileDashboard.jsx` | Main component — orchestrates all views |
| `studenthub-app/src/components/assistant/AssistantDrawer.jsx` | AI chat drawer |
| `studenthub-app/src/components/navigation/SidebarDrawer.jsx` | Nav drawer (9 items) |
| `studenthub-app/src/components/home/HomeOverview.jsx` | Workload + deadline list |
| `studenthub-app/src/components/tasks/TasksView.jsx` | Assignment list with filters |
| `studenthub-app/src/components/study/StudyView.jsx` | Study workspace |
| `studenthub-app/src/components/calendar/CalendarView.jsx` | Monthly calendar |
| `studenthub-app/src/components/cards/CardsStudySection.jsx` | Flashcard study |
| `studenthub-app/src/components/secondary/SecondaryView.jsx` | Settings, grades, announcements, resources |
| `studenthub-app/src/components/ui/Icons.jsx` | SVG icon components |
| `studenthub-app/src/components/ui/ViewControls.jsx` | ViewHeading layout |
| `studenthub-app/src/lib/dashboard-data.js` | Data layer — reads localStorage, merges data |
| `studenthub-app/src/styles/*.css` | Per-feature CSS files |

### Build output (DO NOT EDIT)
- `studenthub/` — Vite build output. Contains `index.html`, `assets/`.

### Backend (Node.js/Express)

| File | Purpose |
|---|---|
| `server.js` | Entry — calls `createApp()`, listens on port |
| `server/app.js` | Express app factory. Wires services and routes |
| `server/config.js` | Loads `.env`, creates config object |
| `server/lib/http.js` | JSON response helper, body parser, CORS headers |
| `server/middleware/cors.js` | CORS preflight handler |
| `server/routes/api.js` | API router — dispatches to all route handlers |
| `server/routes/canvas-routes.js` | Canvas proxy: test, assignments, announcements, grades |
| `server/routes/assistant-route.js` | `POST /api/assistant/chat` |
| `server/routes/user-routes.js` | User auth, data CRUD, Canvas sync, logout |
| `server/routes/notification-routes.js` | FCM token registration + notification sending |
| `server/services/canvas-service.js` | Canvas API client — fetchAll, fetchOne, getCourses, etc. |
| `server/services/assistant-service.js` | AI provider logic — Ollama + Gemini forwarding |
| `server/services/notification-service.js` | Firebase Admin SDK — token management, sendToAll |
| `server/services/static-service.js` | Static file server with video range support |

### Data storage
- `.betterclss_data/user_{canvasUserId}.json` — Per-user JSON file

---

## 2. Existing Architecture Flow

```
Frontend (localStorage: token, domain, ai_key)
    ↓ x-canvas-token, x-canvas-domain, x-ai-key headers
Backend (Express)
    ↓ resolveAuth(req) → verify via Canvas API
Canvas LMS API (read-only currently)
```

**Data flow:**
1. User enters Canvas token → stored in localStorage
2. Every API call includes token/domain headers
3. Backend extracts credentials, verifies via Canvas API, caches 15 min
4. Backend makes authenticated Canvas API calls
5. User data persisted in per-user JSON files
6. AI chat: frontend sends context → backend forwards to Gemini or Ollama

---

## 3. Existing Reusable Infrastructure

- **Canvas auth + token handling** — `canvasService.resolveAuth()`, `verifyUserRequest()`
- **Canvas pagination** — `fetchAll()`, `fetchOne()`
- **User storage** — `loadOrCreateUser()`, `updateUserLocalData()`, `saveUserData()`
- **AI chat endpoint** — prompt architecture, response parsing
- **Gemini API forwarding** — already works
- **Notification service** — `sendToAll()`
- **CORS, body parsing, JSON response** — all reusable
- **API route dispatch** — `server/routes/api.js`
- **User verification** — `verifyUserRequest()`, `writeUserAuthError()`
- **Mobile-first React shell** — edge-swipe drawer, AnimatePresence
- **Settings page** — `SecondaryView.jsx`
- **Spring animation constants** — reusable

---

## 4. Gaps

### Canvas API
- No assignment detail endpoint
- No rubric endpoint
- No submission comments endpoint
- No file upload endpoint
- No submission creation endpoint
- All operations are READ-ONLY

### Backend Infrastructure
- No background job processing
- No agent job persistence model
- No file artifact storage
- No agent state machine
- No capability registry
- No Canvas tool layer
- No AI provider abstraction
- No AI tool/function calling
- No WebSocket/SSE

### Frontend
- No Agentic Helper settings
- No agent job dashboard
- No job detail view

---

## 5. Security Model

- Canvas tokens stored in localStorage, never in backend env (per-user)
- AI keys via `x-ai-key` header per request
- Per-user data isolation by Canvas user ID
- Path traversal prevention in static service
- All requests verify Canvas token belongs to the user

---

## 6. Key Design Decisions

- File-based storage (no database) — agent jobs should be stored in user data
- Synchronous request/response — agent needs async processing
- Read-only Canvas — must extend for write operations
- Tightly coupled AI — needs provider abstraction for tool calling
- Settings in `SecondaryView.jsx` — add new card section
- Navigation in `SidebarDrawer.jsx` — add new nav item

---

## 7. Agentic Helper Current State (Phases 1–15)

### Implemented

**Phase 1:** Repository architecture audit and implementation plan
**Phase 2:** Feature flag, safety gate, persistent enabled/disabled state, backend authorization boundary
**Phase 3:** Assignment Capability Engine — capability registry, requirement extraction, deterministic analysis
**Phase 4:** Canvas Assignment Ingestion + Assignment Manifest — normalized assignment representation
**Phase 5:** Agent Job Runtime + State Machine — persistent jobs, controlled state transitions, progress tracking
**Phase 6:** AI Provider Layer + Gemini Integration — provider abstraction, structured output, mock provider
**Phase 7:** Secure Tool Runtime — centralized tool registry, authorization, schema validation, Canvas read-only tools
**Phase 8:** Agent Orchestrator — controlled loop connecting AI, Tool Runtime, and Job state machine
**Phase 9:** Artifact Generation System — DOCX (built-in zlib ZIP), TXT generators, per-user storage
**Phase 10:** Content Refinement Pipeline — AI refinement, deterministic requirement validation, bounded retries
**Phase 11:** Canvas Write Tools + Human Approval Gate — upload, comment, submission with version-bound approval
**Phase 12:** Mobile Agent Center — job list, detail view, review/approval screen, live polling
**Phase 13:** Integration & Hardening — end-to-end audit, 10 bug fixes, security hardening, 101 integration tests
**Phase 15:** Architecture Audit & Integration Repair — connected orchestrator to refinement/artifacts, fixed approval→execution flow, added mobile execute/create functions

### Architecture

```
Canvas Assignment
       ↓
Assignment Ingestion (server/agent/assignment-ingestion.js)
       ↓
Assignment Manifest (server/agent/assignment-manifest.js)
       ↓
Capability Engine (server/agent/capability-analyzer.js)
       ↓
Agent Job (server/agent/agent-job-service.js)
       ↓
Agent Orchestrator (server/agent/agent-orchestrator.js)
       ↓
AIProvider (server/ai/) → Gemini / Mock
       ↓
Tool Runtime (server/agent/tools/)
       ├── Canvas Read Tools
       ├── Canvas Write Tools (+ approval gate)
       └── Artifact Generation Tools
       ↓
Refinement Pipeline (server/agent/refinement/)
       ↓
Artifact Generator (server/agent/artifacts/)
       ↓
Human Approval Gate (server/agent/approval/)
       ↓
Canvas Submission
```

### API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/agent/settings/:userId` | Toggle Agentic Helper on/off |
| `GET /api/agent/status/:userId` | Check if enabled |
| `GET /api/agent/capabilities` | List registered capabilities |
| `POST /api/agent/analyze` | Stateless assignment analysis |
| `POST /api/agent/ingest/:userId` | Fetch + analyze + persist manifest |
| `GET /api/agent/manifests/:userId` | List cached manifests |
| `POST /api/agent/jobs/:userId` | Create agent job |
| `GET /api/agent/jobs/:userId` | List all jobs |
| `GET /api/agent/jobs/:userId/:jobId` | Get specific job |
| `GET /api/agent/jobs/:userId/:jobId/events` | Get job events |
| `POST /api/agent/jobs/:userId/:jobId/cancel` | Cancel a job |
| `POST /api/agent/execute/:userId/:jobId` | Execute job through orchestrator |
| `POST /api/agent/tools/execute/:userId` | Execute a tool request |
| `GET /api/agent/tools` | List available tools |
| `POST /api/agent/approvals/:userId` | Create approval request |
| `POST /api/agent/approvals/:userId/:id/approve` | Approve request |
| `POST /api/agent/approvals/:userId/:id/deny` | Deny request |
| `GET /api/agent/approvals/:userId/:jobId` | Get approval status |
| `GET /api/agent/artifacts/:userId/:id` | Get artifact info |
| `GET /api/agent/artifacts/:userId/:id/download` | Download artifact |
| `GET /api/agent/summary/:userId` | Job count summary |

### Agent Job States

```
DISCOVERED → ANALYZING → CAPABILITY_CHECK → PLANNING → GENERATING → REFINING → VALIDATING → READY → EXECUTING → COMPLETED
                                                                      ↓
                                                                    FAILED / UNSUPPORTED / USER_ACTION_REQUIRED / CANCELLED
```

### AI Provider

- Provider abstraction: `server/ai/provider.js`
- Gemini implementation: `server/ai/providers/gemini-provider.js`
- Mock provider (testing): `server/ai/providers/mock-provider.js`
- Factory: `server/ai/provider-factory.js`
- Config: `server/ai/ai-config.js`
- Supports: `generate()` and `structuredGenerate()` with JSON schema validation

### Tool Runtime

- Registry: `server/agent/tools/tool-registry.js`
- Runtime: `server/agent/tools/tool-runtime.js`
- Canvas read tools: `server/agent/tools/canvas-tools.js`
- Canvas write tools: `server/agent/tools/canvas-write-tools.js`
- Artifact tools: `server/agent/artifacts/artifact-tools.js`
- Permission tiers: READ → GENERATE → WRITE → SUBMIT

### Artifact System

- Model: `server/agent/artifacts/artifact-model.js`
- Storage: `server/agent/artifacts/artifact-storage.js` (per-user, path-traversal protected)
- DOCX generator: `server/agent/artifacts/docx-generator.js` (built-in zlib, no new deps)
- TXT generator: `server/agent/artifacts/txt-generator.js`
- PDF: NOT IMPLEMENTED (no library available)

### Canvas Write / Approval

- Approval model: `server/agent/approval/approval-model.js`
- Write tools: `server/agent/tools/canvas-write-tools.js`
- SUBMIT tools require human approval before execution
- Approval is version-bound (stale approval detection)
- Approval expires after 1 hour
- Server-side enforcement — frontend cannot bypass

### Mobile Agent Center

- Component: `studenthub-app/src/components/agent/AgentCenter.jsx`
- Styles: `studenthub-app/src/styles/agent-center.css`
- API helpers: `studenthub-app/src/lib/dashboard-data.js` (fetchAgentJobs, createAgentApproval, etc.)
- Polling: 10-second interval for live job status updates
- Views: job list → job detail → review/approval screen
- Navigation: "Agent Center" in sidebar drawer under "Agentic" section

### Test Suites

| Suite | Tests | Location |
|---|---|---|
| Capability Analyzer | 66 | `server/agent/__tests__/capability-analyzer.test.js` |
| Job State Machine | 95 | `server/agent/__tests__/job-state-machine.test.js` |
| AI Provider | 56 | `server/ai/__tests__/provider-layer.test.js` |
| Manifest Pipeline | 56 | `server/agent/__tests__/manifest-pipeline.test.js` |
| Agent Orchestrator | 64 | `server/agent/__tests__/agent-orchestrator.test.js` |
| Tool Runtime | 43 | `server/agent/tools/__tests__/tool-runtime.test.js` |
| Artifact System | 77 | `server/agent/artifacts/__tests__/artifact-system.test.js` |
| Refinement Pipeline | 65 | `server/agent/refinement/__tests__/refinement-pipeline.test.js` |
| Approval & Write Tools | 37 | `server/agent/approval/__tests__/approval-write-tools.test.js` |
| Integration Hardening | 101 | `server/agent/__tests__/integration-hardening.test.js` |
| **Total** | **660** | |

### Phase 13 Bug Fixes

| Bug | Fix |
|---|---|
| `canvas.submit_assignment` checked `job.approval.approved` (undefined) | Now checks `job.approval.status === 'APPROVED'` |
| Artifacts never stored on `job.artifacts` array | Artifact tools now link generated artifacts to the job |
| `pdf_generation` capability marked SUPPORTED but generator returns NOT_IMPLEMENTED | Changed status to UNSUPPORTED |
| `canvas-write-tools` `emitJobEvent` used `global.__agentEventEmitter` (never set) | Now uses `addEvent` dependency from registration |
| Orchestrator double-pushed model response to conversation history | Removed redundant push after action handling |
| `canvas.submit_assignment` didn't validate submission type against allowed types | Added manifest submission type validation |
| `sanitizeFilename` only removed forward slashes | Now also removes backslashes |
| Artifact tools input schema had redundant `jobId` field | Removed (jobId comes from context) |

### Security Hardening (Phase 13)

- Approval gate correctly enforces version-bound stale detection
- Path traversal prevented on artifact read/write/delete
- AI cannot claim tool success without tool result confirmation
- Tool Runtime rejects unknown tools, invalid arguments, unauthorized jobs
- Assignment scope enforced: job courseId/assignmentId checked on all tools
- Prompt injection in assignment text cannot override system safety rules
- DOCX XML escaping prevents content injection
- User data isolation verified (User A cannot see User B jobs)
- Submit tool rejects without server-side approval (frontend cannot bypass)
- PDF, code, video, audio, image generation correctly marked UNSUPPORTED

### Phase 15: Integration Repair

**Critical gaps found and fixed:**

| Gap | Status |
|---|---|
| Orchestrator disconnected from refinement pipeline | ✅ FIXED — orchestrator accepts `createRefinementPipeline` dep, runs refinement after AI loop |
| Orchestrator disconnected from artifact generation | ✅ FIXED — orchestrator accepts `docxGenerator`/`txtGenerator`, generates TXT artifact from AI content |
| Job states skipped full pipeline | ✅ FIXED — orchestrator transitions DISCOVERED → ANALYZING → PLANNING → EXECUTING → READY |
| Approval doesn't trigger execution | ✅ FIXED — approve endpoint fires orchestrator in background after approval |
| Mobile has no execute button | ✅ FIXED — `executeAgentJob()` added to dashboard-data.js, execute button in job detail |
| Mobile has no job creation | ✅ FIXED — `createAgentJob()` added to dashboard-data.js |

**Orchestrator pipeline flow (after fix):**
```
DISCOVERED → ANALYZING → PLANNING → EXECUTING
    ↓ (AI loop + tool calls)
    ↓ (AI generates content via artifact tools)
    ↓ (refinement pipeline runs)
    ↓ (TXT artifact created if AI produced text content)
READY → (awaiting user review)
    ↓ (user approves)
EXECUTING → (Canvas submission via write tools)
COMPLETED
```

### Phase Status

| Phase | Status | Notes |
|---|---|---|
| 1 | COMPLETE | Repository audit |
| 2 | COMPLETE | Feature flag + safety gate |
| 3 | COMPLETE | Capability engine |
| 4 | COMPLETE | Assignment ingestion + manifest |
| 5 | COMPLETE | Agent job + state machine |
| 6 | COMPLETE | AI provider + Gemini |
| 7 | COMPLETE | Tool runtime + Canvas read tools |
| 8 | COMPLETE | Agent orchestrator |
| 9 | COMPLETE | Artifact generation (DOCX, TXT) |
| 10 | COMPLETE | Refinement pipeline |
| 11 | COMPLETE | Canvas write tools + approval |
| 12 | COMPLETE | Mobile Agent Center |
| 13 | COMPLETE | Integration hardening (10 bug fixes) |
| 14 | NOT STARTED | Content generation pipeline (skipped — handled in 15) |
| 15 | COMPLETE | Architecture audit + integration repair |
| 16 | COMPLETE | Execution pipeline + plan-based multi-step orchestration |
| 17 | COMPLETE | Production readiness audit + critical bug fixes |

### Phase 17: Production Readiness Audit

**Critical bugs found and fixed:**

| Bug | Severity | Fix |
|---|---|---|
| `canvasAuth` never passed from orchestrator → tool runtime → Canvas tools | **CRITICAL** — every Canvas tool would fail with NO_AUTH | `toolRuntime.execute()` now accepts and forwards `canvasAuth` option; orchestrator passes `ctx.canvasAuth` |
| Canvas write tools used raw `fetch()` bypassing `canvasService` | **HIGH** — inconsistent auth, no error normalization | Replaced with `canvasService.post()` calls |
| No due-date/lock-date safety check before execution | **MEDIUM** — could try to submit locked assignments | Orchestrator now checks `lockAt` and rejects locked assignments; warns on past-due |
| Job state machine didn't allow `EXECUTING → READY` | **MEDIUM** — orchestrator plan completion would fail | Added READY and USER_ACTION_REQUIRED as valid transitions from EXECUTING |
| `canvas-service.js` had no POST method | **MEDIUM** — write tools had to use raw `fetch()` | Added `canvasService.post()` and `canvasService.uploadAndSubmit()` |
| `stripHtml()` didn't handle non-string inputs | **LOW** — crashes on numeric Canvas values | Added type check |

**New test suite:** `server/agent/__tests__/production-readiness.test.js` (86 tests)
- Canvas auth threading verification
- Due-date / lock-date safety
- Prompt injection detection
- HTML sanitization
- State machine transitions
- Security boundaries (cross-user, unknown tools, approval bypass, WRITE permission)
- Error recovery
- No raw `fetch()` in write tools
- API security (no secrets in responses)

### Execution Pipeline (Phase 16)

The orchestrator now uses a structured execution plan with typed steps, dependency tracking, requirement coverage, and a human review package.

```text
Canvas Assignment
       ↓
Assignment Ingestion → Manifest → Capability Engine
       ↓
Agent Job (DISCOVERED)
       ↓ (user triggers execute)
Execution Plan Created
  ├── analyze (ANALYZE step — AI reads assignment)
  ├── generate (GENERATE step — AI produces content with tool calls)
  ├── refine (REFINE step — deterministic content refinement)
  ├── validate (VALIDATE step — requirement coverage check)
  ├── artifact (ARTIFACT step — DOCX/TXT generation)
  └── artifact_validate (ARTIFACT_VALIDATE step — format validation)
       ↓
Execution Plan → Steps execute in order
  ├── PENDING → RUNNING → COMPLETED / FAILED / BLOCKED
  ├── Dependencies: blocked if upstream failed
  ├── Retries: retryable errors up to maxStepRetries
  └── Limits: maxIterations, maxToolCalls, maxAiCalls, maxTimeMs
       ↓
Requirement Coverage Check
  ├── All requirements must be covered
  └── Uncovered → warnings
       ↓
Human Review Package
  ├── Assignment + requirements
  ├── Completed steps + warnings
  ├── Generated artifacts
  └── Validation results
       ↓
READY_FOR_REVIEW
       ↓ (user approves)
Canvas Submission → COMPLETED
```

**Key files:**
- `server/agent/execution-plan.js` — plan model, step states, dependency tracking, coverage check
- `server/agent/agent-orchestrator.js` — step execution, AI context construction, refinement/artifact wiring

### Known Limitations (Current)

- PDF generation not implemented (no library available on server)
- No background job execution worker (runs in HTTP request context)
- No WebSocket/SSE real-time updates (uses 10s polling)
- No Canvas rubric-aware planning (rubrics fetched but not used in plan generation)
- No persistent AI conversation memory across jobs
- DOCX artifact generation requires AI to explicitly call `artifact.generate_docx` tool
- Refinement pipeline runs after AI loop, not integrated into AI conversation
- `USER_ACTION_REQUIRED → EXECUTING` transition not yet allowed (paused jobs can only be cancelled)
- Canvas file upload uses JSON submission endpoint (no binary multipart upload)
- No attachment processing (PDFs, images attached to Canvas assignments not read)

### Security Model (Verified Phase 17)

- Server-side approval gate: approval is stored on job, not in client state
- Orchestrator authorization: job must belong to authenticated user
- Tool Runtime: all tool calls validated, authorized, scoped to job
- Canvas auth threading: `canvasAuth` forwarded from orchestrator → tool runtime → Canvas tools (no raw fetch())
- AI trust boundary: AI output validated as structured JSON; untrusted
- State machine: invalid transitions rejected; terminal states immutable
- File security: path traversal prevented; filenames sanitized
- User isolation: per-user storage; cross-user access blocked
- Due-date/lock-date safety: locked assignments rejected; past-due warnings
- Prompt injection detection: assignment text scanned for instruction override patterns
- HTML sanitization: Canvas descriptions stripped of scripts/styles
- No secrets in API responses: Canvas tokens, Firebase keys not in job data
- Capability fail-closed: UNSUPPORTED → no generation → no upload → no submission

### API Surface

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/agent/config` | Public agent config (no auth) |
| GET | `/api/agent/capabilities` | List registered capabilities |
| GET/POST | `/api/agent/settings/:userId` | Get/update agent settings |
| GET | `/api/agent/status/:userId` | Check if enabled |
| POST | `/api/agent/analyze` | Stateless assignment analysis |
| POST | `/api/agent/ingest/:userId` | Fetch + analyze + persist manifest |
| GET | `/api/agent/manifests/:userId` | List cached manifests |
| GET | `/api/agent/manifests/:userId/:courseId/:assignmentId` | Get specific manifest |
| POST | `/api/agent/jobs/:userId` | Create agent job |
| GET | `/api/agent/jobs/:userId` | List all jobs |
| GET | `/api/agent/jobs/:userId/:jobId` | Get specific job |
| GET | `/api/agent/jobs/:userId/:jobId/events` | Get job events |
| POST | `/api/agent/jobs/:userId/:jobId/cancel` | Cancel a job |
| POST | `/api/agent/execute/:userId/:jobId` | Execute job through orchestrator |
| POST | `/api/agent/tools/execute/:userId` | Execute a tool request |
| GET | `/api/agent/tools` | List available tools |
| POST | `/api/agent/approvals/:userId` | Create approval request |
| POST | `/api/agent/approvals/:userId/:id/approve` | Approve (triggers orchestrator) |
| POST | `/api/agent/approvals/:userId/:id/deny` | Deny request |
| GET | `/api/agent/approvals/:userId/:jobId` | Get approval status |
| GET | `/api/agent/artifacts/:userId/:id` | Get artifact info |
| GET | `/api/agent/artifacts/:userId/:id/download` | Download artifact |
| GET | `/api/agent/summary/:userId` | Job count summary |

### Next Development Phase

Recommended: **Phase 18 — Background Job Worker + Real-time Updates**
- Decouple orchestrator execution from HTTP request lifecycle
- Add WebSocket/SSE for live job status updates (currently 10s polling)
- Implement persistent job queue for long-running jobs
- Enable `USER_ACTION_REQUIRED → EXECUTING` transition for job resumption
- Canvas binary file upload (multipart) for all Canvas configurations
- Attachment processing (PDF, images) for richer assignment understanding
