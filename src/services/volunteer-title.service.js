const prisma = require('../lib/prisma');
const { validateVolunteerTitles } = require('../utils/volunteer-titles');

async function listVolunteerTitles(dbClient = prisma) {
  const titles = await dbClient.volunteerTitle.findMany({
    orderBy: {
      level: 'asc',
    },
  });

  return validateVolunteerTitles(titles);
}

module.exports = {
  listVolunteerTitles,
};
