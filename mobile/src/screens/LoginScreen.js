import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    const result = await login(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      navigation.getParent()?.goBack();
    } else {
      setError(result.error.message);
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

          <AppButton title="Sign in" onPress={onSubmit} loading={busy} disabled={!email.trim() || !password} style={styles.submit} />

          <AppButton title="Forgot password?" variant="ghost" size="sm" onPress={() => navigation.navigate('ForgotPassword')} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Gokaasa?</Text>
            <AppButton title="Create an account" variant="ghost" size="sm" onPress={() => navigation.navigate('Register')} />
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
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, gap: spacing.xs },
  footerText: { ...typography.caption, color: colors.textMuted },
});
