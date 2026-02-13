CREATE TABLE `MobileSession` (
  `id` char(36) NOT NULL,
  `userId` char(36) NOT NULL,
  `refreshTokenHash` char(64) NOT NULL,
  `deviceId` varchar(191) NOT NULL,
  `deviceName` varchar(191) NULL,
  `platform` varchar(64) NULL,
  `appVersion` varchar(32) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `expiresAt` datetime(3) NOT NULL,
  `revokedAt` datetime(3) NULL,
  `lastRefreshAt` datetime(3) NULL,
  INDEX `MobileSession_userId_idx`(`userId`),
  INDEX `MobileSession_refreshTokenHash_idx`(`refreshTokenHash`),
  INDEX `MobileSession_deviceId_userId_idx`(`deviceId`, `userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MobileSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
