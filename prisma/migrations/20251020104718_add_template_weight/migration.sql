-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_artStyle_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_captionsStyle_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_music_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_overlay_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_owner_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_voiceStyle_fkey`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `Template_voice_fkey`;

-- DropForeignKey
ALTER TABLE `TemplateArtStyle` DROP FOREIGN KEY `TemplateArtStyle_owner_fkey`;

-- DropForeignKey
ALTER TABLE `TemplateMusic` DROP FOREIGN KEY `TemplateMusic_owner_fkey`;

-- DropForeignKey
ALTER TABLE `TemplateVoiceStyle` DROP FOREIGN KEY `TemplateVoiceStyle_owner_fkey`;

-- AlterTable
ALTER TABLE `ProjectGroup` MODIFY `scriptCreationGuidance` TEXT NULL,
    MODIFY `scriptAvoidanceGuidance` TEXT NULL,
    MODIFY `audioStyleGuidance` TEXT NULL;

-- AlterTable
ALTER TABLE `Template` ADD COLUMN `weight` INTEGER NOT NULL DEFAULT 0,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateArtStyle` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateCaptionsStyle` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateMusic` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateOverlay` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateVoice` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `TemplateVoiceStyle` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserCharacter` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserCharacterVariation` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `TemplateArtStyle` ADD CONSTRAINT `TemplateArtStyle_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateVoiceStyle` ADD CONSTRAINT `TemplateVoiceStyle_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateMusic` ADD CONSTRAINT `TemplateMusic_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_artStyleId_fkey` FOREIGN KEY (`artStyleId`) REFERENCES `TemplateArtStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_voiceStyleId_fkey` FOREIGN KEY (`voiceStyleId`) REFERENCES `TemplateVoiceStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_voiceId_fkey` FOREIGN KEY (`voiceId`) REFERENCES `TemplateVoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_musicId_fkey` FOREIGN KEY (`musicId`) REFERENCES `TemplateMusic`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_captionsStyleId_fkey` FOREIGN KEY (`captionsStyleId`) REFERENCES `TemplateCaptionsStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_overlayId_fkey` FOREIGN KEY (`overlayId`) REFERENCES `TemplateOverlay`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `Template` RENAME INDEX `Template_owner_createdAt_idx` TO `Template_ownerId_createdAt_idx`;

-- RenameIndex
ALTER TABLE `Template` RENAME INDEX `Template_public_createdAt_idx` TO `Template_isPublic_createdAt_idx`;

-- RenameIndex
ALTER TABLE `TemplateArtStyle` RENAME INDEX `TemplateArtStyle_owner_createdAt_idx` TO `TemplateArtStyle_ownerId_createdAt_idx`;

-- RenameIndex
ALTER TABLE `TemplateMusic` RENAME INDEX `TemplateMusic_owner_createdAt_idx` TO `TemplateMusic_ownerId_createdAt_idx`;

-- RenameIndex
ALTER TABLE `TemplateVoiceStyle` RENAME INDEX `TemplateVoiceStyle_owner_createdAt_idx` TO `TemplateVoiceStyle_ownerId_createdAt_idx`;
