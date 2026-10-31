const AppError = require('../utils/app-error');

async function resolveLocationInput(prismaClient, locationInput = {}) {
  if (locationInput.locationId) {
    const existingLocation = await prismaClient.location.findUnique({
      where: {
        id: locationInput.locationId,
      },
    });

    if (!existingLocation) {
      throw new AppError('الموقع المطلوب غير موجود', 404);
    }

    return existingLocation.id;
  }

  if (locationInput.location) {
    const createdLocation = await prismaClient.location.create({
      data: locationInput.location,
    });

    return createdLocation.id;
  }

  throw new AppError('الموقع مطلوب', 400);
}

module.exports = {
  resolveLocationInput,
};
