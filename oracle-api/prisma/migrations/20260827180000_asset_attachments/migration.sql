-- Attachments uploaded during asset intake/edit (invoices, warranty docs, photos not covered by the intake photo grid).
CREATE TABLE "AssetAttachment" (
    "id"           TEXT NOT NULL,
    "assetId"      TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL,
    "data"         BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetAttachment_assetId_idx" ON "AssetAttachment"("assetId");

ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
