import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme';

interface Props {
    label: string;
    active?: boolean;
    onPress?: () => void;
}

export function Chip({ label, active = false, onPress }: Props) {
    return (
        <TouchableOpacity
            style={[styles.chip, active && styles.chipActive]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        paddingVertical: Spacing.sm + 2,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    chipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    text: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
    textActive: { color: Colors.onPrimary, fontFamily: 'PlusJakartaSans_700Bold' },
});