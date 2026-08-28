import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Human-readable groupings over the raw `entity` column, which otherwise
// exposes internal Prisma model names (e.g. "IpAddressObservation",
// "CircuitEquipmentAssignment") directly in the filter UI.
const ENTITY_CATEGORIES: { key: string; label: string; entities: string[] }[] = [
  {
    key: "assets", label: "Assets & Inventory",
    entities: ["Asset", "ComputerIntakeDraft", "ComputerIntake", "ScanResult", "Import", "ImportHistory", "InventoryFieldProposal", "HardwareScan"],
  },
  {
    key: "assignments", label: "Assignments & Returns",
    entities: ["Assignment"],
  },
  {
    key: "network", label: "Network & Infrastructure",
    entities: ["NetworkInterface", "IpAddressObservation", "Vlan", "NetworkPort", "PortConnection", "InterfaceVlanAssignment", "NetworkDeviceCredential", "AccessPointProfile", "SwitchProfile", "PhoneProfile", "IspCircuit", "IspCircuitAddress", "FirewallProfile", "ServerProfile", "ServerRoleAssignment", "CircuitEquipmentAssignment"],
  },
  {
    key: "cctv", label: "CCTV & NVR",
    entities: ["CameraProfile", "RecorderProfile", "CameraChannelAssignment"],
  },
  {
    key: "stock", label: "Stock",
    entities: ["StockMovement", "StockCountSession"],
  },
  {
    key: "people", label: "Employees & Departments",
    entities: ["Employee", "Department"],
  },
  {
    key: "users", label: "Users & Roles",
    entities: ["User", "Role"],
  },
  {
    key: "branches", label: "Branches & Categories",
    entities: ["Branch", "Category"],
  },
  {
    key: "security", label: "Security & Credentials",
    entities: ["SecretReference", "AssetSecretReference", "IspCircuitSecretReference"],
  },
  {
    key: "settings", label: "System Settings",
    entities: ["FeatureRollout", "FeatureRolloutBranch"],
  },
  {
    key: "sessions", label: "Sessions & Logins",
    entities: ["Session"],
  },
];
const CATEGORY_BY_KEY = new Map(ENTITY_CATEGORIES.map((c) => [c.key, c.entities]));

// GET /api/activity/entities
router.get("/entities", requirePermission("access_logs"), async (_req, res: Response) => {
  const rows = await prisma.activityLog.findMany({
    select: { entity: true },
    distinct: ["entity"],
    orderBy: { entity: "asc" },
  });
  res.json(rows.map((r) => r.entity));
});

// GET /api/activity/categories — human-readable filter groups
router.get("/categories", requirePermission("access_logs"), async (_req, res: Response) => {
  res.json(ENTITY_CATEGORIES.map((c) => ({ key: c.key, label: c.label })));
});

// GET /api/activity/users — users who have at least one logged action
router.get("/users", requirePermission("access_logs"), async (_req, res: Response) => {
  const rows = await prisma.activityLog.findMany({
    where: { userId: { not: null } },
    distinct: ["userId"],
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const users = rows
    .map((r) => r.user)
    .filter((u): u is { id: string; name: string; email: string } => Boolean(u))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(users);
});

// GET /api/activity?limit&offset&category&entity&userId&action&from&to
router.get("/", requirePermission("access_logs"), async (req: Request, res: Response) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50"), 10), 200);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const where: Record<string, unknown> = {};
  if (req.query.category) {
    const entities = CATEGORY_BY_KEY.get(String(req.query.category));
    where.entity = entities ? { in: entities } : { in: [] };
  } else if (req.query.entity) {
    where.entity = req.query.entity;
  }
  if (req.query.userId) where.userId = req.query.userId;
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
