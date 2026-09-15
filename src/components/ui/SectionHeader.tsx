import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme';

interface Props {
    title: string;
    action?: string;
    onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: Props) {
    return (
        <View style={styles.row}>
            <Text style={styles.title}>{title}</Text>
            {action && (
                <TouchableOpacity onPress={onAction}>
                    <Text style={styles.action}>{action}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    title: { fontFamily: 'Lexend_600SemiBold', fontSize: 18, color: Colors.onSurface },
    action: { ...Typography.labelMd, color: Colors.primary },
});