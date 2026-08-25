// Must run before any other import: ./lib/maintenance -> ./lib/prisma reads
// process.env.DATABASE_URL at module-load time to build the connection
// pool. Without this, that read happens before ./app's own "dotenv/config"
// import gets a chance to run, so the pool is built with an undefined URL
// and silently falls back to default Postgres connection settings for the
// lifetime of the process (only ever visible locally with a .env file —
// hosted environments inject real env vars before the process starts).
import "dotenv/config";
import { startMaintenanceCron } from "./lib/maintenance";
import app from "./app";

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Oracle API running on port ${PORT}`);
  if (process.env.MAINTENANCE_SCHEDULER_ENABLED === "true") startMaintenanceCron();
});
