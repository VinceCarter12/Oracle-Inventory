import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { enabled as stockEnabled, gate as stockGate } from "./stock";

const router = Router();
router.use(requireAuth);

// GET /api/branches
router.get("/", async (_req: AuthRequest, res: Response) => {
  const branches = await prisma.branch.findMany({
    include: {
      _count: { select: { assets: true, employees: true } },
    },
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  res.json(branches);
});

// GET /api/branches/all  (includes archived)
router.get("/all", async (_req: AuthRequest, res: Response) => {
  const branches = await prisma.branch.findMany({
    include: {
      _count: { select: { assets: true, employees: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(branches);
});

// POST /api/branches
router.post("/", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const { name, address } = req.body;
  if (!name) { res.status(400).json({ error: "Branch name is required." }); return; }
  const branch = await prisma.branch.create({
    data: { name, address: address || null },
    include: {
      _count: { select: { assets: true, employees: true } },
    },
  });
  res.status(201).json(branch);
});

// GET /api/branches/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { assets: true, employees: true } },
    },
  });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

// GET /api/branches/:id/stock-summary — spec-canonical alias for GET /api/stock/branches/:branchId/summary.
// Same fail-closed gate, same branch/location scoping, same derived-balance shape.
router.get("/:id/stock-summary", requirePermission("view_stock"), async (req: AuthRequest, res: Response) => {
  if (!(await stockEnabled())) { stockGate(res); return; }
  const account = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } });
  const global = account?.role?.name.toLowerCase() === "super_admin";
  if (!global && account?.branchId !== req.params.id) { res.status(403).json({ error: "Branch summary is outside your scope.", code: "STOCK_BRANCH_FORBIDDEN" }); return; }
  const locations = await prisma.stockLocation.findMany({ where: { branchId: req.params.id, archivedAt: null } });
  const items = await prisma.stockItem.findMany({ where: { active: true } });
  const locationIds = locations.map((location) => location.id);
  const balances = await Promise.all(items.map(async (item) => {
    const rows = await prisma.stockLedgerEntry.findMany({ where: { movement: { stockItemId: item.id }, locationId: { in: locationIds } }, select: { quantityDelta: true } });
    return { id: item.id, sku: item.sku, name: item.name, balance: rows.reduce((sum, row) => sum + Number(row.quantityDelta), 0) };
  }));
  res.json({ branchId: req.params.id, locations, items: balances });
});

// PATCH /api/branches/:id
router.patch("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const { name, address, latitude, longitude } = req.body;
  if (name !== undefined && !name) { res.status(400).json({ error: "Branch name cannot be empty." }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: {
      ...(name      !== undefined && { name }),
      ...(address   !== undefined && { address:   address   || null }),
      ...(latitude  !== undefined && { latitude:  latitude  !== null ? parseFloat(latitude)  : null }),
      ...(longitude !== undefined && { longitude: longitude !== null ? parseFloat(longitude) : null }),
    },
    include: { _count: { select: { assets: true, employees: true } } },
  });
  res.json(updated);
});

// PATCH /api/branches/:id/archive
router.patch("/:id/archive", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  res.json(updated);
});

// PATCH /api/branches/:id/unarchive
router.patch("/:id/unarchive", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: { archivedAt: null },
  });
  res.json(updated);
});

// DELETE /api/branches/:id
router.delete("/:id", requirePermission("manage_settings"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { assets: true, employees: true } } },
  });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  if (branch._count.assets > 0 || branch._count.employees > 0) {
    res.status(409).json({ error: `Cannot delete branch — it still has ${branch._count.assets} asset(s) and ${branch._count.employees} employee(s). Reassign or remove them first.` });
    return;
  }
  await prisma.branch.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
