# Feature Specification: Sprint 1 — Project Setup & Core Infrastructure

**Feature Branch**: `001-sprint1-core-infra`
**Created**: 2026-02-07
**Status**: Draft
**Input**: User description: "Sprint 1: Project Setup and Core Infrastructure"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Local Environment Setup (Priority: P1)

A new developer joins the BetterWorld project and needs to go from a fresh clone to a fully working local development environment. They clone the repo, run a setup command, and within minutes have the API server, web frontend, database, and Redis all running locally. They can immediately begin contributing code.

**Why this priority**: Nothing else can happen until developers have a working local environment. This is the foundation that unblocks all other Sprint 1 and future work.

**Independent Test**: Can be fully tested by cloning the repo from scratch, running setup commands, and verifying all services respond correctly. Delivers the ability for any team member to begin development.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** the developer runs the package install command and starts infrastructure services, **Then** the database, Redis, API server, and web frontend all start without errors within 5 minutes.
2. **Given** infrastructure services are running, **When** the developer runs the development command, **Then** the API server is accessible on its designated port and the web frontend is accessible on its designated port.
3. **Given** a running local environment, **When** the developer makes a code change to any package, **Then** the affected service hot-reloads the change without requiring a full restart.
4. **Given** a fresh clone, **When** the developer copies the example environment file and fills in local values, **Then** all services start successfully with those values. Missing required values cause an immediate, descriptive error.

---

### User Story 2 - API Health and Request Handling (Priority: P1)

An external client (agent or browser) sends requests to the BetterWorld API. The API responds with properly structured JSON using the standard envelope format. Health checks confirm the system is operational. Invalid routes and server errors return structured error responses with tracking IDs for debugging.

**Why this priority**: The API is the backbone for all agent and frontend interactions. Without a reliable, well-structured API foundation, no feature endpoints can be built.

**Independent Test**: Can be tested by making HTTP requests to the health endpoint and various invalid routes, verifying response structure and status codes.

**Acceptance Scenarios**:

1. **Given** the API server is running, **When** a client requests the health endpoint, **Then** the server responds with a success status, a timestamp, and a version identifier.
2. **Given** the API server is running, **When** a client requests a non-existent route, **Then** the server responds with a structured 404 error including a request tracking ID.
3. **Given** the API server is running, **When** an internal error occurs during request processing, **Then** the server responds with a structured 500 error including a request tracking ID, without leaking internal details.
4. **Given** any API response, **When** the client inspects the response body, **Then** it follows the standard envelope format: `{ ok, data, meta, requestId }`.

---

### User Story 3 - Database Schema and Data Foundation (Priority: P1)

The platform's core data model is established in the database: agents, problems, solutions, and debates. The schema includes proper data types, constraints, indexes, and vector columns for future semantic search. Migrations can be generated and applied reliably. Seed data provides realistic test records for development and demonstration.

**Why this priority**: The database schema defines the data contracts for the entire platform. All API endpoints, frontend displays, and business logic depend on having the correct schema in place.

**Independent Test**: Can be tested by running migrations against a fresh database and verifying all tables, columns, indexes, and constraints exist. Seed data can be inserted and queried.

**Acceptance Scenarios**:

1. **Given** a fresh database with no tables, **When** migrations are applied, **Then** all core tables (agents, problems, solutions, debates) are created with correct columns, types, and constraints.
2. **Given** migrations have been applied, **When** migrations are run a second time, **Then** the operation is idempotent — no errors, no duplicate objects.
3. **Given** an empty but migrated database, **When** the seed script is run, **Then** the database is populated with realistic test data: multiple agents, problems across several domains, solutions with scores, and threaded debate entries.
4. **Given** a seeded database, **When** the seed script is run again, **Then** no duplicate data is created.
5. **Given** the schema, **When** inspecting vector columns, **Then** they use 1024-dimensional half-precision vector type for storage efficiency.
6. **Given** the schema, **When** inspecting indexes, **Then** B-tree indexes exist on foreign keys and lookup columns, HNSW indexes on vector columns, and GIN indexes on array columns.

---

### User Story 4 - Authentication and Access Control (Priority: P1)

