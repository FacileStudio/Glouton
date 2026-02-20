import pino from 'pino';

type PinoLogObject = {
  msg?: string;
  level: number;
  time: number;
  [key: string]: any;
};

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
const isBrowser = typeof window !== 'undefined';

export const logger = isBrowser
  ? pino({
      level: isDev ? 'debug' : 'info',
      browser: {
        asObject: true,
        write: {
          info: (o) => {
            const obj = o as PinoLogObject;
            console.log(obj.msg, obj);
          },
          error: (o) => {
            const obj = o as PinoLogObject;
            console.error(obj.msg, obj);
          },
          warn: (o) => {
            const obj = o as PinoLogObject;
            console.warn(obj.msg, obj);
          },
          debug: (o) => {
            if (isDev) {
              const obj = o as PinoLogObject;
              console.debug(obj.msg, obj);
            }
          },
        },
      },
    })
  : pino({
      level: (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || (isDev ? 'debug' : 'info'),
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
    });

export default logger;

/**
 * createLogger
 */
export const createLogger = (options = {}) => {
  /**
   * if
   */
  if (isBrowser) {
    return logger;
  }
  return pino(options);
};

export type { Logger } from 'pino';
