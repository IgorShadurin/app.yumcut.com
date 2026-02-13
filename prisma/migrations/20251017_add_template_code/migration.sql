-- Add `code` column to Template, backfill, enforce uniqueness and NOT NULL
ALTER TABLE `Template` ADD COLUMN `code` VARCHAR(255) NULL;

-- Backfill existing rows with a deterministic slug + id prefix to ensure uniqueness
UPDATE `Template`
SET `code` = CONCAT(
  LOWER(REPLACE(IFNULL(`title`, 'template'), ' ', '-')),
  '-', SUBSTRING(`id`, 1, 8)
)
WHERE `code` IS NULL;

-- Add unique index
CREATE UNIQUE INDEX `Template_code_key` ON `Template`(`code`);

-- Make column NOT NULL after backfill
ALTER TABLE `Template` MODIFY `code` VARCHAR(255) NOT NULL;

