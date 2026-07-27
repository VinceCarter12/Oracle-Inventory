import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const [categories, branches, employees] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, departmentId: true, branchId: true },
    }),
  ]);
  res.json({ categories, branches, employees });
});

export default router;
