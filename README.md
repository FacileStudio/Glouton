# Glouton - Lead Generation System

Production-ready lead generation platform with automated web scraping, intelligent lead scoring, and real-time progress tracking. Built with tRPC, SvelteKit, and BullMQ for enterprise-scale performance.

## Features

- 🔍 **Automated Lead Extraction** - Crawl websites and extract contact information
- 🎯 **Smart Lead Scoring** - Automatic classification (HOT/WARM/COLD) based on quality metrics
- 🚀 **Real-time Progress** - Live updates on hunt status with 5-second polling
- 💼 **Technology Detection** - Identify tech stacks (React, Vue, WordPress, etc.)
- 📊 **Analytics Dashboard** - Comprehensive statistics and insights
- 🔒 **Enterprise Security** - SSRF protection, input validation, rate limiting
- ⚡ **Background Processing** - Async job queue with Redis and BullMQ
- 🎨 **Professional UI** - Modern, responsive interface with Quick Start templates
- 📱 **Quick Start Templates** - Pre-configured searches for common use cases
- 🔐 **JWT Authentication** - Secure user authentication and authorization
- 📈 **Hunt Session Tracking** - Monitor and analyze extraction jobs

## Quick Start

### Prerequisites

- **Bun** (latest version)
- **PostgreSQL** (running locally or remote)
- **Redis** (for job queue)

### Installation

```bash
# Clone repository
git clone https://github.com/FacileStudio/Glouton.git
cd Glouton

# Install dependencies
bun install

# Set up database and schema
bun run dev:db:setup

# Start development servers
bun run dev
```

### Environment Setup

Copy `.env.example` to `.env` in `apps/backend/`:

```bash
# Database
DATABASE_URL=postgresql://user@localhost:5432/myapp

# Redis (Job Queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# JWT Authentication
ENCRYPTION_SECRET=your-secret-key-min-32-chars

# Server Config
PORT=3001
FRONTEND_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

### Usage

1. Navigate to `http://localhost:3000/app/leads`
2. Click the search input to see Quick Start templates
3. Select a template or enter a custom URL
4. Adjust the depth level (1-10)
5. Click "START SEARCH"
6. Watch leads appear in real-time!

### Quick Start Templates

- **Tech News & Startups** - TechCrunch, tech blogs (Depth: 7)
- **Product Launches** - ProductHunt, startup directories (Depth: 6)
- **Trending Developers** - GitHub trending (Depth: 5)
- **Content Creators** - Medium, blogging platforms (Depth: 6)
- **Design Agencies** - Dribbble, design portfolios (Depth: 7)
- **Development Firms** - Clutch, agency listings (Depth: 8)

## Architecture

### Monorepo Structure

```
.
├── apps/
│   ├── backend/          # Hono server (port 3001)
│   ├── frontend/         # SvelteKit landing page (port 5173)
│   ├── backoffice/       # SvelteKit admin panel (port 3002)
│   └── mobile/           # Expo React Native app
│
└── packages/
    ├── auth/             # JWT authentication (server)
    ├── auth-shared/      # Shared auth utilities
    ├── crypto/           # Encryption utilities
    ├── database/         # Prisma schema + client
    ├── env/              # Zod environment validation
    ├── i18n/             # Internationalization (universal)
    ├── storage/          # MinIO S3 service (server)
    ├── storage-client/   # File upload utilities (client)
    ├── stripe/           # Stripe integration
    ├── trpc/             # tRPC router + procedures (server)
    ├── trpc-client/      # Universal tRPC client factory (client)
    ├── types/            # Shared TypeScript types
    ├── ui/               # Shared Svelte components
    ├── utils/            # Shared utility functions
    └── tsconfig/         # Shared TypeScript configs
```

### Tech Stack

**Monorepo & Build**
- Turborepo 2.7.5
- Bun (package manager & runtime)

