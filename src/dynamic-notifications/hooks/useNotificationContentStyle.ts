import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle } from 'react-native-reanimated';
import { CONTENT_MIN_SCALE } from '../constants';
import { clamp, mix } from '../logic';
import { buildNotificationGeometry } from '../layout';
import type { INotificationLayout } from '../types';

interface IUseNotificationContentStyle {
    drop: SharedValue<number>;
    expand: SharedValue<number>;
    reveal: SharedValue<number>;
    offset: SharedValue<number>;
    layout: INotificationLayout;
}

/**
 * Transforma de la gota al rectángulo de la tarjeta: escala, offset vertical y
 * opacidad, en función del progreso de la animación.
 */
export function useNotificationContentStyle({
    drop,
    expand,
    reveal,
    offset,
    layout,
}: IUseNotificationContentStyle) {
    return useAnimatedStyle(() => {
        const geometry = buildNotificationGeometry({
            drop: drop.value,
            expand: expand.value,
            layout,
        });

        const progress = clamp(reveal.value, 0, 1);
        const overshoot = clamp(geometry.widthRatio - 1, 0, 0.2);
        const scale = mix(progress, CONTENT_MIN_SCALE, 1) + overshoot * progress;

        return {
            opacity: progress,
            transform: [{ translateY: geometry.offsetY + offset.value }, { scale }],
        };
    });
}

export type { IUseNotificationContentStyle };
