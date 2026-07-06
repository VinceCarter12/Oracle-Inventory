import { Router, Response } from "express";
import multer from "multer";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { logActivity } from "../lib/activity";
import { parseBelarc } from "../lib/belarc/parseBelarc";
import { compareSpecs } from "../lib/belarc/compare";
import { NotABelarcReportError, type ParsedSpecs } from "../lib/belarc/types";

const router = Router();

// multer — memory storage, max 2 MB (real Belarc exports are ~130 KB), HTML only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      /\.html?$/i.test(file.originalname) ||
      file.mimetype === "text/html" ||
      file.mimetype === "application/octet-stream";
    if (ok) cb(null, true);
    else cb(new Error("Only Belarc HTML exports (.html, .htm) are accepted"));
  },
});

// Scan list/detail payloads never include rawHtml (it's ~130 KB of evidence,
// served only by the /raw endpoint)
const scanSummarySelect = {
  id: true,
  assetId: true,
  fileName: true,
  isBaseline: true,
  overallStatus: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

// ── POST /api/hardware-audit/scan ─────────────────────────────────────────────
// Upload a Belarc HTML export. Pass dryRun=true to parse + preview only.
router.post(
  "/scan",
  requireAuth,
  requirePermission("view_inventory"),
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }
    const html = req.file.buffer.toString("utf-8");

    let parsedSpecs;
    try {
      parsedSpecs = parseBelarc(html);
    } catch (e) {
      if (e instanceof NotABelarcReportError) {
        res.status(400).json({ error: "This file does not look like a Belarc Advisor report." });
        return;
      }
      throw e;
    }

    const assetId = req.body.assetId as string | undefined;

    if (req.body.dryRun === "true") {
      // Preview parse — and preview the comparison too when the asset already
      // has a baseline, so the uploader sees discrepancies before submitting
      let comparison = null;
      if (assetId) {
        const baseline = await prisma.hardwareScan.findFirst({
          where: { assetId, isBaseline: true },
          select: { parsedSpecs: true },
        }).catch(() => null);
        if (baseline) {
          comparison = compareSpecs(baseline.parsedSpecs as unknown as ParsedSpecs, parsedSpecs);
        }
      }
      res.json({ dryRun: true, parsedSpecs, comparison });
      return;
    }

    if (!assetId) {
      res.status(400).json({ error: "assetId is required." });
      return;
    }

    try {
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, name: true } });
      if (!asset) {
        res.status(404).json({ error: "Asset not found." });
        return;
      }

      const baseline = await prisma.hardwareScan.findFirst({
        where: { assetId, isBaseline: true },
        select: { id: true, parsedSpecs: true },
      });
      const comparison = baseline
        ? compareSpecs(baseline.parsedSpecs as unknown as ParsedSpecs, parsedSpecs)
        : null;

      const scan = await prisma.hardwareScan.create({
        data: {
          assetId,
          submittedById: req.user!.id,
          fileName: req.file.originalname,
          rawHtml: html,
          parsedSpecs: JSON.parse(JSON.stringify(parsedSpecs)),
          comparisonResult: comparison ? JSON.parse(JSON.stringify(comparison)) : undefined,
          overallStatus: comparison?.overallStatus ?? null,
        },
        select: scanSummarySelect,
      });

      await logActivity({
        userId: req.user!.id,
        action: "hardware_scan_submitted",
        entity: "Asset",
        entityId: assetId,
        metadata: {
          scanId: scan.id,
          fileName: req.file.originalname,
          computerName: parsedSpecs.meta.computerName ?? null,
          missingSections: parsedSpecs.meta.missingSections,
          overallStatus: comparison?.overallStatus ?? null,
        },
      });

      res.status(201).json(scan);
    } catch (e) {
      console.error("hardware-audit scan upload failed:", e);
      res.status(500).json({ error: "Failed to store the scan." });
    }
  }
);

