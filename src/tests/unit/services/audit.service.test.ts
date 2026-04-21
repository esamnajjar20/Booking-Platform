import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/config/database', () => ({
  default: {
    auditLog: {
      create: vi.fn()
    }
  }
}));

import prisma from '../../../../src/config/database';
import { AuditService } from '../../../../src/services/audit.service';

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates audit log and sanitizes sensitive fields', async () => {
    (prisma.auditLog.create as any).mockResolvedValue({ id: 'a1' });

    await AuditService.log(
      'u1',
      'UPDATE_PROFILE',
      'User',
      'u1',
      { password: 'secret', name: 'Old' },
      { refreshToken: 'token', name: 'New' },
      { ip: '127.0.0.1', headers: { 'user-agent': 'vitest' } } as any
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        action: 'UPDATE_PROFILE',
        entity: 'User',
        entityId: 'u1',
        oldValue: { name: 'Old' },
        newValue: { name: 'New' },
        ip: '127.0.0.1',
        userAgent: 'vitest'
      }
    });
  });

  it('stores null snapshots when values are missing', async () => {
    (prisma.auditLog.create as any).mockResolvedValue({ id: 'a2' });

    await AuditService.log('u1', 'DELETE', 'Service', 's1');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValue: null,
        newValue: null
      })
    });
  });
});
