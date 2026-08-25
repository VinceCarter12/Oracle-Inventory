ALTER TABLE "Asset" ADD COLUMN "purchaseDate" TIMESTAMP(3);
DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim("assetTag")) FROM "Asset"
    WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> ''
    GROUP BY lower(btrim("assetTag")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Computer intake migration blocked: duplicate nonblank asset tags require review before enforcing uniqueness';
  END IF;
END $$;
CREATE UNIQUE INDEX "Asset_assetTag_nonblank_unique" ON "Asset" (lower(btrim("assetTag"))) WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> '';

CREATE TYPE "DeviceType" AS ENUM ('computer', 'laptop');
CREATE TYPE "ComponentType" AS ENUM ('ram', 'storage');
CREATE TYPE "ObservationStatus" AS ENUM ('proposed', 'verified', 'conflict', 'rejected');
CREATE TYPE "DraftStatus" AS ENUM ('draft', 'submitted', 'cancelled');

CREATE TABLE "DeviceProfile" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "deviceType" "DeviceType" NOT NULL DEFAULT 'computer',
  "brand" TEXT,
  "model" TEXT,
  "deviceSerial" TEXT,
  "processor" TEXT,
  "motherboard" TEXT,
  "operatingSystem" TEXT,
  "osVersion" TEXT,
  "osInstallDate" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceObservedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceProfile_assetId_key" ON "DeviceProfile"("assetId");
CREATE INDEX "DeviceProfile_deviceType_idx" ON "DeviceProfile"("deviceType");
ALTER TABLE "DeviceProfile" ADD CONSTRAINT "DeviceProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetComponent" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "deviceProfileId" TEXT,
  "type" "ComponentType" NOT NULL,
  "slotOrBay" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "serialNumber" TEXT,
  "capacity" TEXT,
  "storageKind" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceObservedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetComponent_assetId_type_idx" ON "AssetComponent"("assetId", "type");
ALTER TABLE "AssetComponent" ADD CONSTRAINT "AssetComponent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetComponent" ADD CONSTRAINT "AssetComponent_deviceProfileId_fkey" FOREIGN KEY ("deviceProfileId") REFERENCES "DeviceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InventoryObservation" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "ObservationStatus" NOT NULL DEFAULT 'proposed',
  "fields" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryObservation_assetId_status_idx" ON "InventoryObservation"("assetId", "status");
ALTER TABLE "InventoryObservation" ADD CONSTRAINT "InventoryObservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryObservation" ADD CONSTRAINT "InventoryObservation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ComputerIntakeDraft" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "branchId" TEXT,
  "status" "DraftStatus" NOT NULL DEFAULT 'draft',
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  CONSTRAINT "ComputerIntakeDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComputerIntakeDraft_createdById_status_idx" ON "ComputerIntakeDraft"("createdById", "status");
CREATE INDEX "ComputerIntakeDraft_branchId_status_idx" ON "ComputerIntakeDraft"("branchId", "status");
ALTER TABLE "ComputerIntakeDraft" ADD CONSTRAINT "ComputerIntakeDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputerIntakeDraft" ADD CONSTRAINT "ComputerIntakeDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
