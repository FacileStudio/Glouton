import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const redactPaths = [
  'password',
  'token',
  'secret',
  'authorization',
  'user.password',
  'user.email',
  'card.number',
  'card.cvv',
  'stripe.secret',
  '*.password',
  '*.token',
  '*.secret',
];

/**
 * createTransport
 */
function createTransport() {
  /**
   * if
   */
  if (isProd && process.env.LOGTAIL_TOKEN) {
    return pino.transport({
      target: '@logtail/pino',
      options: { sourceToken: process.env.LOGTAIL_TOKEN },
    });
  }

  /**
   * if
   */
  if (!isProd) {
    return pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname,service,auditSessionId,huntSessionId,userId,jobId',
        singleLine: true,
        messageFormat: '{msg}',
      },
    });
  }

  return undefined;
}

/**
 * createLogger
 */
export function createLogger(options: LoggerOptions = {}): PinoLogger {
  const defaultOptions: LoggerOptions = {
    level: logLevel,
    redact: {
      paths: redactPaths,
      remove: true,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    formatters: {
      ...defaultOptions.formatters,
      ...options.formatters,
    },
    redact: options.redact ?? defaultOptions.redact,
  };

  const transport = createTransport();

  return pino(mergedOptions, transport);
}

export const logger = createLogger();

export default logger;

export type Logger = PinoLogger;
