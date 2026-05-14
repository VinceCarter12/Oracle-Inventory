import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import assetsRoutes from "./routes/assets";
import lookupRoutes from "./routes/lookup";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Allow all origins — API is protected by JWT auth
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/lookup", lookupRoutes);

app.listen(PORT, () => {
  console.log(`Oracle API running on port ${PORT}`);
});
