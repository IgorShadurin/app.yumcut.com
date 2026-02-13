-- AlterTable
ALTER TABLE `UserSettings`
  ADD COLUMN `scriptCreationGuidanceEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `scriptCreationGuidance` TEXT NULL,
  ADD COLUMN `scriptAvoidanceGuidanceEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `scriptAvoidanceGuidance` TEXT NULL;
