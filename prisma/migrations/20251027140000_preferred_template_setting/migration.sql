-- Add preferredTemplateId to UserSettings to persist chosen template
ALTER TABLE `UserSettings`
  ADD COLUMN `preferredTemplateId` CHAR(36) NULL;

