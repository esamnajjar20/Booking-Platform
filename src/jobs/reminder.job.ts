import cron from 'node-cron';
import prisma from '../config/database';
import logger from '../utils/logger';
import redis from '../config/redis';

const RETRY_QUEUE_KEY = 'reminder:retry';
const LOCK_KEY = 'reminder:lock';
const LOCK_TTL_SECONDS = 55 * 60;
let isRunning = false;

async function sendReminder(booking: any, retryCount = 0) {
  try {
    // Re-fetch fresh booking data to avoid stale state
    const freshBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: { user: true, service: true }
    });
    if (!freshBooking || freshBooking.status !== 'CONFIRMED') {
      logger.info(`Skipping reminder for booking ${booking.id}: not confirmed or deleted`);
      return;
    }
    logger.info(`Reminder sent for booking ${freshBooking.id} to user ${freshBooking.user.email}`);
    // await emailService.sendReminder(freshBooking.user.email, freshBooking);
  } catch (error) {
    logger.error(`Failed to send reminder for booking ${booking.id}, retry ${retryCount}`);
    if (retryCount < 3) {
      await redis.zadd(RETRY_QUEUE_KEY, Date.now() + 5 * 60 * 1000, JSON.stringify({ booking, retryCount: retryCount + 1 }));
    } else {
      logger.error(`Permanent failure for booking ${booking.id}`);
    }
  }
}

export function startReminderJob() {
  cron.schedule('0 * * * *', async () => {
    if (isRunning) {
      logger.warn('Skipping reminder job: previous run still in progress');
      return;
    }

    const lockValue = `${process.pid}:${Date.now()}`;
    const acquired = await redis.set(LOCK_KEY, lockValue, 'EX', LOCK_TTL_SECONDS, 'NX');
    if (acquired !== 'OK') {
      logger.info('Skipping reminder job: lock not acquired');
      return;
    }

    isRunning = true;
    logger.info('Running reminder job');
    try {
      const now = new Date();
      const startWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const endWindow = new Date(startWindow.getTime() + 60 * 60 * 1000);
      const upcoming = await prisma.booking.findMany({
        where: {
          startTime: { gte: startWindow, lt: endWindow },
          status: 'CONFIRMED',
          deletedAt: null
        },
        include: { user: true, service: true }
      });
      for (const booking of upcoming) {
        await sendReminder(booking);
      }

      const nowMs = Date.now();
      const retries = await redis.zrangebyscore(RETRY_QUEUE_KEY, 0, nowMs);
      for (const item of retries) {
        const { booking, retryCount } = JSON.parse(item);
        await sendReminder(booking, retryCount);
        await redis.zrem(RETRY_QUEUE_KEY, item);
      }
    } finally {
      isRunning = false;
      const currentValue = await redis.get(LOCK_KEY);
      if (currentValue === lockValue) {
        await redis.del(LOCK_KEY);
      }
    }
  });
}
