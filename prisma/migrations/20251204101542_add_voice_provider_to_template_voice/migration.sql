ALTER TABLE `TemplateVoice`
  ADD COLUMN `voiceProvider` VARCHAR(32) NOT NULL DEFAULT 'elevenlabs';