**Backend**
- Hono 4.11+ (web framework)
- tRPC 11.0+ (type-safe API)
- Prisma (ORM)
- SQLite (database, easily swappable)

**Frontend**
- SvelteKit 2.50+ (landing + backoffice)
- Svelte 5+ (with runes)
- Tailwind CSS 4+

**Mobile**
- Expo SDK 54+
- React Native 0.81+
- React 19+

**Storage & Payments**
- MinIO (S3-compatible storage)
- Stripe (payments + webhooks)

## Core Concepts

### 1. Client/Server Separation

This boilerplate follows a strict separation between server and client code:

```
Server-only packages:
├── @repo/auth          # JWT token generation/verification
├── @repo/storage       # MinIO S3 operations
└── @repo/trpc          # tRPC router definitions

Client-only packages:
├── @repo/storage-client  # File uploads to S3
└── @repo/trpc-client     # tRPC client factory

Isomorphic packages:
├── @repo/auth-shared   # hasAccess(), role types
├── @repo/types         # Shared types
└── @repo/utils         # Pure JS utilities
```

**Why?** Prevents accidentally bundling server secrets or Node.js APIs into client bundles.

### 2. tRPC Architecture

**Server (`@repo/trpc`)**

Modular router structure in `packages/trpc/src/modules/`:
- `auth/` - Login, register, verify
- `user/` - User management
- `contact/` - Contact form submissions
- `stripe/` - Payment processing
- `media/` - File upload URLs
- `chat/` - Messaging system

Each module contains:
```
modules/[name]/
├── router.ts   # tRPC endpoints
└── service.ts  # Business logic
```

**Procedures:**
- `publicProcedure` - No auth required
- `protectedProcedure` - Requires valid JWT
- `adminProcedure` - Requires admin role

**Client (`@repo/trpc-client`)**

Universal factory for web and mobile:

```typescript
import { createUniversalTrpcClient } from '@repo/trpc-client';

export const trpc = createUniversalTrpcClient({
  baseUrl: 'https://api.example.com/trpc',
  getToken: () => localStorage.getItem('token'),
  onUnauthorized: () => redirectToLogin()
});

// Fully typed, autocomplete works!
const user = await trpc.user.me.query();
```

Features:
- Type-safe proxy using `AppRouter` type
- Automatic JWT injection
- Batch requests via `httpBatchLink`
- Custom 401 handling
- Works in browser, Node.js, React Native

### 3. Authentication System

**Server (`@repo/auth`)**

JWT-based authentication:

```typescript
import { AuthManager } from '@repo/auth';

const authManager = new AuthManager(ENCRYPTION_SECRET);

// Generate token
const token = await authManager.generateToken({
  id: user.id,
  email: user.email,
  role: user.role
});

// Verify token
const payload = await authManager.verifyToken(token);
```

**Shared (`@repo/auth-shared`)**

Role-based access control:

```typescript
import { hasAccess } from '@repo/auth-shared';

// Check if user can access admin features
if (hasAccess(user.role, 'admin')) {
  // Allow access
}
```

**Flow:**
1. User logs in via `auth.login` mutation
2. Backend generates JWT with `AuthManager`
3. Client stores token (localStorage/SecureStore)
4. Client sends token in `Authorization: Bearer <token>`
5. Backend verifies token in tRPC context
6. Protected procedures check `ctx.user`

### 4. File Storage System

**Server (`@repo/storage`)**

MinIO/S3 operations:

```typescript
import { StorageService } from '@repo/storage';

const storage = new StorageService({
  endpoint: MINIO_ENDPOINT,
  accessKeyId: MINIO_ROOT_USER,
  secretAccessKey: MINIO_ROOT_PASSWORD,
  bucket: MINIO_BUCKET_NAME
});

// Generate pre-signed URL (15 min expiry)
const uploadUrl = storage.client.file(key).presign({
  expiresIn: 900,
  method: 'PUT'
});
```

**Client (`@repo/storage-client`)**

