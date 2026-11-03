const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_VOLUNTEER_TITLES = [
  {
    name: 'متطوع مبتدئ',
    level: 1,
    description: 'بداية الرحلة والمشاركة في العمل التطوعي.',
    icon: 'seedling',
    minPoints: 0,
    minHours: 0,
    minCompletedTasks: 0,
    minReports: 0,
  },
  {
    name: 'صانع الخير',
    level: 2,
    description: 'مساهمات تطوعية موثقة وبداية أثر ملموس.',
    icon: 'heart',
    minPoints: 100,
    minHours: 1,
    minCompletedTasks: 1,
    minReports: 1,
  },
  {
    name: 'متطوع متميز',
    level: 3,
    description: 'إنجازات ومشاركات تطوعية فعالة.',
    icon: 'star',
    minPoints: 300,
    minHours: 10,
    minCompletedTasks: 5,
    minReports: 5,
  },
  {
    name: 'قائد الأثر',
    level: 4,
    description: 'خبرة ميدانية ومساهمة قيادية مستمرة.',
    icon: 'flag',
    minPoints: 750,
    minHours: 30,
    minCompletedTasks: 20,
    minReports: 15,
  },
  {
    name: 'سفير أثر',
    level: 5,
    description: 'إنجاز تطوعي استثنائي وأثر مجتمعي مستدام.',
    icon: 'crown',
    minPoints: 1500,
    minHours: 100,
    minCompletedTasks: 50,
    minReports: 40,
  },
];

async function main() {
  await prisma.volunteerTitle.createMany({
    data: DEFAULT_VOLUNTEER_TITLES,
    skipDuplicates: true,
  });

  console.log('Default volunteer titles are available.');
}

main()
  .catch((error) => {
    console.error('Volunteer title seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
