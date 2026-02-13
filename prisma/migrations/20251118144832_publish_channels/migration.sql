CREATE TABLE `PublishChannel` (
  `id` char(36) NOT NULL,
  `userId` char(36) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `channelId` varchar(128) NOT NULL,
  `displayName` varchar(255) NULL,
  `handle` varchar(255) NULL,
  `refreshToken` text NULL,
  `accessToken` text NULL,
  `tokenExpiresAt` datetime(3) NULL,
  `scopes` varchar(512) NULL,
  `metadata` json NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `disconnectedAt` datetime(3) NULL,
  UNIQUE INDEX `PublishChannel_userId_provider_channelId_key`(`userId`, `provider`, `channelId`),
  INDEX `PublishChannel_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PublishChannel_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PublishChannelLanguage` (
  `id` char(36) NOT NULL,
  `userId` char(36) NOT NULL,
  `channelId` char(36) NOT NULL,
  `languageCode` varchar(16) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PublishChannelLanguage_channelId_languageCode_key`(`channelId`, `languageCode`),
  INDEX `PublishChannelLanguage_userId_languageCode_idx`(`userId`, `languageCode`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PublishChannelLanguage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PublishChannelLanguage_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `PublishChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PublishTask` (
  `id` char(36) NOT NULL,
  `userId` char(36) NOT NULL,
  `projectId` char(36) NOT NULL,
  `languageCode` varchar(16) NOT NULL,
  `channelId` char(36) NOT NULL,
  `platform` varchar(32) NOT NULL,
  `videoUrl` varchar(1024) NOT NULL,
  `title` varchar(255) NULL,
  `description` text NULL,
  `publishAt` datetime(3) NOT NULL,
  `status` varchar(32) NOT NULL,
  `errorMessage` text NULL,
  `payload` json NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `completedAt` datetime(3) NULL,
  INDEX `PublishTask_status_publishAt_idx`(`status`, `publishAt`),
  INDEX `PublishTask_channelId_publishAt_idx`(`channelId`, `publishAt`),
  INDEX `PublishTask_userId_languageCode_idx`(`userId`, `languageCode`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PublishTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PublishTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PublishTask_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `PublishChannel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
