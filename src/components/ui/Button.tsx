import React from 'react';
import {
    TouchableOpacity, Text, ActivityIndicator,
    StyleSheet, ViewStyle, StyleProp
} from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../theme';

interface Props {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'ghost';
    loading?: boolean;
    disabled?: boolean;
    uppercase?: boolean;
    style?: StyleProp<ViewStyle>;
}

export function Button({
    label, onPress, variant = 'primary',
    loading = false, disabled = false, uppercase = true, style,
}: Props) {
    const isReallyDisabled = loading || disabled;

    return (
        <TouchableOpacity
            style={[
                styles.base,
                styles[variant],
                isReallyDisabled && styles.disabled,
                style
            ]}
            onPress={onPress}
            activeOpacity={0.85}
            disabled={isReallyDisabled}
        >
            {loading
                ? <ActivityIndicator color={variant === 'primary' ? Colors.onPrimary : Colors.primary} size="small" />
                : <Text style={[styles.text, styles[`${variant}Text`]]}>
                    {uppercase ? label.toUpperCase() : label}
                </Text>
            }
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        paddingVertical: Spacing.md + 2,
        paddingHorizontal: Spacing.xl,
        borderRadius: Radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primary: { backgroundColor: Colors.primary },
    secondary: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.outlineVariant },
    ghost: { backgroundColor: 'transparent' },
    text: { ...Typography.labelLg, letterSpacing: 0.5 },
    primaryText: { color: Colors.onPrimary },
    secondaryText: { color: Colors.onSurface },
    ghostText: { color: Colors.primary },
    disabled: { opacity: 0.5 },
} as any);