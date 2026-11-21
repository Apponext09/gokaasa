import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reviewsApi } from '../api/reviewsApi.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const BODY_MIN = 10;
const BODY_MAX = 4000;
const TITLE_MAX = 150;

const RATING_LABELS = {
  1: 'Needs improvement',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Exceptional',
};

function StarPicker({ value, onChange }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          hitSlop={8}
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
        >
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={32}
            color={star <= value ? colors.accent500 : colors.borderSubtle}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Bottom-sheet modal to write (or edit) a review for a completed stay.
 * Matches backend validation:
 * - rating: 1..5
 * - title: optional, max 150
 * - body: min 10, max 4000 chars
 *
 * Props:
 *   visible        — boolean
 *   bookingId      — number | string
 *   hotelName      — string   (shown in the header for context)
 *   onClose()      — called when user dismisses
 *   onSubmitted()  — called after a successful create / update
 */
export function WriteReviewModal({ visible, bookingId, hotelName, onClose, onSubmitted }) {
  const [eligibility, setEligibility] = useState(null);
  const [loadingElig, setLoadingElig] = useState(false);
  const [existingReview, setExistingReview] = useState(null);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const slideY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible && bookingId) {
      setSubmitted(false);
      setError(null);
      setTouched(false);
      checkEligibility();
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      slideY.setValue(300);
    }
  }, [visible, bookingId]);

  const checkEligibility = async () => {
    setLoadingElig(true);
    setEligibility(null);
    setExistingReview(null);
    try {
      const elig = await reviewsApi.eligibility(bookingId);
      setEligibility(elig);
      const prev = elig?.review || elig?.existingReview;
      if (prev) {
        setExistingReview(prev);
        setRating(Number(prev.rating) || 5);
        setTitle(prev.title ?? '');
        setBody(prev.body ?? '');
      } else {
        setRating(5);
        setTitle('');
        setBody('');
      }
    } catch {
      // Fallback: allow writing review, backend will validate
      setEligibility({ eligible: true });
      setRating(5);
      setTitle('');
      setBody('');
    } finally {
      setLoadingElig(false);
    }
  };

  const trimmedBody = body.trim();
  const bodyTooShort = touched && trimmedBody.length < BODY_MIN;

  const handleSubmit = async () => {
    const currentBody = body.trim();
    setTouched(true);
    if (currentBody.length < BODY_MIN) {
      setError(`Say a little more about your stay (at least ${BODY_MIN} characters).`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        rating,
        title: title.trim() || undefined,
        body: currentBody,
      };

      if (existingReview?.id) {
        await reviewsApi.update(existingReview.id, payload);
      } else {
        await reviewsApi.create({ bookingId, ...payload });
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Could not submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideY, { toValue: 300, duration: 220, useNativeDriver: true }).start(onClose);
  };

  const isEditMode = Boolean(existingReview);
  const isIneligible = !loadingElig && eligibility && !eligibility.eligible && !existingReview;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kvView}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{isEditMode ? 'Edit your review' : 'Write a review'}</Text>
                {hotelName ? <Text style={styles.sheetSubtitle} numberOfLines={1}>{hotelName}</Text> : null}
              </View>
              <Pressable onPress={handleClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Loading eligibility */}
            {loadingElig && (
              <View style={styles.centerBox}>
                <ActivityIndicator color={colors.brand600} />
                <Text style={styles.loadingText}>Checking eligibility…</Text>
              </View>
            )}

            {/* Success state */}
            {!loadingElig && submitted && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success600} />
                <Text style={styles.successTitle}>{isEditMode ? 'Review updated!' : 'Review submitted!'}</Text>
                <Text style={styles.successSubtitle}>
                  {isEditMode
                    ? 'Your changes will appear once approved.'
                    : 'Thanks for sharing your feedback! It will appear once approved.'}
                </Text>
                <Pressable style={styles.doneBtn} onPress={handleClose}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            )}

            {/* Ineligible state */}
            {isIneligible && (
              <View style={styles.ineligibleBox}>
                <Ionicons name="information-circle-outline" size={36} color={colors.textMuted} />
                <Text style={styles.ineligibleTitle}>Not eligible yet</Text>
                <Text style={styles.ineligibleBody}>
                  {eligibility?.reason === 'NOT_COMPLETED'
                    ? 'You can review a hotel after your stay is complete.'
                    : eligibility?.reason === 'ALREADY_REVIEWED'
                    ? 'You have already reviewed this stay.'
                    : 'This booking cannot be reviewed at this time.'}
                </Text>
              </View>
            )}

            {/* Form */}
            {!loadingElig && !submitted && !isIneligible && (
              <>
                {/* Rating */}
                <View style={styles.ratingSection}>
                  <Text style={styles.fieldLabel}>Your rating</Text>
                  <StarPicker value={rating} onChange={setRating} />
                  {rating > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>}
                </View>

                {/* Title */}
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>Title <Text style={styles.optional}>(optional)</Text></Text>
                    <Text style={styles.charCount}>{title.length}/{TITLE_MAX}</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Summarise your stay in one line"
                    placeholderTextColor={colors.textMuted}
                    maxLength={TITLE_MAX}
                    returnKeyType="next"
                  />
                </View>

                {/* Body */}
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>Your experience *</Text>
                    <Text style={[styles.charCount, bodyTooShort && styles.charCountWarn]}>
                      {trimmedBody.length}/{BODY_MAX}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.textArea, bodyTooShort && styles.inputError]}
                    value={body}
                    onChangeText={(val) => {
                      setBody(val);
                      if (touched) setError(null);
                    }}
                    placeholder="Tell other travelers about your stay (at least 10 characters)"
                    placeholderTextColor={colors.textMuted}
                    maxLength={BODY_MAX}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  {bodyTooShort && (
                    <Text style={styles.errorSubText}>
                      Please write at least {BODY_MIN} characters ({BODY_MIN - trimmedBody.length} more needed).
                    </Text>
                  )}
                </View>

                {/* Error */}
                {error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.danger600} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Submit button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    submitting && styles.submitBtnDisabled,
                    pressed && !submitting && styles.submitBtnPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={isEditMode ? 'Update review' : 'Submit review'}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="star" size={16} color={colors.white} />
                      <Text style={styles.submitBtnText}>
                        {isEditMode ? 'Update review' : 'Submit review'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,23,38,0.45)',
  },
  kvView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...shadow.floating,
  },
  sheetHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sheetTitle: {
    ...typography.h2,
    color: colors.textStrong,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  sheetBody: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  centerBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  successBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  successTitle: {
    ...typography.h2,
    color: colors.textStrong,
  },
  successSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brand600,
    borderRadius: radius.control,
  },
  doneBtnText: {
    ...typography.bodyStrong,
    color: colors.white,
  },

  ineligibleBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  ineligibleTitle: {
    ...typography.h2,
    color: colors.textStrong,
  },
  ineligibleBody: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  ratingSection: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  starRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingLabel: {
    ...typography.captionStrong,
    color: colors.accent600,
  },
  field: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  optional: {
    fontWeight: '400',
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.caption,
    color: colors.textStrong,
    backgroundColor: colors.surfacePage,
  },
  inputError: {
    borderColor: colors.danger600,
  },
  textArea: {
    minHeight: 96,
    paddingTop: spacing.sm,
  },
  charCount: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  charCountWarn: {
    color: colors.danger600,
  },
  errorSubText: {
    ...typography.tiny,
    color: colors.danger600,
  },
  errorBox: {
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
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand600,
    borderRadius: radius.control,
    height: 48,
    marginTop: spacing.xs,
  },
  submitBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  submitBtnPressed: {
    backgroundColor: colors.brand700,
  },
  submitBtnText: {
    ...typography.bodyStrong,
    color: colors.white,
  },
});
