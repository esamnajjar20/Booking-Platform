import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env';

// Dynamically resolves base URL (useful for local vs production environments)
const baseUrl = process.env.BASE_URL || `http://localhost:${config.PORT}`;

const options = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'Booking Platform API',
      version: '3.1.0',
      description: 'Production-ready booking platform API'
    },

    // Base path for all API endpoints
    // Important: must match actual route prefix in your server (e.g., /api/v1)
    servers: [{ url: `${baseUrl}/api/v1`, description: 'API Server' }],

    components: {
      securitySchemes: {
        // Standard JWT bearer authentication (used for access tokens)
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },

        // Cookie-based auth (commonly used for refresh tokens)
        // Assumes cookie name = "refreshToken"
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken'
        }
      }
    },

    // Applies bearerAuth globally unless overridden per route
    security: [{ bearerAuth: [] }]
  },

  // Files where Swagger will scan for JSDoc annotations
  // Important: paths must match build output if using dist/ in production
  apis: ['./src/routes/v1/*.ts', './src/controllers/*.ts']
};

// Generates OpenAPI spec from annotations
export const swaggerSpec = swaggerJsdoc(options);