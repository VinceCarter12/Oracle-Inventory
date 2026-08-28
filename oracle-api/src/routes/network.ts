import { Router } from "express";
import net from "net";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { decryptDeviceCredentials } from "../lib/deviceCredentialCrypto";

// Reads only. Every write route (POST/PUT) for interfaces, IP observations,
// VLANs, ports, connections, and VLAN assignments lives in
// network-mutations.ts, which is mounted before this router in app.ts —
// duplicate write handlers used to exist here too but were unreachable dead
// code, since Express matches the first-registered handler for a given
// path+method across routers sharing the same "/network" prefix. Removed
// 2026-08-26; normalizeMac/validIp stay exported for their unit tests.
const router = Router();
export function normalizeMac(value: unknown): string | null { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value)) return null; return value.replace(/-/g, ":").toUpperCase(); }
async function scopeAsset(req: AuthRequest, assetId: string) { const [asset, user] = await Promise.all([prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, branchId: true } }), prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } })]); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin"; return { asset, allowed: Boolean(asset && (superAdmin || user?.branchId === asset.branchId)) }; }
export function validIp(address: unknown, prefix: unknown) { if (typeof address !== "string" || !net.isIP(address)) return false; return Number.isInteger(prefix) && Number(prefix) >= 0 && Number(prefix) <= (net.isIPv4(address) ? 32 : 128); }

router.get("/interfaces", requireAuth, requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin";
  if (!superAdmin && !user?.branchId) { res.json({ items: [], page: 1, pageSize: 20, total: 0 }); return; }
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : undefined; const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = { ...(assetId ? { assetId } : {}), ...(!superAdmin ? { asset: { branchId: user!.branchId! } } : {}) };
  const [items, total] = await Promise.all([prisma.networkInterface.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: "desc" }, include: { asset: { select: { name: true, assetTag: true } } } }), prisma.networkInterface.count({ where })]); res.json({ items, page, pageSize, total });
});

router.get("/ports", requireAuth, requirePermission("view_inventory"), async (req: AuthRequest, res) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin";
  if (!superAdmin && !user?.branchId) { res.json({ items: [], page: 1, pageSize: 20, total: 0 }); return; }
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : undefined; const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = { ...(assetId ? { assetId } : {}), ...(!superAdmin ? { asset: { branchId: user!.branchId! } } : {}) };
  const [items, total] = await Promise.all([prisma.networkPort.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: "desc" }, include: { asset: { select: { name: true, assetTag: true } } } }), prisma.networkPort.count({ where })]); res.json({ items, page, pageSize, total });
});

router.get("/interfaces/:id/ip-observations", requireAuth, requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const iface = await prisma.networkInterface.findUnique({ where: { id: req.params.id }, select: { id: true, assetId: true } }); if (!iface) { res.status(404).json({ error: "Interface not found." }); return; } const scope = await scopeAsset(req, iface.assetId); if (!scope.allowed) { res.status(403).json({ error: "Interface is outside your branch scope." }); return; } res.json({ items: await prisma.ipAddressObservation.findMany({ where: { interfaceId: iface.id }, orderBy: { observedAt: "desc" } }) });
});
router.get("/vlans", requireAuth, requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined; const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin"; if (!superAdmin && (!user?.branchId || (branchId && branchId !== user.branchId))) { res.status(403).json({ error: "Branch is outside your scope." }); return; } res.json({ items: await prisma.vlan.findMany({ where: { branchId: superAdmin ? branchId : user!.branchId! }, orderBy: { vlanNumber: "asc" } }) });
});
router.get("/topology", requireAuth, requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined; const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin"; if (!superAdmin && (!user?.branchId || (branchId && branchId !== user.branchId))) { res.status(403).json({ error: "Branch is outside your scope." }); return; } const where = { ...(superAdmin && branchId ? { branchId } : (!superAdmin ? { branchId: user!.branchId! } : {})) }; res.json({ items: await prisma.portConnection.findMany({ where, include: { fromPort: { include: { asset: { select: { name: true, assetTag: true } } } }, toPort: { include: { asset: { select: { name: true, assetTag: true } } } }, toInterface: { include: { asset: { select: { name: true, assetTag: true } } } } }, orderBy: { effectiveFrom: "desc" } }) });
});
router.get("/branches/:branchId/connectivity", requireAuth, requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); if (user?.role?.name?.toLowerCase() !== "super_admin" && user?.branchId !== req.params.branchId) { res.status(403).json({ error: "Branch is outside your scope." }); return; } const [interfaces, ports, vlans, connections] = await Promise.all([prisma.networkInterface.count({ where: { asset: { branchId: req.params.branchId } } }), prisma.networkPort.count({ where: { asset: { branchId: req.params.branchId } } }), prisma.vlan.count({ where: { branchId: req.params.branchId } }), prisma.portConnection.count({ where: { branchId: req.params.branchId, effectiveTo: null } })]); res.json({ branchId: req.params.branchId, interfaces, ports, vlans, activeConnections: connections });
});

router.get("/device-credentials", requireAuth, requirePermission("view_inventory"), requirePermission("view_sensitive_network_fields"), async (req: AuthRequest, res) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { branchId: true, role: { select: { name: true } } } }); const superAdmin = user?.role?.name?.toLowerCase() === "super_admin";
  if (!superAdmin && !user?.branchId) { res.json({ items: [] }); return; }
  const where = superAdmin ? {} : { asset: { branchId: user!.branchId! } };
  const items = await prisma.networkDeviceCredential.findMany({
    where, orderBy: { updatedAt: "desc" },
    select: { id: true, assetId: true, hasUsername: true, hasPassword: true, hasSnmpCommunity: true, hasVpnKey: true, hasWifiPassword: true, hasApiKey: true, hasRecoveryCode: true, updatedAt: true, asset: { select: { name: true, assetTag: true } } },
  });
  res.json({ items });
});

// Decrypting actual credential values is restricted to super_admin, on top of
// the view_sensitive_network_fields gate above, AND requires the requester to
// re-enter their OWN account password (step-up auth) — this is the one place
// raw device secrets leave encrypted storage, so every attempt is logged,
// successful or not.
router.post("/device-credentials/:assetId/reveal", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  if (!currentPassword) { res.status(400).json({ error: "Re-enter your account password to reveal credentials.", code: "PASSWORD_REQUIRED" }); return; }
  const requester = await prisma.systemUser.findUnique({ where: { id: req.user!.id }, select: { password: true } });
  const passwordOk = Boolean(requester) && (await bcrypt.compare(currentPassword, requester!.password));
  if (!passwordOk) {
    await prisma.activityLog.create({ data: { userId: req.user!.id, action: "network_device_credential_reveal_denied", entity: "NetworkDeviceCredential", entityId: req.params.assetId, metadata: { assetId: req.params.assetId, reason: "invalid_password" } } });
    res.status(403).json({ error: "Incorrect password.", code: "INVALID_PASSWORD" });
    return;
  }
  const record = await prisma.networkDeviceCredential.findUnique({ where: { assetId: req.params.assetId } });
  if (!record) { res.status(404).json({ error: "No credentials recorded for this asset." }); return; }
  try {
    const payload = decryptDeviceCredentials(record.ciphertext, record.iv, record.tag);
    await prisma.activityLog.create({ data: { userId: req.user!.id, action: "network_device_credential_revealed", entity: "NetworkDeviceCredential", entityId: record.id, metadata: { assetId: record.assetId } } });
    res.json(payload);
  } catch {
    res.status(503).json({ error: "Device credential encryption is not configured for this environment.", code: "CREDENTIAL_KEY_MISSING" });
  }
});

export default router;
