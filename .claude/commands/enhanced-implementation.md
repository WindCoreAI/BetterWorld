---
description: Full implementation pipeline — executes all tasks, then iterates through validate → review → code-quality cycles until the feature is production-ready. Use after speckit specify, plan, and tasks are complete.
context: fork
handoffs:
  - label: Finish Branch
    agent: finishing-a-development-branch
    prompt: All phases complete — help finalize the branch (merge, PR, or cleanup)
  - label: Re-Review
    agent: review
    prompt: Run a second-opinion code review on the final branch diff
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Argument Parsing

Parse `$ARGUMENTS` before starting. Flags modify which phases run:

| Argument | Effect |
|----------|--------|
| (empty) | Run all 8 phases |
| `--fast` | Collapse validation to a single pass after all fixes (skip Phases 4 and 6) |
| `--skip-review` | Skip Phase 3 (code review) and its follow-up validation (Phase 4) |
| `--skip-quality` | Skip Phase 5 (quality audit) and its follow-up validation (Phase 6) |
| `--skip-install` | Skip `pnpm install --frozen-lockfile` in validation phases |
| `--from <phase>` | Resume from a specific phase number (1-8). Useful after manual intervention. |

Flags can be combined: `--fast --skip-quality` runs Phases 1, 2, 3, 7, 8.

Any unrecognized text in `$ARGUMENTS` is treated as additional context for Phase 1 (e.g., sprint name, specific focus areas).

## Goal

Execute a complete, multi-phase implementation pipeline that takes a feature from tasks.md to production-ready code. This skill orchestrates implementation, validation, review, and quality assurance in sequence, resolving all issues between phases, so the final output is validated, reviewed, quality-audited, and documented.

## Prerequisites

