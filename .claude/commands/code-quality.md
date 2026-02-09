---
description: Audit code quality for files, directories, or the entire codebase. Checks complexity, security, conventions, testing, architecture boundaries, and constitution compliance. Use when you want to proactively enforce quality standards before committing or merging.
context: fork
handoffs:
  - label: Review Changes
    agent: review
    prompt: Review the code changes in the current branch
  - label: Fix Issues
    agent: speckit.implement
    prompt: Fix the quality issues identified in the audit
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding. If the input is empty, audit all staged and modified files (`git diff --name-only HEAD` + `git diff --cached --name-only`). If no changes exist, ask the user to specify a target.

## Goal

Perform a comprehensive, multi-dimensional code quality audit on the specified scope (files, directories, or packages). Produce a structured report with actionable findings ranked by severity. This is a **read-only** skill — it identifies issues but does not fix them.

## Scope Determination

Parse `$ARGUMENTS` to determine audit scope:

| Input | Scope |
|-------|-------|
| Empty | All staged + modified files |
| File path(s) | Specific file(s) |
| Directory path | All `.ts`/`.tsx` files in directory (recursive) |
| Package name (e.g., `api`, `web`) | All source files in `apps/<name>/src/` or `packages/<name>/src/` |
| `all` or `full` | Entire `apps/` and `packages/` source directories |

Limit scope to a maximum of 50 files per audit run. If the scope exceeds this, ask the user to narrow it or confirm they want a summary-only pass (metrics without line-level findings).

## Execution Steps

### 1. Gather Context

Load the following project context (read once, reference throughout):

1. **Constitution**: `.specify/memory/constitution.md` — extract all MUST/SHOULD rules and NON-NEGOTIABLE principles.
2. **Project conventions**: `CLAUDE.md` in repo root — extract coding conventions, testing requirements, and architecture principles.
3. **TypeScript config**: Read relevant `tsconfig.json` for strict mode flags.
4. **ESLint config**: Read `eslint.config.js` or equivalent to understand what's already enforced by tooling.

Build an internal **convention checklist** from these sources. Do not report issues already caught by the linter or type checker — focus on what static tools miss.

### 2. Read Target Files

For each file in scope:
- Read the full file content.
- Identify the file's role (route handler, middleware, service, model, test, utility, component, hook, etc.) from its path and content.
- Load related files if needed for context (imports, type definitions, test files).

### 3. Quality Analysis Passes

Run the following analysis passes on each file. Focus on **high-signal findings** — skip obvious style issues handled by formatters/linters.

#### A. Complexity Analysis

| Metric | Warn | Error | ESLint Equivalent |
|--------|------|-------|-------------------|
| Cyclomatic complexity per function | > 8 | > 12 | `complexity` |
| Cognitive complexity per function | > 10 | > 15 | `sonarjs/cognitive-complexity` |
| Lines per function | > 40 | > 80 | `max-lines-per-function` |
| Lines per file | > 250 | > 400 | `max-lines` |
| Parameters per function | > 3 | > 5 | `max-params` |
| Nesting depth | > 3 | > 4 | `max-depth` |

For each violation, identify the function name, line range, and the specific cause of complexity (deep nesting, long switch, multiple exit points, etc.). Suggest a concrete refactoring strategy (extract function, early return, strategy pattern, etc.).

#### B. Security Analysis

Check against OWASP Top 10 and constitution Security First principle:

- [ ] **Injection**: String concatenation in SQL/queries (must use Drizzle query builder or parameterized queries)
- [ ] **XSS**: Unescaped user input in templates or responses
- [ ] **Auth bypass**: Missing authentication middleware on protected routes
- [ ] **Authorization**: Missing or incorrect RBAC/permission checks (object-level, not just role-level)
- [ ] **Secrets in code**: Hardcoded API keys, tokens, passwords, connection strings (check string literals, template literals)
- [ ] **Secrets in logs**: PII, tokens, keys, or passwords passed to logger calls (Pino or console)
- [ ] **Input validation**: Missing Zod schema validation at system boundaries (API endpoints, agent submissions)
- [ ] **CORS**: Wildcard `*` origin in production config
- [ ] **Rate limiting**: Missing on write endpoints and auth endpoints
- [ ] **Cryptography**: Use of MD5, SHA1, or weak encryption; must use bcrypt (cost 12) for passwords, AES-256-GCM for envelope encryption
- [ ] **Error exposure**: Stack traces, internal paths, or debug info leaked in error responses
- [ ] **File upload**: Missing type/size/content validation

