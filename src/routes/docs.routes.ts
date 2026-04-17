import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';

/**
 * Swagger UI Documentation
 * ------------------------
 * Should be restricted in production environments
 * to avoid exposing internal API structure.
 */

// Only allow Swagger in non-production OR authenticated users
if (!isProd) {
  router.use('/', swaggerUi.serve);
  router.get('/', swaggerUi.setup(swaggerSpec, { explorer: true }));

  router.get('/json', (req, res) => {
    res.json(swaggerSpec);
  });
} else {
  /**
   * In production: restrict access to admins only
   * (or completely disable if not needed)
   */

  router.use(authenticate);

  router.use('/', swaggerUi.serve);
  router.get('/', swaggerUi.setup(swaggerSpec, { explorer: true }));

  router.get('/json', authenticate, (req, res) => {
    res.json(swaggerSpec);
  });
}

export default router;