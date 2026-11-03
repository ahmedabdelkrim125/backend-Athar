ALTER TABLE `tasks`
    ADD COLUMN `duration_hours` INTEGER NULL,
    ADD COLUMN `reward_badge_id` INTEGER NULL;

ALTER TABLE `tasks` ADD CONSTRAINT `tasks_reward_badge_id_fkey` FOREIGN KEY (`reward_badge_id`) REFERENCES `badges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;