
const { PrismaClient, CampaignStatus, TaskStatus } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Athar demo data...');

  // 1. Get existing location
  const location = await prisma.location.findUnique({
    where: { id: 1 },
  });

  if (!location) {
    throw new Error('Location ID 1 not found. Add a location first.');
  }

  // 2. Get an existing volunteer
  let volunteer = await prisma.volunteer.findUnique({
    where: { id: 2 },
  });

  if (!volunteer) {
    volunteer = await prisma.volunteer.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { id: 'asc' },
    });
  }

  if (!volunteer) {
    throw new Error('No volunteer found. Register a volunteer first.');
  }

  // 3. Create or reuse campaign
  const campaignTitle = 'معًا نصنع أثرًا';

  let campaign = await prisma.campaign.findFirst({
    where: { title: campaignTitle },
  });

  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        title: campaignTitle,
        description:
          'مبادرة تطوعية لنشر الوعي بمخاطر الإدمان ودعم المتعافين ومساعدتهم على الاندماج في المجتمع.',
        startDate: new Date('2026-11-10T00:00:00'),
        endDate: new Date('2026-11-20T00:00:00'),
        locationId: location.id,
        createdById: volunteer.id,
        status: CampaignStatus.PUBLISHED,
        attendanceRadiusMeters: 100,
        attendancePoints: 50,
        reportPoints: 50,
      },
    });

    console.log('Campaign created:', campaign.id);
  } else {
    console.log('Campaign already exists:', campaign.id);
  }

  // 4. Create tasks
  const tasks = [
    {
      title: 'تنظيم ورشة توعية',
      description:
        'المساعدة في تنظيم ورشة توعوية حول مخاطر الإدمان وأهمية الوقاية والدعم النفسي والمجتمعي.',
      date: new Date('2026-11-12T00:00:00'),
    },
    {
      title: 'توزيع المواد التوعوية',
      description:
        'المساهمة في تجهيز وتوزيع المواد والمنشورات التوعوية والتعريف بخدمات الدعم والمساعدة.',
      date: new Date('2026-11-15T00:00:00'),
    },
    {
      title: 'تنظيم أنشطة الدعم المجتمعي',
      description:
        'المساعدة في تنظيم أنشطة مجتمعية تشجع على الاندماج وتوفر بيئة داعمة ومحترمة للمتعافين.',
      date: new Date('2026-11-18T00:00:00'),
    },
  ];

  for (const task of tasks) {
    const existingTask = await prisma.task.findFirst({
      where: {
        title: task.title,
        campaignId: campaign.id,
      },
    });

    if (existingTask) {
      console.log('Task already exists:', task.title);
      continue;
    }

    await prisma.task.create({
      data: {
        ...task,
        campaignId: campaign.id,
        locationId: location.id,
        status: TaskStatus.OPEN,
        attendanceRadiusMeters: 100,
      },
    });

    console.log('Task created:', task.title);
  }

  console.log('All demo data completed successfully!');
}

main()
  .catch((error) => {
    console.error('Seed error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
