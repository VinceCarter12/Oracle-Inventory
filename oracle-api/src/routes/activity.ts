import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/activity/entities
router.get("/entities", requirePermission("access_logs"), async (_req, res: Response) => {
  const rows = await prisma.activityLog.findMany({
    select: { entity: true },
    distinct: ["entity"],
    orderBy: { entity: "asc" },
  });
  res.json(rows.map((r) => r.entity));
});

// GET /api/activity?limit&offset&entity&action&from&to
router.get("/", requirePermission("access_logs"), async (req: Request, res: Response) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50"), 10), 200);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const where: Record<string, unknown> = {};
  if (req.query.entity) where.entity = req.query.entity;
  if (req.query.action) where.action = { contains: req.query.action, mode: "insensitive" };
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to   ? { lte: new Date(String(req.query.to))   } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.activityLog.count({ where }),
  ]);

  res.json({ logs, total, limit, offset });
});

export default router;