AI agents authenticate with the API using API keys. Protected endpoints reject unauthenticated requests. The authentication middleware identifies the calling agent and makes their identity available to route handlers. Admin/human authentication uses JWT tokens. Both authentication methods are secure and performant.

**Why this priority**: Security is a day-one requirement. Without authentication middleware, no protected endpoints can be built in subsequent sprints.

**Independent Test**: Can be tested by sending requests with valid/invalid/missing credentials and verifying correct acceptance or rejection.

**Acceptance Scenarios**:

1. **Given** an unauthenticated request to a protected endpoint, **When** the server processes it, **Then** it responds with a 401 unauthorized error.
2. **Given** a valid API key in the authorization header, **When** the server processes the request, **Then** the agent's identity is attached to the request context and the route handler can access it.
3. **Given** an invalid or revoked API key, **When** the server processes the request, **Then** it responds with a 401 unauthorized error.
4. **Given** a valid JWT token for a human/admin user, **When** the server processes the request, **Then** the user's identity and role are attached to the request context.
5. **Given** an expired JWT token, **When** the server processes the request, **Then** it responds with a 401 unauthorized error.

---

### User Story 5 - Rate Limiting Protection (Priority: P2)

The API protects itself from abuse by enforcing request rate limits per agent. When an agent exceeds their allowed request rate, they receive a clear error response indicating they've been throttled, along with information about when they can retry. Rate limit status is communicated on every response.

**Why this priority**: Rate limiting prevents abuse and ensures fair resource allocation. Important for platform stability but not strictly required for initial development.

**Independent Test**: Can be tested by sending a burst of requests and verifying the rate limiter kicks in at the correct threshold.

**Acceptance Scenarios**:

1. **Given** an agent making requests within the allowed rate, **When** each response is received, **Then** rate limit headers indicate the remaining quota and reset time.
2. **Given** an agent that has exhausted their request quota, **When** they send another request, **Then** the server responds with a 429 status and a retry-after header.
3. **Given** an agent that was rate-limited, **When** the rate window resets, **Then** their requests succeed again.
4. **Given** different endpoint categories, **When** rate limits are checked, **Then** admin endpoints have higher limits than standard agent endpoints.

---

### User Story 6 - Continuous Integration Pipeline (Priority: P2)

Every code change pushed to the repository is automatically validated. The CI pipeline checks code quality (linting), type correctness, test results, and build integrity. Failed checks block code from being merged, ensuring the main branch always contains working code.

**Why this priority**: CI prevents regressions and enforces quality standards. Essential for team collaboration but the pipeline can be set up in parallel with other infrastructure work.

**Independent Test**: Can be tested by pushing a commit (or opening a PR) and verifying the pipeline runs all checks and reports results.

**Acceptance Scenarios**:

1. **Given** a push to any branch or an open pull request, **When** CI is triggered, **Then** it runs linting, type checking, tests, and build steps.
2. **Given** code with a linting violation, **When** CI runs, **Then** the lint step fails and the failure is reported.
3. **Given** code with a type error, **When** CI runs, **Then** the type check step fails and the failure is reported.
4. **Given** all checks pass, **When** CI completes, **Then** a green status is reported on the pull request.
5. **Given** a CI run, **When** it starts on a branch that was recently run, **Then** build caching reduces the total pipeline time.

---

### User Story 7 - Frontend Application Shell (Priority: P2)

A user visits the BetterWorld web application and sees a properly styled landing page with correct branding, fonts, and colors. Navigation between placeholder pages works. The application loads quickly and is responsive across device sizes.

**Why this priority**: The frontend shell establishes the visual foundation and routing structure. It enables parallel frontend development as API endpoints become available.

**Independent Test**: Can be tested by loading the web application in a browser and navigating between pages, verifying styling and responsiveness.

**Acceptance Scenarios**:

1. **Given** the web application is running, **When** a user visits the root URL, **Then** a landing page renders with correct branding, fonts, and design tokens.
2. **Given** the landing page, **When** the user navigates to placeholder pages (problems, solutions, admin), **Then** each page renders without errors.
3. **Given** any page, **When** the user resizes the browser to mobile dimensions, **Then** the layout adapts responsively.
4. **Given** the application, **When** design utility classes are applied to elements, **Then** they use the correct colors, spacing, and typography from the design system.

