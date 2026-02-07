> **DevOps & Infrastructure** — Part 2 of 4 | [Dev Environment](06a-devops-dev-environment.md) · [CI/CD Pipeline](06b-devops-cicd-pipeline.md) · [Infra & Monitoring](06c-devops-infra-and-monitoring.md) · [Security & Deployment](06d-devops-security-deploy-and-ops.md)

# DevOps & Infrastructure — CI/CD Pipeline

## 2. CI/CD Pipeline (GitHub Actions)

### 2.1 ci.yml -- Continuous Integration

Runs on every pull request and push to `main`. Executes lint, type checking, unit tests, and integration tests in parallel where possible.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9"
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  # ─────────────────────────────────────────────────────────────────────────
  # Job 1: Install dependencies (shared by all downstream jobs)
  # ─────────────────────────────────────────────────────────────────────────
  install:
    name: Install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Cache node_modules
        uses: actions/cache/save@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

  # ─────────────────────────────────────────────────────────────────────────
  # Job 2: Lint
  # ─────────────────────────────────────────────────────────────────────────
  lint:
    name: Lint
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies
        uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Run ESLint
        run: pnpm turbo lint

  # ─────────────────────────────────────────────────────────────────────────
  # Job 3: Type check
  # ─────────────────────────────────────────────────────────────────────────
  typecheck:
    name: Type Check
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies
        uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Run TypeScript type check
        run: pnpm turbo typecheck

  # ─────────────────────────────────────────────────────────────────────────
  # Job 4: Unit tests
  # ─────────────────────────────────────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies
        uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Run unit tests
        run: pnpm turbo test -- --coverage
        env:
          NODE_ENV: test

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: |
            apps/*/coverage
            packages/*/coverage
          retention-days: 7

  # ─────────────────────────────────────────────────────────────────────────
  # Job 5: Integration tests (requires PostgreSQL + Redis)
  # ─────────────────────────────────────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    needs: install
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: betterworld
          POSTGRES_PASSWORD: betterworld_test
          POSTGRES_DB: betterworld_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U betterworld"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies
        uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Run database migrations
        run: pnpm --filter db migrate
        env:
          DATABASE_URL: postgresql://betterworld:betterworld_test@localhost:5432/betterworld_test

      - name: Run integration tests
        run: pnpm turbo test:integration
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://betterworld:betterworld_test@localhost:5432/betterworld_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-jwt-secret
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}

  # ─────────────────────────────────────────────────────────────────────────
  # Job 6: Build verification
  # ─────────────────────────────────────────────────────────────────────────
  build:
    name: Build
    needs: [lint, typecheck, unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies
        uses: actions/cache/restore@v4
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Build all packages
        run: pnpm turbo build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: |
            apps/api/dist
            apps/web/.next
          retention-days: 1
```

### 2.2 deploy-staging.yml -- Staging Deployment

Auto-deploys to staging environment on every merge to `main`.

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [main]

concurrency:
  group: deploy-staging
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9"

jobs:
  deploy:
    name: Deploy Staging
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm turbo build
        env:
          NODE_ENV: production
          NEXT_PUBLIC_API_URL: ${{ vars.STAGING_API_URL }}

      # ── Fly.io deployment (API + Worker) ─────────────────────────────
      - name: Install Fly CLI
        run: curl -L https://fly.io/install.sh | sh

      - name: Deploy API to Fly.io
        run: fly deploy --config fly.toml --app betterworld-api-staging --strategy rolling --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Deploy Worker to Fly.io
        run: fly deploy --config fly.worker.toml --app betterworld-worker-staging --strategy rolling --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      # ── Vercel deployment (Web) ─────────────────────────────────────
      # Vercel auto-deploys apps/web on push to main via GitHub integration.
      # No manual step needed here — Vercel picks up the commit automatically.

      # Admin UI is served as part of the web app (route group in apps/web)

      # ── Run post-deploy migrations ────────────────────────────────────
      - name: Run database migrations
        run: fly ssh console --app betterworld-api-staging -C "pnpm --filter db migrate"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      # ── Health check ──────────────────────────────────────────────────
      - name: Wait for API health
        run: |
          for i in $(seq 1 30); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ vars.STAGING_API_URL }}/health" || true)
            if [ "$STATUS" = "200" ]; then
              echo "API is healthy"
              exit 0
            fi
            echo "Attempt $i: status=$STATUS, retrying in 10s..."
            sleep 10
          done
          echo "Health check failed after 30 attempts"
          exit 1

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v2
        with:
          webhook: ${{ secrets.SLACK_DEPLOY_WEBHOOK }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "Staging deploy ${{ job.status }}: ${{ github.event.head_commit.message }} by ${{ github.actor }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "${{ job.status == 'success' && ':white_check_mark:' || ':x:' }} *Staging Deploy*\n*Commit*: `${{ github.sha }}` — ${{ github.event.head_commit.message }}\n*Author*: ${{ github.actor }}\n*URL*: ${{ vars.STAGING_API_URL }}"
                  }
                }
              ]
            }
```

### 2.3 deploy-production.yml -- Production Deployment

Manual trigger with required approval gate.

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: "Type 'deploy-production' to confirm"
        required: true
      skip_migrations:
        description: "Skip database migrations"
        type: boolean
        default: false

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9"

jobs:
  # ─────────────────────────────────────────────────────────────────────────
  # Gate: Validate confirmation input
  # ─────────────────────────────────────────────────────────────────────────
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - name: Check confirmation
        if: github.event.inputs.confirm != 'deploy-production'
        run: |
          echo "::error::Confirmation mismatch. Expected 'deploy-production', got '${{ github.event.inputs.confirm }}'"
          exit 1

  # ─────────────────────────────────────────────────────────────────────────
  # Pre-deploy: Run full test suite against production build
  # ─────────────────────────────────────────────────────────────────────────
  pre-deploy-checks:
    name: Pre-deploy Checks
    needs: validate
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: betterworld
          POSTGRES_PASSWORD: betterworld_test
          POSTGRES_DB: betterworld_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U betterworld"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: pnpm --filter db migrate
        env:
          DATABASE_URL: postgresql://betterworld:betterworld_test@localhost:5432/betterworld_test

      - name: Build production
        run: pnpm turbo build
        env:
          NODE_ENV: production

      - name: Run all tests
        run: pnpm turbo test test:integration
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://betterworld:betterworld_test@localhost:5432/betterworld_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-jwt-secret

  # ─────────────────────────────────────────────────────────────────────────
  # Deploy with approval gate
  # ─────────────────────────────────────────────────────────────────────────
  deploy:
    name: Deploy Production
    needs: pre-deploy-checks
    runs-on: ubuntu-latest
    environment:
      name: production
      url: ${{ vars.PRODUCTION_URL }}
    # The 'production' environment requires manual approval in GitHub settings

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build production
        run: pnpm turbo build
        env:
          NODE_ENV: production
          NEXT_PUBLIC_API_URL: ${{ vars.PRODUCTION_API_URL }}

      # ── Snapshot database before migration ────────────────────────────
      # NOTE: Uses Supabase pg_dump via fly ssh. Alternative: use Supabase
      # dashboard's built-in backup feature or `supabase db dump`.
      - name: Create pre-deploy DB snapshot
        if: github.event.inputs.skip_migrations != 'true'
        run: |
          fly ssh console --app betterworld-api -C \
            "pg_dump \"$DATABASE_URL\" --format=custom --no-owner" \
            > /tmp/pre-deploy-snapshot.dump
          echo "Snapshot created at $(date -u +%Y%m%d_%H%M%S)"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

      # ── Run migrations ────────────────────────────────────────────────
      - name: Run database migrations
        if: github.event.inputs.skip_migrations != 'true'
        run: fly ssh console --app betterworld-api -C "pnpm --filter db migrate"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

      # ── Deploy services (rolling) ─────────────────────────────────────
      - name: Install Fly CLI
        run: curl -L https://fly.io/install.sh | sh

      - name: Deploy API
        run: fly deploy --config fly.toml --app betterworld-api --strategy rolling --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

      - name: Verify API health
        run: |
          sleep 30
          for i in $(seq 1 20); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ vars.PRODUCTION_API_URL }}/health" || true)
            if [ "$STATUS" = "200" ]; then
              echo "API healthy"
              break
            fi
            echo "Waiting... attempt $i"
            sleep 10
          done
          if [ "$STATUS" != "200" ]; then
            echo "::error::API health check failed. Consider rollback."
            exit 1
          fi

      - name: Deploy Worker
        run: fly deploy --config fly.worker.toml --app betterworld-worker --strategy rolling --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

      # Web (Next.js) is deployed to Vercel automatically via GitHub integration.
      # No manual deploy step needed — Vercel picks up the commit on push to main.

      # Admin UI is served as part of the web app (route group in apps/web)

      # ── Final health checks ───────────────────────────────────────────
      - name: Full health check
        run: |
          echo "Checking API..."
          curl -sf "${{ vars.PRODUCTION_API_URL }}/health" | jq .

          echo "Checking Web..."
          curl -sf -o /dev/null -w "%{http_code}" "${{ vars.PRODUCTION_URL }}"

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v2
        with:
          webhook: ${{ secrets.SLACK_DEPLOY_WEBHOOK }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "PRODUCTION deploy ${{ job.status }}: ${{ github.sha }} by ${{ github.actor }}"
            }