Before starting, verify that the speckit pipeline has been completed:
1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` from repo root
2. Parse the JSON output for `FEATURE_DIR` and `AVAILABLE_DOCS`
3. If the script exits with an error, **STOP** and tell the user which speckit command to run first

## Pipeline Overview

```
Phase 1: Implementation     → Execute all tasks from tasks.md
Phase 2: Validate + Fix     → Lint, typecheck, test, build — fix all failures
Phase 3: Review + Fix       → Code review — resolve all identified issues        [skippable]
Phase 4: Validate + Fix     → Re-validate after review fixes                     [conditional]
Phase 5: Quality Audit + Fix → Code quality audit — resolve all identified issues [skippable]
Phase 6: Validate + Fix     → Re-validate after quality fixes                    [conditional]
Phase 7: Completeness       → Evaluate feature vs spec, fix gaps, update docs
Phase 8: Summary            → Generate final implementation summary
```

## Progress Visibility (MANDATORY)

The user MUST be able to see real-time progress throughout the entire pipeline. This is non-negotiable.

### TodoWrite Usage

1. **At pipeline start**: Parse tasks.md and create a `TodoWrite` list containing:
   - One item per task from tasks.md (use the task title/description as content)
   - One item per pipeline phase (Phase 2: Validate, Phase 3: Review, etc.)
   - All items start as `pending`

2. **During execution**: Update the `TodoWrite` list in real-time:
   - Mark the current task/phase as `in_progress` BEFORE starting work on it
   - Mark it as `completed` IMMEDIATELY after finishing (not batched)
   - Only ONE item should be `in_progress` at any time

3. **Between phases**: Output a brief text message summarizing what just completed and what's next. Example:
   ```
   ✓ Phase 1 complete: 12/12 tasks implemented. Moving to Phase 2 (Validate + Fix)...
   ```

### tasks.md Updates

**CRITICAL**: Update tasks.md IMMEDIATELY after completing each individual task — mark it `[X]` right away. Do NOT wait until all tasks are done to batch-update. If the session is interrupted mid-way, tasks.md must accurately reflect which tasks were completed.

---

## Execution

### Phase 1: Implementation

Execute the full implementation workflow:

1. **Initialize progress tracking**:
   - Parse tasks.md and create the `TodoWrite` list (see Progress Visibility above)
   - Output: `Starting Phase 1: Implementation (N tasks across M phases)`

2. **Read the implementation skill**: Read `.claude/commands/speckit.implement.md` and follow its complete process:
   - Check checklists status (if checklists/ exists)
   - Load implementation context (tasks.md, plan.md, data-model.md, contracts/, research.md, quickstart.md)
   - Verify project setup (ignore files for detected tech stack)
   - Parse task phases and dependencies
   - Execute tasks phase-by-phase (setup → tests → core → integration → polish)
   - Respect TDD approach: test tasks before implementation tasks
   - Track progress and handle errors per task

3. **Per-task cycle** (repeat for every task):
   - Update `TodoWrite`: mark current task `in_progress`
   - Execute the task
   - Update `tasks.md`: mark the task `[X]` immediately
   - Update `TodoWrite`: mark current task `completed`
   - Output brief status: `✓ Task X.Y done: [description]. (N/M tasks complete)`

4. **Subagent parallelism**: When tasks.md contains independent tasks marked `[P]` (parallel), consider using the Task tool to dispatch independent implementation tasks to subagents. This is especially valuable when 3+ tasks have no shared file dependencies. Each subagent should receive the full context (plan.md, relevant contracts, target file paths). Review each subagent's output before marking the task complete in both tasks.md and TodoWrite.

5. After all tasks are executed, verify:
   - All tasks in tasks.md are marked `[X]`
   - No tasks were skipped or left incomplete
   - If any tasks failed, report them and ask the user whether to continue or stop

**Checkpoint**: Output task completion summary and update TodoWrite before proceeding.

---

### Phase 2: Validate + Fix (Post-Implementation)

Update `TodoWrite`: mark "Phase 2: Validate + Fix" as `in_progress`. Output: `Starting Phase 2: Validate + Fix...`

Run the full validation pipeline and fix all failures:

1. **Read the validation skill**: Read `.claude/commands/validate-dev.md` and follow its complete process:
   - Step 0: `pnpm install --frozen-lockfile` (skip if `--skip-install` flag)
   - Step 1: `pnpm lint` — fix lint errors
   - Step 2: `pnpm typecheck` — fix TypeScript errors
   - Step 3: `pnpm test` — fix failing tests
   - Step 4: `pnpm build` — fix build errors

2. For each failing step:
   - Read the error output thoroughly
   - Read the relevant source files for context
   - Apply minimal, targeted fixes
   - Re-run the step to verify the fix (max 3 attempts per step)

3. After all steps pass, report the validation summary table and any files modified.

4. **Track modified files**: Record all files modified during validation fixes. This set is used by Phase 4/6 to determine if re-validation is needed.

**Checkpoint**: Output validation results. Update `TodoWrite`: mark Phase 2 `completed`. All validation steps must pass before proceeding.

---

### Phase 3: Code Review + Fix

**Skip condition**: Skip this phase entirely if `--skip-review` flag is set.

Update `TodoWrite`: mark "Phase 3: Code Review" as `in_progress`. Output: `Starting Phase 3: Code Review + Fix...`

Perform a thorough code review and resolve all identified issues:

1. **Read the review skill**: Read `.claude/commands/review.md` and follow its process with scope `branch`:
   - Run all 6 review passes: Security → Correctness → Performance → API Design → Testing → Maintainability
   - Generate findings using Conventional Comments format with severity levels

2. **Resolve all findings**:
   - **P0 (Critical)**: Fix immediately — these are blockers
   - **P1 (High)**: Fix immediately — logic errors, missing validation
   - **P2 (Medium)**: Fix — performance issues, missing tests, convention drift
   - **P3 (Low)**: Fix if straightforward, skip if purely cosmetic preference
   - Apply fixes with minimal changes — do not refactor beyond what the finding requires

3. After resolving findings, re-run the review on the changed files to verify no new issues were introduced. If new issues appear, fix them (max 2 iterations).

4. **Track modified files**: Record all files modified during review fixes.

**Checkpoint**: Output review verdict. Update `TodoWrite`: mark Phase 3 `completed`. Should be "Approved" or "Approved with Comments" — no P0/P1 remaining.

---

### Phase 4: Validate + Fix (Post-Review)

**Skip condition**: Skip this phase if ANY of these are true:
- `--skip-review` flag is set (Phase 3 was skipped, so no changes to validate)
- `--fast` flag is set (defer validation to end)
- No files were modified during Phase 3

Run the full validation pipeline again after review fixes:

1. Follow the same process as Phase 2 (read `.claude/commands/validate-dev.md`)
2. This catches any regressions introduced by review fixes
3. Fix any failures using the same approach (read → fix → verify, max 3 attempts per step)

**Checkpoint**: Output validation results. Update `TodoWrite`: mark Phase 4 `completed`. All validation steps must pass before proceeding.

---

### Phase 5: Code Quality Audit + Fix

**Skip condition**: Skip this phase entirely if `--skip-quality` flag is set.

Update `TodoWrite`: mark "Phase 5: Quality Audit" as `in_progress`. Output: `Starting Phase 5: Code Quality Audit + Fix...`

Perform a comprehensive quality audit and resolve all identified issues:

1. **Read the quality skill**: Read `.claude/commands/code-quality.md` and follow its process with scope `branch`:
   - Run all analysis passes: Complexity → Security → Conventions → Architecture → Testing → Performance → Duplication
   - Check constitution compliance (all 7 principles)
   - Generate structured report with severity-ranked findings

2. **Resolve all findings**:
   - **P0 (Critical)**: Fix immediately — security vulnerabilities, constitution violations
   - **P1 (High)**: Fix immediately — logic errors, architecture violations
   - **P2 (Medium)**: Fix — complexity reduction, missing tests, convention alignment
   - **P3 (Low)**: Fix if straightforward, skip if purely cosmetic
   - Apply fixes following existing codebase patterns

3. After resolving findings, verify the overall grade improved (target: A or B).

4. **Track modified files**: Record all files modified during quality fixes.

**Checkpoint**: Output quality grade. Update `TodoWrite`: mark Phase 5 `completed`. Must be B or above to proceed. If D or F, iterate fixes (max 2 additional rounds).

---

### Phase 6: Validate + Fix (Post-Quality)

**Skip condition**: Skip this phase if ANY of these are true:
- `--skip-quality` flag is set (Phase 5 was skipped, so no changes to validate)
- `--fast` flag is set (defer validation to end)
- No files were modified during Phase 5

Run the full validation pipeline again after quality fixes:

1. Follow the same process as Phase 2 (read `.claude/commands/validate-dev.md`)
2. This catches any regressions introduced by quality fixes
3. Fix any failures using the same approach

**Checkpoint**: Output validation results. Update `TodoWrite`: mark Phase 6 `completed`. All validation steps must pass before proceeding.

---

### Phase 6b: Final Validation (fast mode only)

**Run condition**: Only run this phase if `--fast` flag is set AND files were modified in Phase 3 or Phase 5.

Run one final validation pass to catch any regressions from all accumulated fixes:

1. Follow the same process as Phase 2 (read `.claude/commands/validate-dev.md`)
2. Fix any failures (max 3 attempts per step)

**Checkpoint**: All validation steps must pass before proceeding.

---

### Phase 7: Feature Completeness Evaluation

Update `TodoWrite`: mark "Phase 7: Completeness" as `in_progress`. Output: `Starting Phase 7: Feature Completeness Evaluation...`

Evaluate whether the implemented feature fully satisfies the original specification:

1. **Load the spec**: Read spec.md from FEATURE_DIR
2. **Load the plan**: Read plan.md for architecture and design decisions
3. **Cross-reference**: For each requirement in the spec:
   - Verify it was implemented (check the relevant code files)
   - Verify it has test coverage
   - Verify it matches the specified behavior
   - Mark as: ✅ Complete, ⚠️ Partial, ❌ Missing

4. **Generate completeness report**:

   ```
   ## Feature Completeness

   | Requirement | Status | Evidence |
   |-------------|--------|----------|
   | [req 1]     | ✅/⚠️/❌ | [file:line or test name] |
   | ...         | ...    | ...      |

   **Completeness**: X/Y requirements met (Z%)
   ```

5. **If incomplete** (any ⚠️ or ❌):
   - Implement missing or partial requirements
   - Add missing tests
   - Run the validation process (read `.claude/commands/validate-dev.md`) one more time to ensure everything passes
   - Re-evaluate completeness

6. **Update documentation** (required — documentation is part of the deliverable):

   **Always update:**
   - `tasks.md` — **verify and fix**: re-read the file, ensure EVERY completed task is marked `[X]`. If any were missed during Phase 1 (e.g., due to subagent parallelism or error recovery), mark them now. This is a hard requirement — tasks.md must be an accurate record of what was done.
   - `CLAUDE.md` — update the sprint status section (sprint name, deliverables, test count, date)

   **Update only if affected by the implementation:**
   - `docs/INDEX.md` — only if new documentation files were created
   - `docs/roadmap/` files — only if sprint progress or phase status changed
   - API docs — only if public API endpoints were added or changed
   - `spec.md` — only if a requirement was intentionally adjusted during implementation (document why)

   **Do NOT update** docs speculatively or for cosmetic reasons.

**Checkpoint**: Output completeness report. Update `TodoWrite`: mark Phase 7 `completed`. All requirements must be ✅ Complete.

---

### Phase 8: Final Summary

Update `TodoWrite`: mark "Phase 8: Summary" as `in_progress`. Output: `Starting Phase 8: Generating final summary...`

Generate a comprehensive implementation summary:

```
## Implementation Summary

