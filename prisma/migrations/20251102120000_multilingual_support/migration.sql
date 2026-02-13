-- Add JSON column for storing preferred language list (skip if already added earlier)
SET @schema := DATABASE();
SET @hasTargetLanguages := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = 'UserSettings'
        AND COLUMN_NAME = 'targetLanguages'
    ),
    1,
    0
  )
);
SET @maybeAddTargetLanguages := (
  SELECT IF(
    @hasTargetLanguages = 1,
    'SELECT 1',
    'ALTER TABLE `UserSettings` ADD COLUMN `targetLanguages` JSON NULL'
  )
);
PREPARE maybe_add_target_languages FROM @maybeAddTargetLanguages;
EXECUTE maybe_add_target_languages;
DEALLOCATE PREPARE maybe_add_target_languages;

-- Track languages selected at project creation time
ALTER TABLE `Project`
  ADD COLUMN `languages` JSON NULL;

-- Support multi-language scripts per project
ALTER TABLE `Script`
  ADD COLUMN `languageCode` VARCHAR(191) NOT NULL DEFAULT 'en',
  DROP INDEX `Script_projectId_key`,
  ADD UNIQUE INDEX `Script_projectId_languageCode_key`(`projectId`, `languageCode`);

-- Associate audio candidates with language variants
ALTER TABLE `AudioCandidate`
  ADD COLUMN `languageCode` VARCHAR(16) NULL,
  ADD INDEX `AudioCandidate_projectId_languageCode_idx`(`projectId`, `languageCode`);

-- Associate video assets with language variants
ALTER TABLE `VideoAsset`
  ADD COLUMN `languageCode` VARCHAR(16) NULL,
  ADD INDEX `VideoAsset_projectId_languageCode_idx`(`projectId`, `languageCode`);
