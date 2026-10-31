const express = require('express');

const taskController = require('../controllers/task.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', taskController.listTasks);
router.post('/', taskController.createTask);
router.get('/:taskId', taskController.getTaskById);
router.patch('/:taskId', taskController.updateTask);
router.get('/:taskId/assignments', taskController.listTaskAssignments);
router.post('/:taskId/assignments', taskController.assignVolunteerToTask);
router.patch(
  '/:taskId/assignments/:volunteerId',
  taskController.updateTaskAssignment,
);

module.exports = router;
