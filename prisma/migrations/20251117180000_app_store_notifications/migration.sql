-- Create table for App Store Server Notifications
CREATE TABLE `AppStoreServerNotification` (
  `id` char(36) NOT NULL,
  `notificationType` varchar(128) NULL,
  `subtype` varchar(128) NULL,
  `environment` varchar(64) NULL,
  `signedPayload` longtext NULL,
  `payload` json NULL,
  `headers` json NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AppStoreServerNotification_notificationType_subtype_idx`
  ON `AppStoreServerNotification`(`notificationType`, `subtype`);

CREATE INDEX `AppStoreServerNotification_createdAt_idx`
  ON `AppStoreServerNotification`(`createdAt`);
