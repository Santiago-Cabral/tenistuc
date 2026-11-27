import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../theme';
import { CUSTOM_VENUE, VENUE_GROUPS } from '../../constants/venues';

interface Props {
    selected: string | null;
    onSelect: (venue: string) => void;
}

export function VenueChips({ selected, onSelect }: Props) {
    return (
        <View style={styles.container}>
            {VENUE_GROUPS.map(group => (
                <View key={group.city} style={styles.group}>
                    <Text style={styles.city}>{group.city}</Text>
                    <View style={styles.chips}>
                        {group.venues.map(venue => {
                            const active = selected === venue.name;
                            return (
                                <TouchableOpacity
                                    key={venue.name}
                                    onPress={() => onSelect(venue.name)}
                                    activeOpacity={0.8}
                                    style={[styles.chip, active && styles.chipActive]}
                                >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {venue.name}
                                    </Text>
                                    {venue.address ? (
                                        <Text style={[styles.chipAddress, active && styles.chipTextActive]}>
                                            {venue.address}
                                        </Text>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            ))}
            <View style={styles.group}>
                <TouchableOpacity
                    onPress={() => onSelect(CUSTOM_VENUE)}
                    activeOpacity={0.8}
                    style={[styles.chip, styles.chipCustom, selected === CUSTOM_VENUE && styles.chipActive]}
                >
                    <Text style={[styles.chipText, selected === CUSTOM_VENUE && styles.chipTextActive]}>
                        {CUSTOM_VENUE}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { gap: Spacing.md },
    group: { gap: Spacing.xs },
    city: { ...Typography.labelMd, color: Colors.primary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
        maxWidth: '100%',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    chipCustom: { alignSelf: 'flex-start' },
    chipActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
    chipText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    chipAddress: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    chipTextActive: { color: Colors.primaryDim },
});
