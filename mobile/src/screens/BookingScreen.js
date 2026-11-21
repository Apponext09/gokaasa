import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { HoldCountdown } from '../components/HoldCountdown.js';
import { StaySearchBar } from '../components/StaySearchBar.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatMoneyMinor, formatCountdown, occupancyLabel } from '../utils/format.js';
import { MEAL_PLAN_LABEL } from '../constants/booking.js';
import { useAuth } from '../context/AuthContext.js';
import { useBookingSearch } from '../context/BookingSearchContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function initRoomGuests(occupancy = [], existingRooms = []) {
  return occupancy.map((roomOcc, roomIndex) => {
    const adults = roomOcc.adults || 1;
    const childAges = roomOcc.childAges || [];
    const totalGuests = adults + childAges.length;
    const existingGuests = existingRooms.find((r) => r.roomIndex === roomIndex)?.guests || [];

    const guests = Array.from({ length: totalGuests }, (_, guestIndex) => {
      const isChild = guestIndex >= adults;
      const childAge = isChild ? childAges[guestIndex - adults] : undefined;
      const existing = existingGuests[guestIndex] || {};
      return {
        firstName: existing.firstName || '',
        lastName: existing.lastName || '',
        age: existing.age != null ? String(existing.age) : childAge != null ? String(childAge) : '',
        isChild,
      };
    });

    return {
      roomIndex,
      adults,
      children: childAges.length,
      guests,
    };
  });
}

/**
 * Step 3 + 4 combined in the mobile app:
 * Guest details (Lead guest, per-room guest names, Company/GST) + booking review in one screen.
 * The price shown is exactly hold.quote.totals from the server -- never recomputed here.
 */
