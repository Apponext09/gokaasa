import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors.js';

/** A consistent page background + safe-area wrapper, used by every screen instead of a bare View. */
export function ScreenContainer({ children, style, edges = ['top', 'bottom'] }) {
  return (
    <SafeAreaView edges={edges} style={[styles.safe, style]}>
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfacePage },
  flex: { flex: 1 },
});
