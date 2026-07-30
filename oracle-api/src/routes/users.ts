import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { verifyOtp } from "../lib/otp";
import { validateCorporateEmail, normaliseEmail } from "../lib/email";
import { generateTempPassword, sendOnboardingEmail } from "../lib/mailer";

const router = Router();
router.use(requireAuth);

const userSelect = {
  id: true, name: true, email: true, position: true, phone: true,
  status: true, roleId: true, branchId: true, createdAt: true,
  role:   { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
};

async function isProtectedUser(id: string) {
  const user = await prisma.systemUser.findUnique({ where: { id }, include: { role: { select: { name: true } } } });
  return !!user && user.role?.name?.trim().toLowerCase() === "super_admin";
}

// GET /api/users
router.get("/", requirePermission("manage_users"), async (_req, res: Response) => {
  const users = await prisma.systemUser.findMany({
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// POST /api/users
router.post("/", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const { name, email, position, phone, roleId, branchId } =
    req.body as {
      name?: string; email?: string;
      position?: string | null; phone?: string | null;
      roleId?: string | null; branchId?: string | null;
    };
  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }

  // Block Super Admin assignment via user creation
  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (role && role.name.trim().toLowerCase() === "super_admin") {
      res.status(403).json({ error: "Super Admin role cannot be assigned through user creation." });
      return;
    }
  }

  const domainErr = validateCorporateEmail(email);
  if (domainErr) { res.status(400).json({ error: domainErr }); return; }

  const normEmail = normaliseEmail(email);
  const existing = await prisma.systemUser.findUnique({ where: { email: normEmail } });
  if (existing) { res.status(400).json({ error: "Email already in use." }); return; }

  const tempPassword = generateTempPassword();
  const hashed = await bcrypt.hash(tempPassword, 10);
  const user = await prisma.systemUser.create({
    data: {
      name: name.trim(),
      email: normEmail,
      password: hashed,
      position: position ?? null,
      phone: phone ?? null,
      roleId: roleId ?? null,
      branchId: branchId ?? null,
      mustChangePassword: true,
    },
    select: userSelect,
  });
  await logActivity({ userId: req.user!.id, action: "create", entity: "User", entityId: user.id, metadata: { name: user.name, email: user.email } });

  sendOnboardingEmail({ to: user.email, name: user.name, tempPassword })
    .catch(err => console.error("[Mailer] onboarding email failed:", err));

  res.status(201).json(user);
});

// GET /api/users/me
router.get("/me", async (req: AuthRequest, res: Response) => {
  const user = await prisma.systemUser.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, name: true, email: true, position: true, phone: true,
      role: { select: { id: true, name: true } },
    },
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
// Accepts optional otpCode for settings-page OTP-gated flow.
// First-login flow omits otpCode and is allowed through without it.
router.put("/me/password", async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword, otpCode } = req.body as {
    currentPassword?: string; newPassword?: string; otpCode?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // If OTP code was provided, verify it before allowing the change
  if (otpCode) {
    const otpValid = await verifyOtp(user.email, "change_password", otpCode.trim());
    if (!otpValid) { res.status(400).json({ error: "Invalid or expired verification code." }); return; }
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) { res.status(400).json({ error: "Current password is incorrect." }); return; }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({
    where: { id: req.user!.id },
    data: { password: hashed, mustChangePassword: false },
  });
  await logActivity({ userId: req.user!.id, action: "password_changed", entity: "User", entityId: req.user!.id });
  res.json({ success: true });
});

// GET /api/users/:id
router.get("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const user = await prisma.systemUser.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// PUT /api/users/:id  (admin edit)
router.put("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const { name, email, position, phone, branchId } = req.body as {
    name?: string; email?: string; position?: string | null;
    phone?: string | null; branchId?: string | null;
  };
  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }
  const domainErr2 = validateCorporateEmail(email);
  if (domainErr2) { res.status(400).json({ error: domainErr2 }); return; }

  const normEmail2 = normaliseEmail(email);
  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }

  if (normEmail2 !== existing.email.toLowerCase()) {
    const taken = await prisma.systemUser.findUnique({ where: { email: normEmail2 } });
    if (taken) { res.status(400).json({ error: "Email already in use." }); return; }
  }

  const user = await prisma.systemUser.update({
    where: { id: req.params.id },
    data: { name: name.trim(), email: normEmail2, position: position ?? null, phone: phone ?? null, branchId: branchId ?? null },
    select: userSelect,
  });
  await logActivity({ userId: req.user!.id, action: "update", entity: "User", entityId: user.id, metadata: { name: user.name } });
  res.json(user);
});