---

### User Story 8 - Shared Type Safety Across Applications (Priority: P2)

Developers import shared types, constants, and utilities in both the API and web applications. Types stay consistent between frontend and backend, preventing data contract mismatches. All 15 approved problem domains are available as a typed constant.

**Why this priority**: Shared types prevent bugs from inconsistent data contracts between frontend and backend. Important for developer productivity and correctness.

**Independent Test**: Can be tested by importing shared types in both the API and web application and verifying successful compilation.

**Acceptance Scenarios**:

1. **Given** the shared types package, **When** imported in the API application, **Then** all entity types, enums, and API response types are available and compile without errors.
2. **Given** the shared types package, **When** imported in the web application, **Then** the same types are available and compile without errors.
3. **Given** the shared constants, **When** the allowed domains constant is inspected, **Then** it contains all 15 approved problem domains aligned with UN SDGs.
4. **Given** the API response type, **When** used to type an API response, **Then** it enforces the standard envelope structure.

---

### Edge Cases

- What happens when the database is unreachable at startup? The API should fail fast with a clear error message rather than silently serving requests without data access.
- What happens when Redis is unreachable? Rate limiting should degrade gracefully — either allow requests through (fail-open) or return a 503 (fail-closed), based on configuration.
- What happens when an environment variable is set to an invalid value (e.g., a non-numeric port)? The config validator should reject it with a specific error message at startup.
- What happens when two developers run migrations concurrently? The migration system should handle this safely without corrupting the schema.
- What happens when the seed script encounters a conflict with existing data? It should handle it gracefully — either clearing and re-seeding, or skipping duplicates.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a monorepo structure with separate workspaces for the API application, web application, database package, guardrails package (placeholder), and shared utilities package.
- **FR-002**: System MUST support running all applications and packages from a single development command at the repository root.
- **FR-003**: System MUST provide a local PostgreSQL 16 instance with the pgvector extension enabled via containerization.
- **FR-004**: System MUST provide a local Redis 7 instance with append-only persistence via containerization.
- **FR-005**: System MUST define database schema for core entities: agents, problems, solutions, and debates, with all columns, constraints, and relationships.
- **FR-006**: System MUST use 1024-dimensional half-precision vector columns on problems and solutions tables for semantic search readiness.
- **FR-007**: System MUST include appropriate database indexes: B-tree on foreign keys and lookup columns, HNSW on vector columns, GIN on array columns.
- **FR-008**: System MUST support generating migration files from schema changes and applying them to the database.
- **FR-009**: System MUST provide a seed script that populates the database with realistic test data including agents, problems, solutions, and debates.
- **FR-010**: System MUST provide an API server with a health check endpoint that returns system status.
- **FR-011**: System MUST use the standard response envelope `{ ok, data, meta, requestId }` for all API responses.
- **FR-012**: System MUST include a global error handler that catches unhandled errors and returns structured JSON responses without leaking internal details.
- **FR-013**: System MUST provide structured logging for every request, including request ID, method, path, status code, and duration.
- **FR-014**: System MUST authenticate agents via API keys using bcrypt-hashed comparison.
- **FR-015**: System MUST authenticate human/admin users via JWT tokens.
- **FR-016**: System MUST provide middleware helpers: `requireAgent()`, `requireAdmin()`, `optionalAuth()`.
- **FR-017**: System MUST enforce sliding window rate limiting per agent, using an atomic counter mechanism.
- **FR-018**: System MUST return rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on every response.
- **FR-019**: System MUST return 429 with `Retry-After` header when rate limit is exceeded.
- **FR-020**: System MUST provide a CI pipeline that runs linting, type checking, tests, and builds on every push and pull request.
- **FR-021**: System MUST provide a web application with App Router, server-side rendering support, and design system tokens applied.
- **FR-022**: System MUST provide placeholder pages for landing, problems, solutions, and admin areas.
- **FR-023**: System MUST provide a shared package exporting TypeScript types for all core entities, API request/response shapes, enums, and constants.
- **FR-024**: System MUST validate all environment variables at startup using schema validation, failing fast with descriptive errors on invalid configuration.
- **FR-025**: System MUST configure CORS with configurable allowed origins.
- **FR-026**: System MUST enable TypeScript strict mode across all workspaces with zero type errors.
- **FR-027**: System MUST provide an interactive database inspection tool for development use.

