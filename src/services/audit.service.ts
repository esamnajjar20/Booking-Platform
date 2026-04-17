import prisma from '../config/database';
import { Request } from 'express';

/**
 * Removes sensitive fields before storing snapshots in audit logs
 * Prevents leaking secrets like passwords or refresh tokens into logs
 */
const sanitize = (obj: any) => {
  if (!obj) return null;

  // Explicitly strip sensitive authentication fields from audit payloads
  const { password, refreshToken, ...rest } = obj;
  return rest;
};

export class AuditService {
  static async log(
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string | undefined,
    oldValue: any = null,
    newValue: any = null,
    req?: Request
  ) {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,

        // Store sanitized snapshots to avoid persisting sensitive data
        oldValue: sanitize(oldValue),
        newValue: sanitize(newValue),

        // Request metadata for traceability (useful for security/auditing)
        ip: req?.ip,
        userAgent: req?.headers['user-agent']
      }
    });
  }
}