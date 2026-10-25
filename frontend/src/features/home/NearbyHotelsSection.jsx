import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, MapPin, Navigation } from 'lucide-react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button.jsx';
import { useGeolocation } from './useGeolocation.js';
import { discoveryApi } from '@/services/endpoints.js';
import { slugifyPlace } from '@/features/search/searchParams.js';

const RADIUS_KM = 25;
const LIMIT = 8;
const MAP_LIMIT = 24;

const hotelMarkerIcon = divIcon({
  className: 'nearby-hotel-marker',
  html: '<span></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

function MapViewport({ hotels }) {
  const map = useMap();

  useEffect(() => {
    if (hotels.length === 0) return;
    const bounds = latLngBounds(hotels.map((hotel) => [hotel.latitude, hotel.longitude]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11, animate: false });
  }, [hotels, map]);

  return null;
}

export function NearbyHotelsSection() {
  const { status: geoStatus, coords, request } = useGeolocation();
  const [hotels, setHotels] = useState(null);
  const [mapHotels, setMapHotels] = useState(null);
  const [error, setError] = useState(null);
  const [showMapAttribution, setShowMapAttribution] = useState(true);

  const visibleMapHotels = geoStatus === 'granted' && !error && hotels?.length > 0
    ? hotels.filter((hotel) => Number.isFinite(hotel.latitude) && Number.isFinite(hotel.longitude))
    : mapHotels;
  const previewMapBounds = visibleMapHotels?.length > 0
    ? latLngBounds(visibleMapHotels.map((hotel) => [hotel.latitude, hotel.longitude]))
    : null;
  const previewMapCenter = previewMapBounds?.getCenter();

  useEffect(() => {
    setShowMapAttribution(true);
    const timer = window.setTimeout(() => setShowMapAttribution(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    discoveryApi
      .handpickedHotels({ page: 1, limit: MAP_LIMIT })
      .then((result) => {
        if (!active) return;
        setMapHotels((result.items ?? []).filter((hotel) => (
          Number.isFinite(hotel.latitude) && Number.isFinite(hotel.longitude)
        )));
      })
      .catch(() => {
        if (active) setMapHotels([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (geoStatus !== 'granted' || !coords) return undefined;
    let active = true;
    setError(null);
    setHotels(null);
    discoveryApi
      .nearbyHotels({ lat: coords.lat, lng: coords.lng, radiusKm: RADIUS_KM, limit: LIMIT })
      .then((result) => active && setHotels(result.items))
      .catch(() => active && setError('Unable to find hotels near you. Try another location.'));
    return () => {
      active = false;
    };
  }, [geoStatus, coords]);

  const isFinding = geoStatus === 'requesting' || (geoStatus === 'granted' && hotels === null && !error);
  const hasNearbyHotels = geoStatus === 'granted' && !error && hotels?.length > 0;
  const noNearbyHotels = geoStatus === 'granted' && !error && hotels?.length === 0;
  const locationUnavailable = ['denied', 'unavailable', 'timeout'].includes(geoStatus);

  return (
    <section id="nearby" aria-labelledby="nearby-heading" className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="nearby-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
            Hotels Near You
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Discover great stays close to your current location.</p>
        </div>
        {hasNearbyHotels && (
          <Link to={`/hotels/nearby?lat=${coords.lat}&lng=${coords.lng}`} className="text-sm font-medium text-brand-700 hover:underline">
            View all nearby hotels
          </Link>
        )}
      </div>

      <div className="nearby-idle-card">
        <div className="nearby-idle-map">
          {visibleMapHotels?.length > 0 ? (
            <MapContainer
              className="nearby-real-map"
              bounds={previewMapBounds}
              boundsOptions={{ padding: [32, 32], maxZoom: 11 }}
              scrollWheelZoom={false}
              attributionControl={false}
              zoomControl={false}
            >
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="topright" />
              <MapViewport hotels={visibleMapHotels} />
              {visibleMapHotels.map((hotel) => (
                <Marker
                  key={hotel.id}
                  position={[hotel.latitude, hotel.longitude]}
                  icon={hotelMarkerIcon}
                >
                  <Popup>
                    <strong>{hotel.name}</strong>
                    <span className="nearby-map-popup-location">{hotel.area ? `${hotel.area}, ` : ''}{hotel.city}</span>
                    {hotel.distanceKm != null && (
                      <span className="nearby-map-popup-location">{Number(hotel.distanceKm).toFixed(1)} km from your location</span>
                    )}
                    <span className="nearby-map-popup-actions">
                      <Link to={`/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}`}>View hotel</Link>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.latitude},${hotel.longitude}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Google Maps
                      </a>
                    </span>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="nearby-map-empty">
              {visibleMapHotels === null ? 'Loading hotel locations…' : 'No hotel coordinates available'}
            </div>
          )}

          <a
            className={`nearby-idle-map-attribution${showMapAttribution ? '' : ' is-collapsed'}`}
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            aria-label="OpenStreetMap map data and licence"
            title="OpenStreetMap map data and licence"
          >
            {showMapAttribution
              ? '© OpenStreetMap contributors'
              : <Info className="h-3.5 w-3.5" aria-hidden="true" />}
          </a>
        </div>

        {previewMapCenter && (
          <a
            className="nearby-open-google-maps"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`hotels near ${previewMapCenter.lat},${previewMapCenter.lng}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Google Maps
          </a>
        )}

        <div className="nearby-idle-content">
          <h3 className="nearby-idle-heading">
            {isFinding
              ? 'Finding nearby stays…'
              : hasNearbyHotels
                ? `${hotels.length} nearby ${hotels.length === 1 ? 'stay' : 'stays'} on the map`
                : noNearbyHotels
                  ? 'No nearby stays found'
                  : error
                    ? 'Unable to load nearby stays'
                    : locationUnavailable
                      ? 'Location is unavailable'
                      : 'Explore nearby stays'}
          </h3>
          <p className="nearby-idle-desc">
            {hasNearbyHotels
              ? 'Select a hotel marker to see its details and distance from your current location.'
              : noNearbyHotels
                ? `No published hotels were found within ${RADIUS_KM} km. The map remains available for exploring other stays.`
                : error
                  ? 'The map is still available. You can retry your current location.'
                  : locationUnavailable
                    ? 'Allow location access to show nearby hotel markers and distances.'
                    : 'Use your current location to update this map with nearby hotels. Your location is never stored.'}
          </p>

          {hasNearbyHotels ? (
            <Link to={`/hotels/nearby?lat=${coords.lat}&lng=${coords.lng}`} className="nearby-idle-btn">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              View Nearby Hotels
            </Link>
          ) : (
            <Button
              onClick={request}
              size="sm"
              className="nearby-idle-btn"
              loading={isFinding}
            >
              {!isFinding && <Navigation className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
              {isFinding ? 'Finding Hotels…' : geoStatus === 'idle' ? 'Find Hotels Near Me' : 'Retry My Location'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
