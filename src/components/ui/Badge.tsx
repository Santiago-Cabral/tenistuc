import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Typography, Radius } from '../../theme';

interface Props {
    label: string;
    color: string;
    textColor: string;
    style?: StyleProp<ViewStyle>;
}

export function Badge({ label, color, textColor, style }: Props) {
    return (
        <View style={[styles.badge, { backgroundColor: color }, style]}>
            <Text style={[styles.text, { color: textColor }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: Radius.full,
    },
    text: {
        ...Typography.labelSm,
        fontSize: 10,
        letterSpacing: 0.5,
    },
});