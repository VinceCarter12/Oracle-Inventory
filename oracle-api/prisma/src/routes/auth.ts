import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { generateOtp, sendOtpEmail } from "../lib/mailer";
import { requireAuth, AuthRequest } from "../middleware/auth";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

  const user = await prisma.systemUser.findUnique({
    where: { email },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
      permissionOverrides: {
        include: { permission: true },
      },
    },
  });

  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "Account is inactive or suspended." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  // Merge role permissions + per-user overrides (granted=false removes a permission)
  const effectivePerms = new Set(
    user.role?.permissions.map((rp) => rp.permission.key) ?? []
  );
  for (const override of user.permissionOverrides) {
    if (override.granted) {
      effectivePerms.add(override.permission.key);
    } else {
      effectivePerms.delete(override.permission.key);
    }
  }
  const permissions = Array.from(effectivePerms);

  const jwtPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId ?? null,
    role: user.role?.name ?? null,
    permissions,
  };

  const token = jwt.sign(jwtPayload, process.env.JWT_SECRET!, { expiresIn: "8h" });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId ?? null,
      role: user.role?.name ?? null,
      permissions,
    },
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  // JWT is stateless — client discards the token
  res.json({ message: "Logged out." });
});

// ─── OTP helpers ─────────────────────────────────────────────────────────────

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function createOtp(email: string, purpose: string): Promise<string> {
  const code      = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpCode.create({ data: { email, purpose, code, expiresAt } });
  return code;
}

async function verifyOtp(email: string, purpose: string, code: string): Promise<boolean> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      email,
      purpose,
      code,
      used:      false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;
  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  return true;
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Try again in 15 minutes." },
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

router.post("/forgot-password", otpLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  // Always return 200 — don't reveal whether email exists
  const user = await prisma.systemUser.findUnique({ where: { email: email.trim() } });
  if (user && user.status === "active") {
    try {
      const code = await createOtp(email.trim(), "forgot_password");
      await sendOtpEmail(email.trim(), code, "forgot_password");
    } catch {
      // Swallow send errors — still return 200 so we don't leak user existence
    }
  }

  res.json({ message: "If that email is registered, you'll receive a reset code shortly." });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

router.post("/reset-password", async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as {
    email?: string; code?: string; newPassword?: string;
  };

  if (!email?.trim() || !code?.trim() || !newPassword) {
    res.status(400).json({ error: "Email, code, and new password are required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const valid = await verifyOtp(email.trim(), "forgot_password", code.trim());
  if (!valid) {
    res.status(400).json({ error: "Invalid or expired code." });
    return;
  }

  const user = await prisma.systemUser.findUnique({ where: { email: email.trim() } });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired code." });
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.systemUser.update({ where: { id: user.id }, data: { password: hashed } });

  res.json({ message: "Password reset successfully. You can now log in." });
});

// ─── POST /api/auth/request-otp (authenticated) ──────────────────────────────

router.post("/request-otp", requireAuth, otpLimiter, async (req: AuthRequest, res: Response) => {
  const { purpose } = req.body as { purpose?: string };
  const allowed = ["change_email", "change_password"];
  if (!purpose || !allowed.includes(purpose)) {
    res.status(400).json({ error: "Invalid purpose." });
    return;
  }

  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found." }); return; }

  try {
    const code = await createOtp(user.email, purpose);
    await sendOtpEmail(user.email, code, purpose as "change_email" | "change_password");
  } catch {
    res.status(500).json({ error: "Failed to send OTP email. Check SMTP configuration." });
    return;
  }

  res.json({ message: "OTP sent to your email." });
});

// ─── POST /api/auth/verify-otp (authenticated) ───────────────────────────────

router.post("/verify-otp", requireAuth, async (req: AuthRequest, res: Response) => {
  const { code, purpose } = req.body as { code?: string; purpose?: string };
  if (!code?.trim() || !purpose) {
    res.status(400).json({ error: "Code and purpose are required." });
    return;
  }

  const user = await prisma.systemUser.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found." }); return; }

  const valid = await verifyOtp(user.email, purpose, code.trim());
  if (!valid) {
    res.status(400).json({ error: "Invalid or expired code." });
    return;
  }

  res.json({ valid: true });
});

export default router;
