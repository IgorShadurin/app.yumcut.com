ALTER TABLE `UserSettings`
  ADD COLUMN `schedulerDefaultTimes` JSON NULL,
  ADD COLUMN `schedulerCadence` JSON NULL;
