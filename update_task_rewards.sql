INSERT INTO badges (name, description, points_required) VALUES ('شارة الدعم', 'تمنح عند إتمام مهمة مرافقة ودعم المتعافين', 99999);
UPDATE tasks SET duration_hours = 4, reward_badge_id = (SELECT id FROM badges WHERE name = 'شارة الدعم') WHERE id = 3;
UPDATE campaigns SET attendance_points = 30, report_points = 50 WHERE id = 2;