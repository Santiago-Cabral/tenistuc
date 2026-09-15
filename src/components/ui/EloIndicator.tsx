import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../theme';

interface Props { delta: number; }

export function EloIndicator({ delta }: Props) {
    const up = delta >= 0;
    return (
        <View style={[styles.pill, { backgroundColor: up ? 'rgba(183,228,199,0.2)' : 'rgba(186,26,26,0.15)' }]}>
            <Text style={[styles.text, { color: up ? Colors.primaryContainer : Colors.errorContainer }]}>
                {up ? '▲' : '▼'} {Math.abs(delta)} pts esta semana
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 99,
    },
    text: { ...Typography.labelSm, letterSpacing: 0.3 },
});