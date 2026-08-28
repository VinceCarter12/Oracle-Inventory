import { Router, Response, Request } from "express";
import multer from "multer";
import { randomBytes, randomUUID } from "crypto";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { getOcrProvider, parseOcrText } from "../lib/ocr";
import { prisma } from "../lib/prisma";
import { logActivity } from "../lib/activity";

const router = Router();

// multer — memory storage, max 10 MB, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  return randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F2B9"
}

function roomExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  return d;
}

// Map parsed OCR data to Asset create payload
function parsedToAsset(p: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  // Build a description from brand/model + identifier metadata
  const descParts: string[] = [];
  if (p.brand || p.model) descParts.push([p.brand, p.model].filter(Boolean).join(" ") as string);
  if (p.imei1)      descParts.push(`IMEI 1: ${p.imei1}`);
  if (p.imei2)      descParts.push(`IMEI 2: ${p.imei2}`);
  if (p.macAddress) descParts.push(`MAC: ${p.macAddress}`);
  if (p.serviceTag) descParts.push(`Service Tag: ${p.serviceTag}`);
  if (p.assetTag)   descParts.push(`Asset Tag: ${p.assetTag}`);
  if (p.deviceType && p.deviceType !== "unknown") descParts.push(`Device Type: ${p.deviceType}`);

  return {
    name:         (p.assetName as string) || [`${p.brand ?? ""}`, `${p.model ?? ""}`].filter(Boolean).join(" ") || "Scanned Asset",
    serialNumber: (p.serialNumber as string) || null,
    macAddress:   (p.macAddress  as string) || null,
    assetTag:     (p.assetTag    as string) || null,
    condition:    "usable" as const,
    ownership:    "company" as const,
    description:  descParts.join(" | ") || null,
    ...extra,
  };
}

// ── POST /api/scan/ocr ────────────────────────────────────────────────────────
router.post(
  "/ocr",
  requireAuth,
  requirePermission("scan_assets"),
  upload.single("image"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided." });
      return;
    }
    try {
      const provider = getOcrProvider();
      const { lines } = await provider.extractText(req.file.buffer, req.file.mimetype);
      const parsed = parseOcrText(lines);

      await logActivity({
        userId:   req.user!.id,
        action:   "scan",
        entity:   "Asset",
        metadata: {
          provider:        process.env.OCR_PROVIDER ?? "tesseract",
          linesFound:      lines.length,
          assetName:       parsed.assetName  || null,
          serialFound:     !!parsed.serialNumber,
          imeiFound:       !!parsed.imei1,
          macFound:        !!parsed.macAddress,
          modelFound:      !!parsed.model,
          serviceTagFound: !!parsed.serviceTag,
          assetTagFound:   !!parsed.assetTag,
          reason:          parsed.scanReason || null,
        },
      });

      res.json({ lines, parsed });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OCR failed";
      res.status(502).json({ error: `OCR service unavailable: ${msg}` });
    }
  }
);

