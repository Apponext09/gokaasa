import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { DateField } from '../components/DateField.js';
import { DestinationInput } from '../components/DestinationInput.js';
import { GuestsModal } from '../components/GuestsModal.js';
import { HotelCard, HotelCardSkeleton } from '../components/HotelCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppButton } from '../components/AppButton.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { formatOccupancy, occupancyLabel, todayIso, addDaysIso, nightsBetween } from '../utils/format.js';
import { validateSearchCriteria } from '../utils/searchValidation.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'guest_rating', label: 'Guest rating' },
  { value: 'star_rating', label: 'Star rating' },
];

const PROPERTY_TYPES = ['HOTEL', 'RESORT', 'VILLA', 'APARTMENT', 'HOSTEL', 'GUEST_HOUSE'];
const GUEST_RATING_OPTIONS = [
  { value: 3, label: '3+' },
  { value: 3.5, label: '3.5+' },
  { value: 4, label: '4+' },
  { value: 4.5, label: '4.5+' },
];
const MEAL_PLANS = [
  { code: 'ROOM_ONLY', label: 'Room only' },
  { code: 'BREAKFAST', label: 'Breakfast included' },
  { code: 'HALF_BOARD', label: 'Half board' },
  { code: 'FULL_BOARD', label: 'Full board' },
];
// One-tap shortcuts to the same `filters` state the full Filters sheet edits -- every one of these maps
// to a real, already-supported backend search param (hotelSearch.validator.js), never a client-only
// pseudo-filter. `active` is read directly off the live (not draft) filters, so a chip reflects whatever
// is actually applied right now, including when set via the full sheet instead of the chip itself.
const QUICK_FILTERS = [
  { key: 'freeCancellation', label: 'Free cancellation', icon: 'shield-checkmark-outline', active: (f) => f.freeCancellation, apply: (f) => ({ ...f, freeCancellation: !f.freeCancellation }) },
  { key: 'highRating', label: '4★ guest rating+', icon: 'star-outline', active: (f) => f.guestRating === 4, apply: (f) => ({ ...f, guestRating: f.guestRating === 4 ? undefined : 4 }) },
  { key: 'resorts', label: 'Resorts', icon: 'sunny-outline', active: (f) => f.propertyTypes.length === 1 && f.propertyTypes[0] === 'RESORT', apply: (f) => ({ ...f, propertyTypes: f.propertyTypes.length === 1 && f.propertyTypes[0] === 'RESORT' ? [] : ['RESORT'] }) },
  { key: 'pool', label: 'Swimming pool', icon: 'water-outline', active: (f) => f.amenities.includes('POOL'), apply: (f) => ({ ...f, amenities: f.amenities.includes('POOL') ? f.amenities.filter((a) => a !== 'POOL') : [...f.amenities, 'POOL'] }) },
  { key: 'wifi', label: 'Wi-Fi', icon: 'wifi-outline', active: (f) => f.amenities.includes('WIFI'), apply: (f) => ({ ...f, amenities: f.amenities.includes('WIFI') ? f.amenities.filter((a) => a !== 'WIFI') : [...f.amenities, 'WIFI'] }) },
];
const DEFAULT_ROOM = { adults: 2, childAges: [] };
const DEFAULT_FILTERS = { minPrice: '', maxPrice: '', stars: [], guestRating: undefined, propertyTypes: [], amenities: [], mealPlans: [], freeCancellation: false };

