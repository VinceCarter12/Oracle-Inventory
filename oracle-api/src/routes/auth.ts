import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { validateCorporateEmail, normaliseEmail } from "../lib/email";
import { createOtp, verifyOtp } from "../lib/otp";
import { sendOtpEmail } from "../lib/mailer";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

const router = Router();

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const domainErr = validateCorporateEmail(email);
  if (domainErr) { res.status(400).json({ error: domainErr }); return; }

  const user = await prisma.systemUser.findUnique({
    where: { email: normaliseEmail(email) },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
      permissionOverrides: { include: { permission: true } },
    },
  });
  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.status !== "active") {
    const msg =
      user.status === "suspended"
        ? "Your account has been suspended. Contact your administrator."
        : "Your account is inactive. Contact your administrator.";
    res.status(403).json({ error: msg });
    return;
  }

  // Super Admin is a protected system role: it always resolves to every
  // permission and ignores mutable per-user overrides.
  const isSuperAdmin = user.role?.name?.trim().toLowerCase() === "super_admin";
  const permissions = isSuperAdmin
    ? (await prisma.permission.findMany({ select: { key: true } })).map((permission) => permission.key)
    : (() => {
        const rolePerms = user.role?.permissions.map((rp) => rp.permission.key) ?? [];
        const grantedOverrides = user.permissionOverrides
          .filter((up) => up.granted)
          .map((up) => up.permission.key);
        const revokedOverrides = new Set(
          user.permissionOverrides.filter((up) => !up.granted).map((up) => up.permission.key)
        );
        return [...new Set([...rolePerms, ...grantedOverrides])].filter((key) => !revokedOverrides.has(key));
      })();

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    mustChangePassword: user.mustChangePassword,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      role: user.role?.name ?? null,
      permissions,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

// POST /api/auth/request-otp  (authenticated — for change_email / change_password)
router.post("/request-otp", requireAuth, async (req: AuthRequest, res: Response) => {
  const { purpose } = req.body as { purpose?: string };
  const allowed = ["change_email", "change_password"];
  if (!purpose || !allowed.includes(purpose)) {
    res.status(400).json({ error: "Invalid purpose." });
    return;
  }
  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found." }); return; }

  const code = await createOtp(user.email, purpose);
  sendOtpEmail(user.email, code, purpose as "change_email" | "change_password")
    .catch(err => console.error("[Mailer] OTP email failed:", err));
  res.json({ message: "OTP sent to your email." });
});

// POST /api/auth/forgot-password  (public)
router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "Email is required." }); return; }

  const domainErr = validateCorporateEmail(email);
  if (domainErr) { res.status(400).json({ error: domainErr }); return; }

  const user = await prisma.systemUser.findUnique({ where: { email: normaliseEmail(email) } });
  // Always respond 200 to avoid user enumeration
  if (user) {
    const code = await createOtp(user.email, "forgot_password");
    sendOtpEmail(user.email, code, "forgot_password")
      .catch(err => console.error("[Mailer] forgot-password email failed:", err));
  }
  res.json({ message: "If that email exists, a reset code has been sent." });
});

// POST /api/auth/reset-password  (public)
router.post("/reset-password", async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as {
    email?: string; code?: string; newPassword?: string;
  };
  if (!email?.trim() || !code?.trim() || !newPassword) {
    res.status(400).json({ error: "Email, code, and new password are required." });
    return;
  }
  const domainErr = validateCorporateEmail(email);
  if (domainErr) { res.status(400).json({ error: domainErr }); return; }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const user = await prisma.systemUser.findUnique({ where: { email: normaliseEmail(email) } });
  if (!user) { res.status(400).json({ error: "Invalid or expired code." }); return; }

  const valid = await verifyOtp(user.email, "forgot_password", code.trim());
  if (!valid) { res.status(400).json({ error: "Invalid or expired code." }); return; }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({ where: { id: user.id }, data: { password: hashed } });
  res.json({ message: "Password reset successfully." });
});

export default router;
