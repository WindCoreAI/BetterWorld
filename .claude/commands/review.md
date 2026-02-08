---
description: Review code changes for correctness, security, performance, and convention compliance. Works on git diffs, PRs, specific files, or staged changes. Uses Conventional Comments format with severity levels. Use when reviewing code before merge, after implementation, or for a second opinion on any code change.
context: fork
handoffs:
  - label: Audit Full Quality
    agent: code-quality
    prompt: Run a full quality audit on the files touched in this review
  - label: Fix Review Issues
    agent: speckit.implement
    prompt: Fix the issues identified in the code review
---

## User Input

~~~text
$ARGUMENTS
~~~

You **MUST** consider the user input before proceeding. If the input is empty, review all staged and unstaged changes (git diff HEAD). If no changes exist, ask the user what to review.

## Goal

Perform a thorough, multi-pass code review that mirrors what a senior engineer would catch. Produce structured findings using Conventional Comments format, grouped by file and ranked by severity. Focus on issues that static analysis tools cannot catch — logic errors, security vulnerabilities, architectural violations, missing edge cases, and convention drift.

This is a **read-only** skill — it identifies issues but does not fix them.

## Scope Determination

Parse $ARGUMENTS to determine review scope:

| Input | Scope | How |
|-------|-------|-----|
| Empty | Staged + unstaged changes | git diff HEAD |
| 'staged' | Staged changes only | git diff --cached |
| 'branch' or branch name | Full branch diff against main | git diff main...HEAD |
| PR number (e.g., #42) | PR diff | gh pr diff 42 |
| File path(s) | Specific file(s) — full file review | Read file(s) directly |
| 'last' or 'latest' | Last commit only | git diff HEAD~1..HEAD |

## Execution Steps

### 1. Gather Review Context

Load the following context (read once, reference throughout):

**Project conventions** (from CLAUDE.md and constitution):
- TypeScript strict mode, zero errors
- Zod schemas at all system boundaries (API inputs, agent submissions)
- Standard response envelope: { ok, data/error, requestId }
- Cursor-based pagination everywhere (never offset)
- Double-entry accounting for token transactions with balance_before/balance_after
- SELECT FOR UPDATE for mission claiming and token operations
- Pino for structured logging; never log secrets, keys, or PII
- 3-layer guardrail system with no bypass path
- API responses MUST NOT expose internal errors or stack traces
- All content MUST carry guardrail_status enum

**Codebase patterns** (infer from reading existing files):
- Error handling patterns (AppError classes, error codes)
- Import conventions (relative vs absolute, barrel exports)
- Test patterns (describe/it structure, naming conventions, assertion style)
- Route/handler patterns (middleware composition, validation flow)

### 2. Gather the Diff and Related Context

1. **Get the diff** using the appropriate git command from the scope table.
2. **Parse changed files** — extract the list of modified files and changed line ranges.
3. **Read full files** for each changed file (not just the diff hunks) to understand surrounding context.
4. **Load related context** for each changed file:
   - Imported modules and their type signatures
   - Functions that call the changed functions (callers — search with Grep)
   - Test files for the changed files (check for .test.ts / .spec.ts siblings)
   - Schema/type definitions referenced by the changed code
   - Route registration files if routes were changed
5. **Read recent commits** on the branch (git log --oneline -10) to understand the intent of the changes.

### 3. Multi-Pass Review

Review the changes in **separate focused passes**. This catches more issues than a single monolithic pass.

#### Pass 1: Security (P0 — review first, most important)

Focus exclusively on security vulnerabilities:

- **Injection**: SQL/NoSQL injection, command injection, template injection. Check for string concatenation with user input in queries. Must use Drizzle query builder or parameterized queries.
- **Authentication**: Missing auth middleware on protected endpoints. Check route registration against auth requirements.
- **Authorization**: Missing or incorrect permission checks. Look for IDOR vulnerabilities (accessing resources by ID without ownership verification).
- **Input validation**: Missing Zod validation on API inputs. Check that request body, params, and query are validated before use.
- **Secrets exposure**: Hardcoded credentials, API keys in code. Secrets logged to console/Pino. Sensitive data in error responses.
- **XSS**: Unescaped user content rendered in HTML/JSX. Dangerous use of dangerouslySetInnerHTML.
- **CSRF**: State-changing operations without CSRF protection.
- **SSRF**: User-controlled URLs used in server-side requests without allowlist validation.
- **Cryptographic issues**: Weak algorithms (MD5, SHA1), insufficient bcrypt cost factor (must be 12+), missing TLS enforcement.

#### Pass 2: Correctness & Logic (P0/P1)

Focus on bugs, logic errors, and missing edge cases:

- **Off-by-one errors**: Loop bounds, array indexing, comparison operators (< vs <=).
- **Null/undefined handling**: Unchecked nullable values, optional chaining where error handling is needed instead.
- **Error handling**: Missing try/catch on async operations, swallowed errors (empty catch blocks), errors without context propagation.
- **Race conditions**: Concurrent access to shared state without locks. Mission claiming without SELECT FOR UPDATE. Token operations without transaction isolation.
- **Type safety**: Use of 'any', '@ts-ignore', non-null assertions ('!') without justification, unchecked type casts.
- **Return value handling**: Ignored promise return values, unused error results, missing early returns.
- **State management**: Stale closures, missing dependency array entries in React hooks, incorrect state update patterns.
- **Edge cases**: Empty arrays/objects, zero/negative values, maximum length inputs, Unicode/special characters.
- **Business logic**: Does the code correctly implement the intended behavior? Check against PR description, related spec, or ticket.

#### Pass 3: Performance (P1/P2)

Focus on performance anti-patterns:

- **N+1 queries**: Database calls inside loops. Should use batch queries with inArray() or joins.
- **Missing pagination**: Unbounded queries that could return thousands of rows.
- **Unnecessary computation**: Repeated expensive operations that could be cached or memoized.
- **Memory leaks**: Event listeners not cleaned up, growing collections without bounds, unclosed streams/connections.
- **Blocking I/O**: Synchronous file operations, CPU-heavy computation blocking the event loop.
- **React performance**: Unnecessary re-renders, missing useMemo/useCallback for expensive computations, unstable references.
- **Query efficiency**: SELECT * instead of specific columns, missing WHERE clauses, full table scans on large tables.
- **Bundle size**: Importing entire libraries when only a single function is needed.

#### Pass 4: API Design & Compatibility (P1/P2)

For API-related changes:

- **Backwards compatibility**: Do changed endpoints break existing clients? Are removed/renamed fields breaking?
- **Response envelope**: Does the response follow { ok, data/error, requestId } format?
- **Error responses**: Consistent HTTP status codes, descriptive error messages, error codes for client parsing.
- **Pagination**: Cursor-based (never offset). Consistent parameter naming.
- **Versioning**: Breaking changes MUST require a new API version (/v2/).
- **Idempotency**: State-changing operations should support idempotency keys.
- **Rate limiting**: Write endpoints and auth endpoints must have rate limiting.
- **Input validation**: 422 responses with descriptive Zod error messages for invalid input.

#### Pass 5: Testing (P2)

For changes that should have tests:

- **Missing tests**: New functions/endpoints/components without corresponding test files.
- **Coverage gaps**: Changed code paths without test coverage (happy path, error paths, edge cases).
- **Test quality**: Tests that assert on implementation details rather than behavior. Snapshot tests without justification.
- **Test isolation**: Shared mutable state between tests, missing setup/teardown.
- **Assertion specificity**: Weak assertions (toBeTruthy() when toEqual(expected) is appropriate).
- **Missing edge cases**: Boundary values, empty inputs, concurrent scenarios, error conditions.
- **Coverage thresholds**: Changes to guardrails (>= 95%), tokens (>= 90%), db (>= 85%), api (>= 80%) packages must maintain or increase coverage.

#### Pass 6: Maintainability & Conventions (P2/P3)

Focus on readability and convention compliance:

- **Naming**: Descriptive, consistent with existing codebase patterns.
- **Complexity**: Functions exceeding cyclomatic complexity 10 or cognitive complexity 15.
- **DRY**: Copy-pasted logic blocks (>= 5 lines identical) that should be extracted.
- **Dead code**: Unused imports, unreachable branches, commented-out code.
- **Architecture boundaries**: Layer violations (routes importing services from wrong layer, cross-package internal imports).
- **Logging**: Uses Pino (not console), structured format, no PII.
- **Constitution compliance**: All 7 principles checked against changes.

### 4. Finding Deduplication & Ranking

After all passes:

1. **Deduplicate**: Merge findings that reference the same root cause.
2. **Rank**: Sort by severity (P0 > P1 > P2 > P3), then by file.
3. **Cap volume**: Maximum 20 findings. If more exist, include the top 20 and add an overflow count.
4. **Filter noise**: Remove findings already caught by TypeScript, ESLint, or Prettier. Focus on what only a human/AI reviewer can catch.

### 5. Generate Review Report

Output using this structure:

~~~
## Code Review

**Scope**: [what was reviewed — diff range, files, PR]
**Files changed**: N
**Lines changed**: +X / -Y

### Verdict: Approved / Approved with Comments / Changes Requested

**Findings**: X critical, Y high, Z medium, W low

---

### Critical & High Priority

[Findings that must be addressed before merge]

### Medium Priority

[Findings that should be addressed or tracked as follow-up]

### Low Priority & Suggestions

[Optional improvements — non-blocking]

### What's Done Well

[2-3 specific observations about good patterns in this change]
~~~

### 6. Finding Format (Conventional Comments)

Each finding MUST use this format:

~~~
**<label>** (<severity>, <category>): One-line subject

**File**: path/to/file.ts:42-58

Explanation of why this matters — impact, risk, or business consequence.

<suggestion if applicable — concrete code diff>
~~~

**Labels** (from Conventional Comments specification):

| Label | Use When | Blocking? |
|-------|----------|-----------|
| 'issue' | Definite bug, security flaw, or correctness problem | Yes |
| 'suggestion' | Improvement proposal with reasoning | Contextual |
| 'question' | Need clarification on intent or approach | No |
| 'todo' | Small, necessary change (e.g., missing error handling) | Yes |
| 'nitpick' | Style/preference — take it or leave it | No |
| 'praise' | Something done well — always include at least one | No |
| 'thought' | Idea triggered by the review, not a direct issue | No |

**Severity levels**:

| Level | Label | Merge Impact |
|-------|-------|-------------|
| P0 | Critical | Blocks merge — security vulnerability, data loss, constitution violation |
| P1 | High | Should block — logic error, missing validation, broken edge case |
| P2 | Medium | Non-blocking — performance issue, missing test, convention drift |
| P3 | Low | Non-blocking — naming, minor cleanup, style preference |

**Example findings**:

~~~
**issue** (P0, security): User input passed directly to SQL query without parameterization

**File**: apps/api/src/routes/users.ts:47

This creates an SQL injection vulnerability. The userId parameter from the request
is concatenated into the query string. Use Drizzle's query builder with parameterized
values instead.

~~~diff
- const user = await db.execute(sql_query_with_userId);
+ const user = await db.select().from(users).where(eq(users.id, userId));
~~~
~~~

~~~
**suggestion** (P2, perf): Consider batching these database calls to avoid N+1

**File**: apps/api/src/services/missions.ts:82-91

The current loop issues one query per mission to fetch the creator. For a page of 20
missions, this generates 20 additional queries. Use a single batch query instead.

~~~diff
- for (const mission of missions) {
-   mission.creator = await db.select().from(users).where(eq(users.id, mission.creatorId));
- }
+ const creatorIds = missions.map(m => m.creatorId);
+ const creators = await db.select().from(users).where(inArray(users.id, creatorIds));
+ const creatorMap = new Map(creators.map(c => [c.id, c]));
+ missions.forEach(m => { m.creator = creatorMap.get(m.creatorId); });
~~~
~~~

~~~
**praise**: Clean separation of validation into Zod middleware

The route handlers focus purely on business logic while validation is handled
declaratively via Zod schemas in the middleware chain. This is exactly the pattern
the constitution calls for.
~~~

### 7. Verdict Logic

| Condition | Verdict |
|-----------|---------|
| Any P0 finding | Changes Requested |
| >= 3 P1 findings | Changes Requested |
| 1-2 P1 findings | Approved with Comments |
| P2/P3 only | Approved (with optional suggestions) |
| No findings | Approved |

## Operating Principles

- **Read-only**: Never modify files. Report findings only.
- **Opinionated on facts, humble on preferences**: Be definitive about bugs and security issues. Use "consider" or "you might" for stylistic suggestions.
- **Always include praise**: At least one 'praise' finding per review. Acknowledge what's done well.
- **Show, don't tell**: Every suggestion must include a concrete code diff. Never say "improve error handling" without showing how.
- **Explain impact**: Every finding must explain **why** it matters — not just what's wrong, but what bad thing could happen.
- **Don't duplicate tooling**: Skip issues caught by TypeScript, ESLint, or Prettier. If the linter would catch it, don't mention it.
- **Constitution is supreme**: Constitution violations are always P0 if NON-NEGOTIABLE, P1 otherwise.
- **Limit volume**: Maximum 20 findings. Quality over quantity. One well-explained issue is worth ten vague ones.
- **Context matters**: Consider the intent behind the change. Don't flag intentional trade-offs as bugs. Ask questions when the intent is unclear.
- **Be respectful**: Use "we" or "this code" instead of "you." Frame feedback as collaborative improvement, not criticism.
