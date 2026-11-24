import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { authApi } from '../api/authApi.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
const PHONE_RULE = /^\+?[0-9 ()-]{7,20}$/;

export default function EditProfileScreen({ navigation }) {
  const { user, updateProfile, logout } = useAuth();

  // ─── Personal Details State ──────────────────────────────────────────
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // ─── Email Change State ──────────────────────────────────────────────
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(null);
  const [emailError, setEmailError] = useState(null);

  // ─── Reset Password State ────────────────────────────────────────────
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [resetError, setResetError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authApi.pendingEmailChange()
      .then((res) => {
        if (!cancelled && res?.newEmail) {
          setPendingEmail(res.newEmail);
          setShowEmailForm(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 1. Save Personal Details ─────────────────────────────────────────
  const handleSaveProfile = async () => {
    setProfileError(null);
    setProfileSuccess(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFirst) {
      setProfileError('First name is required.');
      return;
    }
    if (!trimmedLast) {
      setProfileError('Last name is required.');
      return;
    }
    if (trimmedPhone && !PHONE_RULE.test(trimmedPhone)) {
      setProfileError('Enter a valid phone number (e.g. +91 9876543210).');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        phone: trimmedPhone || undefined,
      });
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(err.message || 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── 2. Email Change Handlers ────────────────────────────────────────
  const handleRequestEmailChange = async () => {
    setEmailError(null);
    setEmailSuccess(null);

    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError('Enter your new email address.');
      return;
    }
    if (!emailCurrentPassword) {
      setEmailError('Enter your current password to authorize this change.');
      return;
    }

    setEmailBusy(true);
    try {
      const res = await authApi.requestEmailChange({
        newEmail: trimmedEmail,
        currentPassword: emailCurrentPassword,
      });
      setPendingEmail(trimmedEmail);
      setEmailCurrentPassword('');
      setEmailSuccess(res.message || 'A verification code was sent to your new email address.');
    } catch (err) {
      setEmailError(err.message || 'Could not request email change.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    setEmailError(null);
    setEmailSuccess(null);

    const trimmedCode = emailCode.trim();
    if (!trimmedCode || trimmedCode.length !== 6) {
      setEmailError('Enter the 6-digit verification code.');
      return;
    }

    setEmailBusy(true);
    try {
      await authApi.verifyEmailChange({ code: trimmedCode });
      Alert.alert(
        'Email Changed',
        'Your email address has been updated successfully. Please sign in with your new email.',
        [
          {
            text: 'Sign In',
            onPress: async () => {
              await logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Auth', params: { screen: 'Login' } }],
              });
            },
          },
        ]
      );
    } catch (err) {
      setEmailError(err.message || 'Invalid or expired verification code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleResendEmailCode = async () => {
    setEmailError(null);
    setEmailSuccess(null);
    setEmailBusy(true);
    try {
      const res = await authApi.resendEmailChange();
      setEmailSuccess(res.message || 'A new verification code was sent.');
    } catch (err) {
      setEmailError(err.message || 'Could not resend verification code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleCancelEmailChange = async () => {
    setEmailError(null);
    setEmailSuccess(null);
    setEmailBusy(true);
    try {
      await authApi.cancelEmailChange();
      setPendingEmail(null);
      setEmailCode('');
      setNewEmail('');
      setShowEmailForm(false);
      setEmailSuccess('Email change request cancelled.');
    } catch (err) {
      setEmailError(err.message || 'Could not cancel email change.');
    } finally {
      setEmailBusy(false);
    }
  };

  // ─── 3. Send Password Reset Link Handler ─────────────────────────────
  const handleSendResetLink = async () => {
    setResetError(null);
    if (!user?.email) {
      setResetError('No email address associated with this account.');
      return;
    }

    setResettingPassword(true);
    try {
      const res = await authApi.forgotPassword({ email: user.email });
      setResetLinkSent(true);
      Alert.alert(
        'Reset Link Sent',
        res?.message || 'A password reset link has been sent to your email address.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      setResetError(err.message || 'Could not send password reset link.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          
          {/* ── 1. Personal Information Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Ionicons name="person-outline" size={18} color={colors.brand600} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.cardTitle}>Personal Information</Text>
                <Text style={styles.cardSubtitle}>Update your display name and contact phone number.</Text>
              </View>
            </View>

            <View style={styles.grid2}>
              <AppInput
                label="First name"
                value={firstName}
                placeholder="First name"
                onChangeText={(v) => {
                  setFirstName(v);
                  if (profileError) setProfileError(null);
                }}
                containerStyle={styles.flex1}
              />
              <AppInput
                label="Last name"
                value={lastName}
                placeholder="Last name"
                onChangeText={(v) => {
                  setLastName(v);
                  if (profileError) setProfileError(null);
                }}
                containerStyle={styles.flex1}
              />
            </View>

            <AppInput
              label="Phone number (optional)"
              value={phone}
              placeholder="+91 9876543210"
              keyboardType="phone-pad"
              onChangeText={(v) => {
                setPhone(v);
                if (profileError) setProfileError(null);
              }}
            />

            {profileError && (
              <View style={styles.alertError}>
                <Ionicons name="alert-circle" size={16} color={colors.danger600} />
                <Text style={styles.alertErrorText}>{profileError}</Text>
              </View>
            )}

            {profileSuccess && (
              <View style={styles.alertSuccess}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success600} />
                <Text style={styles.alertSuccessText}>{profileSuccess}</Text>
              </View>
            )}

            <AppButton
              title="Save changes"
              onPress={handleSaveProfile}
              loading={savingProfile}
              style={styles.actionBtn}
            />
          </View>

          {/* ── 2. Email Address Card (with OTP verification) ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Ionicons name="mail-outline" size={18} color={colors.brand600} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.cardTitle}>Email Address</Text>
                <Text style={styles.cardSubtitle}>Your primary login and booking confirmation email.</Text>
              </View>
            </View>

            <View style={styles.currentEmailBox}>
              <Text style={styles.currentEmailLabel}>Current email</Text>
              <Text style={styles.currentEmailValue}>{user?.email}</Text>
            </View>

            {emailSuccess && !showEmailForm && !pendingEmail && (
              <View style={[styles.alertSuccess, { marginBottom: spacing.md }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success600} />
                <Text style={styles.alertSuccessText}>{emailSuccess}</Text>
              </View>
            )}

            {!showEmailForm && !pendingEmail ? (
              <AppButton
                title="Change email"
                variant="secondary"
                size="sm"
                icon={<Ionicons name="create-outline" size={16} color={colors.textStrong} />}
                onPress={() => {
                  setEmailSuccess(null);
                  setEmailError(null);
                  setShowEmailForm(true);
                }}
              />
            ) : pendingEmail ? (
              /* Code verification phase */
              <View style={styles.pendingSection}>
                <View style={styles.pendingNotice}>
                  <Ionicons name="mail-open-outline" size={18} color={colors.brand600} />
                  <Text style={styles.pendingNoticeText}>
                    A 6-digit verification code was sent to <Text style={styles.boldText}>{pendingEmail}</Text>.
                  </Text>
                </View>

                <AppInput
                  label="6-digit verification code"
                  value={emailCode}
                  placeholder="e.g. 123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(v) => {
                    setEmailCode(v.replace(/[^0-9]/g, ''));
                    if (emailError) setEmailError(null);
                  }}
                />

                {emailError && (
                  <View style={styles.alertError}>
                    <Ionicons name="alert-circle" size={16} color={colors.danger600} />
                    <Text style={styles.alertErrorText}>{emailError}</Text>
                  </View>
                )}

                {emailSuccess && (
                  <View style={styles.alertSuccess}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success600} />
                    <Text style={styles.alertSuccessText}>{emailSuccess}</Text>
                  </View>
                )}

                <AppButton
                  title="Verify and update email"
                  onPress={handleVerifyEmailChange}
                  loading={emailBusy}
                  disabled={emailCode.trim().length !== 6}
                  style={styles.actionBtn}
                />

                <View style={styles.secondaryActionsRow}>
                  <Pressable onPress={handleResendEmailCode} disabled={emailBusy} style={styles.textButton}>
                    <Text style={styles.resendText}>Resend code</Text>
                  </Pressable>
                  <Pressable onPress={handleCancelEmailChange} disabled={emailBusy} style={styles.textButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* Request phase */
              <View style={styles.pendingSection}>
                <AppInput
                  label="New email address"
                  value={newEmail}
                  placeholder="new.email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onChangeText={(v) => {
                    setNewEmail(v);
                    if (emailError) setEmailError(null);
                  }}
                />

                <AppInput
                  label="Current password"
                  value={emailCurrentPassword}
                  placeholder="Your current password"
                  secureTextEntry
                  onChangeText={(v) => {
                    setEmailCurrentPassword(v);
                    if (emailError) setEmailError(null);
                  }}
                />

                {emailError && (
                  <View style={styles.alertError}>
                    <Ionicons name="alert-circle" size={16} color={colors.danger600} />
                    <Text style={styles.alertErrorText}>{emailError}</Text>
                  </View>
                )}

                {emailSuccess && (
                  <View style={styles.alertSuccess}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success600} />
                    <Text style={styles.alertSuccessText}>{emailSuccess}</Text>
                  </View>
                )}

                <View style={styles.btnRow}>
                  <AppButton
                    title="Send verification code"
                    onPress={handleRequestEmailChange}
                    loading={emailBusy}
                    disabled={!newEmail.trim() || !emailCurrentPassword}
                    style={styles.flex1}
                  />
                  <AppButton
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      setShowEmailForm(false);
                      setNewEmail('');
                      setEmailCurrentPassword('');
                      setEmailError(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>

          {/* ── 3. Password & Security Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Ionicons name="key-outline" size={18} color={colors.brand600} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.cardTitle}>Password & Security</Text>
                <Text style={styles.cardSubtitle}>
                  Change or reset your password securely via email verification.
                </Text>
              </View>
            </View>

            {resetError && (
              <View style={styles.alertError}>
                <Ionicons name="alert-circle" size={16} color={colors.danger600} />
                <Text style={styles.alertErrorText}>{resetError}</Text>
              </View>
            )}

            {resetLinkSent ? (
              <View style={styles.alertSuccess}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success600} />
                <Text style={styles.alertSuccessText}>
                  A password reset link was sent to {user?.email}. Check your inbox to set your new password.
                </Text>
              </View>
            ) : (
              <Text style={styles.emailChangeNote}>
                We will send a password reset link to your registered email address ({user?.email}).
              </Text>
            )}

            <AppButton
              title={resetLinkSent ? 'Resend reset link' : 'Send reset link'}
              variant={resetLinkSent ? 'outline' : 'primary'}
              onPress={handleSendResetLink}
              loading={resettingPassword}
              style={styles.actionBtn}
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },

  /* ── Card Containers ── */
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h2,
    fontSize: 16,
    color: colors.textStrong,
  },
  cardSubtitle: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  /* ── Form Inputs ── */
  grid2: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  /* ── Current Email Box ── */
  currentEmailBox: {
    backgroundColor: colors.surfacePage,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 2,
  },
  currentEmailLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  currentEmailValue: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },

  /* ── Email Pending & Actions ── */
  pendingSection: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand50,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  pendingNoticeText: {
    ...typography.caption,
    color: colors.brand700,
    flex: 1,
  },
  boldText: {
    fontWeight: '700',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  textButton: {
    paddingVertical: spacing.xs,
  },
  resendText: {
    ...typography.captionStrong,
    color: colors.brand600,
  },
  cancelText: {
    ...typography.captionStrong,
    color: colors.danger600,
  },

  /* ── Alert Banners ── */
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.danger50,
    borderRadius: radius.control,
    padding: spacing.sm,
  },
  alertErrorText: {
    ...typography.caption,
    color: colors.danger600,
    flex: 1,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success50,
    borderRadius: radius.control,
    padding: spacing.sm,
  },
  alertSuccessText: {
    ...typography.caption,
    color: colors.success600,
    flex: 1,
  },
});
