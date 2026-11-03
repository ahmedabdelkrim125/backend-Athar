function calculateHaversineDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildNearbyBounds(latitude, longitude, radiusMeters) {
  const latitudeDelta = radiusMeters / 110000;
  const minLatitude = Math.max(-90, latitude - latitudeDelta);
  const maxLatitude = Math.min(90, latitude + latitudeDelta);
  const cosine = Math.cos((latitude * Math.PI) / 180);
  const longitudeDelta = cosine < 0.000001 ? 180 : Math.min(180, radiusMeters / (110000 * cosine));
  const minLongitude = longitude - longitudeDelta;
  const maxLongitude = longitude + longitudeDelta;

  if (longitudeDelta >= 180 || (minLongitude < -180 && maxLongitude > 180)) {
    return { minLatitude, maxLatitude, longitude: null };
  }
  if (minLongitude < -180) {
    return {
      minLatitude,
      maxLatitude,
      longitude: { OR: [{ gte: minLongitude + 360 }, { lte: maxLongitude }] },
    };
  }
  if (maxLongitude > 180) {
    return {
      minLatitude,
      maxLatitude,
      longitude: { OR: [{ gte: minLongitude }, { lte: maxLongitude - 360 }] },
    };
  }
  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

function sortAndPaginateNearbyMissions(missions, page, limit) {
  const sorted = [...missions].sort(
    (left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.mission.date.localeCompare(right.mission.date) ||
      left.mission.id - right.mission.id,
  );
  const skip = (page - 1) * limit;
  return {
    total: sorted.length,
    missions: sorted.slice(skip, skip + limit).map((entry) => entry.mission),
  };
}

module.exports = {
  buildNearbyBounds,
  calculateHaversineDistanceMeters,
  sortAndPaginateNearbyMissions,
};