export default function SearchScreen({ route, navigation }) {
  const params = route.params ?? {};
  const initialDestination = params.destination ? { destination: params.destination, area: params.area ?? null, label: params.label } : null;

  const [destination, setDestination] = useState(initialDestination);
  const [destinationText, setDestinationText] = useState(params.label ?? '');
  const [checkIn, setCheckIn] = useState(params.checkIn ?? addDaysIso(todayIso(), 1));
  const [checkOut, setCheckOut] = useState(params.checkOut ?? addDaysIso(todayIso(), 2));
  const [room, setRoom] = useState(params.occupancy?.[0] ?? DEFAULT_ROOM);
  const [sort, setSort] = useState('recommended');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [amenityOptions, setAmenityOptions] = useState([]);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Arriving with an already-specific destination (a Home search-card submit, or a destination card
  // tap) is itself the deliberate commit -- that's the one case allowed to search immediately. Landing
  // here with nothing chosen shows the form first and waits for an explicit "Search Hotels" tap -- the
  // actual fix for the reported "search doesn't do anything" complaint: there used to be no explicit
  // commit action at all, search just fired reactively and invisibly the instant a destination was
  // picked, with no "Search Hotels" button anywhere on screen.
  const [hasSearched, setHasSearched] = useState(Boolean(initialDestination));
  const [formOpen, setFormOpen] = useState(!initialDestination);
  const [formError, setFormError] = useState(null);

  const [result, setResult] = useState({ status: 'idle', items: [], total: 0, page: 1 });
  const searchAbortRef = useRef(null);
  const nights = nightsBetween(checkIn, checkOut);

  useEffect(() => {
    hotelsApi.amenities().then(setAmenityOptions).catch(() => setAmenityOptions([]));
  }, []);

  const runSearch = useCallback(
    async (page = 1) => {
      if (!destination?.destination) return;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setResult((r) => ({ ...r, status: 'loading' }));
      try {
        const searchParams = {
          destination: destination.destination,
          area: destination.area,
          checkIn,
          checkOut,
          occ: formatOccupancy([room]),
          sort,
          page,
          minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
          maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
          stars: filters.stars.length ? filters.stars.join(',') : undefined,
          guestRating: filters.guestRating,
          propertyTypes: filters.propertyTypes.length ? filters.propertyTypes.join(',') : undefined,
          amenities: filters.amenities.length ? filters.amenities.join(',') : undefined,
          mealPlans: filters.mealPlans.length ? filters.mealPlans.join(',') : undefined,
          freeCancellation: filters.freeCancellation ? 'true' : undefined,
        };
        const data = await hotelsApi.search(searchParams, { signal: controller.signal });
        setResult((prev) => ({
          status: 'ready',
          items: page === 1 ? data.items : [...prev.items, ...data.items],
          total: data.total,
          page,
        }));
      } catch (err) {
        if (err?.code === 'CANCELED') return; // superseded by a newer search -- not a real failure
        setResult((r) => ({ ...r, status: 'error', error: err.message }));
      }
    },
    [destination, checkIn, checkOut, room, sort, filters],
  );

  // Once a search has actually been committed, refining it (dates, guests, sort, filters) re-searches
  // live -- but nothing calls the API before that first explicit "Search Hotels" tap (or arriving with
  // an already-specific destination).
  useEffect(() => {
    if (!hasSearched) return;
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSearched, destination, checkIn, checkOut, room, sort, filters]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const onSearchPress = () => {
    const error = validateSearchCriteria(destination, checkIn, checkOut);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setHasSearched(true);
    setFormOpen(false);
  };

  const hasMore = result.items.length < result.total;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      {hasSearched && !formOpen && (
        <Pressable style={styles.summaryBar} onPress={() => setFormOpen(true)}>
          <View style={styles.flex1}>
            <Text style={styles.summaryDestination} numberOfLines={1}>{destination?.label}</Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {checkIn} → {checkOut} · {occupancyLabel([room])}
            </Text>
          </View>
          <View style={styles.editChip}>
            <Ionicons name="create-outline" size={14} color={colors.brand600} />
            <Text style={styles.editChipText}>Edit</Text>
          </View>
        </Pressable>
      )}

      {formOpen && (
        <View style={styles.searchBox}>
          <DestinationInput
            text={destinationText}
            onChangeText={setDestinationText}
            selected={destination}
            onSelect={(value) => {
              setDestination(value);
              // A functional updater: see HomeScreen.js's identical onSelect handler for why reading
              // `destinationText` directly here would silently revert the destination field's very next
              // keystroke after any prior selection.
              setDestinationText((prev) => value?.label ?? prev);
              setFormError(null);
            }}
            onPickHotel={(item) => {
              setDestinationText(item.label);
              navigation.navigate('HotelDetails', { idOrSlug: item.hotelSlug, checkIn, checkOut, occupancy: [room] });
            }}
          />

          <View style={styles.row}>
            <DateField label="Check-in" value={checkIn} onChange={setCheckIn} minimumDate={todayIso()} />
            <DateField label="Check-out" value={checkOut} onChange={setCheckOut} minimumDate={addDaysIso(checkIn, 1)} />
          </View>

          <View style={styles.row}>
            <Pressable style={styles.pillButton} onPress={() => setGuestsOpen(true)}>
              <Ionicons name="people-outline" size={15} color={colors.brand600} />
              <Text style={styles.pillText}>{occupancyLabel([room])}</Text>
            </Pressable>
            <Pressable style={styles.pillButton} onPress={() => setFiltersOpen(true)}>
              <Ionicons name="options-outline" size={15} color={colors.brand600} />
              <Text style={styles.pillText}>Filters</Text>
            </Pressable>
          </View>

          {formError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger600} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          )}

          <AppButton title={hasSearched ? 'Update search' : 'Search Hotels'} onPress={onSearchPress} style={styles.searchButton} />
        </View>
      )}

      {hasSearched && !formOpen && (
        <View style={styles.toolbarRow}>
          <Pressable style={styles.pillButtonSmall} onPress={() => setFiltersOpen(true)}>
            <Ionicons name="options-outline" size={14} color={colors.brand600} />
            <Text style={styles.pillTextSmall}>Filters</Text>
          </Pressable>
          <Pressable style={styles.pillButtonSmall} onPress={() => setSortOpen(true)}>
            <Ionicons name="swap-vertical-outline" size={14} color={colors.brand600} />
            <Text style={styles.pillTextSmall} numberOfLines={1}>{SORTS.find((s) => s.value === sort)?.label}</Text>
          </Pressable>
        </View>
      )}

      {hasSearched && !formOpen && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFilterRow}>
          {QUICK_FILTERS.map((qf) => {
            const active = qf.active(filters);
            return (
              <Pressable
                key={qf.key}
                style={[styles.quickFilterChip, active && styles.chipActive]}
                onPress={() => setFilters((f) => qf.apply(f))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={qf.icon} size={14} color={active ? colors.white : colors.brand600} />
                <Text style={[styles.pillTextSmall, active && styles.chipTextActive]}>{qf.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!hasSearched && !formOpen && (
        <EmptyState icon="search-outline" title="Plan your next stay" message="Choose a destination and dates above, then tap Search Hotels." />
      )}

      {hasSearched && result.status === 'loading' && result.items.length === 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          <HotelCardSkeleton />
          <HotelCardSkeleton />
          <HotelCardSkeleton />
        </ScrollView>
      )}

      {hasSearched && result.status === 'error' && <ErrorView message={result.error} onRetry={() => runSearch(1)} />}

      {hasSearched && result.status === 'ready' && result.items.length === 0 && (
        <EmptyState
          icon="bed-outline"
          title="No matching stays found"
          message="Try widening your budget, changing your dates, or relaxing a filter."
        />
      )}

      {hasSearched && result.items.length > 0 && (
        <FlatList
          data={result.items}
          keyExtractor={(h) => String(h.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {result.total} stay{result.total === 1 ? '' : 's'} found{nights > 0 ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
            </Text>
          }
          renderItem={({ item, index }) => (
            <FadeSlideIn delay={Math.min(index, 4) * 50}>
              <HotelCard hotel={item} onPress={() => navigation.navigate('HotelDetails', { idOrSlug: item.slug, checkIn, checkOut, occupancy: [room] })} />
            </FadeSlideIn>
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && result.status !== 'loading') runSearch(result.page + 1);
          }}
          ListFooterComponent={result.status === 'loading' ? <HotelCardSkeleton /> : null}
        />
      )}

      <GuestsModal visible={guestsOpen} room={room} onChange={setRoom} onClose={() => setGuestsOpen(false)} />
      <FiltersModal
        visible={filtersOpen}
        filters={filters}
        amenityOptions={amenityOptions}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
      <Modal visible={sortOpen} animationType="fade" transparent onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSortOpen(false)}>
          <View style={styles.sortSheet}>
            {SORTS.map((s) => (
              <Pressable key={s.value} style={styles.sortRow} onPress={() => { setSort(s.value); setSortOpen(false); }}>
                <Text style={[styles.sortLabel, sort === s.value && styles.sortLabelActive]}>{s.label}</Text>
                {sort === s.value && <Ionicons name="checkmark" size={18} color={colors.brand600} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function FiltersModal({ visible, filters, amenityOptions, onChange, onClose }) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggle = (key, value) => {
    setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <ScrollView>
            <Text style={styles.sheetTitle}>Filters</Text>

            <Text style={styles.filterLabel}>Price per night (₹)</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.priceInput}
                keyboardType="numeric"
                placeholder="Min"
                value={draft.minPrice}
                onChangeText={(v) => setDraft({ ...draft, minPrice: v.replace(/[^0-9]/g, '') })}
              />
              <TextInput
                style={styles.priceInput}
                keyboardType="numeric"
                placeholder="Max"
                value={draft.maxPrice}
                onChangeText={(v) => setDraft({ ...draft, maxPrice: v.replace(/[^0-9]/g, '') })}
              />
            </View>

            <Text style={styles.filterLabel}>Star rating</Text>
            <View style={styles.chipRow}>
              {['1', '2', '3', '4', '5'].map((s) => (
                <Pressable key={s} style={[styles.chip, draft.stars.includes(s) && styles.chipActive]} onPress={() => toggle('stars', s)}>
                  <Text style={[styles.chipText, draft.stars.includes(s) && styles.chipTextActive]}>{s}★</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Guest rating</Text>
            <View style={styles.chipRow}>
              {GUEST_RATING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, draft.guestRating === opt.value && styles.chipActive]}
                  onPress={() => setDraft((d) => ({ ...d, guestRating: d.guestRating === opt.value ? undefined : opt.value }))}
                >
                  <Text style={[styles.chipText, draft.guestRating === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Property type</Text>
            <View style={styles.chipRow}>
              {PROPERTY_TYPES.map((p) => (
                <Pressable key={p} style={[styles.chip, draft.propertyTypes.includes(p) && styles.chipActive]} onPress={() => toggle('propertyTypes', p)}>
                  <Text style={[styles.chipText, draft.propertyTypes.includes(p) && styles.chipTextActive]}>{p.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </View>

            {amenityOptions.length > 0 && (
              <>
                <Text style={styles.filterLabel}>Amenities</Text>
                <View style={styles.chipRow}>
                  {amenityOptions.map((a) => (
                    <Pressable key={a.code} style={[styles.chip, draft.amenities.includes(a.code) && styles.chipActive]} onPress={() => toggle('amenities', a.code)}>
                      <Text style={[styles.chipText, draft.amenities.includes(a.code) && styles.chipTextActive]}>{a.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.filterLabel}>Meal plan</Text>
            <View style={styles.chipRow}>
              {MEAL_PLANS.map((mp) => (
                <Pressable key={mp.code} style={[styles.chip, draft.mealPlans.includes(mp.code) && styles.chipActive]} onPress={() => toggle('mealPlans', mp.code)}>
                  <Text style={[styles.chipText, draft.mealPlans.includes(mp.code) && styles.chipTextActive]}>{mp.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.row} onPress={() => setDraft({ ...draft, freeCancellation: !draft.freeCancellation })}>
              <Ionicons name={draft.freeCancellation ? 'checkbox' : 'square-outline'} size={20} color={colors.brand600} />
              <Text style={styles.filterLabel}>Free cancellation only</Text>
            </Pressable>

            <AppButton title="Apply filters" onPress={() => { onChange(draft); onClose(); }} style={{ marginTop: spacing.lg }} />
            <AppButton title="Clear all" variant="ghost" size="sm" onPress={() => setDraft(DEFAULT_FILTERS)} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  searchBox: { backgroundColor: colors.surfaceCard, padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  pillButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 44, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, justifyContent: 'center',
  },
  pillText: { ...typography.caption, color: colors.textStrong, fontWeight: '600' },
  pillButtonSmall: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 36, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, justifyContent: 'center', backgroundColor: colors.surfaceCard,
  },
  pillTextSmall: { ...typography.tiny, color: colors.textStrong, fontWeight: '700' },
  toolbarRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  quickFilterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  quickFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceCard,
  },
  searchButton: { height: 52, marginTop: spacing.xs },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { ...typography.caption, color: colors.danger600, flexShrink: 1 },
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    backgroundColor: colors.surfaceCard, ...shadow.subtle,
  },
  summaryDestination: { ...typography.bodyStrong, color: colors.textStrong },
  summaryMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand200 },
  editChipText: { ...typography.tiny, color: colors.brand600, fontWeight: '700' },
  list: { padding: spacing.lg },
  resultCount: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,23,38,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surfaceCard, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: spacing.xxl, maxHeight: '85%' },
  sheetTitle: { ...typography.h1, color: colors.textStrong, marginBottom: spacing.sm },
  sortSheet: { backgroundColor: colors.surfaceCard, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: spacing.lg },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  sortLabel: { ...typography.body, color: colors.textBody },
  sortLabelActive: { color: colors.brand600, fontWeight: '700' },
  filterLabel: { ...typography.bodyStrong, color: colors.textStrong, marginTop: spacing.lg, marginBottom: spacing.sm },
  priceInput: {
    flex: 1, height: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, ...typography.body,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSubtle },
  chipActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  chipText: { ...typography.caption, color: colors.textBody },
  chipTextActive: { color: colors.white, fontWeight: '700' },
});
