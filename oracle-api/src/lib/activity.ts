import { prisma } from "./prisma";

export async function logActivity(opts: {
  userId?: string | null;
  action: string;       // e.g. "create", "update", "delete", "assign", "return"
  entity: string;       // e.g. "Asset", "User", "Assignment"
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId:   opts.userId ?? null,
        action:   opts.action,
        entity:   opts.entity,
        entityId: opts.entityId ?? null,
        metadata: opts.metadata ? JSON.parse(JSON.stringify(opts.metadata)) : undefined,
      },
    });
  } catch {
    // Never let logging failures break the main request
  }
}
