import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';

import { config } from './config/env';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { correlationIdMiddleware } from './middleware/correlationId.middleware';

import logger, { stream } from './utils/logger';
import prisma from './config/database';
import redis from './config/redis';

import v1Routes from './routes/v1/index';
import docsRoutes from './routes/docs.routes';
import { protectUploads } from './middleware/uploadAuth.middleware';
import { startReminderJob } from './jobs/reminder.job';

const app = express();

const isProd = process.env.NODE_ENV === 'production';

// Trust reverse proxy headers only when explicitly configured (prevents spoofing X-Forwarded-*)
if (config.TRUST_PROXY !== false) {
  app.set('trust proxy', config.TRUST_PROXY);
}

/**
 * Security layer (HTTP headers protection)
 * Includes CSP, HSTS, and basic hardening via Helmet
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],

        // Relaxed in dev, strict in production
        scriptSrc: isProd
          ? ["'self'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],

        imgSrc: ["'self'", "data:", "https:"]
      }
    },

    // Enable HSTS only in production environments
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false
  })
);

/**
 * Global middleware stack
 * Handles CORS, compression, parsing, and request tracing
 */
app.use(cors({
  origin: config.ALLOWED_ORIGINS.split(','),
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: config.BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: config.BODY_LIMIT }));
app.use(cookieParser());

// Correlation ID for request tracing across logs/services
app.use(correlationIdMiddleware);

// HTTP request logging (useful for debugging and security monitoring)
app.use(morgan('combined', { stream }));

/**
 * Rate limiting applied only to API routes
 * Avoids affecting health checks, static files, and docs
 */
app.use('/api/v1', generalLimiter);

/**
 * Static file serving (uploads)
 * Protected via authentication middleware
 */
app.use(
  '/uploads',
  protectUploads,
  express.static(path.join(__dirname, '../uploads'))
);

/**
 * API routes
 * Main versioned backend endpoints
 */
app.use('/api/v1', v1Routes);

/**
 * API documentation routes (Swagger / OpenAPI)
 */
app.use('/api-docs', docsRoutes);

/**
 * Health check endpoints
 * Used for monitoring system status
 */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const protectHealthDetails: express.RequestHandler = (req, res, next) => {
  // Keep detailed checks private in production (DB/Redis info is sensitive)
  if (!isProd) return next();

  const token = req.header('x-health-token');
  if (config.HEALTHCHECK_TOKEN && token === config.HEALTHCHECK_TOKEN) {
    return next();
  }

  const ip = req.ip;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  return res.status(401).json({ status: 'error', error: 'Unauthorized' });
};

app.get('/health/db', protectHealthDetails, async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/health/redis', protectHealthDetails, async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ok', redis: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', redis: 'disconnected' });
  }
});

/**
 * Readiness probe
 * Lightweight check used by orchestration systems (e.g. Kubernetes)
 */
app.get('/ready', (req, res) => {
  res.json({ ready: true });
});

/**
 * 404 handler
 * Handles unknown routes
 */
app.use((req, res) =>
  res.status(404).json({ error: `Cannot ${req.method} ${req.url}` })
);

/**
 * Global error handler
 * Centralized error response formatting
 */
app.use(errorHandler);

/**
 * Start HTTP server
 */
const PORT = config.PORT;

const server = app.listen(PORT, () => {
  logger.info(` Server running on http://localhost:${PORT}`);
  startReminderJob();
});

/**
 * Graceful shutdown handler
 * Ensures proper cleanup of DB and Redis connections
 */
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  // Force shutdown fallback (prevents hanging process)
  setTimeout(() => {
    logger.error('Forced shutdown triggered');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