Direct uploads to S3:

```typescript
import { uploadFile, uploadFileSimple } from '@repo/storage-client';

// Simple upload
const url = await uploadFileSimple(file, presignedUrl);

// Upload with progress
const { url, key } = await uploadFile(file, presignedUrl, {
  onProgress: (percent) => console.log(`${percent}%`),
  signal: abortController.signal
});
```

**Flow:**
1. Client requests pre-signed URL: `trpc.media.getUploadUrl.mutate()`
2. Server generates URL valid for 15 minutes
3. Client uploads **directly to S3** (not through backend!)
4. Client confirms upload: `trpc.media.updateAvatar.mutate()`
5. Server stores metadata in database

**Why direct uploads?** Reduces backend load, faster uploads, better scalability.

### 5. Stripe Integration

**Setup:**
- `@repo/stripe` - Stripe SDK wrapper
- `packages/trpc/src/modules/stripe/` - tRPC endpoints
- `apps/backend/src/handlers/stripe.ts` - Webhook handler

**Webhook verification:**
```typescript
// POST /webhook
const signature = req.header('stripe-signature');
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  STRIPE_WEBHOOK_SECRET
);
```

**Events handled:**
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 6. Internationalization (i18n)

**Package (`@repo/i18n`)**

Universal type-safe internationalization for web and mobile:

```typescript
// SvelteKit
import { i18n } from '@repo/i18n/svelte';
{$i18n.t('auth.login.title')}  // "Log In" or "Connexion"

// React / React Native
import { useI18n } from '@repo/i18n/react';
const { t } = useI18n();
<Text>{t('auth.login.title')}</Text>
```

**Features:**
- Type-safe translation keys with autocomplete
- Nested keys (`common.buttons.save`)
- Interpolation (`Hello {{name}}`)
- Auto browser locale detection
- localStorage persistence
- Supports English (en) and French (fr)

**Adding translations:**

```typescript
// 1. Add to packages/i18n/src/locales/en.ts
export const en = {
  myFeature: {
    title: 'My Feature',
  },
} as const;

// 2. Add to packages/i18n/src/locales/fr.ts
export const fr: EnTranslations = {
  myFeature: {
    title: 'Ma Fonctionnalité',
  },
};

// 3. Use anywhere
t('myFeature.title')
```

**Adding new locales:** See `packages/i18n/README.md`

### 7. Database (Prisma)

**Multi-schema setup:**

```
packages/database/prisma/schema/
├── base.prisma         # Database config
├── user.prisma         # User model
├── account.prisma      # OAuth accounts
├── session.prisma      # Sessions
├── contact.prisma      # Contact form
├── stripe.prisma       # Stripe data
└── media.prisma        # Uploaded files
```

All schemas are automatically merged by Prisma.

**Commands:**
```bash
cd packages/database

# Generate Prisma Client
bun run db:generate

# Push schema to DB (dev)
bun run db:push

# Create migration
bun run db:migrate:dev

# Apply migrations (production)
bun run db:migrate:deploy

# Open Prisma Studio
bun run db:studio
```

## Development

### Running Apps

```bash
# All apps in parallel (Turborepo)
bun run dev

# Individual apps
cd apps/backend && bun run dev        # Backend (port 3001)
cd apps/frontend && bun run dev       # Frontend (port 5173)
cd apps/backoffice && bun run dev     # Backoffice (port 3002)
cd apps/mobile && bun run dev         # Expo dev server

# Mobile specific
cd apps/mobile && bun run ios         # iOS simulator
cd apps/mobile && bun run android     # Android emulator
```

### Type Checking

```bash
# All packages
bun run type-check

# Specific package
turbo run type-check --filter=@repo/backend
```

### Linting & Formatting

```bash
bun run lint        # ESLint
bun run format      # Prettier
```

### Environment Validation

```bash
cd apps/backend && bun run check-env     # Backend .env
cd apps/frontend && bun run check-env    # Frontend .env
```

