import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Search, X } from "lucide-react";
import { Alert } from "@/components/ui/surfaces.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Pagination, formatDateTime } from "@/components/shared/index.jsx";
import { StaggeredReveal } from "@/components/shared/StaggeredReveal.jsx";
import { SearchWidget } from "@/features/search/components/SearchWidget.jsx";
import { HotelsFilterPanel } from "@/features/search/components/HotelsFilterPanel.jsx";
import { HotelCard, HotelCardSkeleton } from "@/features/search/components/HotelCard.jsx";
import {
  parseSearchParams,
  addDays,
  summarizeOccupancy,
  toSearchParams,
  todayIso,
  validateStay,
} from "@/features/search/searchParams.js";
import { useDocumentMeta } from "@/hooks/useDocumentMeta.js";
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

function buildRequest(state, destination) {
  const p = toSearchParams(state);
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
  const [nameQuery, setNameQuery] = useState("");
  const { status: authStatus } = useAuth();

  // If no dates are specified in URL, use next default dates so all hotels show by default
  const effectiveState = hasStay
    ? state
    : {
        ...state,
        checkIn: addDays(today, 1),
        checkOut: addDays(today, 3),
      };

  const requestKey = buildRequest(effectiveState, destination).toString();

  useEffect(() => {
    if (authStatus === "loading") return undefined;
    const ctrl = new AbortController();
    setStatus("loading");
    setError(null);
    const reqParams = buildRequest(effectiveState, destination);
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

  const update = (patch, { resetPage = true } = {}) => {
    const next = { ...state, ...patch, page: resetPage && !("page" in patch) ? 1 : (patch.page ?? state.page) };
    const search = toSearchParams(next);
    if (state.area) search.set("area", state.area);
    if (destination) search.set("destination", destination);
    setParams(search, { replace: false });
  };

  useDocumentMeta({
    title: `Hotels${label ? ` in ${label}` : ""} | Gokaasa`,
    description: `Find and compare hotels${label ? ` in ${label}` : ""} on Gokaasa. Check live prices and availability.`,
    canonicalPath: "/hotels",
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!nameQuery.trim()) return data.items;
    const q = nameQuery.toLowerCase();
    return data.items.filter((h) => h.name.toLowerCase().includes(q));
  }, [data?.items, nameQuery]);

  const filtersPanel = (
    <HotelsFilterPanel
      filters={state.filters}
      priceBounds={data?.priceBounds}
      disabled={status === "loading"}
      nameQuery={nameQuery}
      onNameQueryChange={setNameQuery}
      onChange={(filters) => update({ filters })}
      onClear={() => { update({ filters: {} }); setNameQuery(""); }}
    />
  );

  // Use the same effective stay sent to the API when browsing without explicit dates.
  const cardState = hasStay ? state : {
    checkIn: effectiveState.checkIn,
    checkOut: effectiveState.checkOut,
    occupancy: [{ adults: 2, childAges: [] }],
    filters: state.filters,
    sort: state.sort,
  };

  return (
    <div className="hotels-page-root">
      {/* Hero */}
      <div className="hotels-page-hero">
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
            <SearchWidget
              variant="compact"
              initial={{ destination, area: state.area, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy }}
            />
          </div>
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
                  <span className="hotels-results-count"> ({filteredItems.length} Propert{filteredItems.length === 1 ? "y" : "ies"} Found)</span>
                )}
                {status === "loading" && !data && <span className="hotels-results-count"> (Searching...)</span>}
              </h2>
              <Button variant="secondary" size="sm" className="hotels-mobile-filter-btn" onClick={() => setSheetOpen(true)}>
                <Filter className="h-4 w-4" /> Filters
              </Button>
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
                <Button variant="secondary" onClick={() => { update({ filters: {} }); setNameQuery(""); }}>Clear All Filters</Button>
              </div>
            )}

            {status !== "error" && filteredItems.length > 0 && (
              <div className="hotels-cards-stream">
                {filteredItems.map((hotel, index) => (
                  <StaggeredReveal key={hotel.id} index={index}>
                    <HotelCard hotel={hotel} state={cardState} />
                  </StaggeredReveal>
                ))}
              </div>
            )}

            {data && data.pagination.totalPages > 1 && (
              <div className="mt-8">
                <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(page) => update({ page }, { resetPage: false })} />
              </div>
            )}
            {data && hasStay && (
              <p className="hotels-price-note">Prices are per room per night including taxes and fees. Last checked {formatDateTime(new Date())}.</p>
            )}
            {data && browseMode && (
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
              <Button className="w-full" onClick={() => setSheetOpen(false)}>Show {filteredItems.length} hotels</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