```

### 2.4 db-migrate.yml -- Database Migration Workflow

Standalone workflow for running migrations outside of deploys, with preview and rollback support.

```yaml
# .github/workflows/db-migrate.yml
name: Database Migration

on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        options:
          - staging
          - production
      action:
        description: "Migration action"
        required: true
        type: choice
        options:
          - migrate
          - generate
          - status
          - rollback
      confirm:
        description: "For production: type 'migrate-production' to confirm"
        required: false

jobs:
  migrate:
    name: Database Migration (${{ inputs.environment }})
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}

    steps:
      - name: Validate production confirmation
        if: inputs.environment == 'production' && inputs.action == 'migrate'
        run: |
          if [ "${{ inputs.confirm }}" != "migrate-production" ]; then
            echo "::error::Production migration requires confirmation. Type 'migrate-production'."
            exit 1
          fi

      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: "9"

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Fly CLI
        run: curl -L https://fly.io/install.sh | sh

      # ── Action: status ────────────────────────────────────────────────
      - name: Check migration status
        if: inputs.action == 'status'
        run: |
          fly ssh console --app betterworld-api-${{ inputs.environment }} -C \
            "pnpm --filter db migrate:status"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      # ── Action: generate ──────────────────────────────────────────────
      - name: Generate migration
        if: inputs.action == 'generate'
        run: pnpm --filter db generate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      # ── Action: migrate ───────────────────────────────────────────────
      - name: Create pre-migration snapshot
        if: inputs.action == 'migrate'
        run: |
          fly ssh console --app betterworld-api-${{ inputs.environment }} -C \
            "pg_dump \"$DATABASE_URL\" --format=custom --no-owner" \
            > /tmp/pre-migration.dump
          echo "Snapshot size: $(du -h /tmp/pre-migration.dump | cut -f1)"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Upload snapshot artifact
        if: inputs.action == 'migrate'
        uses: actions/upload-artifact@v4
        with:
          name: db-snapshot-${{ inputs.environment }}-${{ github.run_id }}
          path: /tmp/pre-migration.dump
          retention-days: 30

      - name: Run migration
        if: inputs.action == 'migrate'
        run: |
          fly ssh console --app betterworld-api-${{ inputs.environment }} -C \
            "pnpm --filter db migrate"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Verify migration
        if: inputs.action == 'migrate'
        run: |
          fly ssh console --app betterworld-api-${{ inputs.environment }} -C \
            "pnpm --filter db migrate:status"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      # ── Action: rollback ──────────────────────────────────────────────
      - name: Rollback migration
        if: inputs.action == 'rollback'
        run: |
          echo "::warning::Manual rollback requires restoring from the most recent snapshot."
          echo "Download the snapshot artifact and restore with:"
          echo "  pg_restore --clean --no-owner -d \$DATABASE_URL snapshot.dump"
          echo ""
          echo "Automated rollback is intentionally not supported to prevent data loss."
          echo "See: docs/engineering/06c-devops-infra-and-monitoring.md#42-rollback-procedure"