### Feature
[Feature name from spec.md]

### Branch
[Current git branch name]

### Phases Executed
[List which phases ran and which were skipped, with reasons]

### Deliverables
- [List of key deliverables: routes, components, schemas, tests, etc.]

### Architecture
- [Key architectural decisions made during implementation]
- [New patterns or conventions introduced]

### Files Changed
| Category | Files | Lines Added | Lines Removed |
|----------|-------|-------------|---------------|
| Backend  | X     | +Y          | -Z            |
| Frontend | X     | +Y          | -Z            |
| Schema   | X     | +Y          | -Z            |
| Tests    | X     | +Y          | -Z            |
| Docs     | X     | +Y          | -Z            |
| **Total**| **X** | **+Y**      | **-Z**        |

### Test Results
- Total tests: N (X new)
- All passing: ✅
- Coverage: [per-package if available]

### Quality
- Review verdict: [Approved / Approved with Comments / Skipped]
- Quality grade: [A / B / Skipped]
- Constitution compliance: ✅

### Documentation Updated
- [List only docs that were actually updated, with brief description of changes]

### Known Limitations
- [Any intentional limitations, deferred items, or technical debt]

### Next Steps
- [Suggested follow-up work, if any]
```

Run `git diff --stat main...HEAD` and `git log --oneline main...HEAD` to gather accurate file/commit statistics.

For categories in the Files Changed table, classify by path:
- Backend: `apps/api/src/` (excluding `__tests__/`)
- Frontend: `apps/web/`
- Schema: `packages/db/`, `packages/shared/src/schemas/`, `packages/shared/src/types/`
- Tests: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`
- Docs: `docs/`, `CLAUDE.md`, `README.md`, `*.md` in specs/

