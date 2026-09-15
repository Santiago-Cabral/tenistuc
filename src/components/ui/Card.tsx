import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Radius, Shadow, Spacing } from '../../theme/index';

interface Props {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: Props) {
    return (
        <View style={[styles.card, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl,
        padding: Spacing.lg,
        ...Shadow.ambient,
    },
});