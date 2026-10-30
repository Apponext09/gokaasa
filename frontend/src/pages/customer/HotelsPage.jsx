import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, MapPin, Search, X } from "lucide-react";
import { Alert } from "@/components/ui/surfaces.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Pagination, formatDateTime } from "@/components/shared/index.jsx";
import { StaggeredReveal } from "@/components/shared/StaggeredReveal.jsx";
import { SearchWidget } from "@/features/search/components/SearchWidget.jsx";
import { HotelsFilterPanel } from "@/features/search/components/HotelsFilterPanel.jsx";
import { HotelCard, HotelCardSkeleton } from "@/features/search/components/HotelCard.jsx";
import { useGeolocation } from "@/features/home/useGeolocation.js";
import { distanceFromCoordinatesKm } from "@/features/hotels/distance.js";
import {
  parseSearchParams,
  addDays,
  summarizeOccupancy,
  toSearchParams,
  todayIso,
  validateStay,
} from "@/features/search/searchParams.js";
import { useDocumentMeta } from "@/hooks/useDocumentMeta.js";
import { useDebounce } from "@/hooks/useDebounce.js";
import { useAuth } from "@/features/auth/AuthContext.jsx";
import { discoveryApi } from "@/services/endpoints.js";
import { normalizeError } from "@/services/api.js";
import { cn } from "@/lib/utils.js";

const SORT_TAB_OPTIONS = [
  { value: "recommended", label: "Popularity" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "guest_rating", label: "Customer Ratings" },
  { value: "star_rating", label: "Star Rating" },
];

const titleCase = (slug) =>
  slug ? slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ") : "";

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function buildRequest(state, destination, name) {
  const p = toSearchParams({ ...state, name: name || null }, { includeCoupon: false });
  if (destination) p.set("destination", destination);
  if (state.area) p.set("area", state.area);
  return p;
}

