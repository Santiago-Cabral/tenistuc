import React, { useEffect, useRef } from 'react';
import {
    Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing } from '../../theme';

interface SkeletonProps {
    width?: number | `${number}%`;
    height?: number;
    radius?: number;
    style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 14, radius = Radius.md, style }: SkeletonProps) {
    const opacity = useRef(new Animated.Value(0.45)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.ease,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.45,
                    duration: 800,
                    easing: Easing.ease,
                    useNativeDriver: true,
                }),
            ]),
        );
        animation.start();
        return () => animation.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.block,
                { width, height, borderRadius: radius, opacity },
                style,
            ]}
        />
    );
}

interface SkeletonListProps {
    count?: number;
    variant?: 'card' | 'row' | 'bubble';
}

export function SkeletonList({ count = 5, variant = 'card' }: SkeletonListProps) {
    return (
        <View style={styles.list} accessibilityLabel="Cargando contenido" accessibilityRole="progressbar">
            {Array.from({ length: count }).map((_, index) => (
                <View
                    key={index}
                    style={[
                        styles.item,
                        variant === 'bubble' && styles.itemBubble,
                        index % 2 === 1 && variant === 'bubble' && styles.itemBubbleRight,
                    ]}
                >
                    <Skeleton
                        width={variant === 'row' ? 48 : 56}
                        height={variant === 'row' ? 48 : 56}
                        radius={variant === 'bubble' ? Radius.lg : Radius.full}
                    />
                    <View style={styles.lines}>
                        <Skeleton width="70%" height={14} />
                        <Skeleton width="45%" height={11} />
                        {variant !== 'row' && <Skeleton width="58%" height={11} />}
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    block: { backgroundColor: Colors.surfaceContainerHigh },
    list: { gap: Spacing.base, padding: Spacing.lg },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.base,
        padding: Spacing.lg,
        borderRadius: Radius.xl,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    itemBubble: { backgroundColor: 'transparent', paddingHorizontal: Spacing.lg },
    itemBubbleRight: { flexDirection: 'row-reverse' },
    lines: { flex: 1, gap: Spacing.sm },
});
