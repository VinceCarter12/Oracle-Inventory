import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/reports/summary
// Optional query params: branchId, categoryId (scope all aggregates),
// from, to (YYYY-MM-DD — scope the movements-by-month window, capped at 12 months)
router.get("/summary", requirePermission("view_reports"), async (req: AuthRequest, res: Response) => {
  const { branchId, categoryId, from, to } = req.query as {
    branchId?: string; categoryId?: string; from?: string; to?: string;
  };

  const assetWhere = {
    ...(branchId ? { branchId } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  // Relation filter for assignment counts when scoped by branch/category
  const assignAssetFilter = Object.keys(assetWhere).length ? { asset: assetWhere } : {};

  const [totalAssets, forRepair, forDisposal] = await Promise.all([
    prisma.asset.count({ where: assetWhere }),
    prisma.asset.count({ where: { ...assetWhere, condition: "for_repair" } }),
    prisma.asset.count({ where: { ...assetWhere, condition: "for_disposal" } }),
  ]);

  const assignedAssets = await prisma.assetAssignment.findMany({
    where: { status: "active", ...assignAssetFilter },
    select: { assetId: true },
    distinct: ["assetId"],
  });

  // Movements by month — from/to window if provided, otherwise last 6 months
  const now = new Date();
  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(to)   : null;
  const validRange = fromDate && toDate && !isNaN(+fromDate) && !isNaN(+toDate) && fromDate <= toDate;

  const monthStarts: Date[] = [];
  if (validRange) {
    const cursor = new Date(fromDate!.getFullYear(), fromDate!.getMonth(), 1);
    const last   = new Date(toDate!.getFullYear(), toDate!.getMonth(), 1);
    while (cursor <= last && monthStarts.length < 12) {
      monthStarts.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
  }

  const movementsByMonth = await Promise.all(
    monthStarts.map(async (start) => {
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const monthLabel = start.toLocaleString("default", { month: "short" });

      const [assignmentsCount, returnsCount] = await Promise.all([
        prisma.assetAssignment.count({
          where: { assignedAt: { gte: start, lt: end }, ...assignAssetFilter },
        }),
        prisma.assetAssignment.count({
          where: {
            returnedAt: { gte: start, lt: end },
            status: { in: ["returned", "transferred"] },
            ...assignAssetFilter,
          },
        }),
      ]);

      return { month: monthLabel, assignments: assignmentsCount, returns: returnsCount };
    })
  );

  // Top categories by asset count
  const allAssets = await prisma.asset.findMany({
    where: assetWhere,
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

  // Branch utilization
  const branchAssets = await prisma.asset.findMany({
    where: assetWhere,
    select: {
      branchId: true,
      branch: { select: { name: true } },
      assignments: { where: { status: "active" as const }, select: { id: true } },
    },
  });

  const branchMap = new Map<string, { name: string; total: number; assigned: number }>();
  for (const a of branchAssets) {
    const key  = a.branchId ?? "__none__";
    const name = a.branch?.name ?? "Unassigned";
    if (!branchMap.has(key)) branchMap.set(key, { name, total: 0, assigned: 0 });
    const entry = branchMap.get(key)!;
    entry.total++;
    if (a.assignments.length > 0) entry.assigned++;
  }
  const branchStats = [...branchMap.values()].sort((a, b) => b.total - a.total);

  // Department stats — assets reach departments through employee assignments
  const activeAssignments = await prisma.assetAssignment.findMany({
    where: { status: "active", ...assignAssetFilter },
    select: {
      assetId: true,
      employee: {
        select: { id: true, department: { select: { name: true } } },
      },
    },
  });

  const deptMap = new Map<string, { name: string; assets: number; employees: Set<string> }>();
  for (const a of activeAssignments) {
    const name = a.employee?.department?.name ?? "No department";
    if (!deptMap.has(name)) deptMap.set(name, { name, assets: 0, employees: new Set() });
    const entry = deptMap.get(name)!;
    entry.assets++;
    if (a.employee) entry.employees.add(a.employee.id);
  }
  const deptStats = [...deptMap.values()]
    .map((d) => ({ name: d.name, assets: d.assets, employees: d.employees.size }))
    .sort((a, b) => b.assets - a.assets);

  // Recent asset movements — assignment history widget
  const recentMovements = await prisma.movementLog.findMany({
    where: {
      type: { in: ["assignment", "transfer", "return_approved", "resignation", "new_hire"] },
      ...(Object.keys(assetWhere).length ? { asset: assetWhere } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      type: true,
      createdAt: true,
      asset: { select: { name: true, assetTag: true } },
      employee: { select: { name: true } },
    },
  });

  res.json({
    kpi: {
      totalAssets,
      assigned: assignedAssets.length,
      available: Math.max(0, totalAssets - assignedAssets.length - forRepair - forDisposal),
      forRepair,
      forDisposal,
    },
    movementsByMonth,
    topCategories,
    branchStats,
    deptStats,
    recentMovements: recentMovements.map((m) => ({
      id: m.id,
      type: m.type,
      asset: m.asset.name,
      assetTag: m.asset.assetTag,
      employee: m.employee?.name ?? null,
      createdAt: m.createdAt,
    })),
  });
});

// GET /api/reports/infrastructure-summary
// Dashboard rollup for CCTV/NVR, network, and servers/firewall/ISP inventory.
// Each domain reports { enabled: false } when its feature rollout is off, instead
// of erroring, so the dashboard can just hide that section. Scoped to the caller's
// branch (Super Admin sees all branches). Firewall count is withheld unless the
// caller holds view_sensitive_network_fields, matching that domain's own gate.
router.get("/infrastructure-summary", requirePermission("view_reports"), async (req: AuthRequest, res: Response) => {
  const account = await prisma.systemUser.findUnique({
    where: { id: req.user!.id },
    select: { branchId: true, role: { select: { name: true } } },
  });
  const isSuperAdmin = account?.role?.name?.trim().toLowerCase() === "super_admin";
  const branchId = isSuperAdmin ? undefined : account?.branchId ?? undefined;
  const branchWhere = branchId ? { branchId } : {};

  async function featureOn(featureKey: string, envVar: string) {
    if (process.env[envVar] !== "true") return false;
    const feature = await prisma.featureRollout.findUnique({ where: { key: featureKey } }).catch(() => null);
    if (!feature) return false;
    const override = branchId
      ? await prisma.featureRolloutBranch.findUnique({ where: { featureKey_branchId: { featureKey, branchId } } }).catch(() => null)
      : null;
    return Boolean(override?.enabled ?? (feature.enabledGlobally && feature.status === "enabled"));
  }

  const [cctvOn, networkOn, infraOn, pendingMismatches] = await Promise.all([
    featureOn("cctv.nvr.v1", "CCTV_NVR_ENABLED"),
    featureOn("network.v1", "NETWORK_INFRA_ENABLED"),
    featureOn("servers.firewall.isp.v1", "SERVERS_FIREWALL_ISP_ENABLED"),
    prisma.hardwareScan.count({ where: { isBaseline: false, overallStatus: "mismatch", status: "pending" } }),
  ]);

  const [cctv, network, infrastructure] = await Promise.all([
    cctvOn
      ? Promise.all([
          prisma.cameraProfile.count({ where: { asset: branchWhere } }),
          prisma.recorderProfile.count({ where: { asset: branchWhere } }),
        ]).then(([cameras, recorders]) => ({ enabled: true, cameras, recorders }))
      : Promise.resolve({ enabled: false as const }),
    networkOn
      ? Promise.all([
          prisma.accessPointProfile.count({ where: { asset: branchWhere } }),
          prisma.switchProfile.count({ where: { asset: branchWhere } }),
        ]).then(([accessPoints, switches]) => ({ enabled: true, accessPoints, switches }))
      : Promise.resolve({ enabled: false as const }),
    infraOn
      ? Promise.all([
          prisma.serverProfile.count({ where: { asset: branchWhere } }),
          isSuperAdmin || req.permissions?.includes("view_sensitive_network_fields")
            ? prisma.firewallProfile.count({ where: { asset: branchWhere } })
            : Promise.resolve(null),
          prisma.ispCircuit.count({ where: branchWhere }),
        ]).then(([servers, firewalls, ispCircuits]) => ({ enabled: true, servers, firewalls, ispCircuits }))
      : Promise.resolve({ enabled: false as const }),
  ]);

  res.json({
    hardwareAudit: { pendingMismatches },
    cctv,
    network,
    infrastructure,
  });
});

// GET /api/reports/condition-trend
// Monthly counts of condition-related movement events (repairs sent/returned, disposals)
router.get("/condition-trend", requirePermission("view_reports"), async (_req: AuthRequest, res: Response) => {
  const now = new Date();
  const months: { month: string; repairsSent: number; repairsReturned: number; disposals: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthLabel = start.toLocaleString("default", { month: "short" });

    const [repairsSent, repairsReturned, disposals] = await Promise.all([
      prisma.movementLog.count({ where: { type: "repair_send", createdAt: { gte: start, lt: end } } }),
      prisma.movementLog.count({ where: { type: "repair_return", createdAt: { gte: start, lt: end } } }),
      prisma.movementLog.count({ where: { type: "disposal", createdAt: { gte: start, lt: end } } }),
    ]);

    months.push({ month: monthLabel, repairsSent, repairsReturned, disposals });
  }

  res.json({ months });
});

// GET /api/reports/movement-frequency?limit=10
// Most-moved assets, ranked by total movement log entries
router.get("/movement-frequency", requirePermission("view_reports"), async (req: AuthRequest, res: Response) => {
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));

  const grouped = await prisma.movementLog.groupBy({
    by: ["assetId"],
    _count: { assetId: true },
    _max: { createdAt: true },
    orderBy: { _count: { assetId: "desc" } },
    take: limit,
  });

  const assets = await prisma.asset.findMany({
    where: { id: { in: grouped.map((g) => g.assetId) } },
    select: {
      id: true, name: true, assetTag: true,
      category: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  res.json({
    assets: grouped.map((g) => {
      const a = assetMap.get(g.assetId);
      return {
        assetId: g.assetId,
        name: a?.name ?? "Unknown asset",
        assetTag: a?.assetTag ?? null,
        category: a?.category?.name ?? null,
        branch: a?.branch?.name ?? null,
        movements: g._count.assetId,
        lastMovedAt: g._max.createdAt,
      };
    }),
  });
});

// ── Helper: format date for display ──────────────────────────────────────────
function fmtDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Helper: global sidebar data (status bars + by-category + timeline) ────────
async function getSidebar() {
  const [assets, logs] = await Promise.all([
    prisma.asset.findMany({
      select: {
        condition: true,
        category: { select: { name: true } },
        assignments: { where: { status: "active" }, select: { id: true } },
      },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { action: true, entity: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  const total = assets.length;
  let assigned = 0, available = 0, forRepair = 0, retiring = 0;
  const catCounts = new Map<string, number>();
  for (const a of assets) {
    catCounts.set(a.category?.name ?? "Uncategorized", (catCounts.get(a.category?.name ?? "Uncategorized") ?? 0) + 1);
    if (a.condition === "for_repair") forRepair++;
    else if (a.condition === "for_disposal") retiring++;
    else if (a.assignments.length > 0) assigned++;
    else available++;
  }

  const statusBars = total === 0 ? [] : [
    { label: "Assigned",  pct: Math.round(assigned  / total * 100), color: "#171717" },
    { label: "Available", pct: Math.round(available  / total * 100), color: "#3b82f6" },
    { label: "In repair", pct: Math.round(forRepair  / total * 100), color: "#f59e0b" },
    { label: "Retiring",  pct: Math.round(retiring   / total * 100), color: "#ef4444" },
  ];

  const byCategory = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, count]) => ({ label, val: String(count) }));

  const COLOR_MAP: Record<string, string> = {
    assignment: "#22c55e", return: "#3b82f6", repair: "#f59e0b",
    disposal: "#ef4444", create: "#a855f7", import: "#6366f1",
  };
  const timeline = logs.map(log => {
    const action = log.action.toLowerCase();
    const color = Object.entries(COLOR_MAP).find(([k]) => action.includes(k))?.[1] ?? "#d1d5db";
    const d = new Date(log.createdAt);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - new Date(d.toDateString()).getTime()) / 86400000);
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const label = diff === 0 ? `Today, ${timeStr}` : diff === 1 ? `Yesterday, ${timeStr}` : fmtDate(d);
    return { color, text: `${log.action} ${log.entity}`, sub: log.user?.name ?? "System", time: label };
  });

  return { statusBars, byCategory, timeline };
}

// ── GET /api/reports/:reportType ──────────────────────────────────────────────
router.get("/:reportType", requirePermission("view_reports"), async (req: AuthRequest, res: Response) => {
  const { reportType } = req.params;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const updatedAt = now.toISOString();

  try {
    const sidebar = await getSidebar();

    switch (reportType) {

      case "total-assets":
      case "assigned-available": {
        const assets = await prisma.asset.findMany({
          select: {
            id: true, name: true, assetTag: true, serialNumber: true, condition: true, createdAt: true,
            category: { select: { name: true } },
            branch: { select: { name: true } },
            assignments: {
              where: { status: "active" },
              select: { assignedAt: true, employee: { select: { name: true } } },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        });

        const rows = assets.map(a => {
          const asgn = a.assignments[0];
          let status = "Available";
          if (a.condition === "for_repair") status = "In repair";
          else if (a.condition === "for_disposal") status = "Retiring";
          else if (asgn) status = "Assigned";
          return {
            name: a.name,
            id: a.assetTag ?? a.serialNumber ?? `AST-${a.id.slice(-6).toUpperCase()}`,
            category: a.category?.name ?? "—",
            branch: a.branch?.name ?? "—",
            assignedTo: asgn?.employee?.name ?? "—",
            assignedDate: asgn ? fmtDate(asgn.assignedAt) : "—",
            status,
          };
        });

        const total = assets.length;
        const assignedCount = rows.filter(r => r.status === "Assigned").length;
        const availableCount = rows.filter(r => r.status === "Available").length;
        const addedThisMonth = assets.filter(a => new Date(a.createdAt) >= monthStart).length;

        const kpi = reportType === "total-assets" ? [
          { label: "Total assets",     value: String(total),         sub: "All categories & branches" },
          { label: "Assigned",         value: String(assignedCount), sub: `${total ? Math.round(assignedCount / total * 100) : 0}% utilization` },
          { label: "Available",        value: String(availableCount),sub: `${total ? Math.round(availableCount / total * 100) : 0}% of total` },
          { label: "Added this month", value: `+${addedThisMonth}`,  sub: `Since ${monthStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` },
        ] : [
          { label: "Total assets", value: String(total),          sub: "All categories & branches" },
          { label: "Assigned",     value: String(assignedCount),  sub: `${total ? Math.round(assignedCount / total * 100) : 0}% utilization rate` },
          { label: "Available",    value: String(availableCount), sub: `${total ? Math.round(availableCount / total * 100) : 0}% of total` },
          { label: "Unallocated",  value: String(total - assignedCount), sub: "No active assignment" },
        ];

        const columns = reportType === "total-assets" ? [
          { key: "_asset", label: "Asset" }, { key: "category", label: "Category" },
          { key: "branch", label: "Branch" }, { key: "assignedTo", label: "Assigned to" },
          { key: "status", label: "Status", badge: true },
        ] : [
          { key: "_asset", label: "Asset" }, { key: "category", label: "Category" },
          { key: "branch", label: "Branch" }, { key: "assignedTo", label: "Assigned to" },
          { key: "assignedDate", label: "Assigned date" }, { key: "status", label: "Status", badge: true },
        ];

        return res.json({
          meta: { records: total, updatedAt }, kpi, columns, rows, sidebar,
          chips: ["All", "Assigned", "Available", "In repair", "Retiring"],
          chipFilterKey: "status",
          cardTitle: reportType === "total-assets" ? "All assets" : "Asset allocation",
          entityName: "assets",
          searchPlaceholder: "Search assets by name, ID, or branch...",
        });
      }

      case "by-category": {
        const assets = await prisma.asset.findMany({
          select: {
            categoryId: true, category: { select: { name: true } },
            branch: { select: { name: true } },
          },
        });

        const catMap = new Map<string, { name: string; count: number; branches: Map<string, number> }>();
        const total = assets.length;
        for (const a of assets) {
          const key = a.categoryId ?? "__none__";
          const name = a.category?.name ?? "Uncategorized";
          if (!catMap.has(key)) catMap.set(key, { name, count: 0, branches: new Map() });
          const e = catMap.get(key)!;
          e.count++;
          if (a.branch?.name) e.branches.set(a.branch.name, (e.branches.get(a.branch.name) ?? 0) + 1);
        }

        const allCats = [...catMap.values()].sort((a, b) => b.count - a.count);
        const rows = allCats.map(c => {
          const topBranch = [...c.branches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
          return { name: c.name, count: String(c.count), pct: `${total ? Math.round(c.count / total * 100) : 0}%`, topSite: topBranch };
        });

        const largest = allCats[0];
        return res.json({
          meta: { records: allCats.length, updatedAt },
          kpi: [
            { label: "Total categories", value: String(allCats.length), sub: "Distinct asset categories" },
            { label: "Total assets",     value: String(total),           sub: "Across all categories" },
            { label: "Largest category", value: largest?.name ?? "—",   sub: largest ? `${largest.count} assets` : "—" },
            { label: "Uncategorized",    value: String(catMap.get("__none__")?.count ?? 0), sub: "Assets without a category" },
          ],
          columns: [
            { key: "name", label: "Category" },
            { key: "count", label: "Asset count", align: "right" as const },
            { key: "pct", label: "% of total", align: "right" as const },
            { key: "topSite", label: "Most common branch" },
          ],
          rows, sidebar, chips: ["All"], chipFilterKey: "name",
          cardTitle: "All categories", entityName: "categories",
          searchPlaceholder: "Search categories...",
        });
      }

      case "repair": {
        const repairAssets = await prisma.asset.findMany({
          where: { condition: "for_repair" },
          select: {
            id: true, name: true, assetTag: true, serialNumber: true, updatedAt: true,
            category: { select: { name: true } }, branch: { select: { name: true } },
            movementLogs: {
              where: { type: "repair_send" },
              orderBy: { createdAt: "desc" }, take: 1,
              select: { createdAt: true, employee: { select: { name: true } } },
            },
          },
          orderBy: { updatedAt: "desc" },
        });

        const totalCount = await prisma.asset.count();
        const rows = repairAssets.map(a => ({
          name: a.name,
          id: a.assetTag ?? a.serialNumber ?? `AST-${a.id.slice(-6).toUpperCase()}`,
          category: a.category?.name ?? "—",
          branch: a.branch?.name ?? "—",
          reportedBy: a.movementLogs[0]?.employee?.name ?? "—",
          repairStart: a.movementLogs[0] ? fmtDate(a.movementLogs[0].createdAt) : "—",
          status: "In repair",
        }));

        const branchCount = new Set(repairAssets.map(a => a.branch?.name).filter(Boolean)).size;
        return res.json({
          meta: { records: repairAssets.length, updatedAt },
          kpi: [
            { label: "Under repair",      value: String(repairAssets.length), sub: "Assets currently in repair" },
            { label: "Repair rate",       value: `${totalCount ? Math.round(repairAssets.length / totalCount * 100) : 0}%`, sub: "Of total inventory" },
            { label: "Branches affected", value: String(branchCount),         sub: "Locations with repair activity" },
            { label: "Recently flagged",  value: String(repairAssets.filter(a => new Date(a.updatedAt) >= monthStart).length), sub: "Updated this month" },
          ],
          columns: [
            { key: "_asset", label: "Asset" }, { key: "category", label: "Category" },
            { key: "branch", label: "Branch" }, { key: "reportedBy", label: "Reported by" },
            { key: "repairStart", label: "Repair start" }, { key: "status", label: "Status", badge: true },
          ],
          rows, sidebar, chips: ["All", "In repair"], chipFilterKey: "status",
          cardTitle: "Assets under repair", entityName: "assets",
          searchPlaceholder: "Search by asset name, ID, or branch...",
        });
      }

      case "disposal": {
        const disposalAssets = await prisma.asset.findMany({
          where: { condition: "for_disposal" },
          select: {
            id: true, name: true, assetTag: true, serialNumber: true, createdAt: true, updatedAt: true,
            category: { select: { name: true } }, branch: { select: { name: true } },
            movementLogs: {
              where: { type: "disposal" },
              orderBy: { createdAt: "desc" }, take: 1,
              select: { employee: { select: { name: true } } },
            },
          },
          orderBy: { updatedAt: "desc" },
        });

        const rows = disposalAssets.map(a => {
          const ageYrs = ((Date.now() - new Date(a.createdAt).getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1);
          return {
            name: a.name,
            id: a.assetTag ?? a.serialNumber ?? `AST-${a.id.slice(-6).toUpperCase()}`,
            category: a.category?.name ?? "—",
            branch: a.branch?.name ?? "—",
            age: `${ageYrs} yrs`,
            condition: "For disposal",
            flaggedBy: a.movementLogs[0]?.employee?.name ?? "—",
            status: "Retiring",
          };
        });

        const avgAgeYrs = disposalAssets.length
          ? (disposalAssets.reduce((s, a) => s + (Date.now() - new Date(a.createdAt).getTime()), 0)
            / disposalAssets.length / (365.25 * 24 * 3600 * 1000)).toFixed(1)
          : "0";
        const branchCount = new Set(disposalAssets.map(a => a.branch?.name).filter(Boolean)).size;

        return res.json({
          meta: { records: disposalAssets.length, updatedAt },
          kpi: [
            { label: "Flagged for disposal", value: String(disposalAssets.length), sub: "Pending or in-progress" },
            { label: "Avg. asset age",        value: `${avgAgeYrs} yrs`,            sub: "Mean age at disposal flag" },
            { label: "Branches affected",     value: String(branchCount),            sub: "Locations with disposal assets" },
            { label: "Recently flagged",      value: String(disposalAssets.filter(a => new Date(a.updatedAt) >= monthStart).length), sub: "Updated this month" },
          ],
          columns: [
            { key: "_asset", label: "Asset" }, { key: "category", label: "Category" },
            { key: "branch", label: "Branch" }, { key: "age", label: "Age" },
            { key: "condition", label: "Condition" }, { key: "flaggedBy", label: "Flagged by" },
            { key: "status", label: "Status", badge: true },
          ],
          rows, sidebar, chips: ["All", "Retiring"], chipFilterKey: "status",
          cardTitle: "Flagged assets", entityName: "assets",
          searchPlaceholder: "Search by asset name, ID, or status...",
        });
      }

      case "assignment-history": {
        const assignments = await prisma.assetAssignment.findMany({
          select: {
            id: true, status: true, assignedAt: true, returnedAt: true,
            asset: { select: { name: true, assetTag: true } },
            employee: { select: { name: true, employeeId: true, department: { select: { name: true } } } },
          },
          orderBy: { assignedAt: "desc" },
        });

        const rows = assignments.map(a => ({
          eventId: `ASN-${a.id.slice(-6).toUpperCase()}`,
          asset: a.asset.name,
          employee: a.employee.name,
          department: a.employee.department?.name ?? "—",
          dateOut: fmtDate(a.assignedAt),
          returnDate: a.returnedAt ? fmtDate(a.returnedAt) : "—",
          type: (a.status === "returned" || a.status === "transferred") ? "Returned" : "Assigned",
        }));

        const activeCount = assignments.filter(a => a.status === "active").length;
        const returnsThisMonth = assignments.filter(a => a.returnedAt && new Date(a.returnedAt) >= monthStart).length;
        const empCount = new Set(assignments.map(a => a.employee.name)).size;

        return res.json({
          meta: { records: assignments.length, updatedAt },
          kpi: [
            { label: "Total events",       value: String(assignments.length), sub: "All-time assignment records" },
            { label: "Active assignments", value: String(activeCount),         sub: "Currently checked out" },
            { label: "Returns this month", value: String(returnsThisMonth),    sub: "Completed returns" },
            { label: "Employees",          value: String(empCount),            sub: "With assignment history" },
          ],
          columns: [
            { key: "eventId", label: "Event ID" }, { key: "asset", label: "Asset" },
            { key: "employee", label: "Employee" }, { key: "department", label: "Department" },
            { key: "dateOut", label: "Date out" }, { key: "returnDate", label: "Return date" },
            { key: "type", label: "Type", badge: true },
          ],
          rows, sidebar, chips: ["All", "Assigned", "Returned"], chipFilterKey: "type",
          cardTitle: "All events", entityName: "events",
          searchPlaceholder: "Search by asset, employee, or event ID...",
        });
      }

      case "by-site": {
        const assets = await prisma.asset.findMany({
          select: {
            branchId: true, condition: true,
            branch: { select: { name: true } },
            assignments: { where: { status: "active" }, select: { id: true } },
          },
        });

        const branchMap = new Map<string, { name: string; total: number; assigned: number; available: number; inRepair: number }>();
        const total = assets.length;
        for (const a of assets) {
          const key = a.branchId ?? "__none__";
          const name = a.branch?.name ?? "Unassigned";
          if (!branchMap.has(key)) branchMap.set(key, { name, total: 0, assigned: 0, available: 0, inRepair: 0 });
          const e = branchMap.get(key)!;
          e.total++;
          if (a.condition === "for_repair") e.inRepair++;
          else if (a.assignments.length > 0) e.assigned++;
          else e.available++;
        }

        const allBranches = [...branchMap.values()].sort((a, b) => b.total - a.total);
        const rows = allBranches.map(b => ({
          name: b.name,
          count: String(b.total),
          pct: `${total ? Math.round(b.total / total * 100) : 0}%`,
          assigned: String(b.assigned),
          available: String(b.available),
          inRepair: String(b.inRepair),
        }));

        const largest = allBranches[0];
        const avg = allBranches.length ? Math.round(total / allBranches.length) : 0;
        return res.json({
          meta: { records: allBranches.length, updatedAt },
          kpi: [
            { label: "Total branches",  value: String(allBranches.length), sub: "Active locations" },
            { label: "Total assets",    value: String(total),              sub: "Across all branches" },
            { label: "Largest branch",  value: largest?.name ?? "—",      sub: largest ? `${largest.total} assets` : "—" },
            { label: "Avg. per branch", value: String(avg),                sub: "Mean across locations" },
          ],
          columns: [
            { key: "name", label: "Branch" },
            { key: "count", label: "Asset count", align: "right" as const },
            { key: "pct", label: "% of total", align: "right" as const },
            { key: "assigned", label: "Assigned", align: "right" as const },
            { key: "available", label: "Available", align: "right" as const },
            { key: "inRepair", label: "In repair", align: "right" as const },
          ],
          rows, sidebar, chips: ["All"], chipFilterKey: "name",
          cardTitle: "All branches", entityName: "branches",
          searchPlaceholder: "Search branches...",
        });
      }

      case "employee-ownership": {
        const [employees, depts] = await Promise.all([
          prisma.employee.findMany({
            where: { assignments: { some: { status: "active" } } },
            select: {
              id: true, name: true, employeeId: true,
              department: { select: { name: true } },
              branch: { select: { name: true } },
              assignments: {
                where: { status: "active" },
                select: { assignedAt: true, asset: { select: { category: { select: { name: true } } } } },
                orderBy: { assignedAt: "desc" },
              },
            },
            orderBy: { name: "asc" },
          }),
          prisma.department.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
        ]);

        const rows = employees.map(e => {
          const cats = [...new Set(e.assignments.map(a => a.asset?.category?.name).filter((v): v is string => !!v))];
          return {
            empName: e.name,
            empId: e.employeeId ?? `EMP-${e.id.slice(-6).toUpperCase()}`,
            department: e.department?.name ?? "—",
            branch: e.branch?.name ?? "—",
            assetsHeld: String(e.assignments.length),
            assetTypes: cats.slice(0, 3).join(", ") || "—",
            lastAssigned: e.assignments[0]?.assignedAt ? fmtDate(e.assignments[0].assignedAt) : "—",
          };
        });

        const totalAssignments = employees.reduce((s, e) => s + e.assignments.length, 0);
        const deptCount = new Set(employees.map(e => e.department?.name).filter(Boolean)).size;
        return res.json({
          meta: { records: employees.length, updatedAt },
          kpi: [
            { label: "Employees with assets", value: String(employees.length),                                    sub: "With active assignments" },
            { label: "Assets checked out",    value: String(totalAssignments),                                    sub: "Currently assigned" },
            { label: "Avg. per employee",     value: employees.length ? (totalAssignments / employees.length).toFixed(1) : "0", sub: "Mean assets per person" },
            { label: "Departments",           value: String(deptCount),                                           sub: "With assigned assets" },
          ],
          columns: [
            { key: "_employee", label: "Employee" }, { key: "department", label: "Department" },
            { key: "branch", label: "Branch" }, { key: "assetsHeld", label: "Assets held", align: "right" as const },
            { key: "assetTypes", label: "Asset types" }, { key: "lastAssigned", label: "Last assigned" },
          ],
          rows, sidebar,
          chips: ["All", ...depts.map(d => d.name)],
          chipFilterKey: "department",
          cardTitle: "All employees", entityName: "employees",
          searchPlaceholder: "Search employees by name or ID...",
        });
      }

      case "site-utilization": {
        const [assets, employees] = await Promise.all([
          prisma.asset.findMany({
            select: {
              branchId: true, branch: { select: { name: true } },
              assignments: { where: { status: "active" }, select: { id: true } },
            },
          }),
          prisma.employee.findMany({ select: { branchId: true }, where: { isActive: true } }),
        ]);

        const branchMap = new Map<string, { name: string; total: number; assigned: number }>();
        for (const a of assets) {
          const key = a.branchId ?? "__none__";
          const name = a.branch?.name ?? "Unassigned";
          if (!branchMap.has(key)) branchMap.set(key, { name, total: 0, assigned: 0 });
          const e = branchMap.get(key)!;
          e.total++;
          if (a.assignments.length > 0) e.assigned++;
        }

        const empByBranch = new Map<string, number>();
        for (const e of employees) {
          const key = e.branchId ?? "__none__";
          empByBranch.set(key, (empByBranch.get(key) ?? 0) + 1);
        }

        const allBranches = [...branchMap.entries()].map(([key, b]) => ({
          ...b,
          util: b.total === 0 ? 0 : Math.round(b.assigned / b.total * 100),
          employees: empByBranch.get(key) ?? 0,
          utilBand: b.total === 0 ? "Under 50%" : b.assigned / b.total > 0.75 ? "Over 75%" : b.assigned / b.total >= 0.5 ? "50–75%" : "Under 50%",
        })).sort((a, b) => b.util - a.util);

        const rows = allBranches.map(b => ({
          name: b.name,
          deployed: String(b.total),
          utilPct: `${b.util}%`,
          employees: String(b.employees),
          utilBand: b.utilBand,
          status: b.util > 90 ? "Near capacity" : b.util > 75 ? "Healthy" : b.util >= 50 ? "Moderate" : "Underutilized",
        }));

        const avgUtil = allBranches.length ? Math.round(allBranches.reduce((s, b) => s + b.util, 0) / allBranches.length) : 0;
        return res.json({
          meta: { records: allBranches.length, updatedAt },
          kpi: [
            { label: "Total branches",   value: String(allBranches.length),                     sub: "Active locations" },
            { label: "Avg. utilization", value: `${avgUtil}%`,                                   sub: "Mean across branches" },
            { label: "Over capacity",    value: String(allBranches.filter(b => b.util > 90).length),   sub: "Branches at >90% utilization" },
            { label: "Underutilized",    value: String(allBranches.filter(b => b.util < 30).length),   sub: "Branches at <30% utilization" },
          ],
          columns: [
            { key: "name", label: "Branch" },
            { key: "deployed", label: "Total assets", align: "right" as const },
            { key: "utilPct", label: "Utilization", align: "right" as const },
            { key: "employees", label: "Employees", align: "right" as const },
            { key: "status", label: "Status", badge: true },
          ],
          rows, sidebar,
          chips: ["All", "Over 75%", "50–75%", "Under 50%"],
          chipFilterKey: "utilBand",
          cardTitle: "All branches", entityName: "branches",
          searchPlaceholder: "Search branches...",
        });
      }

      default:
        return res.status(404).json({ error: `Unknown report type: ${reportType}` });
    }
  } catch (err) {
    console.error("[reports]", err);
    return res.status(500).json({ error: "Failed to load report data" });
  }
});

export default router;
