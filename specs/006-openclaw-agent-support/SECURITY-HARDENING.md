# Security Hardening Summary — OpenClaw Agent Support

**Sprint**: 006 — OpenClaw Agent Connection Support
**Date**: 2026-02-09
**Status**: ✅ Complete (All fixes implemented and tested)

---

## Overview

Post-implementation code review identified 6 security and robustness issues in the skill file serving implementation. All issues have been addressed with multi-layer defenses, comprehensive testing, and documentation updates.

**Impact**: Critical path traversal vulnerability fixed. Production deployment robustness improved. Error observability enhanced.

---

## Issues Addressed

### P1: Path Traversal Vulnerability (Critical)

**Issue**: The skill file serving route used unsanitized filename parameters from URL, creating a path traversal vulnerability that could allow attackers to access arbitrary files on the server (e.g., `/skills/betterworld/../../../etc/passwd`).

**Fix**: Multi-layer defense implemented in [apps/api/src/routes/skills.routes.ts](../../apps/api/src/routes/skills.routes.ts):

1. **Input validation**: Reject any filename containing `/`, `\`, or `..` before file access
2. **Defense-in-depth**: Use `path.basename()` to strip any remaining path components
3. **Allowlist**: Only serve files explicitly listed in `ALLOWED_FILES` constant

```typescript
// Before (vulnerable)
const content = await readFile(join(SKILLS_DIR, filename), "utf-8");

// After (hardened)
if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
  return c.json({ ok: false, error: { code: "NOT_FOUND" as const } }, 404);
}
const contentType = ALLOWED_FILES[filename];
if (!contentType) {
  return c.json({ ok: false, error: { code: "NOT_FOUND" as const } }, 404);
}
const content = await readFile(join(SKILLS_DIR, basename(filename)), "utf-8");
```

**Testing**: 6 new integration tests covering various attack vectors (TC-037 through TC-040):
- `../` traversal
- URL-encoded `..%2F` traversal
- Forward slash in filename
- Backslash in filename
- Subdirectory access
- Double-dot only

---

### P2: Working Directory Dependency (Robustness)

**Issue**: `SKILLS_DIR` path computed using `process.cwd()`, which is evaluated at runtime and can vary depending on where the server is started. In Docker containers or non-standard deployments, this could result in incorrect file paths.

**Fix**: Use ESM `import.meta.url` for path resolution relative to source file:

```typescript
// Before (fragile)
const SKILLS_DIR = join(process.cwd(), "public", "skills", "betterworld");

// After (robust)
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = join(__dirname, "..", "..", "public", "skills", "betterworld");
```

**Benefit**: Path resolution now independent of working directory. Correct in all deployment environments (local dev, Docker, Fly.io).

---

### P2: Error Swallowing (Observability)

**Issue**: Catch block silently swallowed all file read errors, returning generic 404. This made it impossible to distinguish between expected (file not found) and unexpected errors (permission denied, disk I/O failure, filesystem corruption).

**Fix**: Distinguish ENOENT (expected) from other errors, log unexpected errors:

```typescript
// Before (blind)
catch {
  return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
}

// After (observable)
catch (error) {
  // Log unexpected errors (not ENOENT) for monitoring
  if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
    logger.error(
      { error, filename, requestId: c.get("requestId") },
      "Failed to read skill file"
    );
  }
  return c.json({ ok: false, error: { code: "NOT_FOUND" as const } }, 404);
}
```

**Benefit**: Production monitoring can now detect filesystem issues, permission problems, or potential attacks, while still maintaining information disclosure protection (always returns 404 to client).

---

### P2: Missing Security Tests (Coverage)

**Issue**: Integration tests validated happy path (200 responses, correct content) but did not test security boundary conditions (path traversal, malicious inputs).

**Fix**: Added 6 path traversal security tests in [apps/api/tests/integration/skills.test.ts](../../apps/api/tests/integration/skills.test.ts):

```typescript
describe("Security: Path traversal protection", () => {
  it("blocks path traversal with ../", async () => {
    const res = await app.request("/skills/betterworld/../../../etc/passwd");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });
  // ... 5 more test cases
});
```

**Coverage**: Now 22 skill route tests (was 16), including adversarial inputs.

---

### P3: Inconsistent Error Code Format (Code Quality)

**Issue**: Error responses used string literal `"NOT_FOUND"` instead of `as const` pattern used elsewhere in codebase (e.g., `error-handler.ts`).

**Fix**: All error codes now use `as const`:

```typescript
// Before
error: { code: "NOT_FOUND", message: "..." }

