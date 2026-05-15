import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth";
import assetsRoutes from "./routes/assets";
import lookupRoutes from "./routes/lookup";
import employeesRoutes from "./routes/employees";
import sitesRoutes from "./routes/sites";
import assignmentsRoutes from "./routes/assignments";
import reportsRoutes from "./routes/reports";
import turnoverRoutes from "./routes/turnover";
import usersRoutes from "./routes/users";
import categoriesRoutes from "./routes/categories";
import departmentsRoutes from "./routes/departments";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Explicit CORS — allow all origins, API is protected by JWT
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/lookup", lookupRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/turnover", turnoverRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/departments", departmentsRoutes);

app.listen(PORT, () => {
  console.log(`Oracle API running on port ${PORT}`);
});
