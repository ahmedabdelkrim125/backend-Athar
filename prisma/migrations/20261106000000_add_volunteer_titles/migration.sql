CREATE TABLE `volunteer_titles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `icon` VARCHAR(191) NOT NULL,
    `min_points` INTEGER NOT NULL DEFAULT 0,
    `min_hours` INTEGER NOT NULL DEFAULT 0,
    `min_completed_tasks` INTEGER NOT NULL DEFAULT 0,
    `min_reports` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `volunteer_titles_name_key`(`name`),
    UNIQUE INDEX `volunteer_titles_level_key`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `volunteer_titles`
    (`name`, `level`, `description`, `icon`, `min_points`, `min_hours`, `min_completed_tasks`, `min_reports`)
VALUES
    ('متطوع مبتدئ', 1, 'بداية الرحلة والمشاركة في العمل التطوعي.', 'seedling', 0, 0, 0, 0),
    ('صانع الخير', 2, 'مساهمات تطوعية موثقة وبداية أثر ملموس.', 'heart', 100, 1, 1, 1),
    ('متطوع متميز', 3, 'إنجازات ومشاركات تطوعية فعالة.', 'star', 300, 10, 5, 5),
    ('قائد الأثر', 4, 'خبرة ميدانية ومساهمة قيادية مستمرة.', 'flag', 750, 30, 20, 15),
    ('سفير أثر', 5, 'إنجاز تطوعي استثنائي وأثر مجتمعي مستدام.', 'crown', 1500, 100, 50, 40);
