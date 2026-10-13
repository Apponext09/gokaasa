import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { authApi } from '../api/authApi.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { message } = await authApi.forgotPassword({ email: email.trim() });
      setSent(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeSlideIn style={styles.brandMark}>
          <Ionicons name={sent ? 'mail-open-outline' : 'key-outline'} size={24} color={colors.white} />
        </FadeSlideIn>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>Enter the email on your account and we'll send you a reset link.</Text>

        {sent ? (
          <Text style={styles.success}>{sent}</Text>
        ) : (
          <>
            <AppInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            {error && <Text style={styles.error}>{error}</Text>}
            <AppButton title="Send reset link" onPress={onSubmit} loading={busy} disabled={!email.trim()} style={styles.submit} />
          </>
        )}
        <AppButton title="Back to sign in" variant="ghost" size="sm" onPress={() => navigation.navigate('Login')} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xxl, gap: spacing.md },
  brandMark: {
    width: 56, height: 56, borderRadius: radius.card, backgroundColor: colors.brand600,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, alignSelf: 'center',
  },
  title: { ...typography.display, color: colors.textStrong, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger600 },
  success: { ...typography.body, color: colors.success600, marginBottom: spacing.md, textAlign: 'center' },
  submit: { marginTop: spacing.sm },
});
