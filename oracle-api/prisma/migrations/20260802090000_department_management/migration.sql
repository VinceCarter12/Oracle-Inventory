-- Department lifecycle and management support.
ALTER TABLE "Department" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Department_archivedAt_idx" ON "Department"("archivedAt");
CREATE UNIQUE INDEX "Department_active_name_ci_key" ON "Department" (LOWER(BTRIM("name"))) WHERE "archivedAt" IS NULL;