Flag any security issue as **P0 (Critical)** or **P1 (High)**.

#### C. Convention Compliance

Check against project-specific conventions from CLAUDE.md and constitution:

- [ ] **Response envelope**: API responses use `{ ok, data/error, requestId }` format
- [ ] **Pagination**: Uses cursor-based pagination (never offset-based)
- [ ] **Token accounting**: Token operations use double-entry with `balance_before`/`balance_after`
- [ ] **Concurrent operations**: Mission claiming and token operations use `SELECT FOR UPDATE`
- [ ] **Guardrail status**: Content carries `guardrail_status` enum (pending/approved/rejected/flagged)
- [ ] **Logging**: Uses Pino structured logging (not console.log/warn/error)
- [ ] **Error handling**: Async operations have proper try/catch or .catch(); errors propagate with context
- [ ] **TypeScript**: No `any` types, no `@ts-ignore`, no non-null assertions (``!``) without justification
- [ ] **Imports**: Consistent patterns (relative vs absolute, barrel exports)
- [ ] **Naming**: Functions/variables use camelCase, types/interfaces use PascalCase, constants use UPPER_SNAKE_CASE, files use kebab-case

#### D. Architecture & Boundaries

- [ ] **Layer violations**: Routes importing from other routes; services reaching into handler-layer code; direct DB access outside service/repository layer
- [ ] **Circular dependencies**: Module A imports B which imports A (check import chains)
- [ ] **Guardrail bypass**: Any code path that makes content visible to end users without passing through the 3-layer guardrail system
- [ ] **Framework coupling**: Agent-facing API code that assumes a specific agent framework (must be framework-agnostic)
- [ ] **Cross-package leaks**: Internal types/functions exported across package boundaries without being part of the public API

#### E. Testing Quality

For test files:
- [ ] **Coverage alignment**: Tests exist for the corresponding source file
- [ ] **Happy path only**: Tests only cover the success case without error/edge testing
- [ ] **Implementation coupling**: Tests assert on internal implementation details (mock call counts, private state) rather than behavior
- [ ] **Missing edge cases**: Null/undefined inputs, empty arrays, boundary values, concurrent access scenarios
- [ ] **Assertion quality**: Tests use specific assertions (not just "does not throw" or snapshot-only)
- [ ] **Test isolation**: Shared mutable state between tests; missing cleanup/teardown
- [ ] **Descriptive names**: Test names document expected behavior (``it("should reject submission when guardrail score < 0.4")``)


For source files:
- [ ] **Missing tests**: Source files with no corresponding test file (`.test.ts` or `.spec.ts`)
- [ ] **Coverage target compliance**: Check against constitution thresholds (guardrails >= 95%, tokens >= 90%, db >= 85%, api >= 80%, global >= 75%)

#### F. Performance Patterns

- [ ] **N+1 queries**: Database calls inside loops (should use `inArray()` or batch queries)
- [ ] **Missing indexes**: Queries filtering/sorting on columns without documented indexes
- [ ] **Memory accumulation**: Growing arrays/objects without bounds in long-running processes
- [ ] **Blocking operations**: Synchronous I/O, `fs.readFileSync`, or CPU-heavy computation on the event loop
- [ ] **Missing cleanup**: Event listeners, intervals, or subscriptions not cleaned up
- [ ] **Unnecessary re-renders** (React): Missing memoization for expensive computations, unstable references in dependency arrays
- [ ] **SELECT ***: Should use explicit column lists

#### G. Code Duplication

- Identify near-identical code blocks (>= 5 lines or >= 50 tokens of similarity) within the audit scope.
- For each duplicate group, identify all locations and suggest extraction into a shared utility or helper.
- Estimate duplication percentage across the audit scope.

### 4. Constitution Compliance Check

Cross-reference all findings against the 7 constitutional principles:

