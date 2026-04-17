import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    env: {
      NODE_ENV: 'test',
      BASE_URL: 'http://localhost:3000',
      JWT_SECRET: 'super-secret-test-key-that-must-be-at-least-32-characters-long-123',
      DATABASE_URL: 'file:./test.db',       
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'scripts/', 'prisma/']
    }
  }
});