// ── GET /api/hardware-audit/scans?assetId= ────────────────────────────────────
router.get(
  "/scans",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const assetId = req.query.assetId as string | undefined;
      const scans = await prisma.hardwareScan.findMany({
        where: assetId ? { assetId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          ...scanSummarySelect,
          asset: { select: { id: true, name: true, serialNumber: true, branch: { select: { id: true, name: true } } } },
        },
      });
      res.json(scans);
    } catch (e) {
      console.error("hardware-audit list failed:", e);
      res.status(500).json({ error: "Failed to load scans." });
    }
  }
);

// ── GET /api/hardware-audit/baseline/:assetId ─────────────────────────────────
router.get(
  "/baseline/:assetId",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const baseline = await prisma.hardwareScan.findFirst({
        where: { assetId: req.params.assetId, isBaseline: true },
        select: { ...scanSummarySelect, parsedSpecs: true },
      });
      res.json(baseline); // null when no baseline accepted yet
    } catch (e) {
      console.error("hardware-audit baseline fetch failed:", e);
      res.status(500).json({ error: "Failed to load baseline." });
    }
  }
);

// ── GET /api/hardware-audit/scans/:scanId ─────────────────────────────────────
router.get(
  "/scans/:scanId",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: {
          ...scanSummarySelect,
          parsedSpecs: true,
          comparisonResult: true,
          reviewNotes: true,
          asset: { select: { id: true, name: true, serialNumber: true, branch: { select: { id: true, name: true } } } },
        },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }
      res.json(scan);
    } catch (e) {
      console.error("hardware-audit detail failed:", e);
      res.status(500).json({ error: "Failed to load scan." });
    }
  }
);

// ── GET /api/hardware-audit/scans/:scanId/raw ─────────────────────────────────
// Original Belarc HTML kept as evidence. Sandboxed: uploaded HTML must never
// run scripts when viewed.
router.get(
  "/scans/:scanId/raw",
  requireAuth,
  requirePermission("view_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: { rawHtml: true, fileName: true },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(scan.rawHtml);
    } catch (e) {
      console.error("hardware-audit raw fetch failed:", e);
      res.status(500).json({ error: "Failed to load raw report." });
    }
  }
);

// ── PUT /api/hardware-audit/scans/:scanId/baseline ────────────────────────────
// Accept this scan as the asset's baseline (exactly one per asset).
router.put(
  "/scans/:scanId/baseline",
  requireAuth,
  requirePermission("edit_inventory"),
  async (req: AuthRequest, res: Response) => {
    try {
      const scan = await prisma.hardwareScan.findUnique({
        where: { id: req.params.scanId },
        select: { id: true, assetId: true },
      });
      if (!scan) {
        res.status(404).json({ error: "Scan not found." });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.hardwareScan.updateMany({
          where: { assetId: scan.assetId, isBaseline: true },
          data: { isBaseline: false },
        });
        const accepted = await tx.hardwareScan.update({
          where: { id: scan.id },
          // The baseline is the reference point — nothing to compare it against
          data: { isBaseline: true, comparisonResult: Prisma.DbNull, overallStatus: null, status: "reviewed", reviewedById: req.user!.id, reviewedAt: new Date() },
          select: { ...scanSummarySelect, parsedSpecs: true },
        });

        // Pending scans were compared against the old baseline — recompute
        // against the new one so the queue reflects reality
        const pending = await tx.hardwareScan.findMany({
          where: { assetId: scan.assetId, isBaseline: false, status: "pending" },
          select: { id: true, parsedSpecs: true },
        });
        const baselineSpecs = accepted.parsedSpecs as unknown as ParsedSpecs;
        for (const p of pending) {
          const comparison = compareSpecs(baselineSpecs, p.parsedSpecs as unknown as ParsedSpecs);
          await tx.hardwareScan.update({
            where: { id: p.id },
            data: {
              comparisonResult: JSON.parse(JSON.stringify(comparison)),
              overallStatus: comparison.overallStatus,
            },
          });
        }
        return accepted;
      });

      await logActivity({
        userId: req.user!.id,
        action: "hardware_baseline_accepted",
        entity: "Asset",
        entityId: scan.assetId,
        metadata: { scanId: scan.id },
      });

      res.json(updated);
    } catch (e) {
      console.error("hardware-audit baseline accept failed:", e);
      res.status(500).json({ error: "Failed to accept baseline." });
    }
  }
);

export default router;
