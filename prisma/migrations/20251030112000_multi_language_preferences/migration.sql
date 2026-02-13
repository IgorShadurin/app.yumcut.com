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

SET @ensureTargetLanguages := (
  SELECT IF(
    @hasTargetLanguages = 0,
    'ALTER TABLE `UserSettings` ADD COLUMN `targetLanguages` JSON NULL',
    'SELECT 1'
  )
);
PREPARE ensure_target_languages FROM @ensureTargetLanguages;
EXECUTE ensure_target_languages;
DEALLOCATE PREPARE ensure_target_languages;

SET @hasLegacyTarget := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = 'UserSettings'
        AND COLUMN_NAME = 'targetLanguage'
    ),
    1,
    0
  )
);

SET @updateTargetLanguages := (
  SELECT
    CONCAT(
      'UPDATE `UserSettings` SET `targetLanguages` = CASE WHEN `targetLanguages` IS NULL OR JSON_LENGTH(`targetLanguages`) = 0 THEN ',
      IF(@hasLegacyTarget = 1, 'JSON_ARRAY(COALESCE(`targetLanguage`, ''en''))', 'JSON_ARRAY(''en'')'),
      ' ELSE `targetLanguages` END'
    )
);
PREPARE update_target_languages FROM @updateTargetLanguages;
EXECUTE update_target_languages;
DEALLOCATE PREPARE update_target_languages;

SET @dropTargetLanguage := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = 'UserSettings'
        AND COLUMN_NAME = 'targetLanguage'
    ),
    'ALTER TABLE `UserSettings` DROP COLUMN `targetLanguage`',
    'SELECT 1'
  )
);
PREPARE drop_stmt FROM @dropTargetLanguage;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

SET @dropLanguagePool := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = 'UserSettings'
        AND COLUMN_NAME = 'languagePool'
    ),
    'ALTER TABLE `UserSettings` DROP COLUMN `languagePool`',
    'SELECT 1'
  )
);
PREPARE drop_stmt FROM @dropLanguagePool;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

SET @dropMultiLanguageMode := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema
        AND TABLE_NAME = 'UserSettings'
        AND COLUMN_NAME = 'multiLanguageMode'
    ),
    'ALTER TABLE `UserSettings` DROP COLUMN `multiLanguageMode`',
    'SELECT 1'
  )
);
PREPARE drop_stmt FROM @dropMultiLanguageMode;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;
