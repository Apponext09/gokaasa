import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDestinationSuggestions } from '../hooks/useDestinationSuggestions.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

/**
 * The one destination-autocomplete input, shared by HomeScreen's search card and SearchScreen's search
 * form. `onPickHotel` is optional -- when a HOTEL-type suggestion (with its own hotelSlug) is chosen, the
 * caller usually wants to navigate straight to that property instead of running a city search.
 */
export function DestinationInput({ text, onChangeText, selected, onSelect, onPickHotel, bare = false }) {
  const { suggestions, clearSuggestions } = useDestinationSuggestions(text, selected);

  const choose = (item) => {
    if (item.type === 'HOTEL' && item.hotelSlug && onPickHotel) {
      clearSuggestions();
      onPickHotel(item);
      return;
    }
    onSelect({ destination: item.destination, area: item.area ?? null, label: item.label });
    clearSuggestions();
  };

  return (
    <View>
      <View style={[styles.inputRow, bare && styles.inputRowBare]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={(value) => {
            onChangeText(value);
            if (selected) onSelect(null);
          }}
          placeholder="City, area, or hotel"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((item) => (
            <Pressable key={`${item.type}-${item.label}`} style={styles.suggestionRow} onPress={() => choose(item)}>
              <Ionicons name={item.type === 'HOTEL' ? 'bed-outline' : 'location-outline'} size={15} color={colors.brand600} />
              <View style={styles.flex1}>
                <Text style={styles.suggestionLabel}>{item.label}</Text>
                {item.subtitle ? <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, borderRadius: radius.control,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceCard,
  },
  inputRowBare: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  input: { flex: 1, ...typography.body, color: colors.textStrong },
  suggestions: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.control, overflow: 'hidden', backgroundColor: colors.surfaceCard },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  suggestionLabel: { ...typography.body, color: colors.textStrong },
  suggestionSubtitle: { ...typography.tiny, color: colors.textMuted },
});
