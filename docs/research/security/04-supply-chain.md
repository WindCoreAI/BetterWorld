# Supply Chain Security Research

> Industry practices for JavaScript/Node.js supply chain security.
> Sources: PackageGate disclosure (Jan 2026), Shai-Hulud attack (Sep 2025), npm security advisories, OWASP.

## Shai-Hulud Attack (September 2025) — Critical Incident

The most devastating npm supply chain attack in history. Attackers hijacked **18 popular npm packages** (including `debug` and `chalk`) through social engineering of maintainer 2FA credentials. A self-replicating worm compromised **796 packages with 132 million monthly downloads**.

- **CISA issued a formal advisory** for the widespread compromise
- **PhantomRaven campaign** (October 2025): Used Registry Dependency Deception (RDD) to hide malicious code, gaining 86,000+ downloads
- npm introduced "Shai-Hulud" defenses in response, but PackageGate later showed gaps in these defenses

**BetterWorld action**: Verify versions of `debug`, `chalk`, and other affected packages in `pnpm-lock.yaml` against known-clean versions.

**References**:
- [CISA Advisory](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [Snyk Analysis](https://snyk.io/articles/npm-security-best-practices-shai-hulud-attack/)
- [pnpm Protection Guide](https://pnpm.io/blog/2025/12/05/newsroom-npm-supply-chain-security)

## PackageGate (January 2026) — Critical

Six zero-day vulnerabilities disclosed affecting npm, pnpm, vlt, and Bun. This is the most significant JavaScript supply chain security event since the ua-parser-js incident.

### Vulnerabilities Affecting pnpm (BetterWorld's package manager)

| CVE | Description | Status |
|-----|-------------|--------|
| CVE-2025-69263 | Lockfile integrity bypass — pnpm records git/HTTP dependencies without integrity hashes, allowing remote server to serve different code on each install | **PATCHED** |
| CVE-2025-69264 | Script execution bypass — similar to npm's .npmrc injection vector | **PATCHED** |

### Key Findings

1. **Lockfile as threat model**: Lockfiles are now part of the threat model. A toothless lockfile (one without integrity hashes for certain dependency types) allows silent code substitution
2. **Git dependency danger**: A malicious git dependency can ship a fake `.npmrc` that replaces the git binary with attacker code — RCE even with `--ignore-scripts`
3. **PhantomRaven campaign**: Used Registry Dependency Deception (RDD) to hide malicious code from every security scanner on npm, gaining 86,000+ downloads

### BetterWorld Impact Assessment

| Vector | Risk Level | Current Mitigation |
|--------|-----------|-------------------|
| pnpm lockfile integrity | Medium | `--frozen-lockfile` in CI (prevents lockfile changes) |
| Git dependencies | Low | No git:// dependencies in package.json |
| Registry dependency deception | Medium | `pnpm audit` catches known bad packages |
| Transitive dependency poisoning | Medium | No specific mitigation beyond audit |

## High-Priority Gaps

### 1. pnpm Version Must Be Current

**Action**: Verify pnpm version >= 9.15.4 includes CVE-2025-69263/69264 patches.

```bash
# Check current pnpm version
pnpm --version

# Check for pnpm security advisories
pnpm audit --prod --audit-level=high
```

**Recommendation**: Pin pnpm version in `packageManager` field of root `package.json` and in CI.

### 2. No Dependency Provenance Verification

**Risk**: npm packages can be published by anyone who controls the package name. No verification that the published code matches the source repository.

**Industry standard**: npm provenance (SLSA Level 3) — cryptographic attestation linking published package to its source commit and build environment.

**Recommendations**:
1. **Enable `npm audit signatures`**: Verify package provenance signatures in CI
2. **Socket.dev integration**: Real-time supply chain threat detection (detects typosquatting, maintainer account takeover, hidden install scripts)
3. **Lockfile-lint**: Validate that all dependencies resolve to expected registries (no registry URL poisoning)
4. **pin-github-actions**: Pin all GitHub Actions by SHA, not tag (prevents supply chain attacks via action tampering)

### 3. No Software Bill of Materials (SBOM)

**Risk**: Cannot quickly determine if a newly disclosed vulnerability affects BetterWorld's dependency tree.

**Industry standard**: Generate SBOM (SPDX or CycloneDX format) on every build.

**Recommendations**:
1. **Generate SBOM in CI**: `npx @cyclonedx/cyclonedx-npm --output-file sbom.json`
2. **Archive SBOMs**: Store with each deployment for incident response
3. **SBOM-based vulnerability scanning**: Cross-reference with OSV.dev or Snyk DB

### 4. GitHub Actions Security

**Current state**: GitHub Actions used for CI/CD but no explicit action pinning strategy.

**Risks**:
- Unpinned actions (using `@v3` instead of SHA) vulnerable to tag tampering
- Actions with `contents: write` or `packages: write` permissions could be abused
- Self-hosted runners (if ever used) inherit environment secrets

**Recommendations**:
1. **Pin all actions by SHA**: `uses: actions/checkout@abc123` not `@v4`
2. **Minimum permissions**: Use `permissions: read-all` at workflow level, grant per-job
3. **Dependabot for actions**: Enable Dependabot security updates for GitHub Actions
4. **No self-hosted runners**: Use GitHub-hosted runners only (ephemeral environments)

## Dependency Hygiene Checklist

| Practice | Status | Recommendation |
|----------|--------|---------------|
| `--frozen-lockfile` in CI | YES | Continue |
| `pnpm audit` in CI | YES | Expand to `pnpm audit --json` + parse for automated blocking |
| Dependabot enabled | PLANNED | Enable with security-updates-only (not version updates) |
| Action pinning by SHA | NO | Implement immediately |
| SBOM generation | NO | Add to CI pipeline |
| Socket.dev | NO | Evaluate for real-time supply chain monitoring |
| Lockfile-lint | NO | Add to CI to prevent registry URL poisoning |
| Provenance verification | NO | Enable when pnpm supports `npm audit signatures` equivalent |

## Monitoring & Response

### If a supply chain incident occurs:

1. **Identify**: Check if affected package is in `pnpm-lock.yaml`
2. **Assess**: Determine if vulnerable code path is reachable
3. **Contain**: Pin to last-known-good version in lockfile
4. **Remediate**: Update or replace affected dependency
5. **Verify**: Re-run full test suite + audit

### Automated monitoring:

- GitHub security advisories (automatic via Dependabot)
- npm advisory feed (`pnpm audit` in CI)
- Socket.dev alerts (recommended)

## References

- [PackageGate: 6 Zero-Days in JS Package Managers](https://www.koi.ai/blog/packagegate-6-zero-days-in-js-package-managers-but-npm-wont-act)
- [npm Supply Chain Attacks 2026 Defense Guide](https://bastion.tech/blog/npm-supply-chain-attacks-2026-saas-security-guide)
- [OWASP LLM03:2025 Supply Chain](https://genai.owasp.org/llmrisk/llm03-supply-chain/)
- [SLSA Framework](https://slsa.dev/)
- [Socket.dev](https://socket.dev/)
