import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    roleId: string | null;
    role: string | null;
    permissions: string[];
  };
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
      roleId: string | null;
      role: string | null;
      permissions: string[];
    };
    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      roleId: payload.roleId ?? null,
      role: payload.role ?? null,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Middleware factory — requires auth + a specific permission key */
export function requirePermission(key: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.user.permissions.includes(key)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}
