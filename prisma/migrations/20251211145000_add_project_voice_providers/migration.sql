ALTER TABLE `Project`
  ADD COLUMN `voiceProvider` VARCHAR(32) NULL,
  ADD COLUMN `languageVoiceProviders` JSON NULL;
