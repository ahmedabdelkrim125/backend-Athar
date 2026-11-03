ALTER TABLE `volunteers`
    ADD COLUMN `role` ENUM('VOLUNTEER', 'CAMPAIGN_MANAGER', 'ORGANIZATION_MANAGER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'VOLUNTEER';

ALTER TABLE `sos_requests`
    MODIFY COLUMN `status` ENUM('OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'CLOSED', 'FALSE_ALARM') NOT NULL DEFAULT 'OPEN',
    ADD COLUMN `task_id` INTEGER NULL,
    ADD COLUMN `responded_by_id` INTEGER NULL,
    ADD COLUMN `accuracy` DECIMAL(8, 2) NULL,
    ADD COLUMN `message` TEXT NULL,
    ADD COLUMN `device_timestamp` DATETIME(3) NULL,
    ADD COLUMN `last_updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `cancelled_reason` TEXT NULL,
    ADD INDEX `sos_requests_status_created_at_idx` (`status`, `created_at`),
    ADD INDEX `sos_requests_task_id_idx` (`task_id`),
    ADD INDEX `sos_requests_responded_by_id_idx` (`responded_by_id`),
    ADD CONSTRAINT `sos_requests_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `sos_requests_responded_by_id_fkey` FOREIGN KEY (`responded_by_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `volunteer_location_updates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `volunteer_id` INTEGER NOT NULL,
    `task_id` INTEGER NULL,
    `incident_id` INTEGER NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `accuracy` DECIMAL(8, 2) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    INDEX `volunteer_location_updates_volunteer_id_recorded_at_idx` (`volunteer_id`, `recorded_at`),
    INDEX `volunteer_location_updates_task_id_recorded_at_idx` (`task_id`, `recorded_at`),
    INDEX `volunteer_location_updates_incident_id_recorded_at_idx` (`incident_id`, `recorded_at`),
    INDEX `volunteer_location_updates_expires_at_idx` (`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `volunteer_location_updates`
    ADD CONSTRAINT `volunteer_location_updates_volunteer_id_fkey` FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `volunteer_location_updates_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `volunteer_location_updates_incident_id_fkey` FOREIGN KEY (`incident_id`) REFERENCES `sos_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `sos_incident_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `incident_id` INTEGER NOT NULL,
    `actor_id` INTEGER NULL,
    `from_status` ENUM('OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'CLOSED', 'FALSE_ALARM') NULL,
    `to_status` ENUM('OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'CLOSED', 'FALSE_ALARM') NULL,
    `action` VARCHAR(64) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `sos_incident_audits_incident_id_created_at_idx` (`incident_id`, `created_at`),
    INDEX `sos_incident_audits_actor_id_created_at_idx` (`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sos_incident_audits`
    ADD CONSTRAINT `sos_incident_audits_incident_id_fkey` FOREIGN KEY (`incident_id`) REFERENCES `sos_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `sos_incident_audits_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_id` INTEGER NULL,
    `action` VARCHAR(96) NOT NULL,
    `target_type` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `audit_logs_actor_id_created_at_idx` (`actor_id`, `created_at`),
    INDEX `audit_logs_target_type_target_id_created_at_idx` (`target_type`, `target_id`, `created_at`),
    INDEX `audit_logs_action_created_at_idx` (`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `notifications`
    MODIFY COLUMN `type` ENUM('MISSION_APPROVED', 'MISSION_CANCELLED', 'MISSION_JOIN_REQUEST', 'MISSION_JOIN_APPROVED', 'MISSION_JOIN_REJECTED', 'MISSION_REMINDER', 'MISSION_CHECK_IN', 'REPORT_SUBMITTED', 'REPORT_APPROVED', 'REPORT_REJECTED', 'EMERGENCY_SOS', 'EMERGENCY_STATUS') NOT NULL;

ALTER TABLE `mission_join_requests`
    ADD COLUMN `rejection_reason` TEXT NULL;

ALTER TABLE `volunteer_location_access_logs`
    MODIFY COLUMN `purpose` ENUM(
        'MISSION_APPROVAL_TARGETING',
        'OWNER_LOCATION_UPDATE',
        'OWNER_LOCATION_DISABLE',
        'ADMIN_LOCATION_MONITORING',
        'ADMIN_LOCATION_HISTORY'
    ) NOT NULL;

CREATE TABLE `rate_limit_buckets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `window_from` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expires_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `rate_limit_buckets_key_window_from_key` (`key`, `window_from`),
    INDEX `rate_limit_buckets_expires_at_idx` (`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
