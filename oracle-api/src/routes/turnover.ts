import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/turnover/resignation/:employeeId
router.get("/resignation/:employeeId", async (req: AuthRequest, res: Response) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.employeeId },
    include: {
      site: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      assignments: {
        where: { status: "active" },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
              condition: true,
              ownership: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(employee);
});

// POST /api/turnover/resignation/:employeeId
router.post("/resignation/:employeeId", async (req: AuthRequest, res: Response) => {
  const { assetIds } = req.body as { assetIds: string[] };
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    res.status(400).json({ error: "assetIds is required." });
    return;
  }
  const now = new Date();

  const assignments = await prisma.assetAssignment.findMany({
    where: {
      employeeId: req.params.employeeId,
      status: "active",
      assetId: { in: assetIds },
    },
  });

  await Promise.all(
    assignments.map((a) =>
      prisma.assetAssignment.update({
        where: { id: a.id },
        data: { status: "returned", returnedAt: now },
      })
    )
  );

  await prisma.movementLog.createMany({
    data: assetIds.map((assetId) => ({
      assetId,
      employeeId: req.params.employeeId,
      type: "resignation" as const,
      notes: "Collected via resignation/turnover process",
    })),
  });

  await prisma.employee.update({
    where: { id: req.params.employeeId },
    data: { isActive: false },
  });

  res.json({ success: true, collected: assetIds.length });
});

export default router;