## Building for Production

```bash
# Build all apps
bun run build

# Build specific app
cd apps/backend && bun run build
```

## Adding New Features

### 1. Adding a tRPC Module

```typescript
// packages/trpc/src/modules/todo/service.ts
export const todoService = {
  createTodo: async (db: PrismaClient, userId: string, data: any) => {
    return db.todo.create({
      data: { ...data, userId }
    });
  }
};

// packages/trpc/src/modules/todo/router.ts
import { router, protectedProcedure } from '../../trpc';
import { z } from 'zod';
import { todoService } from './service';

export const todoRouter = router({
  create: protectedProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return todoService.createTodo(ctx.db, ctx.user.id, input);
    })
});

// packages/trpc/src/index.ts
import { todoRouter } from './modules/todo/router';

export const appRouter = router({
  // ...existing routers
  todo: todoRouter,
});
```

### 2. Adding a Prisma Model

```prisma
// packages/database/prisma/schema/todo.prisma
model Todo {
  id        String   @id @default(cuid())
  title     String
  completed Boolean  @default(false)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Then run:
```bash
cd packages/database
bun run db:push  # or db:migrate:dev for production
```

### 3. Adding Environment Variables

```typescript
// packages/env/src/index.ts
export const serverEnvSchema = z.object({
  // ...existing vars
  MY_NEW_VAR: z.string().min(1),
});
```

Add to `.env`:
```bash
MY_NEW_VAR=some-value
```

## Turborepo Task Dependencies

Defined in `turbo.json`:

```json
{
  "build": {
    "dependsOn": ["^build", "db:generate", "check-env"]
  },
  "dev": {
    "dependsOn": ["db:generate", "check-env"],
    "cache": false
  }
}
```

This ensures:
- Prisma client is generated before builds
- Environment is validated before starting
- Dependencies are built before dependents

## Deployment

### Backend (Hono + tRPC)

```bash
cd apps/backend
bun run build

# Deploy to your platform
# The entry point is dist/index.js
```

**Environment variables needed:**
- All variables from `packages/env/src/index.ts` (serverEnvSchema)

### Frontend (SvelteKit)

```bash
cd apps/frontend
bun run build

# Static files in build/
# Or use adapter-node for Node.js deployment
```

### Mobile (Expo)

```bash
cd apps/mobile
bun run build:ios     # iOS build
bun run build:android # Android build
```

## Project Philosophy

This boilerplate is designed with these principles:

1. **Type Safety First**: No `any` types, full end-to-end typing
2. **Clear Separation**: Client code can't import server code
3. **Developer Experience**: Fast feedback loops, good errors
4. **Production Ready**: Auth, payments, storage all included
5. **Easy to Understand**: Clear naming, good documentation
6. **Scalable**: Modular architecture that grows with your app

## What's Included

- Custom JWT authentication system
- Role-based access control
- File uploads with progress tracking
- Stripe payment integration
- Webhook handling (Stripe)
- Email validation
- Password reset flow (TODO)
- OAuth integration (TODO)
- 2FA support (TODO)

## What's NOT Included (Yet)

See `TODO.md` for planned features:
- Email verification
- OAuth providers (Google, GitHub)
- 2FA (TOTP)
- Redis caching
- Background jobs/cron
- Testing infrastructure
- i18n support
- Multi-tenancy
- Rate limiting
- Logging/monitoring

## Common Issues

**Prisma client not found:**
```bash
cd packages/database && bun run db:generate
```

**Type errors after changing schema:**
```bash
cd packages/database && bun run db:generate
bun run type-check
```

**Environment variable errors:**
```bash
cd apps/backend && bun run check-env
```

**Port already in use:**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

## Contributing

This is a boilerplate/template project. Feel free to fork and customize for your needs!

## License

MIT

---

Built with ❤️ using Bun, Hono, tRPC, SvelteKit, and Expo.
