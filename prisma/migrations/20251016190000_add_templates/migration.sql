-- Create tables for the Template feature (MySQL)

CREATE TABLE `TemplateArtStyle` (
  `id` CHAR(36) NOT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `prompt` LONGTEXT NOT NULL,
  `referenceImageUrl` VARCHAR(512),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TemplateArtStyle_owner_createdAt_idx` (`ownerId`, `createdAt`),
  CONSTRAINT `TemplateArtStyle_owner_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TemplateVoiceStyle` (
  `id` CHAR(36) NOT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `prompt` LONGTEXT NOT NULL,
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TemplateVoiceStyle_owner_createdAt_idx` (`ownerId`, `createdAt`),
  CONSTRAINT `TemplateVoiceStyle_owner_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TemplateVoice` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `externalId` VARCHAR(128),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TemplateMusic` (
  `id` CHAR(36) NOT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `description` VARCHAR(4096),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TemplateMusic_owner_createdAt_idx` (`ownerId`, `createdAt`),
  CONSTRAINT `TemplateMusic_owner_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TemplateCaptionsStyle` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `externalId` VARCHAR(128),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TemplateOverlay` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `description` VARCHAR(4096),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Template` (
  `id` CHAR(36) NOT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(4096),
  `previewImageUrl` VARCHAR(512) NOT NULL,
  `previewVideoUrl` VARCHAR(512) NOT NULL,
  `textPrompt` LONGTEXT NOT NULL,
  `captionsStyleId` CHAR(36),
  `overlayId` CHAR(36),
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `artStyleId` CHAR(36),
  `voiceStyleId` CHAR(36),
  `voiceId` CHAR(36),
  `musicId` CHAR(36),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Template_owner_createdAt_idx` (`ownerId`, `createdAt`),
  INDEX `Template_public_createdAt_idx` (`isPublic`, `createdAt`),
  CONSTRAINT `Template_owner_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Template_artStyle_fkey` FOREIGN KEY (`artStyleId`) REFERENCES `TemplateArtStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Template_voiceStyle_fkey` FOREIGN KEY (`voiceStyleId`) REFERENCES `TemplateVoiceStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Template_voice_fkey` FOREIGN KEY (`voiceId`) REFERENCES `TemplateVoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Template_music_fkey` FOREIGN KEY (`musicId`) REFERENCES `TemplateMusic`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Template_captionsStyle_fkey` FOREIGN KEY (`captionsStyleId`) REFERENCES `TemplateCaptionsStyle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Template_overlay_fkey` FOREIGN KEY (`overlayId`) REFERENCES `TemplateOverlay`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
