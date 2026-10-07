-- hotelSearchRepository.search() filters candidate hotels by lower(h.area), the same way it already
-- filters by lower(h.city) (see hotels_city_idx in 002_hotels.sql). That city index exists; the matching
-- one for area was missed.
CREATE INDEX hotels_area_idx ON hotels (lower(area)) WHERE deleted_at IS NULL;
