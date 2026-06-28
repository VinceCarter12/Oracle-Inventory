/**
 * One-time migration: rename Site → Branch, siteId → branchId, drop Department.siteId
 *
 * Run ONCE before deploying the updated schema:
 *   npx tsx prisma/migrate-to-branch.ts
 *
 * After this script succeeds, run:
 *   npx prisma generate
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── 1. Drop FK constraints that reference the Site table ──────────────────
    await client.query(`ALTER TABLE "SystemUser" DROP CONSTRAINT IF EXISTS "SystemUser_siteId_fkey"`);
    await client.query(`ALTER TABLE "Employee"   DROP CONSTRAINT IF EXISTS "Employee_siteId_fkey"`);
    await client.query(`ALTER TABLE "Asset"      DROP CONSTRAINT IF EXISTS "Asset_siteId_fkey"`);
    await client.query(`ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_siteId_fkey"`);
    console.log("✓ Dropped old FK constraints");

    // ── 2. Rename table Site → Branch ─────────────────────────────────────────
    await client.query(`ALTER TABLE "Site" RENAME TO "Branch"`);
    console.log('✓ Renamed table "Site" → "Branch"');

    // ── 3. Rename siteId → branchId on each referencing table ────────────────
    await client.query(`ALTER TABLE "SystemUser" RENAME COLUMN "siteId" TO "branchId"`);
    await client.query(`ALTER TABLE "Employee"   RENAME COLUMN "siteId" TO "branchId"`);
    await client.query(`ALTER TABLE "Asset"      RENAME COLUMN "siteId" TO "branchId"`);
    console.log("✓ Renamed siteId → branchId on SystemUser, Employee, Asset");

    // ── 4. Drop siteId from Department (now org-wide) ─────────────────────────
    await client.query(`ALTER TABLE "Department" DROP COLUMN IF EXISTS "siteId"`);
    console.log("✓ Dropped Department.siteId (departments are now org-wide)");

    // ── 5. Re-add FK constraints with new names ────────────────────────────────
    await client.query(`
      ALTER TABLE "SystemUser"
        ADD CONSTRAINT "SystemUser_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await client.query(`
      ALTER TABLE "Employee"
        ADD CONSTRAINT "Employee_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await client.query(`
      ALTER TABLE "Asset"
        ADD CONSTRAINT "Asset_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE SET NULL ON UPDATE CASCADE
    `);
    console.log("✓ Re-added FK constraints with new names");

    await client.query("COMMIT");
    console.log("\nMigration complete. Now run: npx prisma generate");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed — rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
