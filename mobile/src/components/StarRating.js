import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';

/** Only ever rendered when hotel.starRating is a real, positive number from the backend. */
export function StarRating({ count, size = 13 }) {
  if (!count || count <= 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <Ionicons key={i} name="star" size={size} color={colors.accent500} />
      ))}
    </View>
  );
}
