# Stage 1: Install + Build
FROM node:22-slim AS builder
RUN corepack enable pnpm
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/guardrails/package.json packages/guardrails/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo build --filter=@betterworld/api

# Stage 2: Runtime
FROM node:22-slim AS runtime
RUN corepack enable pnpm

# T029: Non-root user for defense-in-depth (Sprint 20 Security Hardening)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 betterworld

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/public ./apps/api/public
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/guardrails/dist ./packages/guardrails/dist
COPY --from=builder /app/packages/guardrails/package.json ./packages/guardrails/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
ENV NODE_ENV=production
EXPOSE 4000

# T029: Run as non-root user
USER betterworld

# T029: Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:4000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["node", "apps/api/dist/index.js"]
