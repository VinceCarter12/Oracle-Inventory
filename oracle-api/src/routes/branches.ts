import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { enabled as stockEnabled, gate as stockGate } from "./stock";
import { parseBranchCoordinates } from "../lib/branch-coordinates";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

type GeocodeResult = { display_name: string; lat: string; lon: string };
const geocodeCache = new Map<string, { expiresAt: number; results: GeocodeResult[] }>();
let lastGeocodeAt = 0;

async function searchAddress(query: string): Promise<GeocodeResult[]> {
  const key = query.toLowerCase().trim();
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastGeocodeAt = Date.now();

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ph`,
    {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "OracleInventory/1.0 (+https://oracleinventory.lubesmastery.com)",
      },
    },
  );
  if (!response.ok) throw new Error("Address search is temporarily unavailable.");
  const results = (await response.json()) as GeocodeResult[];
  geocodeCache.set(key, { results, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return results;
}

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

// POST /api/branches/geocode - explicit, rate-limited address search; never autocomplete.
router.post("/geocode", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) { res.status(400).json({ error: "Address search text is required." }); return; }
  if (query.length > 200) { res.status(400).json({ error: "Address search text is too long." }); return; }
  try {
    res.json(await searchAddress(query));
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Address search is temporarily unavailable." });
  }
});

// POST /api/branches
router.post("/", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
  const { name, address, latitude, longitude } = req.body;
  if (!name) { res.status(400).json({ error: "Branch name is required." }); return; }
  let coordinates;
  try { coordinates = parseBranchCoordinates(latitude, longitude); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid coordinates." }); return; }
  const branch = await prisma.branch.create({
    data: { name, address: address || null, ...coordinates },
    include: {
      _count: { select: { assets: true, employees: true } },
    },
  });
  await logActivity({ userId: req.user!.id, action: "BRANCH_CREATED", entity: "Branch", entityId: branch.id, metadata: { name: branch.name } });
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
router.patch("/:id", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const { name, address, latitude, longitude } = req.body;
  if (name !== undefined && !name) { res.status(400).json({ error: "Branch name cannot be empty." }); return; }
  let coordinates;
  try { coordinates = parseBranchCoordinates(latitude, longitude, { allowOmitted: true }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid coordinates." }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: {
      ...(name      !== undefined && { name }),
      ...(address   !== undefined && { address:   address   || null }),
      ...(coordinates ?? {}),
    },
    include: { _count: { select: { assets: true, employees: true } } },
  });
  await logActivity({ userId: req.user!.id, action: "BRANCH_UPDATED", entity: "Branch", entityId: updated.id, metadata: { name: updated.name } });
  res.json(updated);
});

// PATCH /api/branches/:id/archive
router.patch("/:id/archive", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });
  await logActivity({ userId: req.user!.id, action: "BRANCH_ARCHIVED", entity: "Branch", entityId: updated.id, metadata: { name: updated.name } });
  res.json(updated);
});

// PATCH /api/branches/:id/unarchive
router.patch("/:id/unarchive", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: { archivedAt: null },
  });
  await logActivity({ userId: req.user!.id, action: "BRANCH_UNARCHIVED", entity: "Branch", entityId: updated.id, metadata: { name: updated.name } });
  res.json(updated);
});

// DELETE /api/branches/:id
router.delete("/:id", requirePermission("manage_branches"), async (req: AuthRequest, res: Response) => {
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
  await logActivity({ userId: req.user!.id, action: "BRANCH_DELETED", entity: "Branch", entityId: req.params.id, metadata: { name: branch.name } });
  res.status(204).end();
});

export default router;
