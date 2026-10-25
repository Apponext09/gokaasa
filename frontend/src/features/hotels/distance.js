/** Great-circle distance between two latitude/longitude points, in kilometres. */
export function distanceFromCoordinatesKm(origin, destination) {
  const coordinate = (value) => (value == null || value === '' ? null : Number(value));
  const fromLat = coordinate(origin?.lat ?? origin?.latitude);
  const fromLng = coordinate(origin?.lng ?? origin?.longitude);
  const toLat = coordinate(destination?.lat ?? destination?.latitude);
  const toLng = coordinate(destination?.lng ?? destination?.longitude);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return null;
  if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLng) > 180 || Math.abs(toLng) > 180) return null;

  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(toLat - fromLat);
  const longitudeDelta = toRadians(toLng - fromLng);
  const fromLatitude = toRadians(fromLat);
  const toLatitude = toRadians(toLat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));

  return 6371 * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
}
