ALTER TABLE "HardwareScan" ADD COLUMN "parserVersion" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "sourceProduct" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "contentSha256" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "rawHtmlCiphertext" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "rawHtmlIv" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "rawHtmlTag" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "rawRetentionMode" TEXT;
ALTER TABLE "HardwareScan" ADD COLUMN "retentionUntil" TIMESTAMP(3);
ALTER TABLE "HardwareScan" ADD COLUMN "purgedAt" TIMESTAMP(3);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "HardwareScan" WHERE "isBaseline" = true GROUP BY "assetId" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Belarc proposal migration blocked: duplicate baseline scans exist per asset; resolve before applying';
  END IF;
END $$;
CREATE TYPE "ProposalState" AS ENUM ('proposed', 'verified', 'conflict', 'accepted', 'rejected', 'superseded', 'unavailable');
CREATE TYPE "ProposalConfidence" AS ENUM ('observed', 'matched', 'reviewed_accepted', 'conflicted');
CREATE TABLE "InventoryFieldProposal" (
  "id" TEXT NOT NULL,
  "hardwareScanId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetRecordId" TEXT NOT NULL,
  "proposedValueJson" JSONB NOT NULL,
  "officialValueSnapshotJson" JSONB,
  "state" "ProposalState" NOT NULL DEFAULT 'proposed',
  "sourceConfidence" "ProposalConfidence" NOT NULL DEFAULT 'observed',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryFieldProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryFieldProposal_assetId_state_idx" ON "InventoryFieldProposal"("assetId", "state");
CREATE INDEX "InventoryFieldProposal_hardwareScanId_fieldKey_idx" ON "InventoryFieldProposal"("hardwareScanId", "fieldKey");
ALTER TABLE "InventoryFieldProposal" ADD COLUMN "lastIdempotencyKey" TEXT;
CREATE UNIQUE INDEX "HardwareScan_assetId_idempotencyKey_key" ON "HardwareScan"("assetId", "idempotencyKey");
CREATE UNIQUE INDEX "HardwareScan_one_baseline_per_asset_key" ON "HardwareScan"("assetId") WHERE "isBaseline" = true;
ALTER TABLE "InventoryFieldProposal" ADD CONSTRAINT "InventoryFieldProposal_hardwareScanId_fkey" FOREIGN KEY ("hardwareScanId") REFERENCES "HardwareScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryFieldProposal" ADD CONSTRAINT "InventoryFieldProposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
