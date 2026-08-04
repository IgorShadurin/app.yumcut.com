-- CreateTable
CREATE TABLE `EmailContact` (
    `id` CHAR(36) NOT NULL,
    `audience` VARCHAR(64) NOT NULL DEFAULT 'yumcut',
    `email` VARCHAR(320) NOT NULL,
    `userId` CHAR(36) NULL,
    `name` VARCHAR(191) NULL,
    `preferredLanguage` VARCHAR(8) NULL,
    `marketingSubscribed` BOOLEAN NOT NULL DEFAULT false,
    `subscribedAt` DATETIME(3) NULL,
    `unsubscribedAt` DATETIME(3) NULL,
    `consentSource` VARCHAR(64) NULL,
    `preferenceToken` CHAR(36) NOT NULL,
    `legacyPreferenceToken` CHAR(36) NULL,
    `suppressedAt` DATETIME(3) NULL,
    `suppressionReason` VARCHAR(64) NULL,
    `suppressionDetails` VARCHAR(512) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmailContact_preferenceToken_key`(`preferenceToken`),
    UNIQUE INDEX `EmailContact_legacyPreferenceToken_key`(`legacyPreferenceToken`),
    UNIQUE INDEX `EmailContact_audience_email_key`(`audience`, `email`),
    INDEX `EmailContact_userId_idx`(`userId`),
    INDEX `EmailContact_audience_marketingSubscribed_suppressedAt_idx`(`audience`, `marketingSubscribed`, `suppressedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailDeliveryEvent` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `recipient` VARCHAR(320) NULL,
    `messageId` VARCHAR(255) NULL,
    `details` VARCHAR(1024) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailDeliveryEvent_providerEventId_key`(`providerEventId`),
    INDEX `EmailDeliveryEvent_provider_eventType_createdAt_idx`(`provider`, `eventType`, `createdAt`),
    INDEX `EmailDeliveryEvent_recipient_createdAt_idx`(`recipient`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmailContact` ADD CONSTRAINT `EmailContact_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
