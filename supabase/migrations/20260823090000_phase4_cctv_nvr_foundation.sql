-- Phase 4: CCTV/NVR metadata foundation. Server-only access; rollout gated
-- by CCTV_NVR_ENABLED + the cctv.nvr.v1 feature rollout, stays disabled
-- until explicitly approved. Metadata only — no credentials, stream URLs,
-- footage, or exported device configuration are stored.
--
-- NOTE: this migration intentionally omits the optional camera/recorder
-- network-interface and port linkage from the original combined draft.
-- Those columns depend on NetworkInterface/NetworkPort, owned by an
-- unmerged networking phase and not present on main. Add the linkage back
-- in a follow-up migration once that phase lands.
--
-- AUTHORED ONLY. Not applied by this branch. Preflight duplicate camera and
-- recorder profiles plus overlapping active channel assignments before this
-- is ever applied to a database with existing data; the partial active-
-- assignment indexes below fail closed on duplicates by design.

CREATE TYPE "CameraType" AS ENUM ('fixed', 'dome', 'bullet', 'ptz', 'thermal', 'other');
CREATE TYPE "RecorderType" AS ENUM ('nvr', 'dvr', 'hybrid', 'other');

CREATE TABLE "CameraProfile" (
  "id" TEXT PRIMARY KEY,
  "assetId" TEXT NOT NULL UNIQUE,
  "physicalLocation" TEXT NOT NULL,
  "coverageArea" TEXT,
  "cameraType" "CameraType" NOT NULL DEFAULT 'fixed',
  "resolution" TEXT,
  "nightVision" BOOLEAN,
  "motionDetection" BOOLEAN,
  "installationDate" TIMESTAMP(3),
  "notes" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraProfile_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecorderProfile" (
  "id" TEXT PRIMARY KEY,
  "assetId" TEXT NOT NULL UNIQUE,
  "recorderType" "RecorderType" NOT NULL DEFAULT 'nvr',
  "channelCapacity" INTEGER NOT NULL,
  "physicalLocation" TEXT NOT NULL,
  "storageCapacityBytes" BIGINT,
  "retentionDaysTarget" INTEGER,
  "notes" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecorderProfile_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecorderChannel" (
  "id" TEXT PRIMARY KEY,
  "recorderId" TEXT NOT NULL,
  "channelNumber" INTEGER NOT NULL,
  "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecorderChannel_recorderId_fkey"
    FOREIGN KEY ("recorderId") REFERENCES "RecorderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecorderChannel_recorderId_channelNumber_key" UNIQUE ("recorderId", "channelNumber")
);

CREATE TABLE "CameraChannelAssignment" (
  "id" TEXT PRIMARY KEY,
  "cameraId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "notes" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraChannelAssignment_cameraId_fkey"
    FOREIGN KEY ("cameraId") REFERENCES "CameraProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CameraChannelAssignment_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "RecorderChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SecretReference" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "displayLabel" TEXT,
  "system" TEXT,
  "ownerTeam" TEXT,
  "rotationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecretReference_provider_referenceId_key" UNIQUE ("provider", "referenceId")
);

CREATE TABLE "AssetSecretReference" (
  "id" TEXT PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "secretReferenceId" TEXT NOT NULL,
  "cameraProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetSecretReference_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetSecretReference_secretReferenceId_fkey"
    FOREIGN KEY ("secretReferenceId") REFERENCES "SecretReference"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetSecretReference_cameraProfileId_fkey"
    FOREIGN KEY ("cameraProfileId") REFERENCES "CameraProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetSecretReference_assetId_secretReferenceId_cameraProfileId_key"
    UNIQUE ("assetId", "secretReferenceId", "cameraProfileId")
);

CREATE INDEX "CameraProfile_physicalLocation_idx" ON "CameraProfile"("physicalLocation");
CREATE INDEX "RecorderProfile_physicalLocation_idx" ON "RecorderProfile"("physicalLocation");
CREATE INDEX "CameraChannelAssignment_cameraId_validFrom_idx" ON "CameraChannelAssignment"("cameraId", "validFrom");
CREATE INDEX "CameraChannelAssignment_channelId_validFrom_idx" ON "CameraChannelAssignment"("channelId", "validFrom");
CREATE INDEX "AssetSecretReference_secretReferenceId_idx" ON "AssetSecretReference"("secretReferenceId");

-- Preflight overlaps before enabling these partial indexes in a live database.
CREATE UNIQUE INDEX "CameraChannelAssignment_active_camera_key" ON "CameraChannelAssignment"("cameraId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "CameraChannelAssignment_active_channel_key" ON "CameraChannelAssignment"("channelId") WHERE "validTo" IS NULL;

-- Row-level security: metadata-only tables, no anon/authenticated access.
-- Application access goes through the API's Prisma service role only.
ALTER TABLE "CameraProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecorderProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecorderChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CameraChannelAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecretReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetSecretReference" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "CameraProfile", "RecorderProfile", "RecorderChannel",
  "CameraChannelAssignment", "SecretReference", "AssetSecretReference" FROM anon, authenticated;
