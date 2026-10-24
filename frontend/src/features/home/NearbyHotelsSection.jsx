import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Info, MapPin, Navigation, RotateCcw } from 'lucide-react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { Carousel, CarouselItem } from '@/components/ui/carousel.jsx';
import { EmptyState } from '@/components/shared/index.jsx';
import { CuratedHotelCard, CuratedHotelCardSkeleton } from './CuratedHotelCard.jsx';
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

  useEffect(() => {
    if (geoStatus !== 'idle') return undefined;
    setShowMapAttribution(true);
    const timer = window.setTimeout(() => setShowMapAttribution(false), 5000);
    return () => window.clearTimeout(timer);
  }, [geoStatus]);

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

  return (
    <section id="nearby" aria-labelledby="nearby-heading" className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="nearby-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
            Hotels Near You
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Discover great stays close to your current location.</p>
        </div>
        {hotels?.length > 0 && (
          <Link to={`/hotels/nearby?lat=${coords.lat}&lng=${coords.lng}`} className="text-sm font-medium text-brand-700 hover:underline">
            View all nearby hotels
          </Link>
        )}
      </div>

      {geoStatus === 'idle' && (
        <div className="nearby-idle-card">
          <div className="nearby-idle-map">
            {mapHotels?.length > 0 ? (
              <MapContainer
                className="nearby-real-map"
                bounds={latLngBounds(mapHotels.map((hotel) => [hotel.latitude, hotel.longitude]))}
                boundsOptions={{ padding: [32, 32], maxZoom: 11 }}
                scrollWheelZoom={false}
                attributionControl={false}
                zoomControl={false}
              >
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ZoomControl position="topright" />
                <MapViewport hotels={mapHotels} />
                {mapHotels.map((hotel) => (
                  <Marker
                    key={hotel.id}
                    position={[hotel.latitude, hotel.longitude]}
                    icon={hotelMarkerIcon}
                  >
                    <Popup>
                      <strong>{hotel.name}</strong>
                      <span className="nearby-map-popup-location">{hotel.area ? `${hotel.area}, ` : ''}{hotel.city}</span>
                      <Link to={`/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}`}>View hotel</Link>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            ) : (
              <div className="nearby-map-empty">
                {mapHotels === null ? 'Loading hotel locations…' : 'No hotel coordinates available'}
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

          {/* Left: text content */}
          <div className="nearby-idle-content">
            <h3 className="nearby-idle-heading">Explore nearby stays</h3>
            <p className="nearby-idle-desc">
              Use your current location to find hotels near you. Your location is never stored.
            </p>
            <Button onClick={request} size="sm" className="nearby-idle-btn">
              <Navigation className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              Find Hotels Near Me
            </Button>
          </div>

        </div>
      )}

      {geoStatus === 'requesting' && (
        <Carousel aria-label="Hotels near you loading">
          {Array.from({ length: 4 }, (_, i) => (
            <CarouselItem key={i} className="w-64 sm:w-72">
              <CuratedHotelCardSkeleton />
            </CarouselItem>
          ))}
        </Carousel>
      )}

      {geoStatus === 'denied' && (
        <Alert tone="warning" title="We couldn't access your location.">
          <span className="flex flex-wrap items-center gap-3">
            You can still browse hotels by destination instead.
            <Link to="/destinations">
              <Button size="sm" variant="secondary">Choose a destination</Button>
            </Link>
          </span>
        </Alert>
      )}

      {geoStatus === 'unavailable' && (
        <Alert tone="info" title="Location isn't available on this device or browser.">
          <Link to="/destinations" className="font-medium text-brand-700 hover:underline">Choose a destination instead</Link>
        </Alert>
      )}

      {geoStatus === 'timeout' && (
        <Alert tone="warning" title="That took too long.">
          <span className="flex flex-wrap items-center gap-3">
            Your location request timed out.
            <Button size="sm" variant="secondary" onClick={request}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </span>
        </Alert>
      )}

      {geoStatus === 'granted' && error && (
        <Alert tone="error" title="Unable to find hotels near you.">
          <span className="flex flex-wrap items-center gap-3">
            Try another location.
            <Button size="sm" variant="secondary" onClick={request}>Try again</Button>
          </span>
        </Alert>
      )}

      {geoStatus === 'granted' && !error && hotels === null && (
        <Carousel aria-label="Hotels near you loading">
          {Array.from({ length: 4 }, (_, i) => (
            <CarouselItem key={i} className="w-64 sm:w-72">
              <CuratedHotelCardSkeleton />
            </CarouselItem>
          ))}
        </Carousel>
      )}

      {geoStatus === 'granted' && !error && hotels?.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No hotels found nearby"
          description={`We couldn't find a published hotel within ${RADIUS_KM}km of your location.`}
          action={<Link to="/destinations"><Button variant="secondary">Explore Hotels</Button></Link>}
        />
      )}

      {geoStatus === 'granted' && !error && hotels?.length > 0 && (
        <Carousel aria-label="Hotels near you">
          {hotels.map((hotel) => (
            <CarouselItem key={hotel.id} className="w-64 sm:w-72">
              <CuratedHotelCard hotel={hotel} />
            </CarouselItem>
          ))}
        </Carousel>
      )}
    </section>
  );
}