// After
error: { code: "NOT_FOUND" as const, message: "..." }
```

**Benefit**: Better TypeScript type inference, consistent with codebase conventions.

---

### P3: Inconsistent curl Flags (Documentation)

**Issue**: SKILL.md installation commands used inconsistent curl flags (`-sL` vs `-s`), creating copy-paste confusion.

**Fix**: All three commands now use `-sL` (silent + follow redirects):

```bash
# Before (inconsistent)
curl -sL https://betterworld.ai/skill.md > ~/.openclaw/skills/betterworld/SKILL.md
curl -sL https://betterworld.ai/heartbeat.md > ~/.openclaw/skills/betterworld/HEARTBEAT.md
curl -s https://betterworld.ai/skills/betterworld/package.json > ...  # ❌ Missing -L

# After (consistent)
curl -sL https://betterworld.ai/skill.md > ~/.openclaw/skills/betterworld/SKILL.md
curl -sL https://betterworld.ai/heartbeat.md > ~/.openclaw/skills/betterworld/HEARTBEAT.md
curl -sL https://betterworld.ai/skills/betterworld/package.json > ...  # ✅ Added -L
```

---

## Documentation Updates

1. **[tasks.md](tasks.md)**: Added Phase 8 with T013-T019 documenting all security hardening tasks
2. **[manual-test-guide.md](../../docs/tests/openclaw/manual-test-guide.md)**: Added TC-037 through TC-044 security test cases (section 3.1)
3. **[MEMORY.md](../../../.claude/projects/-Users-zhiruifeng-Workspace-Wind-Core-BetterWorld/memory/MEMORY.md)**: Updated with 4 new security lessons learned
4. **This document**: Created comprehensive summary for future reference

---

## Test Results

**Before**: 652 tests passing (16 skill route tests)
**After**: 668 tests passing (22 skill route tests, +6 security tests)

All tests pass:
- ✅ 354 guardrail tests (including 262 adversarial)
- ✅ 158 shared tests
- ✅ 156 API tests (22 skill routes, 6 path traversal security)
- ✅ E2E pipeline test
- ✅ k6 load test baseline

---

## Lessons Learned

1. **Static file serving security**: Always validate file paths for path traversal attacks. Use multi-layer defense: input validation + `basename()` + allowlist. Never trust URL params for file paths.

2. **Path resolution in ESM**: Use `fileURLToPath(import.meta.url)` + `dirname()` instead of `process.cwd()` to make paths independent of working directory. Critical for Docker deployments.

3. **Error logging without information disclosure**: In catch blocks for file operations, distinguish expected (ENOENT) from unexpected errors. Log unexpected errors for monitoring but always return generic 404 to avoid leaking filesystem information.

4. **TypeScript error code consistency**: Use `as const` assertion for error code literals to match codebase convention and get better type inference.

---

## Files Changed

- [apps/api/src/routes/skills.routes.ts](../../apps/api/src/routes/skills.routes.ts) — path traversal protection, robust path resolution, error logging
- [apps/api/tests/integration/skills.test.ts](../../apps/api/tests/integration/skills.test.ts) — 6 new security tests
- [apps/api/public/skills/betterworld/SKILL.md](../../apps/api/public/skills/betterworld/SKILL.md) — consistent curl flags
- [docs/tests/openclaw/manual-test-guide.md](../../docs/tests/openclaw/manual-test-guide.md) — security test cases added
- [specs/006-openclaw-agent-support/tasks.md](tasks.md) — Phase 8 documentation
- [.claude/memory/MEMORY.md](../../../.claude/projects/-Users-zhiruifeng-Workspace-Wind-Core-BetterWorld/memory/MEMORY.md) — lessons learned

---

## References

- **Original Implementation**: T004-T007 (Phase 4, User Story 3)
- **Code Review**: /review command on branch 006-openclaw-agent-support
- **Security Hardening Tasks**: T013-T019 (Phase 8)
- **OWASP Top 10 2021**: A01:2021 – Broken Access Control (path traversal)
- **CWE-22**: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')

---

## Checklist for Future Static File Serving

When implementing static file serving in Hono (or any web framework):

- [ ] **Path validation**: Reject filenames containing `/`, `\`, `..`
- [ ] **Defense-in-depth**: Use `path.basename()` before joining with base directory
- [ ] **Allowlist**: Explicitly list allowed files, return 404 for others
- [ ] **Path resolution**: Use `import.meta.url` + `fileURLToPath()` for ESM modules
- [ ] **Error handling**: Log unexpected errors (not ENOENT), return generic 404 to client
- [ ] **Security tests**: Write adversarial tests for path traversal (6+ attack vectors)
- [ ] **Manual testing**: Verify with curl commands including `../` and encoded variants
- [ ] **Documentation**: Document security considerations in manual test guide

---

**Status**: All issues resolved. Sprint 5 (006-openclaw-agent-support) complete with security hardening.
