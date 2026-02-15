# @repo/logger

A structured logging system built on Pino with automatic environment detection, sensitive data redaction, and support for both server-side and browser environments.

## Features

- Structured JSON logging with Pino
- Environment-aware configuration (pretty logs in dev, JSON in production)
- Automatic sensitive data redaction (passwords, tokens, secrets)
- Browser and server-side support with automatic detection
- Child loggers with bound context
- Multiple log levels (trace, debug, info, warn, error, fatal)
- ISO timestamps on all logs
- Optional Logtail integration for production logging
- Type-safe metadata objects
- Pretty console output in development with pino-pretty
- Zero-config default logger with customizable options

## Installation

Already included as a workspace package. Import it in your app:

```bash
bun add @repo/logger
```

## Usage

### Basic Logging

```typescript
import logger from '@repo/logger';

logger.info('Server started successfully');

logger.info({ port: 3000 }, 'Server listening on port 3000');

logger.warn({ userId: '123', action: 'login' }, 'Failed login attempt');

logger.error({ error: err, domain: 'example.com' }, 'API request failed');
```

### Child Loggers with Bound Context

Create child loggers that automatically include context in every log:

```typescript
import logger from '@repo/logger';

const userLogger = logger.child({ userId: '123', service: 'auth' });
userLogger.info('User logged in');
userLogger.info({ ip: '192.168.1.1' }, 'Session created');
```

Output:
```json
{"level":"info","time":"2024-02-14T12:00:00.000Z","userId":"123","service":"auth","msg":"User logged in"}
{"level":"info","time":"2024-02-14T12:00:01.000Z","userId":"123","service":"auth","ip":"192.168.1.1","msg":"Session created"}
```

### Service-Specific Loggers

```typescript
import logger from '@repo/logger';

const hunterLogger = logger.child({ service: 'hunter' });
hunterLogger.info({ domain: 'example.com' }, 'Starting domain search');
hunterLogger.debug({ results: 5 }, 'Email search completed');

const scraperLogger = logger.child({ service: 'scraper' });
scraperLogger.info({ url: 'https://example.com' }, 'Scraping website');
scraperLogger.warn({ retries: 3 }, 'Max retries reached');
```

### Request ID Tracking

```typescript
import logger from '@repo/logger';

function handleRequest(req) {
  const requestLogger = logger.child({ requestId: req.id });

  requestLogger.info({ method: req.method, path: req.path }, 'Request received');

  try {
    const result = processRequest(req);
    requestLogger.info({ statusCode: 200 }, 'Request completed');
    return result;
  } catch (error) {
    requestLogger.error({ error, statusCode: 500 }, 'Request failed');
    throw error;
  }
}
```

### All Log Levels

```typescript
import logger from '@repo/logger';

logger.trace({ detail: 'fine-grained' }, 'Very detailed debugging');
logger.debug({ step: 1 }, 'Debug information');
logger.info({ event: 'startup' }, 'General information');
logger.warn({ threshold: 80 }, 'Warning message');
logger.error({ error: new Error('Failed') }, 'Error occurred');
logger.fatal({ critical: true }, 'Fatal error, process exiting');
```

### Custom Logger Instance

Create a custom logger with different configuration:

```typescript
import { createLogger } from '@repo/logger';

const customLogger = createLogger({
  level: 'trace',
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
});

customLogger.trace('Custom trace log');
```

### Error Logging with Stack Traces

```typescript
import logger from '@repo/logger';

try {
  await riskyOperation();
} catch (error) {
  logger.error(
    {
      error,
      userId: '123',
      operation: 'riskyOperation',
    },
    'Operation failed'
  );
}
```

Pino automatically serializes Error objects with stack traces.

## API Reference

### Default Logger

```typescript
import logger from '@repo/logger';
```

The default logger is pre-configured and ready to use. It automatically detects the environment (browser vs server) and applies appropriate formatting.

### createLogger(options)

Create a custom logger instance with specific options.

```typescript
import { createLogger } from '@repo/logger';

const logger = createLogger(options);
```

**Note:** `createLogger` is only available in server-side environments (Node.js/Bun).

#### Options

```typescript
interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  formatters?: {
    level?: (label: string) => object;
    bindings?: (bindings: object) => object;
    log?: (object: object) => object;
  };
  redact?: {
    paths: string[];
    remove?: boolean;
  };
  // ... other Pino options
}
```

### Logger Methods

All methods accept an optional metadata object as the first parameter:

```typescript
logger.trace(obj?, msg, ...args)
logger.debug(obj?, msg, ...args)
logger.info(obj?, msg, ...args)
logger.warn(obj?, msg, ...args)
logger.error(obj?, msg, ...args)
logger.fatal(obj?, msg, ...args)
```

### Child Loggers

```typescript
const childLogger = logger.child(bindings);
```

Creates a child logger that inherits the parent configuration and automatically includes the provided bindings in every log.

