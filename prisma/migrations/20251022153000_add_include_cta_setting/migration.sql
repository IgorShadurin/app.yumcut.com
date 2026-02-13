-- Add Include Call to Action setting to user settings
ALTER TABLE `UserSettings`
  ADD COLUMN `includeCallToAction` BOOLEAN NOT NULL DEFAULT TRUE;

