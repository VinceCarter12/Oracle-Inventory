import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations use a controlled direct/session connection, never the
    // runtime transaction-pooler connection.
    url: process.env["DIRECT_URL"],
  },
});
