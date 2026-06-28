import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";

const router = Router();
router.use(requireAuth);

// ─── Common select shape ──────────────────────────────────────────────────────

const userSelect = {
  id:        true,
  name:      true,
  email:     true,
  position:  true,
  phone:     true,
  status:    true,
  roleId:    true,
  siteId:    true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
} as const;

// ─── Self-service routes (/me) ────────────────────────────────────────────────

// GET /api/users/me
router.get("/me", async (req: AuthRequest, res: Response) => {
  const user = await prisma.systemUser.findUnique({
    where: { id: req.user!.id },
    select: userSelect,
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// PUT /api/users/me
// If email is changing, otpCode (verified change_email OTP) is required.
router.put("/me", async (req: AuthRequest, res: Response) => {
  const { name, email, position, phone, otpCode } = req.body as {
    name?: string; email?: string; position?: string; phone?: string; otpCode?: string;
  };
  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }

  const currentUser = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!currentUser) { res.status(404).json({ error: "User not found." }); return; }

  const emailChanging = email.trim().toLowerCase() !== currentUser.email.toLowerCase();
  if (emailChanging) {
    if (!otpCode?.trim()) {
      res.status(400).json({ error: "An OTP code is required to change your email.", requiresOtp: true });
      return;
    }
    // Verify OTP against current email (user requested it from their existing inbox)
    const otp = await prisma.otpCode.findFirst({
      where: {
        email:     currentUser.email,
        purpose:   "change_email",
        code:      otpCode.trim(),
        used:      false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      res.status(400).json({ error: "Invalid or expired OTP code." });
      return;
    }
    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  }

  const conflict = await prisma.systemUser.findFirst({
    where: { email: email.trim(), NOT: { id: req.user!.id } },
  });
  if (conflict) {
    res.status(409).json({ error: "Email already in use." });
    return;
  }
  const user = await prisma.systemUser.update({
    where: { id: req.user!.id },
    data: { name: name.trim(), email: email.trim(), position: position?.trim() ?? null, phone: phone?.trim() ?? null },
    select: userSelect,
  });
  await logActivity({ userId: req.user!.id, action: "USER_SELF_UPDATED", entity: "SystemUser", entityId: user.id });
  res.json(user);
});

// PUT /api/users/me/password
router.put("/me/password", async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect." }); return; }
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({ where: { id: req.user!.id }, data: { password: hashed } });
  await logActivity({ userId: req.user!.id, action: "USER_PASSWORD_CHANGED", entity: "SystemUser", entityId: user.id });
  res.json({ success: true });
});

// ─── Admin user management ────────────────────────────────────────────────────

// GET /api/users — list all users
router.get(
  "/",
  requirePermission("manage_users"),
  async (_req: AuthRequest, res: Response) => {
    const users = await prisma.systemUser.findMany({
      select: userSelect,
      orderBy: { name: "asc" },
    });
    res.json(users);
  }
);

// GET /api/users/:id — single user
router.get(
  "/:id",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    const user = await prisma.systemUser.findUnique({
      where: { id: req.params.id },
      select: {
        ...userSelect,
        permissionOverrides: {
          include: { permission: true },
        },
      },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  }
);

// POST /api/users — create user
router.post(
  "/",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    const { name, email, password, position, phone, roleId, siteId } = req.body as {
      name?: string; email?: string; password?: string;
      position?: string; phone?: string; roleId?: string; siteId?: string;
    };

    if (!name?.trim())    { res.status(400).json({ error: "Name is required." });            return; }
    if (!email?.trim())   { res.status(400).json({ error: "Email is required." });           return; }
    if (!password)        { res.status(400).json({ error: "Password is required." });        return; }
    if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters." }); return; }

    const existing = await prisma.systemUser.findUnique({ where: { email: email.trim() } });
    if (existing) {
      res.status(409).json({ error: "A user with that email already exists." });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.systemUser.create({
      data: {
        name:     name.trim(),
        email:    email.trim(),
        password: hashed,
        position: position?.trim() ?? null,
        phone:    phone?.trim()    ?? null,
        roleId:   roleId           ?? null,
        siteId:   siteId           ?? null,
        status:   "active",
      },
      select: userSelect,
    });

    await logActivity({
      userId: req.user!.id,
      action: "USER_CREATED",
      entity: "SystemUser",
      entityId: user.id,
      metadata: { name: user.name, email: user.email },
    });

    res.status(201).json(user);
  }
);

// PUT /api/users/:id — edit profile
router.put(
  "/:id",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    const { name, email, position, phone, siteId } = req.body as {
      name?: string; email?: string; position?: string; phone?: string; siteId?: string;
    };

    if (!name?.trim())  { res.status(400).json({ error: "Name is required." });  return; }
    if (!email?.trim()) { res.status(400).json({ error: "Email is required." }); return; }

    const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }

    const conflict = await prisma.systemUser.findFirst({
      where: { email: email.trim(), NOT: { id: req.params.id } },
    });
    if (conflict) { res.status(409).json({ error: "Email already in use." }); return; }

    const user = await prisma.systemUser.update({
      where: { id: req.params.id },
      data: {
        name:     name.trim(),
        email:    email.trim(),
        position: position?.trim() ?? null,
        phone:    phone?.trim()    ?? null,
        siteId:   siteId           ?? null,
      },
      select: userSelect,
    });

    await logActivity({
      userId: req.user!.id,
      action: "USER_UPDATED",
      entity: "SystemUser",
      entityId: user.id,
      metadata: { updatedBy: req.user!.email },
    });

    res.json(user);
  }
);

// PATCH /api/users/:id/status — change status
router.patch(
  "/:id/status",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    const { status } = req.body as { status?: string };
    if (!status || !["active", "inactive", "suspended"].includes(status)) {
      res.status(400).json({ error: "status must be active, inactive, or suspended." });
      return;
    }
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: "Cannot change your own account status." });
      return;
    }
    const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }

    const user = await prisma.systemUser.update({
      where: { id: req.params.id },
      data: { status: status as "active" | "inactive" | "suspended" },
      select: userSelect,
    });

    await logActivity({
      userId: req.user!.id,
      action: "USER_STATUS_CHANGED",
      entity: "SystemUser",
      entityId: user.id,
      metadata: { from: existing.status, to: status, changedBy: req.user!.email },
    });

    res.json(user);
  }
);

