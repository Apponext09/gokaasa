/**
 * Parses latitude and longitude from a Google Maps or OpenStreetMap URL.
 * Supports:
 * - https://www.google.com/maps/@19.0760,72.8777,15z
 * - https://maps.google.com/?q=19.0760,72.8777
 * - https://www.google.com/maps/place/.../@19.0760,72.8777,...
 * - https://maps.google.com/?ll=19.0760,72.8777
 * - https://www.google.com/maps/dir/.../19.0760,72.8777
 * - !3d19.0760!4d72.8777
 */
export function parseCoordinatesFromUrl(url) {
  if (!url || typeof url !== 'string') return null;

  // 1. Check for @lat,lng
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 2. Check for query parameters q=lat,lng, ll=lat,lng, daddr=lat,lng
  const queryMatch = url.match(/[?&](?:q|ll|query|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (queryMatch) {
    const lat = Number(queryMatch[1]);
    const lng = Number(queryMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 3. Check for !3dlat!4dlng (Google Maps protobuf payload)
  const protoMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (protoMatch) {
    const lat = Number(protoMatch[1]);
    const lng = Number(protoMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

/**
 * Resolves destination coordinates for distance calculation.
 * STRICT RULE: If the hotel has no locationUrl provided, it returns null
 * so distance is not displayed.
 */
export function resolveHotelCoordinates(destination) {
  if (!destination) return null;

  // If destination is a hotel object with locationUrl
  if (destination.locationUrl !== undefined) {
    if (!destination.locationUrl) return null; // No location URL -> do not compute distance!

    const fromUrl = parseCoordinatesFromUrl(destination.locationUrl);
    if (fromUrl) return fromUrl;

    // If url didn't have coordinates embedded, fallback to stored coordinates
    if (destination.latitude != null && destination.longitude != null) {
      return { lat: Number(destination.latitude), lng: Number(destination.longitude) };
    }
    return null;
  }

  // Direct lat/lng object (e.g. user geolocation)
  const lat = destination.lat ?? destination.latitude;
  const lng = destination.lng ?? destination.longitude;
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { lat: Number(lat), lng: Number(lng) };
  }

  return null;
}

/** Great-circle distance between two points, in kilometres. */
export function distanceFromCoordinatesKm(origin, destination) {
  const fromCoords = resolveHotelCoordinates(origin);
  const toCoords = resolveHotelCoordinates(destination);

  if (!fromCoords || !toCoords) return null;

  const fromLat = fromCoords.lat;
  const fromLng = fromCoords.lng;
  const toLat = toCoords.lat;
  const toLng = toCoords.lng;

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
