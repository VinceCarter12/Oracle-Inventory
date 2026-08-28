-- Peripheral component types (Monitor, Keyboard, Mouse, Speaker, Webcam,
-- Microphone, Printer, UPS, AVR, Clicker, Projector, TV, Signal Booster,
-- Flash Drive, External HDD, HDD/SSD and NVME/SSD docking stations) reuse
-- AssetComponent as child rows on a parent asset, same pattern as the
-- RAM/Storage rows already built for Computer intake.
ALTER TYPE "ComponentType" ADD VALUE 'monitor';
ALTER TYPE "ComponentType" ADD VALUE 'keyboard';
ALTER TYPE "ComponentType" ADD VALUE 'mouse';
ALTER TYPE "ComponentType" ADD VALUE 'speaker';
ALTER TYPE "ComponentType" ADD VALUE 'webcam';
ALTER TYPE "ComponentType" ADD VALUE 'microphone';
ALTER TYPE "ComponentType" ADD VALUE 'printer';
ALTER TYPE "ComponentType" ADD VALUE 'ups';
ALTER TYPE "ComponentType" ADD VALUE 'avr';
ALTER TYPE "ComponentType" ADD VALUE 'clicker';
ALTER TYPE "ComponentType" ADD VALUE 'projector';
ALTER TYPE "ComponentType" ADD VALUE 'tv';
ALTER TYPE "ComponentType" ADD VALUE 'signal_booster';
ALTER TYPE "ComponentType" ADD VALUE 'flash_drive';
ALTER TYPE "ComponentType" ADD VALUE 'external_hdd';
ALTER TYPE "ComponentType" ADD VALUE 'hdd_ssd_docking_station';
ALTER TYPE "ComponentType" ADD VALUE 'nvme_docking_station';

ALTER TABLE "AssetComponent" ADD COLUMN "propertyTag" TEXT;
