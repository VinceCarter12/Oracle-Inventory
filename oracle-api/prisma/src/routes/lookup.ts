import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const [categories, sites, employees] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, departmentId: true, siteId: true },
    }),
  ]);
  res.json({ categories, sites, employees });
});

export default router;