// PATCH /api/users/:id/status
router.patch("/:id/status", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const { status } = req.body as { status?: string };
  const allowed = ["active", "inactive", "suspended"];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: "Status must be active, inactive, or suspended." });
    return;
  }
  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }
  if (existing.id === req.user!.id) { res.status(400).json({ error: "Cannot change your own status." }); return; }

  const user = await prisma.systemUser.update({
    where: { id: req.params.id },
    data: { status: status as "active" | "inactive" | "suspended" },
    select: userSelect,
  });
  await logActivity({ userId: req.user!.id, action: "status_change", entity: "User", entityId: user.id, metadata: { status } });
  res.json(user);
});

// PUT /api/users/:id/role
router.put("/:id/role", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const { roleId } = req.body as { roleId?: string | null };
  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }

  if (roleId) {
    const targetRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!targetRole) { res.status(400).json({ error: "Role not found." }); return; }
    if (targetRole.name.trim().toLowerCase() === "super_admin") {
      res.status(403).json({ error: "Super Admin role cannot be assigned through normal user management." });
      return;
    }
  }

  const user = await prisma.systemUser.update({
    where: { id: req.params.id },
    data: { roleId: roleId ?? null },
    select: userSelect,
  });
  await logActivity({ userId: req.user!.id, action: "assign_role", entity: "User", entityId: user.id, metadata: { roleId } });
  res.json(user);
});

// PUT /api/users/:id/reset-password  (admin force reset)
router.put("/:id/reset-password", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({ where: { id: req.params.id }, data: { password: hashed } });
  await logActivity({ userId: req.user!.id, action: "reset_password", entity: "User", entityId: req.params.id });
  res.json({ success: true });
});

// GET /api/users/:id/permissions — get per-user permission overrides
router.get("/:id/permissions", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  if (await isProtectedUser(req.params.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }
  const overrides = await prisma.userPermission.findMany({
    where: { userId: req.params.id },
    include: { permission: { select: { id: true, key: true, description: true } } },
  });
  res.json(overrides);
});

// PUT /api/users/:id/permissions — replace per-user permission overrides
// Body: { grants: string[], revokes: string[] } — arrays of permissionId
router.put("/:id/permissions", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const { grants, revokes } = req.body as { grants?: unknown; revokes?: unknown };
  if (!Array.isArray(grants) || !Array.isArray(revokes)) {
    res.status(400).json({ error: "grants and revokes must be arrays of permissionId" });
    return;
  }
  const grantIds  = (grants  as unknown[]).filter((x): x is string => typeof x === "string");
  const revokeIds = (revokes as unknown[]).filter((x): x is string => typeof x === "string");

  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId: req.params.id } }),
    ...(grantIds.length > 0 ? [prisma.userPermission.createMany({
      data: grantIds.map((permissionId) => ({ userId: req.params.id, permissionId, granted: true })),
      skipDuplicates: true,
    })] : []),
    ...(revokeIds.length > 0 ? [prisma.userPermission.createMany({
      data: revokeIds.map((permissionId) => ({ userId: req.params.id, permissionId, granted: false })),
      skipDuplicates: true,
    })] : []),
  ]);
  await logActivity({ userId: req.user!.id, action: "set_permissions", entity: "User", entityId: req.params.id });
  res.json({ ok: true });
});

// DELETE /api/users/:id
router.delete("/:id", requirePermission("manage_users"), async (req: AuthRequest, res: Response) => {
  const existing = await prisma.systemUser.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (await isProtectedUser(existing.id)) { res.status(403).json({ error: "Super Admin users are protected." }); return; }
  if (existing.id === req.user!.id) { res.status(400).json({ error: "Cannot delete your own account." }); return; }

  await prisma.systemUser.delete({ where: { id: req.params.id } });
  await logActivity({ userId: req.user!.id, action: "delete", entity: "User", entityId: req.params.id, metadata: { name: existing.name } });
  res.json({ success: true });
});

export default router;