```

### 2.5 Pipeline Caching Strategy

> **Note**: `setup-node` caches the pnpm store (global package cache); `actions/cache` caches `node_modules` directories for faster installs. Both are needed: the pnpm store avoids re-downloading packages, while `node_modules` cache avoids re-linking them.

| Cache Target | Key | Restoration Strategy | Savings |
|-------------|-----|---------------------|---------|
| pnpm store | `pnpm-store-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}` | Built into `actions/setup-node` with `cache: pnpm` | ~60s per job |
| `node_modules` | `deps-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}` | Explicit save/restore. Shared across all jobs in a run. | ~30s per job |
| Turborepo remote cache | `TURBO_TOKEN` + `TURBO_TEAM` env vars | Automatic via Vercel remote cache or self-hosted | ~40% build time |
| Docker layers | `docker/build-push-action` with `cache-from: type=gha` | GitHub Actions cache backend | ~50% image build time |
| Next.js cache | `.next/cache` in build artifacts | Uploaded as artifact, restored in deploy jobs | ~20s per build |

### 2.6 Required GitHub Secrets

| Secret | Purpose | How to Get |
|--------|---------|-----------|
| `TURBO_TOKEN` | Turborepo remote cache | Generate at vercel.com → Settings → Tokens |
| `ANTHROPIC_API_KEY` | Production guardrail classifier | console.anthropic.com → API Keys |
| `ANTHROPIC_API_KEY_TEST` | Test suite guardrail calls (lower quota OK) | Same as above, separate key |
| `FLY_API_TOKEN` | Staging deployment (Fly.io) | Fly.io dashboard → Account → Access Tokens |
| `FLY_API_TOKEN_PROD` | Production deployment (restricted access) | Same as above, separate token |
| `SENTRY_AUTH_TOKEN` | Error tracking release uploads | sentry.io → Settings → Auth Tokens |
| `SENTRY_DSN` | Error tracking DSN | sentry.io → Project → Client Keys |

---
