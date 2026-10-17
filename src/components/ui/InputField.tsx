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
    rightAccessory?: React.ReactNode;
}

export function InputField({ label, style, inputStyle, rightAccessory, ...props }: Props) {
    return (
        <View style={[styles.wrapper, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View style={styles.inputRow}>
                <TextInput
                    style={[
                        styles.input,
                        props.multiline && styles.multiline,
                        rightAccessory ? styles.inputWithAccessory : null,
                        inputStyle,
                    ]}
                    placeholderTextColor={Colors.onSurfaceVariant}
                    {...props}
                />
                {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { gap: Spacing.sm },
    label: { ...Typography.labelMd, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
    inputRow: { justifyContent: 'center' },
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
    inputWithAccessory: { paddingRight: 48 },
    accessory: {
        position: 'absolute',
        right: Spacing.md,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.md },
});