import type { IBuildGooMatrix } from './types';

/**
 * ColorMatrix 4x5 que produce el efecto "gooey": sube el contraste del canal
 * alfa alrededor del threshold, así dos figuras separadas se fusionan.
 */
export function buildGooMatrix({ gain, threshold }: IBuildGooMatrix): number[] {
    return [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, gain, -gain * threshold,
    ];
}
