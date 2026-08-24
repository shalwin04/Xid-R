/**
 * Structured logging for Xid-R.
 */

import pino from "pino";
import { getConfig } from "../config.js";

const config = getConfig();

export const logger = pino({
  level: config.api.debug ? "debug" : "info",
  transport:
    config.environment === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "xid-r",
    environment: config.environment,
  },
});

/**
 * Create a child logger with additional context.
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log levels for convenience.
 */
export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => logger.debug(data, msg),
  info: (msg: string, data?: Record<string, unknown>) => logger.info(data, msg),
  warn: (msg: string, data?: Record<string, unknown>) => logger.warn(data, msg),
  error: (msg: string, data?: Record<string, unknown>) => logger.error(data, msg),
};
