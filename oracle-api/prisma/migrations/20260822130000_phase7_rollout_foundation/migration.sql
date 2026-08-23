CREATE TYPE "RolloutStatus" AS ENUM ('disabled', 'staged', 'pilot', 'enabled', 'paused');

CREATE TABLE "FeatureRollout" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabledGlobally" BOOLEAN NOT NULL DEFAULT false,
  "status" "RolloutStatus" NOT NULL DEFAULT 'disabled',
  "minimumRole" TEXT,
  "configVersion" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureRollout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureRollout_key_key" ON "FeatureRollout"("key");
ALTER TABLE "FeatureRollout" ADD CONSTRAINT "FeatureRollout_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FeatureRolloutBranch" (
  "id" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "reason" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureRolloutBranch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureRolloutBranch_featureKey_branchId_key" ON "FeatureRolloutBranch"("featureKey", "branchId");
CREATE INDEX "FeatureRolloutBranch_branchId_idx" ON "FeatureRolloutBranch"("branchId");
ALTER TABLE "FeatureRolloutBranch" ADD CONSTRAINT "FeatureRolloutBranch_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "FeatureRollout"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRolloutBranch" ADD CONSTRAINT "FeatureRolloutBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureRolloutBranch" ADD CONSTRAINT "FeatureRolloutBranch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "SystemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
