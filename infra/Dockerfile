# Single-stage build — pnpm install creates proper workspace symlinks for tsx
FROM node:22-slim
RUN corepack enable pnpm

# T029: Non-root user for defense-in-depth (Sprint 20 Security Hardening)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 betterworld

WORKDIR /app

# Install dependencies first (Docker layer cache on lockfile changes only)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/guardrails/package.json packages/guardrails/
RUN pnpm install --frozen-lockfile

# Copy source and config files
COPY apps/api/src apps/api/src
COPY apps/api/public apps/api/public
COPY apps/api/tsconfig.json apps/api/
COPY packages/shared/src packages/shared/src
COPY packages/db/src packages/db/src
COPY packages/guardrails/src packages/guardrails/src
COPY tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 4000

# T029: Run as non-root user
USER betterworld

# T029: Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:4000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["./apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
