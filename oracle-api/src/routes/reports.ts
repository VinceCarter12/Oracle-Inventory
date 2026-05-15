import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/reports/summary
router.get("/summary", async (_req: AuthRequest, res: Response) => {
  const [totalAssets, forRepair, forDisposal] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.count({ where: { condition: "for_repair" } }),
    prisma.asset.count({ where: { condition: "for_disposal" } }),
  ]);

  const assignedAssets = await prisma.assetAssignment.findMany({
    where: { status: "active" },
    select: { assetId: true },
    distinct: ["assetId"],
  });

  // Movements by month — last 6 months
  const now = new Date();
  const movementsByMonth: { month: string; assignments: number; returns: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthLabel = start.toLocaleString("default", { month: "short" });

    const [assignmentsCount, returnsCount] = await Promise.all([
      prisma.assetAssignment.count({ where: { assignedAt: { gte: start, lt: end } } }),
      prisma.assetAssignment.count({
        where: {
          returnedAt: { gte: start, lt: end },
          status: { in: ["returned", "transferred"] },
        },
      }),
    ]);

    movementsByMonth.push({ month: monthLabel, assignments: assignmentsCount, returns: returnsCount });
  }

  // Top categories by asset count
  const allAssets = await prisma.asset.findMany({
    select: {
      categoryId: true,
      category: { select: { name: true } },
      assignments: { where: { status: "active" }, select: { id: true } },
    },
  });

  const catMap = new Map<string, { name: string; count: number; assigned: number }>();
  for (const a of allAssets) {
    const key = a.categoryId ?? "__none__";
    const name = a.category?.name ?? "Uncategorized";
    if (!catMap.has(key)) catMap.set(key, { name, count: 0, assigned: 0 });
    const entry = catMap.get(key)!;
    entry.count++;
    if (a.assignments.length > 0) entry.assigned++;
  }
  const topCategories = [...catMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    kpi: {
      totalAssets,
      assigned: assignedAssets.length,
      forRepair,
      forDisposal,
    },
    movementsByMonth,
    topCategories,
  });
});

export default router;
