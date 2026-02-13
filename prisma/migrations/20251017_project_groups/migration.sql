-- Create ProjectGroup table
CREATE TABLE `ProjectGroup` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `prompt` LONGTEXT,
  `templateId` CHAR(36),

  `durationSeconds` INT NULL,
  `useExactTextAsScript` BOOLEAN NULL,
  `includeDefaultMusic` BOOLEAN NULL,
  `addOverlay` BOOLEAN NULL,
  `autoApproveScript` BOOLEAN NULL,
  `autoApproveAudio` BOOLEAN NULL,
  `watermarkEnabled` BOOLEAN NULL,
  `captionsEnabled` BOOLEAN NULL,
  `scriptCreationGuidanceEnabled` BOOLEAN NULL,
  `scriptCreationGuidance` LONGTEXT,
  `scriptAvoidanceGuidanceEnabled` BOOLEAN NULL,
  `scriptAvoidanceGuidance` LONGTEXT,
  `audioStyleGuidanceEnabled` BOOLEAN NULL,
  `audioStyleGuidance` LONGTEXT,
  `voiceId` VARCHAR(128),
  `targetLanguage` VARCHAR(16),

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Update on update timestamp for updatedAt
CREATE TRIGGER `ProjectGroup_updatedAt` BEFORE UPDATE ON `ProjectGroup`
FOR EACH ROW SET NEW.`updatedAt` = CURRENT_TIMESTAMP(3);

-- Indexes
CREATE INDEX `ProjectGroup_userId_createdAt_idx` ON `ProjectGroup`(`userId`, `createdAt`);

-- FKs
ALTER TABLE `ProjectGroup`
  ADD CONSTRAINT `ProjectGroup_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ProjectGroup_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Create ProjectGroupCharacterSelection
CREATE TABLE `ProjectGroupCharacterSelection` (
  `id` CHAR(36) NOT NULL,
  `groupId` CHAR(36) NOT NULL,
  `characterId` CHAR(36),
  `characterVariationId` CHAR(36),
  `userCharacterId` CHAR(36),
  `userCharacterVariationId` CHAR(36),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ProjectGroupCharacterSelection_groupId_key` (`groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectGroupCharacterSelection`
  ADD CONSTRAINT `ProjectGroupCharacterSelection_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProjectGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Alter Project to add groupId and templateId
ALTER TABLE `Project`
  ADD COLUMN `groupId` CHAR(36) NULL,
  ADD COLUMN `templateId` CHAR(36) NULL;

CREATE INDEX `Project_groupId_idx` ON `Project`(`groupId`);
CREATE INDEX `Project_templateId_idx` ON `Project`(`templateId`);

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProjectGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Project_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