// PUT /api/users/:id/role — assign role
router.put(
  "/:id/role",
  requirePermission("assign_roles"),
  async (req: AuthRequest, res: Response) => {
    const { roleId } = req.body as { roleId?: string | null };
    const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }

    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    }

    const user = await prisma.systemUser.update({
      where: { id: req.params.id },
      data: { roleId: roleId ?? null },
      select: userSelect,
    });

    await logActivity({
      userId: req.user!.id,
      action: "USER_ROLE_ASSIGNED",
      entity: "SystemUser",
      entityId: user.id,
      metadata: { roleId: roleId ?? null, assignedBy: req.user!.email },
    });

    res.json(user);
  }
);

// PUT /api/users/:id/reset-password — admin resets a user's password
router.put(
  "/:id/reset-password",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.systemUser.update({ where: { id: req.params.id }, data: { password: hashed } });

    await logActivity({
      userId: req.user!.id,
      action: "USER_PASSWORD_RESET",
      entity: "SystemUser",
      entityId: req.params.id,
      metadata: { resetBy: req.user!.email },
    });

    res.json({ success: true });
  }
);

// DELETE /api/users/:id — delete user (cannot delete self)
router.delete(
  "/:id",
  requirePermission("manage_users"),
  async (req: AuthRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: "Cannot delete your own account." });
      return;
    }
    const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "User not found" }); return; }

    await prisma.systemUser.delete({ where: { id: req.params.id } });

    await logActivity({
      userId: req.user!.id,
      action: "USER_DELETED",
      entity: "SystemUser",
      entityId: req.params.id,
      metadata: { name: existing.name, email: existing.email, deletedBy: req.user!.email },
    });

    res.json({ success: true });
  }
);

export default router;
