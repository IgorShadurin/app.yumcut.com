ALTER TABLE `PublishTask`
  ADD COLUMN `providerTaskId` VARCHAR(255) NULL,
  ADD COLUMN `cleanupRequestedAt` DATETIME NULL,
  ADD COLUMN `cleanupCompletedAt` DATETIME NULL;

CREATE TABLE `PublishChannelOAuthState` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `state` VARCHAR(128) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `codeVerifier` VARCHAR(256) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PublishChannelOAuthState_state_key`(`state`),
  INDEX `PublishChannelOAuthState_userId_expiresAt_idx`(`userId`, `expiresAt`),
  CONSTRAINT `PublishChannelOAuthState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
