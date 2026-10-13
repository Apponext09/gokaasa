import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

/**
 * Shown instead of inventing data when the backend genuinely has none for this view. `image` (a real
 * bundled asset, e.g. the Gokaasa mark) replaces the default Ionicons glyph when a specific screen wants
 * actual brand art instead of a generic icon -- every other caller keeps using `icon` unchanged.
 */
export function EmptyState({ icon = 'file-tray-outline', image, imageLabel, title, message, action }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        {image ? (
          <Image source={image} style={styles.image} resizeMode="contain" accessibilityLabel={imageLabel} />
        ) : (
          <Ionicons name={icon} size={28} color={colors.textMuted} />
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  image: { width: 40, height: 36 },
  title: { ...typography.h2, color: colors.textStrong, textAlign: 'center' },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
