// src/config/database.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['error', 'warn']           // أزل 'query' و 'info' في التطوير أيضاً للهدوء
    : ['error'],

  errorFormat: 'pretty',
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

process.on('beforeExit', async () => {
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error disconnecting Prisma:', err);
  }
});

export default prisma;