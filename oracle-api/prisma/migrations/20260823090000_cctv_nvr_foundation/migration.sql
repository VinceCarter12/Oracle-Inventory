-- Phase 4 CCTV/NVR metadata foundation. Run duplicate/preflight checks before apply.
-- No credentials, stream URLs, footage, or raw configuration are stored.
-- NOTE: this isolated migration intentionally omits the optional
-- CameraProfile.networkInterfaceId / RecorderChannel.portId linkage present
-- in the original combined draft. Those columns depend on NetworkInterface
-- and NetworkPort, which belong to an unmerged networking phase and are not
-- present on main. Re-add the linkage in a follow-up migration once that
-- phase lands, rather than forward-referencing tables that do not exist yet.
CREATE TYPE "CameraType" AS ENUM ('fixed','dome','bullet','ptz','thermal','other');
CREATE TYPE "RecorderType" AS ENUM ('nvr','dvr','hybrid','other');

CREATE TABLE "CameraProfile" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "physicalLocation" TEXT NOT NULL,
  "coverageArea" TEXT, "cameraType" "CameraType" NOT NULL DEFAULT 'fixed',
  "resolution" TEXT, "nightVision" BOOLEAN, "motionDetection" BOOLEAN,
  "installationDate" TIMESTAMP(3), "notes" TEXT, "idempotencyKey" TEXT, "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CameraProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CameraProfile_assetId_key" ON "CameraProfile"("assetId");
CREATE UNIQUE INDEX "CameraProfile_idempotencyKey_key" ON "CameraProfile"("idempotencyKey");
CREATE INDEX "CameraProfile_physicalLocation_idx" ON "CameraProfile"("physicalLocation");
ALTER TABLE "CameraProfile" ADD CONSTRAINT "CameraProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecorderProfile" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "recorderType" "RecorderType" NOT NULL DEFAULT 'nvr',
  "channelCapacity" INTEGER NOT NULL, "physicalLocation" TEXT NOT NULL, "storageCapacityBytes" BIGINT,
  "retentionDaysTarget" INTEGER, "notes" TEXT, "idempotencyKey" TEXT, "idempotencyPayloadHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RecorderProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecorderProfile_assetId_key" ON "RecorderProfile"("assetId");
CREATE UNIQUE INDEX "RecorderProfile_idempotencyKey_key" ON "RecorderProfile"("idempotencyKey");
CREATE INDEX "RecorderProfile_physicalLocation_idx" ON "RecorderProfile"("physicalLocation");
ALTER TABLE "RecorderProfile" ADD CONSTRAINT "RecorderProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecorderChannel" (
  "id" TEXT NOT NULL, "recorderId" TEXT NOT NULL, "channelNumber" INTEGER NOT NULL, "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RecorderChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecorderChannel_recorderId_channelNumber_key" ON "RecorderChannel"("recorderId","channelNumber");
ALTER TABLE "RecorderChannel" ADD CONSTRAINT "RecorderChannel_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "RecorderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CameraChannelAssignment" (
  "id" TEXT NOT NULL, "cameraId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3), "notes" TEXT, "idempotencyKey" TEXT, "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraChannelAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CameraChannelAssignment_idempotencyKey_key" ON "CameraChannelAssignment"("idempotencyKey");
CREATE INDEX "CameraChannelAssignment_cameraId_validFrom_idx" ON "CameraChannelAssignment"("cameraId","validFrom");
CREATE INDEX "CameraChannelAssignment_channelId_validFrom_idx" ON "CameraChannelAssignment"("channelId","validFrom");
ALTER TABLE "CameraChannelAssignment" ADD CONSTRAINT "CameraChannelAssignment_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CameraProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CameraChannelAssignment" ADD CONSTRAINT "CameraChannelAssignment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "RecorderChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Preflight overlaps before enabling these partial indexes in a live database.
CREATE UNIQUE INDEX "CameraChannelAssignment_active_camera_key" ON "CameraChannelAssignment"("cameraId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "CameraChannelAssignment_active_channel_key" ON "CameraChannelAssignment"("channelId") WHERE "validTo" IS NULL;

CREATE TABLE "SecretReference" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "referenceId" TEXT NOT NULL, "displayLabel" TEXT,
  "system" TEXT, "ownerTeam" TEXT, "rotationAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SecretReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecretReference_provider_referenceId_key" ON "SecretReference"("provider","referenceId");
CREATE TABLE "AssetSecretReference" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "secretReferenceId" TEXT NOT NULL, "cameraProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssetSecretReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetSecretReference_assetId_secretReferenceId_cameraProfileId_key" ON "AssetSecretReference"("assetId","secretReferenceId","cameraProfileId");
CREATE INDEX "AssetSecretReference_secretReferenceId_idx" ON "AssetSecretReference"("secretReferenceId");
ALTER TABLE "AssetSecretReference" ADD CONSTRAINT "AssetSecretReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetSecretReference" ADD CONSTRAINT "AssetSecretReference_secretReferenceId_fkey" FOREIGN KEY ("secretReferenceId") REFERENCES "SecretReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetSecretReference" ADD CONSTRAINT "AssetSecretReference_cameraProfileId_fkey" FOREIGN KEY ("cameraProfileId") REFERENCES "CameraProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: metadata-only tables, deny all client-role access by
-- default. Application access goes through the API service role only; no
-- anon or authenticated grants are issued here.
ALTER TABLE "CameraProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecorderProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecorderChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CameraChannelAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecretReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetSecretReference" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "CameraProfile", "RecorderProfile", "RecorderChannel",
  "CameraChannelAssignment", "SecretReference", "AssetSecretReference" FROM anon, authenticated;