export function HotelsPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const state = useMemo(() => parseSearchParams(params), [params]);
  const destination = params.get("destination") || "";
  const stayProblem = validateStay(state, today);
  const hasStay = !stayProblem;
  const browseMode = !hasStay;
  const label = titleCase(destination) || "";

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const nameQuery = state.name ?? "";
  const debouncedNameQuery = useDebounce(nameQuery.trim(), 200);
  const nameSearchIsSettling = nameQuery.trim() !== debouncedNameQuery;
  const { status: authStatus } = useAuth();
  const geolocation = useGeolocation({ autoRequest: authStatus !== "loading" });

  // If no dates are specified in URL, use next default dates so all hotels show by default
  const effectiveState = useMemo(() => (
    hasStay
      ? state
      : {
          ...state,
          checkIn: addDays(today, 1),
          checkOut: addDays(today, 3),
        }
  ), [hasStay, state, today]);

  // Defaults are real search inputs, so write them to the URL as well. This keeps refresh/share and
  // the quick-view/full-page links on the exact stay that produced the displayed availability.
  useEffect(() => {
    if (params.has("checkIn") || params.has("checkOut")) return;
    const search = toSearchParams(effectiveState);
    if (state.area) search.set("area", state.area);
    if (destination) search.set("destination", destination);
    setParams(search, { replace: true });
  }, [destination, effectiveState, params, setParams, state.area]);

  const requestKey = buildRequest(effectiveState, destination, debouncedNameQuery).toString();
  const searchWidgetKey = [
    destination,
    state.area ?? "",
    state.name ?? "",
    state.checkIn ?? "",
    state.checkOut ?? "",
    JSON.stringify(state.occupancy),
  ].join("|");

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    setError(null);
    const reqParams = buildRequest(effectiveState, destination, debouncedNameQuery);
    discoveryApi
      .search(Object.fromEntries(reqParams), { signal: ctrl.signal })
      .then((result) => { setData(result); setStatus("ready"); })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(normalizeError(err).message);
        setStatus("error");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retryKey, authStatus]);

  // A sold-out card caused only by a short booking hold becomes searchable again as soon as that
  // hold expires. Refresh once at the earliest advertised expiry; confirmed inventory remains sold out.
  useEffect(() => {
    const retryTimes = (data?.items ?? [])
      .filter((hotel) => hotel.availabilityStatus === "TEMPORARILY_HELD" && hotel.retryAt)
      .map((hotel) => new Date(hotel.retryAt).getTime())
      .filter(Number.isFinite);
    if (retryTimes.length === 0) return undefined;
    const delay = Math.max(250, Math.min(...retryTimes) - Date.now() + 250);
    const timer = setTimeout(() => setRetryKey((key) => key + 1), delay);
    return () => clearTimeout(timer);
  }, [data?.items]);

  const update = (patch, { resetPage = true, replace = false } = {}) => {
    const next = { ...state, ...patch, page: resetPage && !("page" in patch) ? 1 : (patch.page ?? state.page) };
    const search = toSearchParams(next);
    if (state.area) search.set("area", state.area);
    if (destination) search.set("destination", destination);
    setParams(search, { replace });
  };

  useDocumentMeta({
    title: `Hotels${label ? ` in ${label}` : ""} | Gokaasa`,
    description: `Find and compare hotels${label ? ` in ${label}` : ""} on Gokaasa. Check live prices and availability.`,
    canonicalPath: "/hotels",
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const items = geolocation.coords
      ? data.items.map((hotel) => {
          const distanceKm = distanceFromCoordinatesKm(geolocation.coords, hotel);
          return distanceKm == null ? hotel : { ...hotel, distanceKm };
        })
      : data.items;
    return items;
  }, [data?.items, geolocation.coords]);

  // Dynamically extract up to the first 5 unique hotel images for the searched location
  const locationImages = useMemo(() => {
    if (!data?.items?.length) return [];
    const urls = [];
    for (const h of data.items) {
      const url =
        h.image?.url ||
        h.image?.sourceUrl ||
        h.cover?.url ||
        h.cover?.sourceUrl ||
        h.imageUrl ||
        (Array.isArray(h.images) ? h.images[0]?.url : null);
      if (url && !urls.includes(url)) {
        urls.push(url);
        if (urls.length >= 5) break;
      }
    }
    return urls;
  }, [data?.items]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Automatically cycle through the location's hotel images every 5 seconds
  useEffect(() => {
    setActiveImageIndex(0);
    if (locationImages.length <= 1) return;
    const interval = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % locationImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [locationImages]);

  // Dynamically load popular destination covers from API (zero hardcoding)
  const [popularCovers, setPopularCovers] = useState([]);
  useEffect(() => {
    discoveryApi
      .popularDestinations({ limit: 6 })
      .then((items) => setPopularCovers(items ?? []))
      .catch(() => {});
  }, []);

  const currentHeroImage = useMemo(() => {
    // 1. Prioritize real hotel photos returned for the searched location (cycles first 5)
    if (locationImages.length > 0) {
      return locationImages[activeImageIndex] || locationImages[0];
    }
    // 2. If results are still loading or empty, match destination against popular destinations
    if (destination && popularCovers.length > 0) {
      const destLower = destination.toLowerCase();
      const match = popularCovers.find(
        (p) => p.destination?.toLowerCase() === destLower || p.label?.toLowerCase() === destLower,
      );
      if (match?.imageUrl) return match.imageUrl;
    }
    // 3. Fallback to first popular destination cover if available
    return popularCovers[0]?.imageUrl || null;
  }, [locationImages, activeImageIndex, destination, popularCovers]);

  const filtersPanel = (
    <HotelsFilterPanel
      filters={state.filters}
      priceBounds={data?.priceBounds}
      nameQuery={nameQuery}
      onNameQueryChange={(value) => update({ name: value || null }, { replace: true })}
      onChange={(filters) => update({ filters })}
      onClear={() => update({ filters: {}, name: null })}
    />
  );

  // Use the same effective stay sent to the API when browsing without explicit dates.
  const cardState = hasStay ? state : {
    checkIn: effectiveState.checkIn,
    checkOut: effectiveState.checkOut,
    occupancy: [{ adults: 2, childAges: [] }],
    filters: state.filters,
    sort: state.sort,
    coupon: state.coupon,
  };

  return (
    <div className="hotels-page-root">
      {/* Hero */}
      <div
        className={cn("hotels-page-hero", currentHeroImage && "has-location-image")}
        style={currentHeroImage
          ? { backgroundImage: `linear-gradient(90deg, rgba(3, 18, 48, 0.82), rgba(10, 66, 186, 0.58)), url(${JSON.stringify(currentHeroImage)})` }
          : undefined}
      >
        <div className="hotels-page-hero-inner">
          <h1 className="hotels-page-hero-title">
            {label ? `Hotels in ${label}` : "Find Your Perfect Stay"}
          </h1>
          <p className="hotels-page-hero-sub">
            {hasStay
              ? `${shortDate(state.checkIn)} to ${shortDate(state.checkOut)} - ${summarizeOccupancy(state.occupancy)}`
              : label
                ? `Browsing all hotels in ${label} - add dates to see live prices`
                : "Choose a destination and dates to see live prices and availability"}
          </p>
          <div className="hotels-page-search-box">
            <div className="hotels-search-desktop">
              <SearchWidget
                key={`desktop-${searchWidgetKey}`}
                variant="compact"
                initial={{ destination, area: state.area, name: state.name, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy, coupon: state.coupon }}
              />
            </div>
            <div className="hotels-search-mobile">
              <SearchWidget
                key={`mobile-${searchWidgetKey}`}
                variant="hero"
                initial={{ destination, area: state.area, name: state.name, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy, coupon: state.coupon }}
              />
            </div>
          </div>

          {locationImages.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5" aria-label="Location hotel photos">
              {locationImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    activeImageIndex === idx ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
                  )}
                  aria-label={`View location hotel image ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hotels-page-body">
        {/* Sort tabs */}
        <div className="hotels-sort-tabs-bar">
          <span className="hotels-sort-label">Sort by:</span>
          <div className="hotels-sort-buttons">
            {SORT_TAB_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn("hotels-sort-tab-btn", state.sort === opt.value && "active")}
                onClick={() => update({ sort: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hotels-page-grid">
          {/* Filter sidebar */}
          <aside className="hotels-filter-sidebar hidden lg:block">
            {filtersPanel}
          </aside>

          {/* Results */}
          <section className="hotels-results-col" aria-live="polite">
            <div className="hotels-results-header">
              <h2 className="hotels-results-heading">
                {label ? (
                  <>Hotels in <span>{label}</span></>
                ) : "All Hotels"}
                {status === "ready" && (
                  <span className="hotels-results-count"> ({data?.pagination.total ?? 0} Propert{data?.pagination.total === 1 ? "y" : "ies"} Found)</span>
                )}
                {status === "loading" && !data && <span className="hotels-results-count"> (Searching...)</span>}
                {status === "loading" && data && <span className="hotels-results-count"> (Updating...)</span>}
              </h2>
              <div className="flex items-center gap-2">
                {!geolocation.coords && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={geolocation.request}
                    disabled={geolocation.status === "requesting"}
                  >
                    <MapPin className="h-4 w-4" />
                    {geolocation.status === "requesting" ? "Getting location…" : "Show distance"}
                  </Button>
                )}
                <Button variant="secondary" size="sm" className="hotels-mobile-filter-btn" onClick={() => setSheetOpen(true)}>
                  <Filter className="h-4 w-4" /> Filters
                </Button>
              </div>
            </div>

            {status === "loading" && !data && (
              <div className="hotels-cards-stream">
                {[0, 1, 2, 3].map((i) => <HotelCardSkeleton key={i} />)}
              </div>
            )}

            {status === "error" && (
              <Alert tone="error" title="We could not load hotels right now.">
                <span className="flex flex-wrap items-center gap-3">
                  {error}
                  <Button size="sm" variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>Try again</Button>
                </span>
              </Alert>
            )}

            {status === "ready" && filteredItems.length === 0 && (
              <div className="hotels-no-results-card">
                <div className="hotels-empty-icon-wrap"><Search className="h-10 w-10 text-slate-400" /></div>
                <h3>No Hotels Found{label ? ` in ${label}` : ""}</h3>
                <p>Try clearing some filters or searching a nearby destination.</p>
                <Button variant="secondary" onClick={() => update({ filters: {}, name: null })}>Clear All Filters</Button>
              </div>
            )}

            {data && status !== "error" && filteredItems.length > 0 && (
              <div className={cn("hotels-cards-stream", (status === "loading" || nameSearchIsSettling) && "is-updating")} aria-busy={status === "loading" || nameSearchIsSettling}>
                {filteredItems.map((hotel, index) => (
                  <StaggeredReveal key={hotel.id} index={index}>
                    <HotelCard hotel={hotel} state={cardState} />
                  </StaggeredReveal>
                ))}
              </div>
            )}

            {status === "ready" && data && data.pagination.totalPages > 1 && (
              <div className="mt-8">
                <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(page) => update({ page }, { resetPage: false })} />
              </div>
            )}
            {status === "ready" && data && hasStay && (
              <p className="hotels-price-note">Nightly prices are before taxes and fees; stay totals include them. Last checked {formatDateTime(new Date())}.</p>
            )}
            {status === "ready" && data && browseMode && (
              <p className="hotels-price-note">Add check-in and check-out dates above to see live prices and availability.</p>
            )}
          </section>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Close filters" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold">Filters</p>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSheetOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            {filtersPanel}
            <div className="sticky bottom-0 -mx-5 mt-5 border-t border-slate-100 bg-white px-5 py-3">
              <Button className="w-full" onClick={() => setSheetOpen(false)}>Show {data?.pagination.total ?? 0} hotels</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
