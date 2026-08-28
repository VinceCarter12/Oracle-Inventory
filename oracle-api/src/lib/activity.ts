import { prisma } from "./prisma";
import { broadcastChange } from "./ws";

export async function logActivity(opts: {
  userId?: string | null;
  action: string;       // e.g. "create", "update", "delete", "assign", "return"
  entity: string;       // e.g. "Asset", "User", "Assignment"
  entityId?: string | null;
  branchId?: string | null; // scopes the live-update broadcast; omit for global entities
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

  try {
    broadcastChange({ entity: opts.entity, action: opts.action, entityId: opts.entityId, branchId: opts.branchId ?? null });
  } catch {
    // Never let a broadcast failure break the main request
  }
}
