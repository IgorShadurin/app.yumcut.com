ALTER TABLE `UserSettings` ADD COLUMN `preferredVoiceId` VARCHAR(128) NULL;
ALTER TABLE `Project` ADD COLUMN `voiceId` VARCHAR(128) NULL;
-- Cleanup if previous iteration added JSON preferredVoice or extra tables (safe no-ops if not present)
-- ALTER TABLE `UserSettings` DROP COLUMN `preferredVoice`;
-- DROP TABLE IF EXISTS `UserVoice`;
-- DROP TABLE IF EXISTS `ProjectVoiceSelection`;
