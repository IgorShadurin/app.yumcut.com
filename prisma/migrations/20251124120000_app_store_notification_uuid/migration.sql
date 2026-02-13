ALTER TABLE `AppStoreServerNotification`
  ADD COLUMN `notificationUuid` char(36) NULL,
  ADD UNIQUE INDEX `AppStoreServerNotification_notificationUuid_key` (`notificationUuid`);
