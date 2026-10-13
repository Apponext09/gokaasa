import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

/** Server field paths look like "body.email" (backend/src/middleware/validate.js); this strips the
 * prefix so a field error lands on the right input, same convention as the website's applyServerFieldErrors. */
function fieldError(error, name) {
  return error?.fieldErrors?.[`body.${name}`] ?? error?.fieldErrors?.[name];
}

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    const result = await register({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      password: form.password,
    });
    setBusy(false);
    if (result.ok) {
      navigation.getParent()?.goBack();
    } else {
      setError(result.error);
    }
  };

  const canSubmit = form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.password.length >= 10;

  return (
    <ScreenContainer edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FadeSlideIn style={styles.brandMark}>
            <Ionicons name="bed" size={26} color={colors.white} />
          </FadeSlideIn>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Book faster, track trips, and save hotels you love.</Text>

          <AppInput label="First name" value={form.firstName} onChangeText={set('firstName')} error={fieldError(error, 'firstName')} />
          <AppInput label="Last name" value={form.lastName} onChangeText={set('lastName')} error={fieldError(error, 'lastName')} />
          <AppInput
            label="Email"
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={fieldError(error, 'email')}
          />
          <AppInput label="Phone (optional)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={fieldError(error, 'phone')} />
          <AppInput
            label="Password"
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            error={fieldError(error, 'password')}
          />
          <Text style={styles.hint}>At least 10 characters, with a letter and a number.</Text>
          {error?.message ? <Text style={styles.error}>{error.message}</Text> : null}

          <AppButton title="Create account" onPress={onSubmit} loading={busy} disabled={!canSubmit} style={styles.submit} />
          <AppButton title="Already have an account? Sign in" variant="ghost" size="sm" onPress={() => navigation.navigate('Login')} />
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
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: -spacing.sm },
  error: { ...typography.caption, color: colors.danger600 },
  submit: { marginTop: spacing.sm },
});
