-- Phase 6: Tools & Stock. Server-only access; rollout stays disabled until approved.
CREATE TYPE "StockLocationType" AS ENUM ('room', 'cabinet', 'vehicle', 'employee_custody', 'other');
CREATE TYPE "StockMovementType" AS ENUM ('receive', 'issue', 'transfer', 'adjustment', 'count_correction', 'consume', 'return', 'opening');
CREATE TYPE "StockCountStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');

CREATE TABLE "StockItem" (
  "id" TEXT PRIMARY KEY,
  "sku" TEXT NOT NULL UNIQUE,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "requestFingerprint" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "unitOfMeasure" TEXT NOT NULL,
  "description" TEXT,
  "isSerialized" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "StockLocation" (
  "id" TEXT PRIMARY KEY,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "locationType" "StockLocationType" NOT NULL,
  "description" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLocation_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockMovement" (
  "id" TEXT PRIMARY KEY,
  "stockItemId" TEXT NOT NULL,
  "movementType" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "reason" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "requestFingerprint" TEXT NOT NULL,
  "performedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "relatedEmployeeId" TEXT,
  "relatedAssetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_relatedEmployeeId_fkey"
    FOREIGN KEY ("relatedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_relatedAssetId_fkey"
    FOREIGN KEY ("relatedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "StockLedgerEntry" (
  "id" TEXT PRIMARY KEY,
  "movementId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "quantityDelta" DECIMAL(18,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLedgerEntry_movementId_fkey"
    FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockLedgerEntry_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockLevelPolicy" (
  "id" TEXT PRIMARY KEY,
  "stockItemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "minimumQuantity" DECIMAL(18,3) NOT NULL,
  "reorderQuantity" DECIMAL(18,3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLevelPolicy_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockLevelPolicy_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockLevelPolicy_stockItemId_locationId_key" UNIQUE ("stockItemId", "locationId")
);

CREATE TABLE "StockCountSession" (
  "id" TEXT PRIMARY KEY,
  "locationId" TEXT NOT NULL,
  "status" "StockCountStatus" NOT NULL DEFAULT 'draft',
  "startedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "expectedUpdatedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "approvalIdempotencyKey" TEXT UNIQUE,
  "approvalReason" TEXT,
  "approvalExpectedUpdatedAt" TIMESTAMP(3),
  CONSTRAINT "StockCountSession_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountSession_startedById_fkey"
    FOREIGN KEY ("startedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountSession_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockCountLine" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "expectedQuantitySnapshot" DECIMAL(18,3) NOT NULL,
  "countedQuantity" DECIMAL(18,3) NOT NULL,
  "variance" DECIMAL(18,3) NOT NULL,
  CONSTRAINT "StockCountLine_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "StockCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_sessionId_stockItemId_key" UNIQUE ("sessionId", "stockItemId")
);

CREATE INDEX "StockLocation_branchId_archivedAt_idx" ON "StockLocation"("branchId", "archivedAt");
CREATE INDEX "StockMovement_stockItemId_createdAt_idx" ON "StockMovement"("stockItemId", "createdAt");
CREATE INDEX "StockLedgerEntry_locationId_createdAt_idx" ON "StockLedgerEntry"("locationId", "createdAt");

-- Baseline roles are normally created by prisma/seed.ts, but this migration's
-- RolePermission inserts below need the rows to exist even on a fresh
-- database where seed has not run yet.
INSERT INTO "Role" ("id", "name", "description") VALUES
  ('role-super-admin', 'super_admin', 'Full system access'),
  ('role-admin', 'admin', 'Inventory and staff management'),
  ('role-staff', 'staff', 'Inventory operations'),
  ('role-viewer', 'viewer', 'Read-only access')
ON CONFLICT ("id") DO NOTHING;

-- Phase 6 has distinct read and approval authority. Existing manage_stock remains the write authority.
INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm-view-stock', 'view_stock', 'View stock levels, movements, and counts'),
  ('perm-approve-stock-adjustments', 'approve_stock_adjustments', 'Approve stock-count corrections')
ON CONFLICT ("id") DO UPDATE
  SET "key" = EXCLUDED."key", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role-super-admin', 'perm-view-stock'),
  ('role-admin', 'perm-view-stock'),
  ('role-staff', 'perm-view-stock'),
  ('role-super-admin', 'perm-approve-stock-adjustments'),
  ('role-admin', 'perm-approve-stock-adjustments')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

ALTER TABLE "StockItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLevelPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountLine" ENABLE ROW LEVEL SECURITY;

-- anon/authenticated only exist on Supabase-hosted Postgres; skip on a plain
-- local/self-hosted database where there is no client-facing PostgREST role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "StockItem", "StockLocation", "StockMovement", "StockLedgerEntry",
      "StockLevelPolicy", "StockCountSession", "StockCountLine" FROM anon, authenticated;
  END IF;
END $$;
