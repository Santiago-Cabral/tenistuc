import { useDerivedValue } from 'react-native-reanimated';
import { buildNotificationGeometry } from '../layout';
import type { INotificationGeometryInput, INotificationGeometryValues } from '../types';

/**
 * Expone cada campo de la geometría como `DerivedValue` para que Skia pueda
 * leerlos sin pasar por el bridge de JS.
 */
export function useNotificationGeometry({
    drop,
    expand,
    layout,
}: INotificationGeometryInput): INotificationGeometryValues {
    const geometry = useDerivedValue(() =>
        buildNotificationGeometry({
            drop: drop.value,
            expand: expand.value,
            layout,
        }),
    );

    return {
        x: useDerivedValue(() => geometry.value.x),
        y: useDerivedValue(() => geometry.value.y),
        width: useDerivedValue(() => geometry.value.width),
        height: useDerivedValue(() => geometry.value.height),
        radius: useDerivedValue(() => geometry.value.radius),
        neckX: useDerivedValue(() => geometry.value.neckX),
        neckY: useDerivedValue(() => geometry.value.neckY),
        neckWidth: useDerivedValue(() => geometry.value.neckWidth),
        neckHeight: useDerivedValue(() => geometry.value.neckHeight),
        neckRadius: useDerivedValue(() => geometry.value.neckRadius),
        shadowOpacity: useDerivedValue(() => geometry.value.shadowOpacity),
        offsetY: useDerivedValue(() => geometry.value.offsetY),
        widthRatio: useDerivedValue(() => geometry.value.widthRatio),
    };
}
