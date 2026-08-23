CREATE TYPE "IpAddressFamily" AS ENUM ('ipv4', 'ipv6');
CREATE TYPE "AddressingMode" AS ENUM ('static', 'dhcp', 'dynamic', 'unknown');
CREATE TYPE "VlanTaggingMode" AS ENUM ('access', 'tagged', 'trunk');
CREATE TYPE "PortStatus" AS ENUM ('up', 'down', 'disabled', 'unknown');
CREATE TYPE "LinkType" AS ENUM ('physical', 'logical', 'wan');

CREATE TABLE "NetworkInterface" ("id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "interfaceName" TEXT NOT NULL, "macAddress" TEXT, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NetworkInterface_pkey" PRIMARY KEY ("id"));
CREATE TABLE "IpAddressObservation" ("id" TEXT NOT NULL, "interfaceId" TEXT NOT NULL, "address" TEXT NOT NULL, "prefixLength" INTEGER NOT NULL, "family" "IpAddressFamily" NOT NULL, "addressingMode" "AddressingMode" NOT NULL, "gateway" TEXT, "dnsServers" TEXT[] NOT NULL, "source" TEXT NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "validTo" TIMESTAMP(3), CONSTRAINT "IpAddressObservation_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Vlan" ("id" TEXT NOT NULL, "branchId" TEXT NOT NULL, "vlanNumber" INTEGER NOT NULL, "vlanName" TEXT, "cidr" TEXT, "gateway" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Vlan_pkey" PRIMARY KEY ("id"));
CREATE TABLE "InterfaceVlanAssignment" ("id" TEXT NOT NULL, "interfaceId" TEXT NOT NULL, "vlanId" TEXT NOT NULL, "taggingMode" "VlanTaggingMode" NOT NULL, "isNative" BOOLEAN NOT NULL DEFAULT false, "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3), CONSTRAINT "InterfaceVlanAssignment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "NetworkPort" ("id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "portNumber" TEXT NOT NULL, "portLabel" TEXT, "medium" TEXT, "speedMbps" INTEGER, "poeCapability" TEXT, "adminStatus" "PortStatus" NOT NULL DEFAULT 'unknown', "operationalStatus" "PortStatus" NOT NULL DEFAULT 'unknown', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NetworkPort_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PortConnection" ("id" TEXT NOT NULL, "fromPortId" TEXT NOT NULL, "toPortId" TEXT, "toInterfaceId" TEXT, "branchId" TEXT NOT NULL, "linkType" "LinkType" NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PortConnection_pkey" PRIMARY KEY ("id"));
ALTER TABLE "NetworkInterface" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "NetworkInterface" ADD COLUMN "idempotencyPayloadHash" TEXT;
ALTER TABLE "IpAddressObservation" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "IpAddressObservation" ADD COLUMN "idempotencyPayloadHash" TEXT;
ALTER TABLE "Vlan" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Vlan" ADD COLUMN "idempotencyPayloadHash" TEXT;
ALTER TABLE "InterfaceVlanAssignment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "InterfaceVlanAssignment" ADD COLUMN "idempotencyPayloadHash" TEXT;
ALTER TABLE "NetworkPort" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "NetworkPort" ADD COLUMN "idempotencyPayloadHash" TEXT;
ALTER TABLE "PortConnection" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PortConnection" ADD COLUMN "idempotencyPayloadHash" TEXT;
CREATE UNIQUE INDEX "NetworkInterface_assetId_interfaceName_key" ON "NetworkInterface"("assetId", "interfaceName");
CREATE UNIQUE INDEX "Vlan_branchId_vlanNumber_key" ON "Vlan"("branchId", "vlanNumber");
CREATE UNIQUE INDEX "NetworkPort_assetId_portNumber_key" ON "NetworkPort"("assetId", "portNumber");
CREATE UNIQUE INDEX "NetworkInterface_idempotencyKey_key" ON "NetworkInterface"("idempotencyKey");
CREATE UNIQUE INDEX "IpAddressObservation_idempotencyKey_key" ON "IpAddressObservation"("idempotencyKey");
CREATE UNIQUE INDEX "Vlan_idempotencyKey_key" ON "Vlan"("idempotencyKey");
CREATE UNIQUE INDEX "InterfaceVlanAssignment_idempotencyKey_key" ON "InterfaceVlanAssignment"("idempotencyKey");
CREATE UNIQUE INDEX "NetworkPort_idempotencyKey_key" ON "NetworkPort"("idempotencyKey");
CREATE UNIQUE INDEX "PortConnection_idempotencyKey_key" ON "PortConnection"("idempotencyKey");
CREATE INDEX "NetworkInterface_macAddress_idx" ON "NetworkInterface"("macAddress");
CREATE INDEX "IpAddressObservation_interfaceId_observedAt_idx" ON "IpAddressObservation"("interfaceId", "observedAt");
CREATE INDEX "IpAddressObservation_address_idx" ON "IpAddressObservation"("address");
CREATE INDEX "PortConnection_branchId_effectiveFrom_idx" ON "PortConnection"("branchId", "effectiveFrom");
ALTER TABLE "NetworkInterface" ADD CONSTRAINT "NetworkInterface_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IpAddressObservation" ADD CONSTRAINT "IpAddressObservation_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "NetworkInterface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vlan" ADD CONSTRAINT "Vlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterfaceVlanAssignment" ADD CONSTRAINT "InterfaceVlanAssignment_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "NetworkInterface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterfaceVlanAssignment" ADD CONSTRAINT "InterfaceVlanAssignment_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "Vlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NetworkPort" ADD CONSTRAINT "NetworkPort_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortConnection" ADD CONSTRAINT "PortConnection_fromPortId_fkey" FOREIGN KEY ("fromPortId") REFERENCES "NetworkPort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortConnection" ADD CONSTRAINT "PortConnection_toPortId_fkey" FOREIGN KEY ("toPortId") REFERENCES "NetworkPort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortConnection" ADD CONSTRAINT "PortConnection_toInterfaceId_fkey" FOREIGN KEY ("toInterfaceId") REFERENCES "NetworkInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortConnection" ADD CONSTRAINT "PortConnection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm-manage-infrastructure-assets', 'manage_infrastructure_assets', 'Manage network and infrastructure inventory'),
  ('perm-view-sensitive-network-fields', 'view_sensitive_network_fields', 'View sensitive network addressing and topology fields')
ON CONFLICT ("id") DO UPDATE SET "key" = EXCLUDED."key", "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role-super-admin', 'perm-manage-infrastructure-assets'),
  ('role-admin', 'perm-manage-infrastructure-assets'),
  ('role-super-admin', 'perm-view-sensitive-network-fields'),
  ('role-admin', 'perm-view-sensitive-network-fields')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
