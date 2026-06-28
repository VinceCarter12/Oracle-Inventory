import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string };
  permissions?: string[];
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      name: string;
    };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Load permissions from DB and attach to req. Call after requireAuth. */
export function requirePermission(key: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!req.permissions) {
      const user = await prisma.systemUser.findUnique({
        where: { id: req.user.id },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          permissionOverrides: { include: { permission: true } },
        },
      });
      if (!user) { res.status(401).json({ error: "User not found" }); return; }

      const rolePerms = user.role?.permissions.map((rp) => rp.permission.key) ?? [];
      const granted = user.permissionOverrides.filter((up) => up.granted).map((up) => up.permission.key);
      const revoked = new Set(user.permissionOverrides.filter((up) => !up.granted).map((up) => up.permission.key));
      req.permissions = [...new Set([...rolePerms, ...granted])].filter((k) => !revoked.has(k));
    }

    if (!req.permissions.includes(key)) {
      res.status(403).json({ error: "Forbidden: missing permission " + key });
      return;
    }
    next();
  };
}
