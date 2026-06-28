import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/activity — filterable activity log
// Query params: entity, action, userId, from, to, limit (default 50), offset (default 0)
router.get(
  "/",
  requirePermission("access_logs"),
  async (req: AuthRequest, res: Response) => {
    const { entity, action, userId, from, to } = req.query as Record<string, string | undefined>;
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50",  10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) ?? "0",   10), 0);

    const where: Record<string, unknown> = {};
    if (entity) where.entity   = entity;
    if (action) where.action   = action;
    if (userId) where.userId   = userId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take:  limit,
        skip:  offset,
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({ logs, total, limit, offset });
  }
);

// GET /api/activity/entities — distinct entity types present in log
router.get(
  "/entities",
  requirePermission("access_logs"),
  async (_req: AuthRequest, res: Response) => {
    const result = await prisma.activityLog.findMany({
      select:  { entity: true },
      distinct: ["entity"],
      orderBy: { entity: "asc" },
    });
    res.json(result.map((r) => r.entity));
  }
);

export default router;
