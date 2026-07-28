import { startMaintenanceCron } from "./lib/maintenance";
import app from "./app";

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Oracle API running on port ${PORT}`);
  if (process.env.MAINTENANCE_SCHEDULER_ENABLED === "true") startMaintenanceCron();
});
