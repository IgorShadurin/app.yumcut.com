ALTER TABLE `UserSettings`
  ADD COLUMN `audioStyleGuidanceEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `audioStyleGuidance` TEXT NULL;
