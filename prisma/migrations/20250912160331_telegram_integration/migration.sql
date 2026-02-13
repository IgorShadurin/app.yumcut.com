-- CreateTable
CREATE TABLE `TelegramAccount` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `telegramId` VARCHAR(32) NOT NULL,
  `chatId` VARCHAR(32) NOT NULL,
  `username` VARCHAR(255) NULL,
  `firstName` VARCHAR(255) NULL,
  `lastName` VARCHAR(255) NULL,
  `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TelegramAccount_userId_key`(`userId`),
  UNIQUE INDEX `TelegramAccount_telegramId_key`(`telegramId`),
  UNIQUE INDEX `TelegramAccount_chatId_key`(`chatId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TelegramLinkToken` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `tokenHash` VARCHAR(128) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TelegramLinkToken_tokenHash_key`(`tokenHash`),
  INDEX `TelegramLinkToken_userId_expiresAt_idx`(`userId`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TelegramAccount` ADD CONSTRAINT `TelegramAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TelegramLinkToken` ADD CONSTRAINT `TelegramLinkToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
