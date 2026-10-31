const { buildAvatarUrl } = require('./profile-helpers');

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    return value?.toString?.() ?? value;
  }

  return parsedValue;
}

function serializeVolunteerSummary(volunteer) {
  if (!volunteer) {
    return null;
  }

  return {
    id: volunteer.id,
    fullName: volunteer.fullName,
    nationalId: volunteer.nationalId,
    email: volunteer.email,
    phone: volunteer.phone,
    avatarUrl: buildAvatarUrl(volunteer),
    status: volunteer.status,
  };
}

function serializeLocation(location) {
  if (!location) {
    return null;
  }

  return {
    id: location.id,
    name: location.name,
    latitude: decimalToNumber(location.latitude),
    longitude: decimalToNumber(location.longitude),
    city: location.city,
    area: location.area,
  };
}

function serializePagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function serializeBadge(badge) {
  if (!badge) {
    return null;
  }

  return {
    id: badge.id,
    name: badge.name,
    description: badge.description,
    pointsRequired: badge.pointsRequired,
  };
}

module.exports = {
  decimalToNumber,
  serializeBadge,
  serializeLocation,
  serializePagination,
  serializeVolunteerSummary,
};
