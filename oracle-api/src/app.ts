import "dotenv/config";
import express from "express";
import { Router } from "express";
import { prisma } from "./lib/prisma";
import authRoutes from "./routes/auth";
import assetsRoutes from "./routes/assets";
import lookupRoutes from "./routes/lookup";
import employeesRoutes from "./routes/employees";
import branchesRoutes from "./routes/branches";
import assignmentsRoutes from "./routes/assignments";
import reportsRoutes from "./routes/reports";
import turnoverRoutes from "./routes/turnover";
import usersRoutes from "./routes/users";
import rolesRoutes from "./routes/roles";
import activityRoutes from "./routes/activity";
import categoriesRoutes from "./routes/categories";
import departmentsRoutes from "./routes/departments";
import importRoutes from "./routes/import";
import maintenanceRoutes from "./routes/maintenance";
import scanRoutes from "./routes/scan";
import hardwareAuditRoutes from "./routes/hardware-audit";
import operationsRoutes from "./routes/operations";
import computerIntakeRoutes from "./routes/computer-intake";
import stockRoutes from "./routes/stock";
import cctvRoutes from "./routes/cctv";
import secretReferenceRoutes from "./routes/secret-reference";
import networkRoutes from "./routes/network";
import networkMutationRoutes from "./routes/network-mutations";
import networkDeviceRoutes from "./routes/network-devices";
import phoneRoutes from "./routes/phones";
import infrastructureRoutes from "./routes/infrastructure";

const app = express();
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const productionFrontendOrigins = [
  "https://oracle-inventory.vercel.app",
  "https://oracle-inventory-vince-carters-projects.vercel.app",
  "https://oracle-inventory-git-main-vince-carters-projects.vercel.app",
];
const allowedOrigins = new Set([
  ...configuredOrigins,
  ...(process.env.NODE_ENV === "production" ? productionFrontendOrigins : []),
]);

if (process.env.NODE_ENV === "production" && allowedOrigins.size === 0) {
  throw new Error("CORS_ALLOWED_ORIGINS must contain at least one trusted origin in production.");
}

if (process.env.NODE_ENV === "production") {
  for (const key of ["DATABASE_URL", "JWT_SECRET"]) {
    if (!process.env[key]) throw new Error(`${key} must be configured in production.`);
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: "Origin is not allowed." });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Idempotency-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ready" }); }
  catch (error) {
  const databaseError = error as { name?: unknown; code?: unknown; message?: unknown };
  const rawMessage =
    typeof databaseError.message === "string"
      ? databaseError.message
      : "No error message";
  const safeMessage = rawMessage.replace(
    /postgres(?:ql)?:\/\/\S+/gi,
    "[REDACTED_DATABASE_URL]"
  );

  console.error("Database readiness check failed", {
    name: databaseError.name,
    code: databaseError.code,
    message: safeMessage
  });

  res.status(503).json({ status: "not_ready" });
}
});

const apiRouter = Router();
apiRouter.use("/auth", authRoutes);
apiRouter.use("/assets", assetsRoutes);
apiRouter.use("/lookup", lookupRoutes);
apiRouter.use("/employees", employeesRoutes);
apiRouter.use("/branches", branchesRoutes);
apiRouter.use("/assignments", assignmentsRoutes);
apiRouter.use("/reports", reportsRoutes);
apiRouter.use("/turnover", turnoverRoutes);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/roles", rolesRoutes);
apiRouter.use("/activity", activityRoutes);
apiRouter.use("/categories", categoriesRoutes);
apiRouter.use("/departments", departmentsRoutes);
apiRouter.use("/import", importRoutes);
apiRouter.use("/maintenance", maintenanceRoutes);
apiRouter.use("/scan", scanRoutes);
apiRouter.use("/hardware-audit", hardwareAuditRoutes);
apiRouter.use("/operations", operationsRoutes);
apiRouter.use("/computer-intake", computerIntakeRoutes);
apiRouter.use("/stock", stockRoutes);
apiRouter.use("/cctv", cctvRoutes);
apiRouter.use("/secret-references", secretReferenceRoutes);
apiRouter.use("/network", networkMutationRoutes);
apiRouter.use("/network", networkRoutes);
apiRouter.use("/network", networkDeviceRoutes);
apiRouter.use("/phones", phoneRoutes);
apiRouter.use("/", infrastructureRoutes);

app.use("/api", apiRouter);

// Vercel's file-system router intercepts nested paths beginning with `/api/`
// before the Express catch-all receives them. The frontend keeps its public
// `/api/*` contract and proxies it to this internal, Vercel-safe gateway.
app.use("/gateway", apiRouter);

export default app;
