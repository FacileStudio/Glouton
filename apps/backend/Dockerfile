FROM oven/bun:1.3.7-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/audit/package.json ./packages/audit/
COPY packages/auth/package.json ./packages/auth/
COPY packages/auth-shared/package.json ./packages/auth-shared/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/hunter/package.json ./packages/hunter/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/lead-sources/package.json ./packages/lead-sources/
COPY packages/logger/package.json ./packages/logger/
COPY packages/maps/package.json ./packages/maps/
COPY packages/smtp/package.json ./packages/smtp/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/

RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 backend

COPY --from=builder --chown=backend:nodejs /app/apps/backend ./apps/backend
COPY --from=builder --chown=backend:nodejs /app/packages ./packages
COPY --from=builder --chown=backend:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=backend:nodejs /app/package.json ./
COPY --from=builder --chown=backend:nodejs /app/turbo.json ./

USER backend

EXPOSE 3001

CMD ["bun", "run", "apps/backend/src/index.ts"]
