import { prisma } from './prisma';

/**
 * Write an ActivityLog entry. Silently swallows errors so a logging
 * failure never crashes the main request.
 */
export async function logActivity(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId:   params.userId   ?? null,
        action:   params.action,
        entity:   params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch {
    // Never let activity logging crash a request
  }
}
