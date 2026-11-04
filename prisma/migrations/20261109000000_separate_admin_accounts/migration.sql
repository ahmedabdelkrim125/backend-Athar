-- Existing identities remain volunteers. No volunteer is promoted to ADMIN.
UPDATE `volunteers`
SET `role` = 'VOLUNTEER'
WHERE `role` <> 'VOLUNTEER';

ALTER TABLE `volunteers`
    MODIFY COLUMN `role` ENUM('VOLUNTEER') NOT NULL DEFAULT 'VOLUNTEER';

CREATE TABLE `admins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `password_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `admins_email_key` (`email`),
    INDEX `admins_is_active_created_at_idx` (`is_active`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_auth_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `refresh_token_hash` VARCHAR(191) NULL,
    `user_agent` VARCHAR(512) NULL,
    `ip_address` VARCHAR(64) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `admin_auth_sessions_refresh_token_hash_key` (`refresh_token_hash`),
    INDEX `admin_auth_sessions_admin_id_revoked_at_idx` (`admin_id`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_auth_sessions`
    ADD CONSTRAINT `admin_auth_sessions_admin_id_fkey`
    FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `campaigns`
    MODIFY COLUMN `created_by` INTEGER NULL,
    DROP FOREIGN KEY `campaigns_created_by_fkey`;

ALTER TABLE `campaigns`
    ADD COLUMN `created_by_admin_id` INTEGER NULL,
    ADD INDEX `campaigns_created_by_admin_id_idx` (`created_by_admin_id`),
    ADD CONSTRAINT `campaigns_created_by_fkey`
        FOREIGN KEY (`created_by`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `campaigns_created_by_admin_id_fkey`
        FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `tasks`
    ADD COLUMN `approved_by_admin_id` INTEGER NULL,
    ADD INDEX `tasks_approved_by_admin_id_idx` (`approved_by_admin_id`),
    ADD CONSTRAINT `tasks_approved_by_admin_id_fkey`
        FOREIGN KEY (`approved_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `reports`
    ADD COLUMN `reviewed_by_admin_id` INTEGER NULL,
    ADD INDEX `reports_reviewed_by_admin_id_idx` (`reviewed_by_admin_id`),
    ADD CONSTRAINT `reports_reviewed_by_admin_id_fkey`
        FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `report_review_audits`
    MODIFY COLUMN `reviewer_id` INTEGER NULL,
    DROP FOREIGN KEY `report_review_audits_reviewer_id_fkey`;

ALTER TABLE `report_review_audits`
    ADD COLUMN `reviewer_admin_id` INTEGER NULL,
    ADD INDEX `report_review_audits_reviewer_admin_id_idx` (`reviewer_admin_id`),
    ADD CONSTRAINT `report_review_audits_reviewer_id_fkey`
        FOREIGN KEY (`reviewer_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `report_review_audits_reviewer_admin_id_fkey`
        FOREIGN KEY (`reviewer_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `sos_requests`
    ADD COLUMN `reference` VARCHAR(40) NULL,
    ADD COLUMN `responded_by_admin_id` INTEGER NULL,
    ADD INDEX `sos_requests_responded_by_admin_id_idx` (`responded_by_admin_id`),
    ADD UNIQUE INDEX `sos_requests_reference_key` (`reference`),
    ADD CONSTRAINT `sos_requests_responded_by_admin_id_fkey`
        FOREIGN KEY (`responded_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `sos_requests`
SET `reference` = CONCAT('SOS-', `id`);

ALTER TABLE `sos_requests`
    MODIFY COLUMN `reference` VARCHAR(40) NOT NULL,
    MODIFY COLUMN `latitude` DECIMAL(10, 7) NULL,
    MODIFY COLUMN `longitude` DECIMAL(10, 7) NULL;

ALTER TABLE `volunteer_location_updates`
    MODIFY COLUMN `expires_at` DATETIME(3) NULL,
    ADD COLUMN `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `volunteer_location_updates` AS `location_update`
LEFT JOIN `sos_requests` AS `incident` ON `incident`.`id` = `location_update`.`incident_id`
SET `location_update`.`expires_at` =
    CASE
        WHEN `incident`.`id` IS NULL THEN `location_update`.`expires_at`
        WHEN `incident`.`status` IN ('RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM')
            THEN DATE_ADD(COALESCE(`incident`.`resolved_at`, `incident`.`created_at`), INTERVAL 30 DAY)
        ELSE NULL
    END
WHERE `location_update`.`incident_id` IS NOT NULL;

ALTER TABLE `sos_incident_audits`
    ADD COLUMN `actor_admin_id` INTEGER NULL,
    ADD INDEX `sos_incident_audits_actor_admin_id_created_at_idx` (`actor_admin_id`, `created_at`),
    ADD CONSTRAINT `sos_incident_audits_actor_admin_id_fkey`
        FOREIGN KEY (`actor_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `audit_logs`
    ADD COLUMN `admin_id` INTEGER NULL,
    ADD INDEX `audit_logs_admin_id_created_at_idx` (`admin_id`, `created_at`),
    ADD CONSTRAINT `audit_logs_admin_id_fkey`
        FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `volunteer_location_access_logs`
    ADD COLUMN `accessed_by_admin_id` INTEGER NULL,
    ADD INDEX `volunteer_location_access_logs_accessed_by_admin_id_accessed_idx` (`accessed_by_admin_id`, `accessed_at`),
    ADD CONSTRAINT `volunteer_location_access_logs_accessed_by_admin_id_fkey`
        FOREIGN KEY (`accessed_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `notifications`
    MODIFY COLUMN `user_id` INTEGER NULL,
    ADD COLUMN `admin_id` INTEGER NULL,
    ADD UNIQUE INDEX `notifications_admin_id_event_key_key` (`admin_id`, `event_key`),
    ADD INDEX `notifications_admin_id_is_read_created_at_idx` (`admin_id`, `is_read`, `created_at`),
    ADD CONSTRAINT `notifications_admin_id_fkey`
        FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_devices`
    MODIFY COLUMN `user_id` INTEGER NULL,
    ADD COLUMN `admin_id` INTEGER NULL,
    ADD INDEX `user_devices_admin_id_is_active_idx` (`admin_id`, `is_active`),
    ADD CONSTRAINT `user_devices_admin_id_fkey`
        FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- MySQL does not permit CHECK-constrained columns to participate in foreign
-- keys with cascading actions. The application enforces one owner per record.
