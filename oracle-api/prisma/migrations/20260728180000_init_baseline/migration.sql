-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('usable', 'for_repair', 'for_disposal');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('company', 'personal');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('assignment', 'transfer', 'site_transfer', 'resignation', 'new_hire', 'repair_send', 'repair_return', 'disposal', 'lost_report', 'stolen_report', 'recovery', 'return_requested', 'return_approved', 'return_rejected');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'returned', 'transferred', 'pending_return');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('active', 'lost', 'stolen');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'processing', 'completed', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "RowOutcome" AS ENUM ('imported', 'skipped', 'failed', 'duplicate', 'overwritten');

-- CreateEnum
CREATE TYPE "HwComparisonStatus" AS ENUM ('match', 'warning', 'mismatch');

-- CreateEnum
CREATE TYPE "HardwareScanStatus" AS ENUM ('pending', 'reviewed', 'flagged', 'archived');

-- CreateEnum
CREATE TYPE "ScanRoomStatus" AS ENUM ('open', 'closed', 'expired');

-- CreateEnum
CREATE TYPE "ScanDeviceStatus" AS ENUM ('waiting', 'connected', 'scanning', 'done');

-- CreateEnum
CREATE TYPE "ScanResultStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "SystemUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "roleId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,

    CONSTRAINT "SystemUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "position" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "categoryId" TEXT,
    "condition" "AssetCondition" NOT NULL DEFAULT 'usable',
    "ownership" "OwnershipType" NOT NULL DEFAULT 'company',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nextMaintenanceDate" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "assetTag" TEXT,
    "branchId" TEXT,
    "computerName" TEXT,
    "imeiNumber" TEXT,
    "importId" TEXT,
    "macAddress" TEXT,
    "metadata" JSONB,
    "propertyTag" TEXT,
    "lostAt" TIMESTAMP(3),
    "lostStolenNotes" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'active',
    "notifiedDue" TIMESTAMP(3),
    "notifiedReminder" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardwareScan" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rawHtml" TEXT NOT NULL,
    "parsedSpecs" JSONB NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "comparisonResult" JSONB,
    "overallStatus" "HwComparisonStatus",
    "status" "HardwareScanStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardwareScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "returnNotes" TEXT,
    "returnRequestedAt" TIMESTAMP(3),
    "returnRequestedBy" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovementLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" "MovementType" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovementLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "categoriesCreated" INTEGER NOT NULL DEFAULT 0,
    "editedBeforeImport" INTEGER NOT NULL DEFAULT 0,
    "overwrittenRows" INTEGER NOT NULL DEFAULT 0,
    "strictMode" BOOLEAN NOT NULL DEFAULT false,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mappingUsed" JSONB,
    "assetsCreated" INTEGER NOT NULL DEFAULT 0,
    "assetsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "assetsUpdated" INTEGER NOT NULL DEFAULT 0,
    "assignmentsCreated" INTEGER NOT NULL DEFAULT 0,
    "employeesCreated" INTEGER NOT NULL DEFAULT 0,
    "employeesUpdated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "mappedData" JSONB NOT NULL,
    "outcome" "RowOutcome",
    "assetId" TEXT,
    "errorMessage" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "conflictKey" TEXT,
    "employeeHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnMappingPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryHint" TEXT,
    "mappings" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColumnMappingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRoom" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ScanRoomStatus" NOT NULL DEFAULT 'open',
    "maxDevices" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanDevice" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "status" "ScanDeviceStatus" NOT NULL DEFAULT 'waiting',
    "connectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "ScanDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "parsedData" JSONB NOT NULL,
    "rawLines" JSONB NOT NULL,
    "status" "ScanResultStatus" NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "assetId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemUser_email_key" ON "SystemUser"("email");

-- CreateIndex
CREATE INDEX "OtpCode_email_purpose_idx" ON "OtpCode"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeId_key" ON "Employee"("employeeId");

-- CreateIndex
CREATE INDEX "HardwareScan_assetId_isBaseline_idx" ON "HardwareScan"("assetId", "isBaseline");

-- CreateIndex
CREATE INDEX "ImportHistory_uploadedById_idx" ON "ImportHistory"("uploadedById");

-- CreateIndex
CREATE INDEX "ImportRow_importId_rowIndex_idx" ON "ImportRow"("importId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ScanRoom_roomCode_key" ON "ScanRoom"("roomCode");

-- CreateIndex
CREATE INDEX "ScanRoom_ownerId_idx" ON "ScanRoom"("ownerId");

-- CreateIndex
CREATE INDEX "ScanRoom_expiresAt_idx" ON "ScanRoom"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScanDevice_deviceToken_key" ON "ScanDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "ScanDevice_roomId_idx" ON "ScanDevice"("roomId");

-- CreateIndex
CREATE INDEX "ScanResult_roomId_status_idx" ON "ScanResult"("roomId", "status");

-- CreateIndex
CREATE INDEX "ScanResult_status_scannedAt_idx" ON "ScanResult"("status", "scannedAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SystemUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemUser" ADD CONSTRAINT "SystemUser_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemUser" ADD CONSTRAINT "SystemUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareScan" ADD CONSTRAINT "HardwareScan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareScan" ADD CONSTRAINT "HardwareScan_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareScan" ADD CONSTRAINT "HardwareScan_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementLog" ADD CONSTRAINT "MovementLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementLog" ADD CONSTRAINT "MovementLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportHistory" ADD CONSTRAINT "ImportHistory_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnMappingPreset" ADD CONSTRAINT "ColumnMappingPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRoom" ADD CONSTRAINT "ScanRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "SystemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDevice" ADD CONSTRAINT "ScanDevice_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ScanRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ScanDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ScanRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