export default function BookingScreen({ route, navigation }) {
  const { holdId, hotelName, roomName, planName } = route.params;
  const { user } = useAuth();
  const searchCtx = useBookingSearch();
  const [activeHoldId, setActiveHoldId] = useState(holdId);
  const [state, setState] = useState({ status: 'loading', hold: null, error: null });
  const [updatingStay, setUpdatingStay] = useState(false);

  // Booking for: myself vs someone_else
  const [bookingFor, setBookingFor] = useState('myself');
  const [contact, setContact] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    mobile: user?.phone ?? '',
  });

  // Room-by-room guests
  const [roomGuests, setRoomGuests] = useState([]);

  // Company and GST details
  const [companyDetails, setCompanyDetails] = useState({
    gstNumber: '',
    companyName: '',
    billingAddress: '',
  });
  const [gstError, setGstError] = useState(null);

  // Special request
  const [specialRequest, setSpecialRequest] = useState('');

  // Offers & Coupons
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState(null);
  const [availableOffers, setAvailableOffers] = useState([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const loadAvailableCoupons = useCallback((hId) => {
    if (!hId) return;
    bookingsApi
      .holdCoupons(hId)
      .then((items) => setAvailableOffers(Array.isArray(items) ? items : []))
      .catch(() => setAvailableOffers([]));
  }, []);

  const applyCoupon = async (codeToApply) => {
    const code = (typeof codeToApply === 'string' ? codeToApply : couponCode).trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const updatedHold = await bookingsApi.applyCoupon(activeHoldId, code);
      setState((s) => ({ ...s, hold: updatedHold }));
      setCouponCode('');
      setAvailableOffers([]);
    } catch (err) {
      setCouponError(err.message || 'Invalid or inapplicable coupon code.');
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = async () => {
    setCouponBusy(true);
    setCouponError(null);
    try {
      const updatedHold = await bookingsApi.removeCoupon(activeHoldId);
      setState((s) => ({ ...s, hold: updatedHold }));
      loadAvailableCoupons(activeHoldId);
    } catch (err) {
      Alert.alert('Unable to remove coupon', err.message || 'Please try again.');
    } finally {
      setCouponBusy(false);
    }
  };

  useEffect(() => {
    bookingsApi
      .hold(holdId)
      .then((hold) => {
        setState({ status: 'ready', hold, error: null });

        if (!hold.quote?.coupon) {
          loadAvailableCoupons(holdId);
        } else {
          setAvailableOffers([]);
        }

        // Pre-fill existing guest details if available
        if (hold.guestDetails) {
          const gd = hold.guestDetails;
          if (gd.primaryContact) {
            setContact({
              firstName: gd.primaryContact.firstName || '',
              lastName: gd.primaryContact.lastName || '',
              email: gd.primaryContact.email || '',
              mobile: gd.primaryContact.mobile || '',
            });
            if (user?.email && gd.primaryContact.email && user.email.toLowerCase() !== gd.primaryContact.email.toLowerCase()) {
              setBookingFor('someone_else');
            }
          }
          if (gd.companyName || gd.gstNumber || gd.billingAddress) {
            setCompanyDetails({
              gstNumber: gd.gstNumber || '',
              companyName: gd.companyName || '',
              billingAddress: gd.billingAddress || '',
            });
          }
          if (gd.specialRequest) {
            setSpecialRequest(gd.specialRequest);
          }
        }

        // Initialize room guests based on stay occupancy
        const occupancy = hold.quote?.stay?.occupancy || [{ adults: 2, childAges: [] }];
        setRoomGuests(initRoomGuests(occupancy, hold.guestDetails?.rooms || []));
      })
      .catch((err) => setState({ status: 'error', hold: null, error: err.message }));
  }, [holdId, user?.email]);

  const handleHoldExpire = useCallback(() => {
    if (!activeHoldId) return;
    bookingsApi
      .hold(activeHoldId)
      .then((updatedHold) => {
        setState((s) => ({ ...s, hold: updatedHold }));
      })
      .catch((err) => {
        setState((s) => ({ ...s, error: err.message }));
      });
  }, [activeHoldId]);

  const handleBookingForChange = (choice) => {
    setBookingFor(choice);
    if (choice === 'myself' && user) {
      setContact({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        mobile: user.phone || '',
      });
    } else if (choice === 'someone_else') {
      setContact({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
      });
    }
  };

  const updateRoomGuest = (roomIdx, guestIdx, field, value) => {
    setRoomGuests((prev) => {
      const updated = [...prev];
      const room = { ...updated[roomIdx] };
      const guests = [...room.guests];
      guests[guestIdx] = { ...guests[guestIdx], [field]: value };
      room.guests = guests;
      updated[roomIdx] = room;
      return updated;
    });
  };

  if (state.status === 'loading') return <LoadingView label="Loading your hold…" />;
  if (state.status === 'error') return <ErrorView message={state.error} onRetry={() => navigation.replace('Booking', route.params)} />;

  const { hold } = state;
  if (hold.status !== 'HELD') {
    return (
      <ErrorView
        title="This hold has expired"
        message="Your room hold expired. Please search again and pick a room."
        onRetry={() => navigation.popToTop()}
      />
    );
  }

  const { totals, stay, cancellationPolicy } = hold.quote;
  const canSubmit = contact.firstName.trim() && contact.lastName.trim() && contact.email.trim() && contact.mobile.trim();

  const validateInputs = () => {
    // 1. GST validation
    const rawGst = companyDetails.gstNumber.trim().toUpperCase();
    if (rawGst && !GSTIN_REGEX.test(rawGst)) {
      setGstError('Enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)');
      return false;
    }
    setGstError(null);

    // 2. Room guest validation: if first name given, last name must also be given
    for (let r = 0; r < roomGuests.length; r++) {
      const room = roomGuests[r];
      for (let g = 0; g < room.guests.length; g++) {
        const guest = room.guests[g];
        const fn = guest.firstName.trim();
        const ln = guest.lastName.trim();
        if ((fn && !ln) || (!fn && ln)) {
          setSaveError(`Please enter both first and last name for Guest ${g + 1} in Room ${r + 1}, or leave both blank.`);
          return false;
        }
      }
    }
    return true;
  };

  const handleStayApply = async (newCheckIn, newCheckOut, newOccupancy) => {
    if (!hold?.quote) return;
    const { hotel, room, ratePlan } = hold.quote;

    setUpdatingStay(true);
    setSaveError(null);
    try {
      // 1. Create new hold with updated dates and occupancy
      const newHold = await bookingsApi.createHold({
        hotelId: hotel.id,
        roomTypeId: room.id,
        ratePlanId: ratePlan.id,
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        rooms: newOccupancy.length,
        occupancy: newOccupancy,
      });

      // 2. Release previous hold
      if (activeHoldId) {
        bookingsApi.release(activeHoldId).catch(() => {});
      }

      // 3. Update active hold
      setActiveHoldId(newHold.id);
      setState({ status: 'ready', hold: newHold, error: null });
      searchCtx.setStay({ checkIn: newCheckIn, checkOut: newCheckOut, rooms: newOccupancy });

      // 4. Update room guests array for new occupancy structure
      setRoomGuests(initRoomGuests(newOccupancy, roomGuests));

      // 5. Reload available coupons for the new hold
      if (!newHold.quote?.coupon) {
        loadAvailableCoupons(newHold.id);
      }
    } catch (err) {
      Alert.alert(
        'Dates unavailable',
        err.message || 'This room is not available for the selected dates. Please choose different dates.',
      );
    } finally {
      setUpdatingStay(false);
    }
  };

  const onContinue = async () => {
    if (!validateInputs()) return;

    setSaving(true);
    setSaveError(null);
    try {
      const formattedRooms = roomGuests.map((room, roomIndex) => ({
        roomIndex,
        guests: room.guests
          .filter((guest) => guest.firstName.trim() && guest.lastName.trim())
          .map((guest) => ({
            firstName: guest.firstName.trim(),
            lastName: guest.lastName.trim(),
            ...(guest.age !== '' && !isNaN(Number(guest.age)) ? { age: Number(guest.age) } : {}),
          })),
      }));

      const rawGst = companyDetails.gstNumber.trim().toUpperCase();

      await bookingsApi.saveGuests(activeHoldId, {
        primaryContact: {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          email: contact.email.trim().toLowerCase(),
          mobile: contact.mobile.trim(),
        },
        rooms: formattedRooms,
        gstNumber: rawGst || undefined,
        companyName: companyDetails.companyName.trim() || undefined,
        billingAddress: companyDetails.billingAddress.trim() || undefined,
        specialRequest: specialRequest.trim() || undefined,
      });

      navigation.navigate('Payment', { holdId: activeHoldId, hotelName, roomName, planName });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      {/* ── Top Stay Search Bar — dynamically update dates and re-hold room ── */}
      <StaySearchBar
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        occupancy={stay.occupancy}
        hotelName={hotelName}
        onApply={handleStayApply}
      />

      {updatingStay && (
        <View style={styles.updatingBanner}>
          <Ionicons name="refresh-outline" size={14} color={colors.brand600} />
          <Text style={styles.updatingText}>Updating dates and room hold…</Text>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <HoldCountdown
            secondsRemaining={hold.secondsRemaining}
            expiresAt={hold.expiresAt}
            onExpire={handleHoldExpire}
          />

          {/* ── Summary Card ── */}
          <View style={styles.summaryCard}>
            <Text style={styles.hotelName}>{hotelName}</Text>
            <Text style={styles.caption}>{roomName} · {planName}</Text>
            <Text style={styles.caption}>{MEAL_PLAN_LABEL[hold.quote.ratePlan.mealPlan] ?? ''}</Text>
            <View style={styles.summaryFactRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={styles.caption}>{stay.checkIn} → {stay.checkOut} · {stay.nights} night{stay.nights === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.summaryFactRow}>
              <Ionicons name="people-outline" size={14} color={colors.textMuted} />
              <Text style={styles.caption}>{occupancyLabel(stay.occupancy)}</Text>
            </View>
            <View style={styles.summaryFactRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
              <Text style={styles.caption}>{cancellationPolicy.description}</Text>
            </View>

            <View style={styles.divider} />
            <Row label={`${stay.rooms || stay.occupancy?.length || 1} room${(stay.rooms || stay.occupancy?.length || 1) === 1 ? '' : 's'} × ${stay.nights} night${stay.nights === 1 ? '' : 's'}`} value={formatMoneyMinor(totals.subtotal, totals.currency)} />
            {totals.discount > 0 && <Row label="Discount" value={`−${formatMoneyMinor(totals.discount, totals.currency)}`} tone="success" />}
            {totals.couponDiscount > 0 && (
              <Row
                label={`Coupon (${hold.quote.coupon?.code || 'Applied'})`}
                value={`−${formatMoneyMinor(totals.couponDiscount, totals.currency)}`}
                tone="success"
              />
            )}
            <Row label="Taxes" value={formatMoneyMinor(totals.taxes, totals.currency)} />
            <View style={styles.divider} />
            <Row label="Total" value={formatMoneyMinor(totals.total, totals.currency)} strong />
          </View>

          {/* ── Offers & Coupons Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="pricetag-outline" size={18} color={colors.brand600} />
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>Offers & Coupons</Text>
                <Text style={styles.cardSubtitle}>
                  {hold.quote.coupon ? 'Coupon applied to your booking' : 'Apply promo codes or select available offers'}
                </Text>
              </View>
            </View>

            {hold.quote.coupon ? (
              <View style={styles.appliedCouponBanner}>
                <View style={styles.appliedCouponLeft}>
                  <View style={styles.appliedCouponBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success600} />
                    <Text style={styles.appliedCouponCode}>{hold.quote.coupon.code}</Text>
                  </View>
                  <Text style={styles.appliedCouponSavings}>
                    {totals.couponDiscount > 0
                      ? `Saved ${formatMoneyMinor(totals.couponDiscount, totals.currency)} with this offer!`
                      : 'Coupon applied successfully!'}
                  </Text>
                </View>
                <Pressable
                  style={styles.removeCouponButton}
                  onPress={removeCoupon}
                  disabled={couponBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Remove coupon"
                >
                  {couponBusy ? (
                    <ActivityIndicator size="small" color={colors.danger600} />
                  ) : (
                    <View style={styles.removeCouponContent}>
                      <Ionicons name="close-circle-outline" size={16} color={colors.danger600} />
                      <Text style={styles.removeCouponText}>Remove</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.couponInputSection}>
                <View style={styles.couponInputRow}>
                  <View style={styles.couponInputWrap}>
                    <TextInput
                      placeholder="Enter coupon code"
                      placeholderTextColor={colors.textMuted}
                      value={couponCode}
                      onChangeText={(txt) => {
                        setCouponCode(txt);
                        if (couponError) setCouponError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={styles.couponTextInput}
                      editable={!couponBusy}
                    />
                  </View>
                  <Pressable
                    testID="apply-coupon-button"
                    style={[
                      styles.applyCouponButton,
                      (!couponCode.trim() || couponBusy) && styles.applyCouponButtonDisabled,
                    ]}
                    onPress={() => applyCoupon()}
                    disabled={!couponCode.trim() || couponBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Apply coupon"
                  >
                    {couponBusy ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.applyCouponButtonText}>Apply</Text>
                    )}
                  </Pressable>
                </View>

                {couponError ? (
                  <View style={styles.couponErrorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger600} />
                    <Text style={styles.couponErrorText}>{couponError}</Text>
                  </View>
                ) : null}

                {availableOffers.length > 0 && (
                  <View style={styles.availableOffersSection}>
                    <Text style={styles.availableOffersHeading}>
                      Available offers for this stay
                    </Text>
                    <View style={styles.offersList}>
                      {availableOffers.map((offer) => (
                        <View key={offer.code} style={styles.offerTile}>
                          <View style={styles.offerTileLeft}>
                            <View style={styles.offerCodeBadge}>
                              <Text style={styles.offerCodeText}>{offer.code}</Text>
                            </View>
                            <Text style={styles.offerTitle} numberOfLines={1}>
                              {offer.title || offer.code}
                            </Text>
                            {offer.description ? (
                              <Text style={styles.offerDesc} numberOfLines={2}>
                                {offer.description}
                              </Text>
                            ) : null}
                            {offer.discountMinor > 0 ? (
                              <Text style={styles.offerSavings}>
                                Save {formatMoneyMinor(offer.discountMinor, totals.currency)}
                              </Text>
                            ) : null}
                          </View>
                          <Pressable
                            style={styles.offerApplyBtn}
                            onPress={() => applyCoupon(offer.code)}
                            disabled={couponBusy}
                            accessibilityRole="button"
                          >
                            <Text style={styles.offerApplyBtnText}>Apply</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Lead Guest Details Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={18} color={colors.brand600} />
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>Lead guest details</Text>
                <Text style={styles.cardSubtitle}>Booking confirmation and updates go to this person.</Text>
              </View>
            </View>

            {/* "I am booking for" selector */}
            <View style={styles.bookingForContainer}>
              <Text style={styles.bookingForLabel}>I am booking for:</Text>
              <View style={styles.radioGroup}>
                <Pressable
                  style={styles.radioOption}
                  onPress={() => handleBookingForChange('myself')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: bookingFor === 'myself' }}
                >
                  <View style={[styles.radioCircle, bookingFor === 'myself' && styles.radioCircleActive]}>
                    {bookingFor === 'myself' && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioText}>Myself</Text>
                </Pressable>

                <Pressable
                  style={styles.radioOption}
                  onPress={() => handleBookingForChange('someone_else')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: bookingFor === 'someone_else' }}
                >
                  <View style={[styles.radioCircle, bookingFor === 'someone_else' && styles.radioCircleActive]}>
                    {bookingFor === 'someone_else' && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioText}>Someone else</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.grid2}>
              <AppInput
                label="First name"
                value={contact.firstName}
                onChangeText={(v) => setContact((c) => ({ ...c, firstName: v }))}
                containerStyle={styles.flex1}
              />
              <AppInput
                label="Last name"
                value={contact.lastName}
                onChangeText={(v) => setContact((c) => ({ ...c, lastName: v }))}
                containerStyle={styles.flex1}
              />
            </View>
            <AppInput
              label="Email address"
              value={contact.email}
              onChangeText={(v) => setContact((c) => ({ ...c, email: v }))}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <AppInput
              label="Mobile number"
              value={contact.mobile}
              onChangeText={(v) => setContact((c) => ({ ...c, mobile: v }))}
              keyboardType="phone-pad"
            />
          </View>

          {/* ── Room 1, Room 2... Guests Cards ── */}
          {roomGuests.map((room, roomIdx) => (
            <View key={roomIdx} style={[styles.card, shadow.card]}>
              <View style={styles.cardHeader}>
                <Ionicons name="bed-outline" size={18} color={colors.brand600} />
                <View style={styles.flex1}>
                  <View style={styles.roomHeaderRow}>
                    <Text style={styles.cardTitle}>Room {roomIdx + 1} Guests</Text>
                    <View style={styles.guestCountBadge}>
                      <Text style={styles.guestCountText}>
                        {room.adults} adult{room.adults === 1 ? '' : 's'}
                        {room.children > 0 ? `, ${room.children} child` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardSubtitle}>
                    Naming each guest is optional -- anyone you skip can be added at check-in.
                  </Text>
                </View>
              </View>

              <View style={styles.guestSlotsContainer}>
                {room.guests.map((guest, guestIdx) => (
                  <View key={guestIdx} style={styles.guestSlot}>
                    <Text style={styles.guestSlotLabel}>
                      Guest {guestIdx + 1} · {guest.isChild ? 'Child' : 'Adult'} <Text style={styles.optionalText}>(optional)</Text>
                    </Text>
                    <View style={styles.grid2}>
                      <AppInput
                        label="First name"
                        value={guest.firstName}
                        placeholder="First name"
                        onChangeText={(v) => updateRoomGuest(roomIdx, guestIdx, 'firstName', v)}
                        containerStyle={styles.flex1}
                      />
                      <AppInput
                        label="Last name"
                        value={guest.lastName}
                        placeholder="Last name"
                        onChangeText={(v) => updateRoomGuest(roomIdx, guestIdx, 'lastName', v)}
                        containerStyle={styles.flex1}
                      />
                    </View>
                    <AppInput
                      label="Age (optional)"
                      value={guest.age}
                      placeholder={guest.isChild ? 'Child age' : 'Adult age (optional)'}
                      onChangeText={(v) => updateRoomGuest(roomIdx, guestIdx, 'age', v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                      maxLength={3}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* ── Company and Requests Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="business-outline" size={18} color={colors.brand600} />
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>Company & GST details</Text>
                <Text style={styles.cardSubtitle}>Optional for business travelers claiming tax credit.</Text>
              </View>
            </View>

            <AppInput
              label="GST number (optional)"
              value={companyDetails.gstNumber}
              placeholder="e.g. 29ABCDE1234F1Z5"
              onChangeText={(v) => {
                setCompanyDetails((c) => ({ ...c, gstNumber: v.toUpperCase() }));
                if (gstError) setGstError(null);
              }}
              autoCapitalize="characters"
              maxLength={15}
              error={gstError}
            />

            <AppInput
              label="Company name (optional)"
              value={companyDetails.companyName}
              placeholder="e.g. Acme Technologies Pvt Ltd"
              onChangeText={(v) => setCompanyDetails((c) => ({ ...c, companyName: v }))}
            />

            <AppInput
              label="Billing address (optional)"
              value={companyDetails.billingAddress}
              placeholder="Registered business address"
              onChangeText={(v) => setCompanyDetails((c) => ({ ...c, billingAddress: v }))}
              multiline
            />

            <AppInput
              label="Special requests (optional)"
              value={specialRequest}
              placeholder="e.g. Quiet room, late check-in..."
              onChangeText={setSpecialRequest}
              multiline
            />
          </View>

          {saveError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.danger600} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          <AppButton
            title="Continue to payment"
            onPress={onContinue}
            loading={saving}
            disabled={!canSubmit}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={[strong ? styles.totalValue : styles.caption, tone === 'success' && styles.successValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning50,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  timerBannerUrgent: { backgroundColor: colors.danger50 },
  timerText: { ...typography.bodyStrong, color: colors.warning600 },
  timerTextUrgent: { color: colors.danger600 },
  summaryCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.card,
  },
  summaryFactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  hotelName: { ...typography.h1, color: colors.textStrong },
  caption: { ...typography.caption, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  totalValue: { ...typography.bodyStrong, color: colors.textStrong },

  /* ── Cards ── */
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.h2,
    color: colors.textStrong,
    fontSize: 16,
  },
  cardSubtitle: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  grid2: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  /* ── Booking For Radio ── */
  bookingForContainer: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  bookingForLabel: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  radioGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: colors.brand600,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand600,
  },
  radioText: {
    ...typography.body,
    color: colors.textStrong,
    fontSize: 14,
  },

  /* ── Room Guests ── */
  roomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guestCountBadge: {
    backgroundColor: colors.brand50,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  guestCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand600,
  },
  guestSlotsContainer: {
    gap: spacing.md,
  },
  guestSlot: {
    backgroundColor: colors.surfacePage,
    borderRadius: radius.control,
    padding: spacing.sm,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  guestSlotLabel: {
    ...typography.captionStrong,
    color: colors.textStrong,
    marginBottom: 2,
  },
  optionalText: {
    fontWeight: '400',
    color: colors.textMuted,
  },

  /* ── Errors and Submit ── */
  updatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand50,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.control,
    marginBottom: spacing.xs,
  },
  updatingText: {
    ...typography.captionStrong,
    color: colors.brand600,
    fontSize: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.danger50,
    borderRadius: radius.control,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger600,
    flex: 1,
  },
  submit: { marginTop: spacing.sm, marginBottom: spacing.xxxl },

  /* ── Offers & Coupons ── */
  appliedCouponBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.success50,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: spacing.md,
    gap: spacing.sm,
  },
  appliedCouponLeft: {
    flex: 1,
    gap: 4,
  },
  appliedCouponBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedCouponCode: {
    ...typography.bodyStrong,
    color: colors.success600,
    letterSpacing: 0.5,
  },
  appliedCouponSavings: {
    ...typography.caption,
    color: colors.success600,
  },
  removeCouponButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  removeCouponContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeCouponText: {
    ...typography.captionStrong,
    color: colors.danger600,
  },
  couponInputSection: {
    gap: spacing.sm,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  couponInputWrap: {
    flex: 1,
    height: 46,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  couponTextInput: {
    ...typography.body,
    color: colors.textStrong,
    letterSpacing: 0.5,
    padding: 0,
  },
  applyCouponButton: {
    height: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
    backgroundColor: colors.brand600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyCouponButtonDisabled: {
    backgroundColor: colors.brand200,
  },
  applyCouponButtonText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
  couponErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -2,
  },
  couponErrorText: {
    ...typography.caption,
    color: colors.danger600,
    flexShrink: 1,
  },
  availableOffersSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  availableOffersHeading: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  offersList: {
    gap: spacing.sm,
  },
  offerTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
    gap: spacing.sm,
  },
  offerTileLeft: {
    flex: 1,
    gap: 3,
  },
  offerCodeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brand400,
    backgroundColor: colors.brand50,
  },
  offerCodeText: {
    ...typography.tiny,
    color: colors.brand700,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  offerTitle: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  offerDesc: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  offerSavings: {
    ...typography.captionStrong,
    color: colors.success600,
  },
  offerApplyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    borderWidth: 1,
    borderColor: colors.brand200,
  },
  offerApplyBtnText: {
    ...typography.captionStrong,
    color: colors.brand600,
  },
  successValue: {
    color: colors.success600,
    fontWeight: '600',
  },
});

