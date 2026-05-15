import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/users/me
router.get("/me", async (req: AuthRequest, res: Response) => {
  const user = await prisma.systemUser.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true },
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// PUT /api/users/me
router.put("/me", async (req: AuthRequest, res: Response) => {
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }
  const user = await prisma.systemUser.update({
    where: { id: req.user!.id },
    data: { name: name.trim(), email: email.trim() },
    select: { id: true, name: true, email: true },
  });
  res.json(user);
});

// PUT /api/users/me/password
router.put("/me/password", async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect." }); return; }
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({ where: { id: req.user!.id }, data: { password: hashed } });
  res.json({ success: true });
});

export default router;