// ── GET /api/scan/check-duplicate ─────────────────────────────────────────────
router.get(
  "/check-duplicate",
  requireAuth,
  requirePermission("scan_assets"),
  async (req: AuthRequest, res: Response) => {
    const { serialNumber, imei1, imei2, macAddress, serviceTag, assetTag } =
      req.query as Record<string, string>;

    const orClauses: object[] = [];
    if (serialNumber?.trim()) {
      orClauses.push({ serialNumber: { equals: serialNumber.trim(), mode: "insensitive" as const } });
    }
    const textTokens = [imei1, imei2, macAddress, serviceTag, assetTag].filter(Boolean);
    for (const token of textTokens) {
      orClauses.push({ description: { contains: token, mode: "insensitive" as const } });
    }
    if (!orClauses.length) { res.json({ duplicates: [] }); return; }

    const assets = await prisma.asset.findMany({
      where:  { OR: orClauses },
      select: {
        id: true, name: true, serialNumber: true,
        condition: true, status: true,
        branch:   { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      take: 5,
    });
    res.json({ duplicates: assets });
  }
);

// ── POST /api/scan/room ───────────────────────────────────────────────────────
// Create a scan room with up to 5 pre-generated device slots
router.post(
  "/room",
  requireAuth,
  requirePermission("scan_assets"),
  async (req: AuthRequest, res: Response) => {
    const maxDevices = Math.min(parseInt(String(req.body?.maxDevices ?? 5), 10) || 5, 5);

    // Unique room code — retry on collision
    let roomCode = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.scanRoom.findUnique({ where: { roomCode } });
      if (!exists) break;
      roomCode = generateRoomCode();
    }

    const room = await prisma.scanRoom.create({
      data: {
        roomCode,
        ownerId:    req.user!.id,
        maxDevices,
        expiresAt:  roomExpiry(),
        devices: {
          create: Array.from({ length: maxDevices }, (_, i) => ({
            deviceToken: randomUUID(),
            deviceLabel: `Phone ${i + 1}`,
          })),
        },
      },
      include: { devices: { orderBy: { deviceLabel: "asc" } } },
    });

    res.json({
      roomId:    room.id,
      roomCode:  room.roomCode,
      expiresAt: room.expiresAt,
      devices:   room.devices.map(d => ({
        deviceId:    d.id,
        deviceToken: d.deviceToken,
        deviceLabel: d.deviceLabel,
        status:      d.status,
      })),
    });
  }
);

// ── GET /api/scan/room/:roomId ────────────────────────────────────────────────
// Desktop polls for results + device statuses
router.get(
  "/room/:roomId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const room = await prisma.scanRoom.findUnique({
      where:   { id: req.params.roomId },
      include: {
        devices: { orderBy: { deviceLabel: "asc" } },
        results: {
          orderBy: { scannedAt: "asc" },
          include: { device: { select: { deviceLabel: true } } },
        },
      },
    });

    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.ownerId !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    // Auto-expire
    if (room.status === "open" && new Date() > room.expiresAt) {
      await prisma.scanRoom.update({ where: { id: room.id }, data: { status: "expired" } });
      room.status = "expired";
    }

    res.json({
      roomId:    room.id,
      roomCode:  room.roomCode,
      status:    room.status,
      expiresAt: room.expiresAt,
      devices:   room.devices.map(d => ({
        deviceId:    d.id,
        deviceLabel: d.deviceLabel,
        status:      d.status,
        lastSeenAt:  d.lastSeenAt,
      })),
      results: room.results.map(r => ({
        id:          r.id,
        deviceLabel: r.device.deviceLabel,
        parsedData:  r.parsedData,
        status:      r.status,
        rejectReason: r.rejectReason,
        assetId:     r.assetId,
        scannedAt:   r.scannedAt,
      })),
      resultCount: room.results.length,
    });
  }
);

// ── DELETE /api/scan/room/:roomId ─────────────────────────────────────────────
router.delete(
  "/room/:roomId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const room = await prisma.scanRoom.findUnique({ where: { id: req.params.roomId } });
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.ownerId !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    await prisma.scanRoom.update({ where: { id: room.id }, data: { status: "closed" } });
    res.json({ ok: true });
  }
);

