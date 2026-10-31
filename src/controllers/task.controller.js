const taskService = require('../services/task.service');
const asyncHandler = require('../utils/async-handler');

const listTasks = asyncHandler(async (req, res) => {
  const result = await taskService.listTasks(req.query, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getTaskById = asyncHandler(async (req, res) => {
  const result = await taskService.getTaskById(
    req.params.taskId,
    req.user.id,
    req.query,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createTask = asyncHandler(async (req, res) => {
  const result = await taskService.createTask(req.body, req.user.id);

  res.status(201).json({
    success: true,
    ...result,
  });
});

const updateTask = asyncHandler(async (req, res) => {
  const result = await taskService.updateTask(
    req.params.taskId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const listTaskAssignments = asyncHandler(async (req, res) => {
  const result = await taskService.listTaskAssignments(
    req.params.taskId,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const assignVolunteerToTask = asyncHandler(async (req, res) => {
  const result = await taskService.assignVolunteerToTask(
    req.params.taskId,
    req.body,
    req.user.id,
  );

  res.status(201).json({
    success: true,
    ...result,
  });
});

const updateTaskAssignment = asyncHandler(async (req, res) => {
  const result = await taskService.updateTaskAssignment(
    req.params.taskId,
    req.params.volunteerId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  assignVolunteerToTask,
  createTask,
  getTaskById,
  listTaskAssignments,
  listTasks,
  updateTask,
  updateTaskAssignment,
};
