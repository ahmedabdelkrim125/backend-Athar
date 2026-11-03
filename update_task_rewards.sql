SELECT
    t.id,
    t.title,
    t.duration_hours,
    t.reward_badge_id,
    b.name AS badge_name
FROM tasks t
LEFT JOIN badges b ON b.id = t.reward_badge_id
WHERE t.id = 3;

SELECT
    id,
    title,
    attendance_points,
    report_points,
    (attendance_points + report_points) AS total_points
FROM campaigns
WHERE id = 2;

SELECT *
FROM badges
WHERE name = 'شارة الدعم';