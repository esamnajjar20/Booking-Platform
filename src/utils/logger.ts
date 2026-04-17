import winston from 'winston';
import path from 'path';

const logDir = 'logs';

/**
 * Expanded sensitive fields list
 */
const sensitiveFields = [
  'password',
  'refreshToken',
  'accessToken',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt'
];

/**
 * Deep sanitization helper
 * Handles nested objects safely
 */
const deepSanitize = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;

  const clone = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in clone) {
    const lowerKey = key.toLowerCase();

    if (sensitiveFields.includes(lowerKey)) {
      clone[key] = '[REDACTED]';
    } else if (typeof clone[key] === 'object') {
      clone[key] = deepSanitize(clone[key]);
    }
  }

  return clone;
};

/**
 * Winston sanitization format
 */
const filterSensitive = winston.format((info) => {
  if (info.message) {
    info.message = deepSanitize(info.message);
  }

  if (info.meta) {
    info.meta = deepSanitize(info.meta);
  }

  return info;
});

/**
 * Logger configuration
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    filterSensitive(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    }),

    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

/**
 * Express stream (morgan integration)
 * Sanitized before logging
 */
export const stream = {
  write: (message: string) => {
    logger.info(deepSanitize(message.trim()));
  }
};

export default logger;