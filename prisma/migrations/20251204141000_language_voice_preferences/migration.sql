-- Add per-language voice preferences for users and projects
ALTER TABLE `UserSettings`
  ADD COLUMN `languageVoicePreferences` JSON NULL;

ALTER TABLE `Project`
  ADD COLUMN `languageVoiceAssignments` JSON NULL;
