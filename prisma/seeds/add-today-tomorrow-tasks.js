
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const volunteerId = 1;
  const campaignId = 2;
  const locationId = 1;

  const tasksData = [
    {
      title: 'تجهيز وتنسيق حملة توعوية',
      description:
        'المساعدة في تجهيز وتنظيم المواد التوعوية والتنسيق مع فريق المتطوعين استعدادًا للحملة.',
      date: new Date('2026-11-01T00:00:00.000Z'),
    },
    {
      title: 'زيارة ميدانية وتوزيع مواد توعوية',
      description:
        'المشاركة في زيارة ميدانية وتوزيع المنشورات التوعوية والتعريف بخدمات الدعم والمساعدة.',
      date: new Date('2026-11-02T00:00:00.000Z'),
    },
  ];

  // Verify campaign and volunteer
  const [campaign, volunteer, location] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.volunteer.findUnique({ where: { id: volunteerId } }),
    prisma.location.findUnique({ where: { id: locationId } }),
  ]);

  if (!campaign || !volunteer || !location) {
    throw new Error('Campaign, volunteer, or location not found');
  }

  // Extend campaign start date to include today's task
  if (campaign.startDate > new Date('2026-11-01T00:00:00.000Z')) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        startDate: new Date('2026-11-01T00:00:00.000Z'),
      },
    });
  }

  for (const taskData of tasksData) {
    const existingTask = await prisma.task.findFirst({
      where: {
        campaignId,
        title: taskData.title,
        date: taskData.date,
      },
    });

    if (existingTask) {
      console.log(`Already exists: ${taskData.title}`);
      continue;
    }

    const task = await prisma.task.create({
      data: {
        ...taskData,
        campaignId,
        locationId,
        status: 'ASSIGNED',
      },
    });

    await prisma.volunteerTask.create({
      data: {
        volunteerId,
        taskId: task.id,
        status: 'ASSIGNED',
      },
    });

    console.log(`Created and assigned: ${task.title}`);
  }

  console.log('Tasks added successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
