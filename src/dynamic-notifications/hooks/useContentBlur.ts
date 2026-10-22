import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { BLUR_INTENSITY } from '../constants';
import { clamp } from '../logic';

interface IUseContentBlur {
    reveal: SharedValue<number>;
}

/**
 * El blur del contenido se desvanece a medida que el texto se revela.
 */
export function useContentBlur({ reveal }: IUseContentBlur) {
    const animatedProps = useAnimatedProps(() => {
        const progress = clamp(reveal.value, 0, 1);
        return { intensity: BLUR_INTENSITY * (1 - progress) };
    });

    const animatedStyle = useAnimatedStyle(() => {
        return { opacity: 1 - clamp(reveal.value, 0, 1) };
    });

    return { animatedProps, animatedStyle };
}

export type { IUseContentBlur };
