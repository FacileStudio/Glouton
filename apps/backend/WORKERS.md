# Backend Workers Setup

## Why Workers Run in Node.js

The backend API server runs in **Bun** for performance, but BullMQ workers run in **Node.js** for Playwright compatibility.

### The Problem

Playwright (used for web scraping) relies on Node.js `child_process` APIs to launch browser instances. Bun's `child_process` implementation doesn't fully support the stdio pipes that Playwright uses for IPC communication with browser processes, causing `ENOENT` errors when trying to spawn browsers.

### The Solution

**Separate processes for backend and workers:**

- **Backend (Bun)**: Fast API server handling HTTP/WebSocket requests and creating jobs
- **Workers (Node.js)**: Process background jobs that require Playwright/Chromium

They communicate via **Redis (BullMQ)**, providing clean separation and allowing each to use the optimal runtime.

## Architecture

```
┌─────────────┐         ┌─────────┐         ┌──────────────┐
│   Backend   │────────▶│  Redis  │◀────────│   Workers    │
│   (Bun)     │         │ (BullMQ)│         │  (Node.js)   │
│             │         │         │         │              │
│ - API       │         │ - Queues│         │ - Playwright │
│ - WebSocket │         │ - Jobs  │         │ - Scraping   │
│ - Job mgmt  │         │         │         │ - Processing │
└─────────────┘         └─────────┘         └──────────────┘
```

## Running in Development

### Run everything (recommended):
```bash
bun run dev  # Runs both backend and workers
```

### Run separately:
```bash
bun run dev:backend   # Backend only (Bun)
bun run dev:workers   # Workers only (Node.js)
```

## Production Deployment

Deploy backend and workers as **separate services**:

### Backend Service
```bash
bun run build
bun run start
```

### Worker Service
```bash
bun run build
bun run start:workers
```

**Best practice**: Run multiple worker instances for horizontal scaling.

## Files

- `src/index.ts` - Backend API server (Bun)
- `src/workers.ts` - Worker process (Node.js)
- `package.json` - Scripts for running both

## Queue Names

- `leads` - Lead extraction, auditing, and hunting jobs
- `opportunities` - Opportunity scraping and notification jobs

## Environment Variables

Workers and backend share the same `.env` file and require:

- `REDIS_HOST` - Redis server host
- `REDIS_PORT` - Redis server port
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number

Plus all other backend environment variables (database, etc.)