If a category has 0 files, omit it from the table.

## Operating Principles

- **Progress is visible**: The user must always be able to see what's happening. Use `TodoWrite` for real-time task tracking, and output text messages at every phase transition and task completion. Silent long-running work is unacceptable — if you're working, the user should see evidence of it.
- **tasks.md is the source of truth**: Update tasks.md immediately after each task completes (mark `[X]`). Never batch these updates. If the session crashes or is interrupted, tasks.md must accurately reflect what was actually done. Verify in Phase 7 that no updates were missed.
- **Phase gates**: Each checkpoint must pass before proceeding to the next phase. Do not skip phases unless a skip condition is met.
- **Fix, don't paper over**: When issues are found, fix the root cause — not the symptom. No `@ts-ignore`, no `eslint-disable`, no empty catch blocks to silence errors.
- **Minimal fixes**: Only change what's needed to resolve the specific issue. Do not refactor, add features, or "improve" surrounding code.
- **Track all changes**: Maintain a running list of every file modified across all phases. Use this for conditional validation (Phases 4/6) and the final summary (Phase 8).
- **Documentation is part of the deliverable**: Docs must be updated in Phase 7 — this is not optional. But only update docs that are actually affected.
- **Max total iterations**: If the combined fix loops across all phases exceed 20 iterations, stop and report remaining issues for manual resolution.
- **Respect existing patterns**: All fixes must follow existing codebase conventions. Read surrounding code before editing.
- **Constitution is supreme**: Constitution violations are always the highest priority, in any phase.
- **Read skill files, don't guess**: When a phase references another skill (validate-dev, review, code-quality), always read the `.claude/commands/<skill>.md` file for its full instructions. Never rely on memory of what the skill does — it may have been updated.
