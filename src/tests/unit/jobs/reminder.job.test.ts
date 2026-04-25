import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingFindUnique: vi.fn(),
  redisSet: vi.fn(),
  redisGet: vi.fn(),
  redisDel: vi.fn(),
  redisZadd: vi.fn(),
  redisZrangeByScore: vi.fn(),
  redisZrem: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.schedule
  }
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    booking: {
      findMany: mocks.bookingFindMany,
      findUnique: mocks.bookingFindUnique
    }
  }
}));

vi.mock('../../../../src/config/redis', () => ({
  default: {
    set: mocks.redisSet,
    get: mocks.redisGet,
    del: mocks.redisDel,
    zadd: mocks.redisZadd,
    zrangebyscore: mocks.redisZrangeByScore,
    zrem: mocks.redisZrem
  }
}));

vi.mock('../../../../src/utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

describe('reminder.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules job and executes reminders when lock acquired', async () => {
    mocks.redisSet.mockResolvedValue('OK');
    mocks.bookingFindMany.mockResolvedValue([{ id: 'b1' }]);
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'b1',
      status: 'CONFIRMED',
      user: { email: 'u@u.com' },
      service: { id: 's1' }
    });
    mocks.redisZrangeByScore.mockResolvedValue([]);
    mocks.redisGet.mockResolvedValue('123:1');

    vi.spyOn(process, 'pid', 'get').mockReturnValue(123);

    const { startReminderJob } = await import('../../../../src/jobs/reminder.job');
    startReminderJob();

    const [, jobFn] = mocks.schedule.mock.calls[0];
    await jobFn();

    expect(mocks.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    expect(mocks.bookingFindMany).toHaveBeenCalled();
    expect(mocks.bookingFindUnique).toHaveBeenCalledWith({
      where: { id: 'b1' },
      include: { user: true, service: true }
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('Reminder sent for booking b1'));
  });

  it('queues retry when reminder send fails and handles retry queue items', async () => {
    mocks.redisSet.mockResolvedValue('OK');
    mocks.bookingFindMany.mockResolvedValue([{ id: 'b1' }]);
    mocks.bookingFindUnique
      .mockRejectedValueOnce(new Error('mailer down'))
      .mockResolvedValueOnce({
        id: 'b1',
        status: 'CONFIRMED',
        user: { email: 'u@u.com' },
        service: { id: 's1' }
      });
    mocks.redisZrangeByScore.mockResolvedValue([JSON.stringify({ booking: { id: 'b1' }, retryCount: 1 })]);
    mocks.redisGet.mockResolvedValue('123:1');

    vi.spyOn(process, 'pid', 'get').mockReturnValue(123);

    const { startReminderJob } = await import('../../../../src/jobs/reminder.job');
    startReminderJob();
    const [, jobFn] = mocks.schedule.mock.calls[0];

    await jobFn();

    expect(mocks.redisZadd).toHaveBeenCalledWith(
      'reminder:retry',
      expect.any(Number),
      expect.stringContaining('"retryCount":1')
    );
    expect(mocks.redisZrem).toHaveBeenCalledWith(
      'reminder:retry',
      expect.stringContaining('"retryCount":1')
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining('Failed to send reminder for booking b1'));
  });
});
