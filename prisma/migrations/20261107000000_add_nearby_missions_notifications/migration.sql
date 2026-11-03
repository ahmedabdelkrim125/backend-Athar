ALTER TABLE `tasks`
    ADD COLUMN `approval_status` ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN `approved_by_id` INTEGER NULL,
    ADD COLUMN `approved_at` DATETIME(3) NULL,
    ADD COLUMN `required_volunteers` INTEGER NULL,
    ADD COLUMN `attendance_radius_meters` INTEGER NULL,
    ADD INDEX `tasks_approval_status_date_idx` (`approval_status`, `date`),
    ADD INDEX `tasks_approved_by_id_idx` (`approved_by_id`),
    ADD CONSTRAINT `tasks_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `locations_latitude_longitude_idx` ON `locations`(`latitude`, `longitude`);

ALTER TABLE `volunteers`
    ADD COLUMN `location_sharing_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `last_known_latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `last_known_longitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `location_accuracy` DECIMAL(8, 2) NULL,
    ADD COLUMN `location_last_updated_at` DATETIME(3) NULL,
    ADD INDEX `volunteers_location_sharing_enabled_location_last_updated_at_idx` (`location_sharing_enabled`, `location_last_updated_at`),
    ADD INDEX `volunteers_last_known_latitude_last_known_longitude_idx` (`last_known_latitude`, `last_known_longitude`);

ALTER TABLE `reports`
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `approval_status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN `rejection_reason` TEXT NULL,
    ADD COLUMN `reviewed_by_id` INTEGER NULL,
    ADD COLUMN `reviewed_at` DATETIME(3) NULL,
    ADD INDEX `reports_approval_status_created_at_idx` (`approval_status`, `created_at`),
    ADD INDEX `reports_reviewed_by_id_idx` (`reviewed_by_id`),
    ADD CONSTRAINT `reports_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `report_review_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER NOT NULL,
    `reviewer_id` INTEGER NOT NULL,
    `action` ENUM('APPROVED', 'REJECTED') NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `report_review_audits_report_id_created_at_idx` (`report_id`, `created_at`),
    INDEX `report_review_audits_reviewer_id_idx` (`reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `report_review_audits`
    ADD CONSTRAINT `report_review_audits_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `report_review_audits_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `volunteers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `volunteer_location_access_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `volunteer_id` INTEGER NOT NULL,
    `accessed_by_id` INTEGER NULL,
    `task_id` INTEGER NULL,
    `purpose` ENUM('MISSION_APPROVAL_TARGETING', 'OWNER_LOCATION_UPDATE', 'OWNER_LOCATION_DISABLE') NOT NULL,
    `accessed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `volunteer_location_access_logs_volunteer_id_accessed_at_idx` (`volunteer_id`, `accessed_at`),
    INDEX `volunteer_location_access_logs_accessed_by_id_accessed_at_idx` (`accessed_by_id`, `accessed_at`),
    INDEX `volunteer_location_access_logs_task_id_idx` (`task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `volunteer_location_access_logs`
    ADD CONSTRAINT `volunteer_location_access_logs_volunteer_id_fkey` FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `volunteer_location_access_logs_accessed_by_id_fkey` FOREIGN KEY (`accessed_by_id`) REFERENCES `volunteers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `volunteer_location_access_logs_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `mission_join_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `volunteer_id` INTEGER NOT NULL,
    `task_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `decided_at` DATETIME(3) NULL,

    UNIQUE INDEX `mission_join_requests_volunteer_id_task_id_key` (`volunteer_id`, `task_id`),
    INDEX `mission_join_requests_task_id_status_idx` (`task_id`, `status`),
    INDEX `mission_join_requests_volunteer_id_status_idx` (`volunteer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mission_join_requests`
    ADD CONSTRAINT `mission_join_requests_volunteer_id_fkey` FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `mission_join_requests_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `mission_join_requests`
    (`volunteer_id`, `task_id`, `status`, `created_at`, `updated_at`, `decided_at`)
SELECT `volunteer_id`, `task_id`, 'APPROVED', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `volunteer_tasks`
WHERE `status` <> 'CANCELLED';

CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `type` ENUM('MISSION_APPROVED', 'MISSION_JOIN_REQUEST', 'MISSION_JOIN_APPROVED', 'MISSION_JOIN_REJECTED', 'MISSION_REMINDER', 'MISSION_CHECK_IN', 'REPORT_SUBMITTED', 'REPORT_APPROVED', 'REPORT_REJECTED') NOT NULL,
    `data` JSON NULL,
    `event_key` VARCHAR(191) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,

    UNIQUE INDEX `notifications_user_id_event_key_key` (`user_id`, `event_key`),
    INDEX `notifications_user_id_is_read_created_at_idx` (`user_id`, `is_read`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notifications`
    ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `volunteers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `user_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `fcm_token` VARCHAR(512) NOT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_devices_fcm_token_key` (`fcm_token`),
    INDEX `user_devices_user_id_is_active_idx` (`user_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_devices`
    ADD CONSTRAINT `user_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `volunteers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
