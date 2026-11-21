import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { bookingsApi } from '../api/bookingsApi.js';
import { useAuth } from '../context/AuthContext.js';
import { useBookingSearch } from '../context/BookingSearchContext.js';
import { formatOccupancy, occupancyLabel, summarizeOccupancy, todayIso, addDaysIso, nightsBetween } from '../utils/format.js';
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

const GUEST_RATING_OPTIONS = [
  { value: 3, label: '3+' },
  { value: 3.5, label: '3.5+' },
  { value: 4, label: '4+' },
  { value: 4.5, label: '4.5+' },
];
const STAR_OPTIONS = [
  { value: '0', label: 'No rating' },
  { value: '1', label: '1★' },
  { value: '2', label: '2★' },
  { value: '3', label: '3★' },
  { value: '4', label: '4★' },
  { value: '5', label: '5★' },
];
const MEAL_PLANS = [
  { code: 'ROOM_ONLY', label: 'Room only' },
  { code: 'BREAKFAST', label: 'Breakfast included' },
  { code: 'HALF_BOARD', label: 'Half board' },
  { code: 'FULL_BOARD', label: 'Full board' },
];
const DEFAULT_ROOM = { adults: 2, childAges: [] };
const DEFAULT_FILTERS = { minPrice: '', maxPrice: '', stars: [], guestRating: undefined, propertyTypes: [], amenities: [], mealPlans: [], freeCancellation: false };

export default function SearchScreen({ route, navigation }) {
  const { isAuthenticated } = useAuth();
  const searchCtx = useBookingSearch();
  const params = route.params ?? {};
  const initialDestination = params.destination ? { destination: params.destination, area: params.area ?? null, label: params.label } : searchCtx.destination;

  const [destination, setDestination] = useState(initialDestination);
  const [destinationText, setDestinationText] = useState(params.label ?? searchCtx.destination?.label ?? '');
  const [checkIn, setCheckIn] = useState(params.checkIn ?? searchCtx.checkIn);
  const [checkOut, setCheckOut] = useState(params.checkOut ?? searchCtx.checkOut);
  const [rooms, setRooms] = useState(params.occupancy ?? searchCtx.rooms);
  const [sort, setSort] = useState('recommended');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [amenityOptions, setAmenityOptions] = useState([]);
  const [propertyTypeOptions, setPropertyTypeOptions] = useState([]);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [reservingHotelId, setReservingHotelId] = useState(null);

  const handleCheckInChange = (newIn) => {
    let newOut = checkOut;
    if (checkOut <= newIn) {
      newOut = addDaysIso(newIn, 1);
    }
    setCheckIn(newIn);
    setCheckOut(newOut);
    searchCtx.setDates(newIn, newOut);
  };

  const handleCheckOutChange = (newOut) => {
    setCheckOut(newOut);
    searchCtx.setDates(checkIn, newOut);
  };

  const handleRoomsChange = (newRooms) => {
    setRooms(newRooms);
    searchCtx.setRooms(newRooms);
  };

  const handleQuickReserve = async (hotel) => {
    if (!isAuthenticated) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }

    const offer = hotel.bestOffer;
    if (!offer?.roomTypeId || !offer?.ratePlanId) {
      navigation.navigate('HotelDetails', { idOrSlug: hotel.slug, checkIn, checkOut, occupancy: rooms });
      return;
    }

    setReservingHotelId(hotel.id);
    try {
      const hold = await bookingsApi.createHold({
        hotelId: hotel.id,
        roomTypeId: offer.roomTypeId,
        ratePlanId: offer.ratePlanId,
        checkIn,
        checkOut,
        rooms: rooms.length,
        occupancy: rooms,
      });
      navigation.navigate('Booking', {
        holdId: hold.id,
        hotelName: hotel.name,
        roomName: offer.roomName || 'Selected Room',
        planName: offer.ratePlanName || 'Best Available Rate',
        isQuickReserve: true,
      });
    } catch (err) {
      Alert.alert('Unable to reserve', err.message || 'Room could not be held. Please try viewing rooms.');
    } finally {
      setReservingHotelId(null);
    }
  };

  // When navigating to Search screen (with or without a pre-chosen destination), all matching hotels
  // load immediately by default so the screen is never blank. If no destination or filter is applied,
  // it displays all published properties; when filters or destinations change, it filters dynamically.
  const [hasSearched, setHasSearched] = useState(true);
  const [formOpen, setFormOpen] = useState(!initialDestination);
  const [formError, setFormError] = useState(null);

  const [result, setResult] = useState({ status: 'idle', items: [], total: 0, page: 1 });
  const searchAbortRef = useRef(null);
  const nights = nightsBetween(checkIn, checkOut);

  useEffect(() => {
    hotelsApi.amenities?.()?.then(setAmenityOptions).catch(() => setAmenityOptions([]));
    hotelsApi.catalog?.('property-types')?.then(setPropertyTypeOptions).catch(() => setPropertyTypeOptions([]));
  }, []);

  const runSearch = useCallback(
    async (page = 1) => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setResult((r) => ({ ...r, status: 'loading' }));
      try {
        const searchParams = {
          destination: destination?.destination || undefined,
          area: destination?.area || undefined,
          checkIn,
          checkOut,
          occ: formatOccupancy(rooms),
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
          total: data.pagination?.total ?? data.total ?? data.items?.length ?? 0,
          page,
        }));
      } catch (err) {
        if (err?.code === 'CANCELED') return; // superseded by a newer search -- not a real failure
        setResult((r) => ({ ...r, status: 'error', error: err.message }));
      }
    },
    [destination, checkIn, checkOut, rooms, sort, filters],
  );

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, checkIn, checkOut, rooms, sort, filters]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const onSearchPress = () => {
    const error = validateSearchCriteria(destination, checkIn, checkOut, { requireDestination: false });
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setHasSearched(true);
    setFormOpen(false);
    runSearch(1);
  };

  const hasMore = result.items.length < result.total;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      {!formOpen && (
        <Pressable style={styles.summaryBar} onPress={() => setFormOpen(true)}>
          <View style={styles.flex1}>
            <Text style={styles.summaryDestination} numberOfLines={1}>{destination?.label || 'All Properties'}</Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {checkIn} → {checkOut} · {summarizeOccupancy(rooms)}
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
          <View style={styles.searchBoxHeader}>
            <Text style={styles.searchBoxTitle}>{destination ? 'Search' : 'Find your stay'}</Text>
            <Pressable
              onPress={() => setFormOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close search form"
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <DestinationInput
            text={destinationText}
            onChangeText={(txt) => {
              setDestinationText(txt);
              if (!txt.trim()) {
                setDestination(null);
              }
            }}
            selected={destination}
            onSelect={(value) => {
              setDestination(value);
              setDestinationText((prev) => value?.label ?? prev);
              setFormError(null);
            }}
            onPickHotel={(item) => {
              setDestinationText(item.label);
              navigation.navigate('HotelDetails', { idOrSlug: item.hotelSlug, checkIn, checkOut, occupancy: rooms });
            }}
          />

          <View style={styles.row}>
            <DateField label="Check-in" value={checkIn} onChange={handleCheckInChange} minimumDate={todayIso()} />
            <DateField label="Check-out" value={checkOut} onChange={handleCheckOutChange} minimumDate={addDaysIso(checkIn, 1)} />
          </View>

          <View style={styles.row}>
            <Pressable style={styles.pillButton} onPress={() => setGuestsOpen(true)}>
              <Ionicons name="people-outline" size={15} color={colors.brand600} />
              <Text style={styles.pillText}>{summarizeOccupancy(rooms)}</Text>
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

          <AppButton title="Search Hotels" onPress={onSearchPress} style={styles.searchButton} />
        </View>
      )}

      {!formOpen && (
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

      {result.status === 'loading' && result.items.length === 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          <HotelCardSkeleton compact />
          <HotelCardSkeleton compact />
          <HotelCardSkeleton compact />
        </ScrollView>
      )}

      {result.status === 'error' && <ErrorView message={result.error} onRetry={() => runSearch(1)} />}

      {result.status === 'ready' && result.items.length === 0 && (
        <EmptyState
          icon="bed-outline"
          title="No matching stays found"
          message="Try widening your budget, changing your dates, or relaxing a filter."
        />
      )}

      {result.items.length > 0 && (
        <FlatList
          style={styles.flex1}
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
              <HotelCard
                hotel={item}
                compact
                onPress={() => navigation.navigate('HotelDetails', { idOrSlug: item.slug, checkIn, checkOut, occupancy: rooms })}
                onQuickReserve={() => handleQuickReserve(item)}
                isQuickReserving={reservingHotelId === item.id}
              />
            </FadeSlideIn>
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && result.status !== 'loading') runSearch(result.page + 1);
          }}
          ListFooterComponent={result.status === 'loading' ? <HotelCardSkeleton compact /> : null}
        />
      )}

      <GuestsModal visible={guestsOpen} rooms={rooms} onChange={handleRoomsChange} onClose={() => setGuestsOpen(false)} />
      <FiltersModal
        visible={filtersOpen}
        filters={filters}
        amenityOptions={amenityOptions}
        propertyTypeOptions={propertyTypeOptions}
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

