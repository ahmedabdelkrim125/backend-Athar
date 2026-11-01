
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const volunteerId = 1;
  const campaignId = 2;

  // Verify volunteer
  const volunteer = await prisma.volunteer.findUnique({
    where: { id: volunteerId },
  });

  if (!volunteer) {
    throw new Error(`Volunteer ${volunteerId} not found`);
  }

  // Get campaign tasks
  const tasks = await prisma.task.findMany({
    where: { campaignId },
    select: { id: true, title: true },
  });

  if (tasks.length === 0) {
    throw new Error(`No tasks found for campaign ${campaignId}`);
  }

  // Assign all campaign tasks to the volunteer
  const result = await prisma.volunteerTask.createMany({
    data: tasks.map((task) => ({
      volunteerId,
      taskId: task.id,
      status: 'ASSIGNED',
    })),
    skipDuplicates: true,
  });

  // Update task status
  await prisma.task.updateMany({
    where: {
      id: { in: tasks.map((task) => task.id) },
      status: 'OPEN',
    },
    data: { status: 'ASSIGNED' },
  });

  console.log(`Volunteer: ${volunteer.fullName}`);
  console.log(`Tasks found: ${tasks.length}`);
  console.log(`New assignments: ${result.count}`);
  console.log('Task assignment completed successfully!');

  tasks.forEach((task) => {
    console.log(`- ${task.title}`);
  });
}

main()
  .catch((error) => {
    console.error('Assignment error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
