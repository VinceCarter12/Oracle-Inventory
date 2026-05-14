import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/sites
router.get("/", async (_req: AuthRequest, res: Response) => {
  const sites = await prisma.site.findMany({
    include: {
      _count: { select: { assets: true, employees: true } },
      departments: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(sites);
});

// POST /api/sites
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, address } = req.body;
  if (!name) { res.status(400).json({ error: "Site name is required." }); return; }
  const site = await prisma.site.create({
    data: { name, address: address || null },
    include: {
      _count: { select: { assets: true, employees: true } },
      departments: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(site);
});

// GET /api/sites/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const site = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { assets: true, employees: true } },
      departments: { select: { id: true, name: true } },
    },
  });
  if (!site) { res.status(404).json({ error: "Site not found" }); return; }
  res.json(site);
});

export default router;
