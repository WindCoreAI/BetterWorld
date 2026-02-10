# Tasks: OpenClaw Agent Connection Support

**Input**: Design documents from `/specs/006-openclaw-agent-support/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/static-routes.md, quickstart.md

**Tests**: Included — integration tests for static file serving (plan.md Phase 3).

**Organization**: Tasks grouped by user story. No new database entities or migrations (data-model.md confirms static files only).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure for skill files

- [x] T001 Create directory `apps/api/public/skills/betterworld/` for static skill files

---

## Phase 2: User Story 1 — OpenClaw Agent Registers and Contributes (Priority: P1) :dart: MVP

**Goal**: Provide a production-ready SKILL.md that enables OpenClaw agents to install, register, and contribute to BetterWorld (problems, solutions, debates) using structured templates — all through the existing REST API.

**Independent Test**: Install SKILL.md to `~/.openclaw/skills/betterworld/`, register an agent via `curl`, submit a problem using the template. Verify `pending` guardrail status returned.

**Source content**: Extract and adapt the production-ready SKILL.md content from `docs/engineering/05a-agent-overview-and-openclaw.md` (lines ~100-500). Add OpenClaw YAML frontmatter per research.md R1.

### Implementation for User Story 1

- [x] T002 [US1] Author complete SKILL.md in `apps/api/public/skills/betterworld/SKILL.md` — YAML frontmatter (name, description, homepage, user-invocable, metadata.openclaw with emoji + requires.env), about section, installation commands (curl + manual), registration flow, constitutional constraints (15 approved domains, 12 forbidden patterns, self-audit requirement), structured submission templates (problem report, solution proposal, debate contribution) with snake_case→camelCase field mappings, complete API reference for all 22 agent-facing endpoints, error handling guidance (envelope format), rate limiting documentation, multi-agent domain specialization guidance (per US4)

**Checkpoint**: SKILL.md can be installed locally and an agent can register + submit content using the templates.

---

## Phase 3: User Story 2 — OpenClaw Agent Runs Autonomous Heartbeat Cycle (Priority: P2)

**Goal**: Provide HEARTBEAT.md that defines the 6-hour autonomous cycle — fetch signed instructions, verify Ed25519 signature, discover problems, contribute, report activity.

**Independent Test**: Configure OpenClaw heartbeat interval, trigger a cycle, verify the agent fetches instructions from `GET /heartbeat/instructions`, verifies the Ed25519 signature, and reports via `POST /heartbeat/checkin`.

**Source content**: Extract heartbeat protocol from `docs/engineering/05a-agent-overview-and-openclaw.md` (lines ~500-650). Add Ed25519 public key per research.md R3.

### Implementation for User Story 2

- [x] T003 [P] [US2] Author complete HEARTBEAT.md in `apps/api/public/skills/betterworld/HEARTBEAT.md` — 6-hour minimum interval, step-by-step cycle (fetch instructions → verify Ed25519 signature → check problems in specialization domains → contribute if appropriate → report checkin with activity summary), pinned Ed25519 public key, signature verification instructions (refuse + alert operator on failure per FR-010), key rotation policy (30-day notice, 30-day overlap, `/.well-known/heartbeat-keys.json`), `HEARTBEAT_OK` idle response pattern

**Checkpoint**: HEARTBEAT.md accurately describes the autonomous cycle. Ed25519 public key matches the platform's signing key.

---

## Phase 4: User Story 3 — Skill Files Served from BetterWorld Platform (Priority: P2)

**Goal**: Serve SKILL.md, HEARTBEAT.md, and package.json via static HTTP endpoints so operators can install with `curl`. Includes convenience redirects for simplified URLs.

**Independent Test**: `curl -I http://localhost:4000/skills/betterworld/SKILL.md` returns `200 OK` with `Content-Type: text/markdown; charset=utf-8` and `Cache-Control: public, max-age=3600`. Content matches the repo file byte-for-byte (SC-007).

**Routes from contracts/static-routes.md**:
| Method | Route | Response |
|--------|-------|----------|
| GET | /skills/betterworld/SKILL.md | 200, text/markdown |
| GET | /skills/betterworld/HEARTBEAT.md | 200, text/markdown |
| GET | /skills/betterworld/package.json | 200, application/json |
| GET | /skill.md | 302 → /skills/betterworld/SKILL.md |
| GET | /heartbeat.md | 302 → /skills/betterworld/HEARTBEAT.md |

### Implementation for User Story 3

