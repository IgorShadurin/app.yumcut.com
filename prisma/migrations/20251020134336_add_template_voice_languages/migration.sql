-- AlterTable
ALTER TABLE `TemplateVoice` ADD COLUMN `gender` VARCHAR(32) NULL,
    ADD COLUMN `languages` VARCHAR(255) NULL,
    ADD COLUMN `speed` VARCHAR(32) NULL,
    ADD COLUMN `previewPath` VARCHAR(512) NULL;
