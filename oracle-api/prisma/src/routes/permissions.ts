import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/permissions — list all permission keys
router.get("/", async (_req, res: Response) => {
  const permissions = await prisma.permission.findMany({
    orderBy: { key: "asc" },
  });
  res.json(permissions);
});

export default router;
