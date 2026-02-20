FROM oven/bun:1.3.7-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/auth-shared/package.json ./packages/auth-shared/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/hunter/package.json ./packages/hunter/
COPY packages/lead-sources/package.json ./packages/lead-sources/
COPY packages/logger/package.json ./packages/logger/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/trpc-client/package.json ./packages/trpc-client/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN bun install --no-save

FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/auth-shared/package.json ./packages/auth-shared/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/hunter/package.json ./packages/hunter/
COPY packages/lead-sources/package.json ./packages/lead-sources/
COPY packages/logger/package.json ./packages/logger/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/trpc-client/package.json ./packages/trpc-client/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install bun for the build
RUN npm install -g bun@1.3.7

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_ENV=production

RUN cd apps/frontend && bunx svelte-kit sync
RUN bun run build --filter=@repo/frontend

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 frontend

COPY --from=builder --chown=frontend:nodejs /app/apps/frontend/build ./apps/frontend/build
COPY --from=builder --chown=frontend:nodejs /app/apps/frontend/package.json ./apps/frontend/
COPY --from=builder --chown=frontend:nodejs /app/packages ./packages
COPY --from=builder --chown=frontend:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=frontend:nodejs /app/package.json ./

USER frontend

EXPOSE 3000

CMD ["bun", "run", "apps/frontend/build"]
