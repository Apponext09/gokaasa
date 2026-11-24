import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

export default function LoginScreen({ navigation, isTab = false }) {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const navigateAfterAuth = () => {
    if (isTab) {
      navigation.navigate('Home');
    } else {
      navigation.navigate('Main', { screen: 'Home' });
    }
  };

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    const result = await login(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      navigateAfterAuth();
    } else {
      setError(result.error?.message || 'Failed to sign in');
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      Alert.alert(
        'Google Sign-In',
        'Google Sign-In is being prepared. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your mobile .env or configuration to complete Google OAuth credentials.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setGoogleBusy(true);
      const result = await loginWithGoogle({ credential: `mock-token-${Date.now()}` });
      setGoogleBusy(false);
      if (result.ok) {
        navigateAfterAuth();
      } else {
        setError(result.error?.message || 'Google sign-in failed');
      }
    } catch (err) {
      setGoogleBusy(false);
      setError(err?.message || 'Google sign-in failed');
    }
  };

  const goToForgotPassword = () => {
    if (isTab) {
      navigation.navigate('Auth', { screen: 'ForgotPassword' });
    } else {
      navigation.navigate('ForgotPassword');
    }
  };

  const goToRegister = () => {
    if (isTab) {
      navigation.navigate('Auth', { screen: 'Register' });
    } else {
      navigation.navigate('Register');
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FadeSlideIn style={styles.brandMark}>
            <Ionicons name="bed" size={26} color={colors.white} />
          </FadeSlideIn>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to manage your trips, wishlist, and bookings.</Text>

          <AppInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <AppInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
          />
          {error && <Text style={styles.error}>{error}</Text>}

          <AppButton
            title="Sign in"
            onPress={onSubmit}
            loading={busy}
            disabled={!email.trim() || !password}
            style={styles.submit}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={googleBusy || busy}
            onPress={handleGoogleSignIn}
            style={({ pressed }) => [
              styles.googleBtn,
              pressed && styles.googleBtnPressed,
              (googleBusy || busy) && styles.googleBtnDisabled,
            ]}
          >
            {googleBusy ? (
              <ActivityIndicator size="small" color={colors.textStrong} />
            ) : (
              <View style={styles.googleBtnContent}>
                <Image
                  source={require('../../assets/google-icon.png')}
                  style={styles.googleIcon}
                  resizeMode="contain"
                  accessibilityLabel="Google logo"
                />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </View>
            )}
          </Pressable>

          <AppButton title="Forgot password?" variant="ghost" size="sm" onPress={goToForgotPassword} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Gokaasa?</Text>
            <AppButton title="Create an account" variant="ghost" size="sm" onPress={goToRegister} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xxl, gap: spacing.md },
  brandMark: {
    width: 56, height: 56, borderRadius: radius.card, backgroundColor: colors.brand600,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, alignSelf: 'center',
  },
  title: { ...typography.display, color: colors.textStrong, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger600 },
  submit: { marginTop: spacing.sm },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    letterSpacing: 0.5,
  },
  googleBtn: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.control,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    ...shadow.subtle,
  },
  googleBtnPressed: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.9,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleBtnText: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, gap: spacing.xs },
  footerText: { ...typography.caption, color: colors.textMuted },
});
