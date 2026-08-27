-- Optional device credentials for a network asset (switch/AP/router logins,
-- SNMP communities, VPN pre-shared keys, Wi-Fi passwords, API keys, recovery
-- codes). Secret values are encrypted (AES-256-GCM) as a single JSON blob
-- before storage; the has* flags let the UI show what's populated without
-- decrypting. Decryption is gated to super_admin via a dedicated reveal route.
CREATE TABLE "NetworkDeviceCredential" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "hasUsername" BOOLEAN NOT NULL DEFAULT false,
  "hasPassword" BOOLEAN NOT NULL DEFAULT false,
  "hasSnmpCommunity" BOOLEAN NOT NULL DEFAULT false,
  "hasVpnKey" BOOLEAN NOT NULL DEFAULT false,
  "hasWifiPassword" BOOLEAN NOT NULL DEFAULT false,
  "hasApiKey" BOOLEAN NOT NULL DEFAULT false,
  "hasRecoveryCode" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkDeviceCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NetworkDeviceCredential_assetId_key" ON "NetworkDeviceCredential"("assetId");
ALTER TABLE "NetworkDeviceCredential" ADD CONSTRAINT "NetworkDeviceCredential_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NetworkDeviceCredential" ADD CONSTRAINT "NetworkDeviceCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Metadata-only from the API's point of view (ciphertext is opaque without
-- the key), but still deny direct client-role access on Supabase-hosted
-- Postgres, consistent with the other secret-adjacent tables in this schema.
ALTER TABLE "NetworkDeviceCredential" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "NetworkDeviceCredential" FROM anon, authenticated;
  END IF;
END $$;