function FiltersModal({ visible, filters, amenityOptions, propertyTypeOptions, onChange, onClose }) {
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
              {STAR_OPTIONS.map((item) => (
                <Pressable key={item.value} style={[styles.chip, draft.stars.includes(item.value) && styles.chipActive]} onPress={() => toggle('stars', item.value)}>
                  <Text style={[styles.chipText, draft.stars.includes(item.value) && styles.chipTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Guest rating</Text>
            <View style={styles.chipRow}>
              {GUEST_RATING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Guest rating ${opt.label}`}
                  accessibilityState={{ selected: draft.guestRating === opt.value }}
                  style={[styles.chip, draft.guestRating === opt.value && styles.chipActive]}
                  onPress={() => setDraft((d) => ({ ...d, guestRating: d.guestRating === opt.value ? undefined : opt.value }))}
                >
                  <Text style={[styles.chipText, draft.guestRating === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Property type</Text>
            <View style={styles.chipRow}>
              {propertyTypeOptions.map((propertyType) => (
                <Pressable key={propertyType.code} style={[styles.chip, draft.propertyTypes.includes(propertyType.code) && styles.chipActive]} onPress={() => toggle('propertyTypes', propertyType.code)}>
                  <Text style={[styles.chipText, draft.propertyTypes.includes(propertyType.code) && styles.chipTextActive]}>{propertyType.name}</Text>
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

            <Pressable
              testID="filter-free-cancellation"
              accessibilityRole="checkbox"
              accessibilityLabel="Free cancellation only"
              accessibilityState={{ checked: draft.freeCancellation }}
              style={styles.row}
              onPress={() => setDraft((d) => ({ ...d, freeCancellation: !d.freeCancellation }))}
            >
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
  searchBox: {
    backgroundColor: colors.surfaceCard,
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    ...shadow.subtle,
  },
  searchBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.xs,
  },
  searchBoxTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
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
  toolbarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfacePage,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
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
