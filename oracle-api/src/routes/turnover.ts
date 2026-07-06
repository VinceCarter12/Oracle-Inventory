import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getExitCheckStates, isExitCheckBlocked, exitCheckMessage } from "../lib/belarc/exitCheck";

const router = Router();
router.use(requireAuth);

// GET /api/turnover/resignation/:employeeId
router.get("/resignation/:employeeId", async (req: AuthRequest, res: Response) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.employeeId },
    include: {
      branch: { select: { id: true, name: true } },
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

  // Hardware Audit exit check per assigned asset — lets the offboarding UI
  // show which assets are blocked before the admin attempts collection
  const exitChecks = await getExitCheckStates(employee.assignments.map((a) => a.asset.id));
  res.json({
    ...employee,
    assignments: employee.assignments.map((a) => ({
      ...a,
      exitCheck: exitChecks.get(a.asset.id) ?? "not_required",
    })),
  });
});

// POST /api/turnover/resignation/:employeeId
router.post("/resignation/:employeeId", async (req: AuthRequest, res: Response) => {
  const { assetIds } = req.body as { assetIds: string[] };
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    res.status(400).json({ error: "assetIds is required." });
    return;
  }
  const now = new Date();

  // Hardware Audit exit check — refuse the whole collection if any selected
  // asset is audit-enrolled without a reviewed scan
  const exitChecks = await getExitCheckStates(assetIds);
  const blocked = assetIds.filter((id) => isExitCheckBlocked(exitChecks.get(id) ?? "not_required"));
  if (blocked.length > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: blocked } },
      select: { id: true, name: true },
    });
    res.status(409).json({
      error: `Hardware exit check required: ${assets
        .map((a) => exitCheckMessage(a.name, exitChecks.get(a.id) ?? "missing"))
        .join(" ")}`,
      blockedAssets: assets.map((a) => ({ id: a.id, name: a.name, exitCheck: exitChecks.get(a.id) })),
    });
    return;
  }

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