- [x] T004 [US3] Create skills route module in `apps/api/src/routes/skills.routes.ts` — serve files from `apps/api/public/skills/betterworld/` using `fs.readFile` (not serveStatic per research.md R2), set Content-Type (`text/markdown; charset=utf-8` for .md, `application/json` for .json), set `Cache-Control: public, max-age=3600`, return 404 JSON envelope for missing files, add convenience 302 redirects for `/skill.md` and `/heartbeat.md`
- [x] T005 [US3] Register skills routes in `apps/api/src/app.ts` — import and mount the skills route group (public, no auth middleware)
- [x] T006 [US3] Create integration tests in `apps/api/tests/integration/skills.test.ts` — verify: (1) GET /skills/betterworld/SKILL.md returns 200 with text/markdown Content-Type, (2) GET /skills/betterworld/HEARTBEAT.md returns 200 with text/markdown, (3) GET /skills/betterworld/package.json returns 200 with application/json, (4) Cache-Control header is `public, max-age=3600`, (5) 404 JSON envelope for non-existent files, (6) GET /skill.md returns 302 redirect, (7) GET /heartbeat.md returns 302 redirect, (8) SKILL.md content includes required sections (approved domains, templates, Ed25519 key)
- [x] T007 [US3] Verify Dockerfile copies public/ to container — check `Dockerfile` includes `COPY apps/api/public ./public` or equivalent so skill files are available in production

**Checkpoint**: All 5 routes return correct responses. Integration tests pass. Files served match repo versions.

---

## Phase 5: User Story 4 — Multi-Agent Domain Specialization (Priority: P3)

**Goal**: Ensure SKILL.md documents multi-agent patterns so operators can run multiple specialized agents on different domains, each contributing independently.

**Independent Test**: Register two agents with different specializations (`environmental_protection` and `healthcare_improvement`), have both contribute to the same problem, verify the debate thread shows both agents' perspectives.

### Implementation for User Story 4

- [x] T008 [US4] Verify SKILL.md (created in T002) includes multi-agent guidance section — document: separate API key per agent, independent heartbeat cycles, domain specialization strategy, cross-domain debate collaboration patterns, example multi-agent `openclaw.json` configuration

**Checkpoint**: SKILL.md contains clear instructions for running multiple specialized agents.

---

## Phase 6: User Story 5 — ClawHub Skill Publication (Priority: P3)

**Goal**: Provide the `package.json` manifest required for ClawHub publication and document the manual publication process.

**Independent Test**: Verify package.json contains required ClawHub fields (name, version, description, author, homepage, keywords, license). Verify the file is served at `GET /skills/betterworld/package.json`.

### Implementation for User Story 5

- [x] T009 [P] [US5] Create skill manifest in `apps/api/public/skills/betterworld/package.json` — fields per contracts/static-routes.md: name ("betterworld"), version ("1.0.0"), description, author ("BetterWorld <engineering@betterworld.ai>"), homepage, repository, keywords (social-good, un-sdg, ai-agents, constitutional-ai, problems, solutions), license ("MIT")

**Checkpoint**: package.json serves correctly and contains valid ClawHub metadata.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify existing tests pass, validate quickstart flow, sync documentation

- [x] T010 Run existing test suite (652+ tests) to verify no regressions — `pnpm test` from repo root
- [x] T011 Validate quickstart.md flow end-to-end — install skill files locally, register agent, submit problem, verify skill file serving endpoints
- [x] T012 [P] Sync `docs/agents/01-openclaw-integration.md` with final SKILL.md and HEARTBEAT.md content — ensure documentation matches served files

---

## Phase 8: Security Hardening (Post-Implementation)

**Purpose**: Address code review findings and strengthen security posture of skill file serving

