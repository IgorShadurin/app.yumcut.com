-- Drop the obsolete token storage table now that uploads use signed grants
DROP TABLE IF EXISTS `StorageUploadToken`;