| Principle | Key Checks |
|-----------|------------|
| I. Constitutional AI for Good | No guardrail bypass; all content has guardrail_status; forbidden patterns are hard blocks |
| II. Security First | All items from Security Analysis pass |
| III. Test-Driven Quality Gates | Coverage targets met; no flaky test patterns; strict mode zero errors |
| IV. Verified Impact | Evidence pipeline uses multi-stage verification; token ops use double-entry |
| V. Human Agency | Mission claiming is atomic; max 3 active missions enforced; no penalty for declining |
| VI. Framework Agnostic | Standard envelope; cursor pagination; no framework-specific agent code |
| VII. Structured over Free-form | Zod validation on all submissions; self_audit field present; scoring formula correct |

Constitution violations are automatically **P0 (Critical)** if the principle is NON-NEGOTIABLE, or **P1 (High)** otherwise.

### 5. Severity Assignment

| Level | Label | Criteria | Example |
|-------|-------|----------|---------|
| **P0** | Critical | Security vulnerability, constitution NON-NEGOTIABLE violation, data loss risk | SQL injection, guardrail bypass, missing auth |
| **P1** | High | Logic error, missing validation, constitution violation, broken edge case | Missing Zod validation at API boundary, N+1 query |
| **P2** | Medium | Performance issue, missing test, suboptimal design, convention violation | Console.log instead of Pino, high complexity function |
| **P3** | Low | Style preference, minor cleanup, naming improvement | Inconsistent naming, minor duplication |

### 6. Generate Report

Output a structured Markdown report:

```
## Code Quality Audit Report

**Scope**: [files/directories audited]
**Files analyzed**: N
**Date**: YYYY-MM-DD

### Summary

| Severity | Count |
|----------|-------|
| P0 Critical | X |
| P1 High | Y |
| P2 Medium | Z |
| P3 Low | W |

**Overall Grade**: A / B / C / D / F

| Grade | Criteria |
|-------|----------|
| A | 0 P0, 0 P1, <= 3 P2 |
| B | 0 P0, <= 2 P1, <= 5 P2 |
| C | 0 P0, <= 5 P1, any P2 |
| D | Any P0 or > 5 P1 |
| F | Multiple P0 or constitution NON-NEGOTIABLE violations |

### Findings

[Findings grouped by file, then by severity (P0 first)]

Each finding:

**[ID] [Severity] [Category]**: One-line summary
**File**: `path/to/file.ts:42-58`
**Why**: Impact explanation
**Fix**: Concrete suggestion with code example

### Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Avg cyclomatic complexity | X | <= 8 | ✅/⚠️/❌ |
| Max cognitive complexity | X | <= 15 | ✅/⚠️/❌ |
| Files with tests | X/Y (Z%) | >= 80% | ✅/⚠️/❌ |
| Duplication estimate | X% | <= 3% | ✅/⚠️/❌ |
| Security findings | X | 0 | ✅/❌ |
| Constitution violations | X | 0 | ✅/❌ |

### What's Done Well

[2-3 specific observations about good patterns, clean architecture, thorough tests]
```

### 7. Recommendations

After the report, provide a prioritized action list:

1. **Must fix before merge** — P0 and P1 issues
2. **Should fix soon** — P2 issues, especially convention violations
3. **Consider for cleanup** — P3 issues, technical debt items
4. **Tooling suggestions** — ESLint rules, git hooks, or CI checks that could catch these automatically

## Operating Principles

- **Read-only**: Never modify files. Report findings only.
- **High signal, low noise**: Cap at 30 findings. Aggregate remainder in an overflow count. Focus on what matters.
- **Don't duplicate tooling**: Skip issues already caught by TypeScript strict mode, ESLint, or Prettier. Focus on semantic issues that require human/AI judgment.
- **Be specific**: Every finding must include file path, line number(s), and a concrete fix suggestion with code.
- **Be fair**: Include a "What's Done Well" section. Every audit should acknowledge good work.
- **Constitution is supreme**: Constitution violations are always the highest priority findings.
- **Quantify impact**: Where possible, quantify the risk ("this N+1 pattern will issue ~100 queries for a typical page load").
