/**
 * Helpers matemáticos. Todos son "worklets" porque corren dentro de los
 * callbacks de Reanimated (UI thread) durante la animación.
 */

export function clamp<T extends number>(value: T, min: T, max: T): T {
    'worklet';
    return Math.min(Math.max(value, min), max) as T;
}

export function mix<T extends number>(progress: number, from: T, to: T): number {
    'worklet';
    return from + (to - from) * progress;
}

export function easeOutPower(progress: number, power: number): number {
    'worklet';
    const normalized = Math.min(Math.max(progress, 0), 1);
    return 1 - Math.pow(1 - normalized, power);
}

/**
 * Perfil en forma de campana (0 en los extremos, 1 en el pico).
 * Da la forma del "cuello" que une la gota con la isla.
 */
export function neckProfile(progress: number, rise: number, fall: number): number {
    'worklet';
    const t = clamp(progress, 0, 1);
    if (t <= 0 || t >= 1) return 0;
    const peak = rise / (rise + fall);
    const normal = Math.pow(peak, rise) * Math.pow(1 - peak, fall);
    return (Math.pow(t, rise) * Math.pow(1 - t, fall)) / normal;
}
