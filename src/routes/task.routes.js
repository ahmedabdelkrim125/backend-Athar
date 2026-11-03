const express = require('express');

const taskController = require('../controllers/task.controller');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');

const router = express.Router();

router.get('/', requireAccountAuth, taskController.listTasks);
router.post('/', requireAdminAuth, taskController.createTask);
router.get('/:taskId', requireAccountAuth, taskController.getTaskById);
router.patch('/:taskId', requireAdminAuth, taskController.updateTask);
router.get('/:taskId/assignments', requireAdminAuth, taskController.listTaskAssignments);
router.post('/:taskId/assignments', requireAdminAuth, taskController.assignVolunteerToTask);
router.patch(
  '/:taskId/assignments/:volunteerId',
  requireAdminAuth,
  taskController.updateTaskAssignment,
);

module.exports = router;
