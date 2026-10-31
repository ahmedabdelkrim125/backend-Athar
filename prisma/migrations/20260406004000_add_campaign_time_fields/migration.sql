-- AlterTable
ALTER TABLE `campaigns`
    ADD COLUMN `start_time` TIME(0) NULL,
    ADD COLUMN `end_time` TIME(0) NULL;