// ── POST /api/scan/room/:roomId/batch-create ──────────────────────────────────
// Accept a list of ScanResult IDs and create Asset records
router.post(
  "/room/:roomId/batch-create",
  requireAuth,
  requirePermission("scan_assets"),
  async (req: AuthRequest, res: Response) => {
    const { resultIds, categoryId, branchId } = req.body as {
      resultIds: string[];
      categoryId?: string;
      branchId?:   string;
    };

    if (!Array.isArray(resultIds) || !resultIds.length) {
      res.status(400).json({ error: "resultIds array is required" });
      return;
    }
    if (!branchId) { res.status(400).json({ error: "Branch is required." }); return; }

    const room = await prisma.scanRoom.findUnique({ where: { id: req.params.roomId } });
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (room.ownerId !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const results = await prisma.scanResult.findMany({
      where: { id: { in: resultIds }, roomId: room.id, status: "pending" },
    });

    const created: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    // Process each result individually — create asset then mark accepted
    for (const r of results) {
      try {
        const p = r.parsedData as Record<string, unknown>;
        const asset = await prisma.asset.create({
          data: {
            ...parsedToAsset(p),
            ...(categoryId ? { categoryId } : {}),
            ...(branchId   ? { branchId   } : {}),
          },
        });
        await prisma.scanResult.update({
          where: { id: r.id },
          data:  { status: "accepted", assetId: asset.id },
        });
        created.push(asset.id);
      } catch (err) {
        failed.push({ id: r.id, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await logActivity({
      userId:   req.user!.id,
      action:   "batch_create",
      entity:   "Asset",
      metadata: { roomId: room.id, created: created.length, failed: failed.length },
    });

    res.json({ created: created.length, failed });
  }
);

// ── GET /api/scan/admin/queue ─────────────────────────────────────────────────
router.get(
  "/admin/queue",
  requireAuth,
  requirePermission("approve_transactions"),
  async (req: AuthRequest, res: Response) => {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit = Math.min(100, parseInt(String(req.query.limit ?? 50), 10));
    const status = (req.query.status as string) || "pending";
    const userId = req.query.userId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo   = req.query.dateTo   as string | undefined;

    const where: object = {
      status,
      ...(userId   ? { room: { ownerId: userId } } : {}),
      ...(dateFrom || dateTo ? {
        scannedAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
        },
      } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.scanResult.count({ where }),
      prisma.scanResult.findMany({
        where,
        orderBy: { scannedAt: "desc" },
        skip:  (page - 1) * limit,
        take:  limit,
        include: {
          device: { select: { deviceLabel: true } },
          room:   {
            select: {
              roomCode: true,
              owner: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      items: items.map(r => ({
        id:           r.id,
        status:       r.status,
        parsedData:   r.parsedData,
        rawLines:     r.rawLines,
        rejectReason: r.rejectReason,
        assetId:      r.assetId,
        scannedAt:    r.scannedAt,
        deviceLabel:  r.device.deviceLabel,
        roomCode:     r.room.roomCode,
        owner:        r.room.owner,
      })),
    });
  }
);

// ── PATCH /api/scan/admin/results/:id ────────────────────────────────────────
router.patch(
  "/admin/results/:id",
  requireAuth,
  requirePermission("approve_transactions"),
  async (req: AuthRequest, res: Response) => {
    const { action, reason, categoryId, branchId } = req.body as {
      action:     "accept" | "reject";
      reason?:    string;
      categoryId?: string;
      branchId?:   string;
    };

    const result = await prisma.scanResult.findUnique({
      where: { id: req.params.id },
    });
    if (!result) { res.status(404).json({ error: "Result not found" }); return; }
    if (result.status !== "pending") {
      res.status(409).json({ error: `Already ${result.status}` });
      return;
    }

    if (action === "reject") {
      await prisma.scanResult.update({
        where: { id: result.id },
        data:  { status: "rejected", rejectReason: reason ?? null },
      });
      await logActivity({
        userId:   req.user!.id,
        action:   "reject_scan",
        entity:   "ScanResult",
        entityId: result.id,
        metadata: { reason },
      });
      res.json({ ok: true, status: "rejected" });
      return;
    }

    // action === "accept" — create asset
    if (!branchId) { res.status(400).json({ error: "Branch is required." }); return; }
    const p = result.parsedData as Record<string, unknown>;
    const asset = await prisma.asset.create({
      data: {
        ...parsedToAsset(p),
        ...(categoryId ? { categoryId } : {}),
        ...(branchId   ? { branchId   } : {}),
      },
    });
    await prisma.scanResult.update({
      where: { id: result.id },
      data:  { status: "accepted", assetId: asset.id },
    });
    await logActivity({
      userId:   req.user!.id,
      action:   "accept_scan",
      entity:   "Asset",
      entityId: asset.id,
      metadata: { scanResultId: result.id },
    });
    res.json({ ok: true, status: "accepted", assetId: asset.id });
  }
);

// ── POST /api/scan/admin/batch ────────────────────────────────────────────────
router.post(
  "/admin/batch",
  requireAuth,
  requirePermission("approve_transactions"),
  async (req: AuthRequest, res: Response) => {
    const { resultIds, action, reason, categoryId, branchId } = req.body as {
      resultIds:   string[];
      action:      "accept" | "reject";
      reason?:     string;
      categoryId?: string;
      branchId?:   string;
    };

    if (!Array.isArray(resultIds) || !resultIds.length) {
      res.status(400).json({ error: "resultIds required" });
      return;
    }
    if (action === "accept" && !branchId) { res.status(400).json({ error: "Branch is required." }); return; }

    const results = await prisma.scanResult.findMany({
      where: { id: { in: resultIds }, status: "pending" },
    });

    const done: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const r of results) {
      try {
        if (action === "reject") {
          await prisma.scanResult.update({
            where: { id: r.id },
            data:  { status: "rejected", rejectReason: reason ?? null },
          });
        } else {
          const p = r.parsedData as Record<string, unknown>;
          const asset = await prisma.asset.create({
            data: {
              ...parsedToAsset(p),
              ...(categoryId ? { categoryId } : {}),
              ...(branchId   ? { branchId   } : {}),
            },
          });
          await prisma.scanResult.update({
            where: { id: r.id },
            data:  { status: "accepted", assetId: asset.id },
          });
        }
        done.push(r.id);
      } catch (err) {
        failed.push({ id: r.id, reason: err instanceof Error ? err.message : "Error" });
      }
    }

    await logActivity({
      userId:   req.user!.id,
      action:   `admin_batch_${action}`,
      entity:   "ScanResult",
      metadata: { count: done.length, failed: failed.length },
    });

    res.json({ done: done.length, failed });
  }
);

// ── POST /api/scan/device/:deviceToken/ping  (PUBLIC — token auth) ────────────
// Mobile calls this on mount to mark device as connected
router.post(
  "/device/:deviceToken/ping",
  async (req: Request, res: Response) => {
    const device = await prisma.scanDevice.findUnique({
      where:   { deviceToken: req.params.deviceToken },
      include: { room: true },
    });
    if (!device) { res.status(404).json({ error: "Invalid device token" }); return; }
    if (device.room.status !== "open" || new Date() > device.room.expiresAt) {
      res.status(410).json({ error: "Session expired" });
      return;
    }

    await prisma.scanDevice.update({
      where: { id: device.id },
      data:  { status: "connected", connectedAt: new Date(), lastSeenAt: new Date() },
    });

    res.json({
      deviceLabel: device.deviceLabel,
      roomCode:    device.room.roomCode,
      expiresAt:   device.room.expiresAt,
    });
  }
);

// ── POST /api/scan/device/:deviceToken/result  (PUBLIC — token auth) ──────────
// Mobile submits an image; server runs OCR and stores ScanResult
router.post(
  "/device/:deviceToken/result",
  upload.single("image"),
  async (req: Request, res: Response) => {
    const device = await prisma.scanDevice.findUnique({
      where:   { deviceToken: req.params.deviceToken },
      include: { room: true },
    });
    if (!device) { res.status(404).json({ error: "Invalid device token" }); return; }
    if (device.room.status !== "open" || new Date() > device.room.expiresAt) {
      res.status(410).json({ error: "Session expired" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image provided" });
      return;
    }

    // Mark device as scanning
    await prisma.scanDevice.update({
      where: { id: device.id },
      data:  { status: "scanning", lastSeenAt: new Date() },
    });

    try {
      const provider = getOcrProvider();
      const { lines } = await provider.extractText(req.file.buffer, req.file.mimetype);
      const parsed = parseOcrText(lines);

      const result = await prisma.scanResult.create({
        data: {
          roomId:     device.roomId,
          deviceId:   device.id,
          parsedData: parsed as object,
          rawLines:   lines as object,
        },
      });

      // Mark device as connected (idle) again
      await prisma.scanDevice.update({
        where: { id: device.id },
        data:  { status: "connected", lastSeenAt: new Date() },
      });

      res.json({ resultId: result.id, parsed });
    } catch (err: unknown) {
      await prisma.scanDevice.update({
        where: { id: device.id },
        data:  { status: "connected", lastSeenAt: new Date() },
      });
      const msg = err instanceof Error ? err.message : "OCR failed";
      res.status(502).json({ error: `OCR failed: ${msg}` });
    }
  }
);

export default router;