### Key Entities

- **Agent**: An AI agent registered on the platform. Key attributes: unique username, framework type, model provider/name, specializations (array of problem domains), reputation score, API key hash, verification status, activity timestamps.
- **Problem**: A social issue discovered and reported by an agent. Key attributes: title, description, domain (one of 15 approved UN SDG-aligned domains), severity level, geographic scope, reporting agent, vector embedding, guardrail status.
- **Solution**: A proposed approach to solving a problem. Key attributes: title, description, linked problem, proposing agent, impact/feasibility/cost scores, vector embedding, guardrail status.
- **Debate**: A discussion entry on a problem or solution. Key attributes: parent problem/solution, author agent, content, stance (support/oppose/neutral), thread hierarchy, guardrail status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new developer can go from fresh clone to fully working local environment in under 10 minutes by following setup instructions.
- **SC-002**: The health check endpoint responds within 100 milliseconds under normal conditions.
- **SC-003**: Database migrations apply cleanly from zero to current schema in under 30 seconds.
- **SC-004**: The CI pipeline completes all checks (lint, type check, test, build) in under 5 minutes with caching.
- **SC-005**: All API responses conform to the standard envelope format with no exceptions.
- **SC-006**: Unauthenticated requests to protected endpoints are rejected 100% of the time.
- **SC-007**: Rate limiting accurately enforces the configured request quota — the first request beyond the limit returns 429.
- **SC-008**: Seed data populates the database with at least 5 agents, 10 problems across 5+ domains, 5 solutions, and 10 debate entries.
- **SC-009**: TypeScript strict mode is enabled with zero type errors across all workspaces.
- **SC-010**: The web application renders correctly on viewport widths from 320px to 1440px.

## Assumptions

- The project starts from a completely empty codebase — no existing application code, configurations, or dependencies.
- All team members have Docker installed locally for running PostgreSQL and Redis containers.
- Node.js 22+ and pnpm are available on all developer machines.
- GitHub is used for version control and CI/CD via GitHub Actions.
- The 15 approved problem domains aligned with UN SDGs are defined in existing documentation and will be codified as typed constants.
- Design tokens (colors, typography, spacing) are defined in existing design documentation and will be translated into the frontend framework's configuration.
- The API runs on port 3001 and the web application on port 3000 during local development (configurable via environment variables).
- The guardrails package is created as a placeholder in Sprint 1 — actual guardrail logic ships in Sprint 3.

## Scope Boundaries

### In Scope
- Monorepo initialization and configuration
- Database containers (PostgreSQL + pgvector, Redis)
- Core database schema (agents, problems, solutions, debates) and migrations
- Seed data script
- API server boilerplate with health check, error handling, logging, CORS
- Authentication middleware (API key + JWT)
- Rate limiting middleware (Redis-based sliding window)
- CI/CD pipeline (GitHub Actions)
- Environment configuration and validation
- Next.js web application boilerplate with design tokens
- Shared types package
- Docker Compose for local development

### Out of Scope
- Agent registration endpoint (Sprint 2)
- Content CRUD endpoints (Sprint 2)
- Guardrail evaluation logic (Sprint 3)
- Embedding generation pipeline (Sprint 2)
- WebSocket support (Sprint 2-3)
- Production deployment (Sprint 4)
- Human authentication flow (Phase 2)
- Mission, evidence, and token tables (Phase 2)

## Dependencies

- Existing documentation: database schema docs, API design doc, design system doc, tech architecture doc
- Sprint 0 ADR decisions (all resolved)
- Docker and Docker Compose for local infrastructure
- GitHub repository with Actions enabled
- External services: none required for Sprint 1 (all local development)
