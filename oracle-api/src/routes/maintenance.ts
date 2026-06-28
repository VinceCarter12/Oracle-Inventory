import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth";
import { runMaintenanceCheck } from "../lib/maintenance";

const router = Router();

/**
 * POST /api/maintenance/run-now
 * Manually trigger the maintenance notification check immediately.
 * Requires manage_settings permission (admin only).
 * Use this to test notifications without waiting for the 8am cron.
 */
router.post(
  "/run-now",
  requireAuth,
  requirePermission("manage_settings"),
  async (_req, res) => {
    try {
      const result = await runMaintenanceCheck();
      res.json({
        ok: true,
        message: "Maintenance check complete.",
        ...result,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  }
);

export default router;