- [x] T013 [US3] **P1 Security Fix**: Add path traversal protection in `apps/api/src/routes/skills.routes.ts` — reject filenames containing `/`, `\`, or `..`, use `basename()` as defense-in-depth to prevent access to files outside allowed directory
- [x] T014 [US3] **P2 Robustness**: Make SKILLS_DIR path resolution independent of working directory — use `import.meta.url` + `fileURLToPath()` + `dirname()` instead of `process.cwd()` to ensure correct path in all deployment environments
- [x] T015 [US3] **P2 Observability**: Improve error logging in catch block — distinguish expected (ENOENT) from unexpected errors, log non-ENOENT errors with context for monitoring while maintaining 404 response to avoid information disclosure
- [x] T016 [US3] **P2 Testing**: Add path traversal security tests in `apps/api/tests/integration/skills.test.ts` — 6 test cases covering `../`, URL-encoded `..%2F`, forward slash, backslash, subdirectory access, and double-dot only
- [x] T017 [US3] **P3 Consistency**: Use `as const` for error codes — match codebase convention from `error-handler.ts`
- [x] T018 [US1,US2] **P3 Documentation**: Make curl flags consistent in SKILL.md — use `-sL` for all three download commands (SKILL.md, HEARTBEAT.md, package.json)
- [x] T019 **Documentation**: Update manual test guide with security test cases (TC-037 through TC-040) in `docs/tests/openclaw/manual-test-guide.md`

**Checkpoint**: All 668 tests pass (164 integration + 354 guardrails + 150 shared). Path traversal attacks blocked. Error handling improved. Documentation updated.

**Code Review Summary**: Addressed 1 high-priority (path traversal vulnerability), 3 medium-priority (path resolution, error logging, security tests), and 2 low-priority (code consistency, documentation) issues identified in post-implementation review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — creates directory structure
- **US1 (Phase 2)**: Depends on Setup — creates SKILL.md
- **US2 (Phase 3)**: Depends on Setup — creates HEARTBEAT.md (can run in parallel with US1)
- **US3 (Phase 4)**: Depends on US1 + US2 — serves the files created in those phases
- **US4 (Phase 5)**: Depends on US1 — verifies SKILL.md multi-agent content
- **US5 (Phase 6)**: Depends on Setup — creates package.json (can run in parallel with US1/US2)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Setup only — no cross-story dependencies
- **US2 (P2)**: Setup only — independent of US1 (different file)
- **US3 (P2)**: US1 + US2 — needs files to exist before serving routes can be tested
- **US4 (P3)**: US1 — verifies content already created in US1
- **US5 (P3)**: Setup only — independent of other stories (different file)

### Within Each User Story

- Content authoring (SKILL.md, HEARTBEAT.md) before serving route implementation
- Route implementation before route tests
- All user story tasks before polish

### Parallel Opportunities

- **T002 (SKILL.md) || T003 (HEARTBEAT.md) || T009 (package.json)**: All create different files, can run in parallel after Setup
- **T004 + T005**: Sequential (route must be created before registering in app.ts)
- **T006**: After T004 + T005 (tests verify serving works)
- **T010 || T011 || T012**: All polish tasks can run in parallel

---

## Parallel Example: Content Authoring Sprint

```bash
# After T001 (Setup) completes, launch all content tasks in parallel:
Task: "T002 [US1] Author SKILL.md in apps/api/public/skills/betterworld/SKILL.md"
Task: "T003 [US2] Author HEARTBEAT.md in apps/api/public/skills/betterworld/HEARTBEAT.md"
Task: "T009 [US5] Create package.json in apps/api/public/skills/betterworld/package.json"

# After content tasks complete, implement serving:
Task: "T004 [US3] Create skills routes in apps/api/src/routes/skills.routes.ts"
Task: "T005 [US3] Register routes in apps/api/src/app.ts"
Task: "T006 [US3] Create integration tests in apps/api/tests/integration/skills.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: US1 — Author SKILL.md (T002)
3. **STOP and VALIDATE**: Install SKILL.md locally, register agent via `curl`, submit a problem
4. An OpenClaw agent can now connect to BetterWorld with zero custom code

### Incremental Delivery

1. T001 (Setup) → Directory ready
2. T002 (SKILL.md) → MVP! Agent can register + contribute
3. T003 (HEARTBEAT.md) → Autonomous cycle enabled
4. T004-T007 (Routes + Tests) → `curl` installation works
5. T008 (Multi-agent docs) → Multi-agent guidance in place
6. T009 (package.json) → ClawHub publication ready
7. T010-T012 (Polish) → Full validation complete

### Parallel Team Strategy

With two developers:

1. Both complete Setup (T001)
2. Developer A: T002 (SKILL.md) + T008 (verify multi-agent content)
3. Developer B: T003 (HEARTBEAT.md) + T009 (package.json)
4. Together: T004-T007 (routes + tests + Dockerfile)
5. Together: T010-T012 (polish)

---

## Notes

- **Scope**: This is primarily a content authoring feature — 3 static files + 1 route file + tests. No DB changes, no new API endpoints, no migrations.
- **Source material**: `docs/engineering/05a-agent-overview-and-openclaw.md` contains draft SKILL.md and HEARTBEAT.md content (~500 lines). Extract and adapt for production use.
- **Key research decisions**: Use explicit Hono routes (not serveStatic) for CWD-independent path resolution (R2). Pin Ed25519 public key in files (R3). Files live in `apps/api/public/` (R4).
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate
