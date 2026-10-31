function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function calculateDistanceMeters(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const lat1 = Number(fromLatitude);
  const lon1 = Number(fromLongitude);
  const lat2 = Number(toLatitude);
  const lon2 = Number(toLongitude);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
}

function buildDistanceContext(location, coordinates, radiusMeters) {
  if (!location || !coordinates) {
    return {
      distanceMeters: null,
      radiusMeters: radiusMeters ?? null,
      isWithinRange: null,
    };
  }

  const distanceMeters = calculateDistanceMeters(
    coordinates.latitude,
    coordinates.longitude,
    location.latitude,
    location.longitude,
  );

  return {
    distanceMeters,
    radiusMeters: radiusMeters ?? null,
    isWithinRange:
      distanceMeters === null || radiusMeters === null
        ? null
        : distanceMeters <= radiusMeters,
  };
}

module.exports = {
  buildDistanceContext,
  calculateDistanceMeters,
};
