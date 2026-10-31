async function syncTaskStatusFromAssignments(dbClient, taskId) {
  const task = await dbClient.task.findUnique({
    where: {
      id: taskId,
    },
    select: {
      status: true,
    },
  });

  if (!task || task.status === 'CANCELLED') {
    return;
  }

  const assignments = await dbClient.volunteerTask.findMany({
    where: {
      taskId,
    },
    select: {
      status: true,
    },
  });

  let nextStatus = 'OPEN';

  if (assignments.length > 0) {
    const allAssignmentsClosed = assignments.every((assignment) =>
      ['COMPLETED', 'CANCELLED'].includes(assignment.status),
    );

    if (
      allAssignmentsClosed &&
      assignments.some((assignment) => assignment.status === 'COMPLETED')
    ) {
      nextStatus = 'COMPLETED';
    } else if (
      assignments.some((assignment) =>
        ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(assignment.status),
      )
    ) {
      nextStatus = 'IN_PROGRESS';
    } else {
      nextStatus = 'ASSIGNED';
    }
  }

  if (task.status !== nextStatus) {
    await dbClient.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: nextStatus,
      },
    });
  }
}

module.exports = {
  syncTaskStatusFromAssignments,
};
