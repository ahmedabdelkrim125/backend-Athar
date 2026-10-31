-- AlterTable
ALTER TABLE `volunteers`
    ADD COLUMN `avatar_url` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `campaigns`
    ADD COLUMN `cover_image` VARCHAR(191) NULL,
    ADD COLUMN `attendance_radius_meters` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `attendance_points` INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN `report_points` INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE `tasks`
    ADD COLUMN `attendance_radius_meters` INTEGER NULL;

-- AlterTable
ALTER TABLE `reports`
    ADD COLUMN `points_awarded` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `reports_volunteer_id_task_id_key`
    ON `reports`(`volunteer_id`, `task_id`);

-- AlterTable
ALTER TABLE `volunteer_tasks`
    ADD COLUMN `check_in_latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `check_in_longitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `check_out_latitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `check_out_longitude` DECIMAL(10, 7) NULL,
    ADD COLUMN `attendance_points_awarded` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `announcements`
    ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `community_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `volunteer_id` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `image` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `community_posts_volunteer_id_idx`(`volunteer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_post_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `volunteer_id` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `community_post_comments_post_id_idx`(`post_id`),
    INDEX `community_post_comments_volunteer_id_idx`(`volunteer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_post_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `volunteer_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `community_post_likes_post_id_volunteer_id_key`(`post_id`, `volunteer_id`),
    INDEX `community_post_likes_volunteer_id_idx`(`volunteer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `community_posts`
    ADD CONSTRAINT `community_posts_volunteer_id_fkey`
    FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_post_comments`
    ADD CONSTRAINT `community_post_comments_post_id_fkey`
    FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_post_comments`
    ADD CONSTRAINT `community_post_comments_volunteer_id_fkey`
    FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_post_likes`
    ADD CONSTRAINT `community_post_likes_post_id_fkey`
    FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_post_likes`
    ADD CONSTRAINT `community_post_likes_volunteer_id_fkey`
    FOREIGN KEY (`volunteer_id`) REFERENCES `volunteers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
