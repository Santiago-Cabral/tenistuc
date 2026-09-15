import React from 'react';
import {
    View, Text, TextInput, StyleSheet,
    TextInputProps, ViewStyle, StyleProp, TextStyle
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme';

interface Props extends Omit<TextInputProps, 'style'> {
    label?: string;
    style?: StyleProp<ViewStyle>;
    inputStyle?: StyleProp<TextStyle>;
}

export function InputField({ label, style, inputStyle, ...props }: Props) {
    return (
        <View style={[styles.wrapper, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <TextInput
                style={[styles.input, props.multiline && styles.multiline, inputStyle]}
                placeholderTextColor={Colors.onSurfaceVariant}
                {...props}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { gap: Spacing.sm },
    label: { ...Typography.labelMd, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
    input: {
        backgroundColor: Colors.surfaceContainer,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md + 2,
        ...Typography.bodyMd,
        color: Colors.onSurface,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.md },
});