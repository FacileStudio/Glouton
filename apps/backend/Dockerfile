FROM oven/bun:1.3.7-alpine AS base

FROM golang:1.26.11-alpine3.23 AS sonar
WORKDIR /src
COPY apps/backend/sonar/go.mod apps/backend/sonar/go.sum ./
RUN go mod download
RUN SONAR_VERSION=$(go list -m -f '{{.Version}}' github.com/FacileStudio/sonar | cut -c2-) \
    && CGO_ENABLED=0 GOFLAGS=-trimpath go build \
    -ldflags "-s -w -X github.com/FacileStudio/sonar/cmd.version=${SONAR_VERSION}" \
    -o /go/bin/sonar github.com/FacileStudio/sonar

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/audit/package.json ./packages/audit/
COPY packages/auth/package.json ./packages/auth/
COPY packages/auth-shared/package.json ./packages/auth-shared/
COPY packages/courrier/package.json ./packages/courrier/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/database/package.json ./packages/database/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/logger/package.json ./packages/logger/
COPY packages/maps/package.json ./packages/maps/
COPY packages/smtp/package.json ./packages/smtp/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/webhooks/package.json ./packages/webhooks/
COPY packages/websearch/package.json ./packages/websearch/

RUN bun install --no-save

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
ARG CACHE_BUST=1
COPY . .
COPY prisma.config.ts ./

ARG DATABASE_URL=postgresql://glouton:glouton@postgres:5432/glouton
ENV DATABASE_URL=$DATABASE_URL

RUN bun run --cwd packages/database prisma:generate

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 backend
RUN apk add --no-cache chromium \
    && mkdir -p /home/backend/.cache/sonar \
    && chown -R backend:nodejs /home/backend

ENV HOME=/home/backend
ENV SONAR_CONFIG=/etc/sonar.yml
ENV SONAR_FETCH_PUBLIC_ONLY=1
COPY --from=sonar /go/bin/sonar /usr/local/bin/sonar
COPY apps/backend/sonar.yml /etc/sonar.yml

COPY --from=builder --chown=backend:nodejs /app/apps/backend ./apps/backend
COPY --from=builder --chown=backend:nodejs /app/packages ./packages
COPY --from=builder --chown=backend:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=backend:nodejs /app/package.json ./
COPY --from=builder --chown=backend:nodejs /app/turbo.json ./
COPY --from=builder --chown=backend:nodejs /app/prisma.config.ts ./

USER backend

EXPOSE 3001

CMD ["sh", "-c", "bun run --cwd packages/database prisma:push --accept-data-loss && bun run apps/backend/src/index.ts"]