## Environment Configuration

### Development

In development (`NODE_ENV !== 'production'`):
- Pretty console output with colors via pino-pretty
- Human-readable timestamps (HH:MM:ss Z)
- Default log level: `debug`
- PID and hostname hidden for cleaner output

Example output:
```
[12:34:56 EST] INFO: Server started successfully
    userId: "123"
    service: "auth"
```

### Production

In production (`NODE_ENV === 'production'`):
- JSON output for structured logging
- ISO 8601 timestamps
- Default log level: `info`
- Optional Logtail integration (set `LOGTAIL_TOKEN` environment variable)

Example output:
```json
{"level":"info","time":"2024-02-14T17:34:56.000Z","userId":"123","service":"auth","msg":"Server started successfully"}
```

### Environment Variables

- `NODE_ENV`: Set to `production` for production logging
- `LOG_LEVEL`: Override default log level (trace, debug, info, warn, error, fatal)
- `LOGTAIL_TOKEN`: Enable Logtail integration in production (optional)

## Sensitive Data Redaction

The logger automatically redacts sensitive fields from logs:

### Redacted Fields

- `password`
- `token`
- `secret`
- `authorization`
- `user.password`
- `user.email`
- `card.number`
- `card.cvv`
- `stripe.secret`
- `*.password` (any nested password field)
- `*.token` (any nested token field)
- `*.secret` (any nested secret field)

### Example

```typescript
logger.info({
  username: 'john',
  password: 'secret123',
  email: 'john@example.com',
}, 'User data');
```

Output (password is redacted):
```json
{"level":"info","time":"...","username":"john","msg":"User data"}
```

## Browser Support

The logger automatically detects browser environments and uses console methods with structured data:

```typescript
import logger from '@repo/logger';

logger.info({ action: 'click', button: 'submit' }, 'Button clicked');
logger.error({ error: err }, 'Form submission failed');
```

Browser output uses `console.log`, `console.error`, `console.warn`, and `console.debug` with the metadata object.

## Integration with tRPC

Use the logger in tRPC procedures:

```typescript
import logger from '@repo/logger';
import { router, protectedProcedure } from '../trpc';

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const requestLogger = logger.child({
      userId: ctx.user.id,
      procedure: 'user.getProfile',
    });

    requestLogger.debug('Fetching user profile');

    const profile = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
    });

    requestLogger.info('Profile fetched successfully');

    return profile;
  }),
});
```

## Integration with BullMQ Jobs

Use the logger in job workers:

```typescript
import logger from '@repo/logger';
import type { JobDefinition } from '@repo/jobs';

const sendEmailJob: JobDefinition<EmailData, void> = {
  name: 'send-email',
  processor: async (job) => {
    const jobLogger = logger.child({
      jobId: job.id,
      jobName: job.name,
    });

    jobLogger.info({ to: job.data.to }, 'Processing email job');

    try {
      await sendEmail(job.data);
      jobLogger.info('Email sent successfully');
      await job.updateProgress(100);
    } catch (error) {
      jobLogger.error({ error }, 'Failed to send email');
      throw error;
    }
  },
};
```

## Best Practices

1. **Use structured logging**: Always include relevant metadata as the first parameter
   ```typescript
   logger.info({ userId, action }, 'User action');
   ```

2. **Create child loggers for services**: Bind service context to avoid repetition
   ```typescript
   const serviceLogger = logger.child({ service: 'hunter' });
   ```

3. **Include request/job IDs**: Makes debugging distributed systems easier
   ```typescript
   const requestLogger = logger.child({ requestId: req.id });
   ```

4. **Log errors with context**: Always include relevant context when logging errors
   ```typescript
   logger.error({ error, userId, operation }, 'Operation failed');
   ```

5. **Use appropriate log levels**:
   - `trace`: Very fine-grained debugging
   - `debug`: Debugging information
   - `info`: General informational messages
   - `warn`: Warning messages that don't require immediate action
   - `error`: Errors that should be investigated
   - `fatal`: Fatal errors that may cause the process to exit

6. **Don't log sensitive data directly**: The redaction helps, but avoid logging credentials
   ```typescript
   logger.info({ email: user.email }, 'User logged in');
   ```

7. **Be consistent with message format**: Use clear, actionable messages
   ```typescript
   logger.info({ domain }, 'Starting domain search');
   logger.info({ results: count }, 'Domain search completed');
   ```

## Performance

- Minimal overhead in production (JSON serialization is fast)
- Child loggers are lightweight and don't duplicate configuration
- Async transport in development (pino-pretty runs in worker thread)
- Automatic log level filtering (lower levels are skipped entirely)

## TypeScript Support

Full TypeScript support with type inference:

```typescript
import logger, { type Logger } from '@repo/logger';

function setupLogging(): Logger {
  return logger.child({ module: 'setup' });
}
```

## License

Private package - not for distribution
