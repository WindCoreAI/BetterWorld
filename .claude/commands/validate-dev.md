---
description: Run all builds and tests, auto-fix failures, and iterate until green. Mirrors the GitHub CI pipeline (lint, typecheck, test, build) to catch and resolve issues locally before push.
---

## User Input

```text
$ARGUMENTS
```

## Goal

Run the full local validation pipeline that mirrors GitHub CI (`ci.yml`) to catch failures before pushing. Execute each step sequentially. When a step fails, **read the error output, fix the issues, and re-run** until it passes (up to 3 attempts per step). Continue through all steps, then report a full summary including any fixes applied.

## Pipeline Steps

Run the following steps **in order**. Each step must pass before proceeding to the next. After each step, report its status (pass/fail) and elapsed time.

### Step 0: Dependency Check

Run `pnpm install --frozen-lockfile` to ensure lockfile is in sync and dependencies are installed. This mirrors what CI does first in every job. If this fails, the lockfile is out of sync — tell the user to run `pnpm install` and commit the updated lockfile.

### Step 1: Lint

Run `pnpm lint` (turborepo will run lint across all workspaces).

On failure: Report which workspace(s) and file(s) have lint errors. Show the specific errors.

### Step 2: Type Check

Run `pnpm typecheck` (turborepo will run `tsc --noEmit` across all workspaces).

On failure: Report the TypeScript errors with file paths and line numbers. Categorize by workspace.

### Step 3: Unit Tests

Run `pnpm test` (turborepo will run `vitest run` in workspaces that have tests).

On failure: Report which test suites and specific tests failed. Include the error messages.

### Step 4: Build

Run `pnpm build` (turborepo will run build across all workspaces).

On failure: Report build errors. Common causes include TypeScript errors not caught by `--noEmit` (e.g., declaration emit issues) or Next.js build errors (missing dependencies, invalid imports).

### Step 5: Integration Tests (conditional)

Parse `$ARGUMENTS` for flags:
- If `$ARGUMENTS` contains `--full` or `--integration` or `all`: Run integration tests.
- If `$ARGUMENTS` is empty or doesn't contain those flags: **Skip** integration tests and note they were skipped (they require local PostgreSQL + Redis).

If running: Execute `pnpm test:integration`.

On failure: Report which integration tests failed. Remind the user that integration tests require local PostgreSQL (port 5432) and Redis (port 6379) running.

## Reporting

After all steps complete (or on first failure), output a summary:

```
## Validation Results

| Step                | Status | Duration |
|---------------------|--------|----------|
| Dependencies        | ✅/❌  | Xs       |
| Lint                | ✅/❌  | Xs       |
| Type Check          | ✅/❌  | Xs       |
| Unit Tests          | ✅/❌  | Xs       |
| Build               | ✅/❌  | Xs       |
| Integration Tests   | ✅/❌/⏭️ | Xs    |

**Result**: ✅ All checks passed — safe to push / ❌ Failed at [step]
```

If all steps pass, confirm that the code matches what CI will check and is safe to push.

If a step fails:
1. Read and analyze the full failure output
2. Identify the root cause
3. **Fix the issue** — edit the source files to resolve the error
4. Re-run the failed step to verify the fix
5. If it passes, continue to the next step
6. If it still fails, read the new error output and iterate (max 3 attempts per step)
7. If a step still fails after 3 attempts, stop and report the remaining errors for manual resolution

## Fix Loop Rules

- **Read before fixing**: Always read the failing file(s) before making edits. Understand the context.
- **Minimal fixes**: Only change what's needed to resolve the specific error. Do not refactor or improve surrounding code.
- **Track all changes**: After all steps pass, include a summary of every file modified and what was changed.
- **Respect intent**: If a fix is ambiguous (multiple valid approaches), prefer the approach that matches existing codebase patterns.
- **Skip unfixable issues**: Some failures (missing env vars, Docker not running, lockfile drift) can't be auto-fixed. Report these clearly and move on or stop.
- **Max iterations**: If the total fix loop across all steps exceeds 10 iterations, stop and report remaining issues.

## Options

| Argument | Effect |
|----------|--------|
| (empty) | Run steps 0-4 (skip integration tests) |
| `--full` or `all` | Run all steps including integration tests |
| `--integration` | Run all steps including integration tests |
| `--skip-install` | Skip step 0 (dependency check) for faster runs |
| `--from <step>` | Start from a specific step (e.g., `--from test` to skip lint/typecheck) |

## Operating Principles

- **Mirror CI exactly**: Run the same commands CI runs. Do not add extra checks that CI doesn't perform.
- **Fix before proceeding**: When a step fails, fix the issues and verify the fix before moving to the next step.
- **Actionable output**: Every failure must include the specific error and the fix applied.
- **Auto-fix with care**: Read error output thoroughly, read the relevant source files, then apply minimal targeted fixes. Never blindly change code.
- **Respect turbo cache**: Turbo will skip unchanged workspaces. This is expected and correct.

## Final Report

After all steps pass (or max iterations reached), append a **Changes Made** section to the summary:

```
## Changes Made

| File | Change |
|------|--------|
| path/to/file.ts | Fixed unused import of `Foo` |
| path/to/other.ts | Added missing return type annotation |

Total files modified: N
```

If no fixes were needed, note "No fixes required — all checks passed on first run."
