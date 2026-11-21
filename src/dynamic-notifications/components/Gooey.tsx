import {
    Blur,
    Canvas,
    ColorMatrix,
    Group,
    Paint,
    RoundedRect,
    Shadow,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import {
    DROP_TINT_END,
    DROP_TINT_START,
    SHADOW_BLUR,
    SHADOW_DY,
} from '../constants';
import { buildGooMatrix } from '../geometry';
import { useDynamicNotifications } from '../hooks/useDynamicNotifications';
import { useNotificationGeometry } from '../hooks/useNotificationGeometry';
import type { INotificationGooey } from '../types';

/**
 * Dibuja el cuello y la gota con Skia. El efecto gooey se logra con un
 * Blur + ColorMatrix aplicados en la layer del Group.
 */
export const Gooey = memo<INotificationGooey>(
    ({ blur, gain, threshold, cardColor, shadowColor }) => {
        const context = useDynamicNotifications();
        const { layout, drop, expand, tint } = context;

        const geometry = useNotificationGeometry({ drop, expand, layout });

        const body = cardColor ?? context.cardColor;
        const pill = body;
        const shade = shadowColor ?? context.shadowColor;
        const radius = blur ?? context.blur;

        const matrix = useMemo(
            () =>
                buildGooMatrix({
                    gain: gain ?? context.gain,
                    threshold: threshold ?? context.threshold,
                }),
            [gain, threshold, context.gain, context.threshold],
        );

        const droplet = useDerivedValue(
            () => interpolateColor(tint.value, [DROP_TINT_START, DROP_TINT_END], [pill, body]),
            [pill, body],
        );

        return (
            <Canvas pointerEvents="none" style={[styles.canvas, { height: layout.canvasHeight }]}>
                <Group opacity={geometry.shadowOpacity}>
                    <RoundedRect
                        x={geometry.x}
                        y={geometry.y}
                        width={geometry.width}
                        height={geometry.height}
                        r={geometry.radius}
                    >
                        <Shadow dx={0} dy={SHADOW_DY} blur={SHADOW_BLUR} color={shade} shadowOnly />
                    </RoundedRect>
                </Group>

                <Group
                    layer={
                        <Paint>
                            <Blur blur={radius} />
                            <ColorMatrix matrix={matrix} />
                        </Paint>
                    }
                >
                    <RoundedRect
                        x={geometry.neckX}
                        y={geometry.neckY}
                        width={geometry.neckWidth}
                        height={geometry.neckHeight}
                        r={geometry.neckRadius}
                        color={pill}
                    />
                    <RoundedRect
                        x={geometry.x}
                        y={geometry.y}
                        width={geometry.width}
                        height={geometry.height}
                        r={geometry.radius}
                        color={droplet}
                    />
                </Group>
            </Canvas>
        );
    },
);

const styles = StyleSheet.create({
    canvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
});
