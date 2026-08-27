-- Phone inventory. Company vs BYOD reuses Asset.ownership; serial number,
-- IMEI, and property tag already live on Asset. Only brand/model need a
-- category-specific home.
CREATE TABLE "PhoneProfile" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "brand" TEXT, "model" TEXT,
  "notes" TEXT, "idempotencyKey" TEXT, "idempotencyPayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PhoneProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoneProfile_assetId_key" ON "PhoneProfile"("assetId");
CREATE UNIQUE INDEX "PhoneProfile_idempotencyKey_key" ON "PhoneProfile"("idempotencyKey");
ALTER TABLE "PhoneProfile" ADD CONSTRAINT "PhoneProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
