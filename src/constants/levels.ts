// src/constants/levels.ts
// Lista canónica de niveles/categorías de jugadores.
// Debe coincidir con el check constraint de `profiles.level` en Supabase.

export const LEVELS = [
    '1era',
    '2da',
    '3era',
    '4ta',
    '5ta',
    '6ta',
] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_ORDER: Record<Level, number> = {
    '1era': 0,
    '2da': 1,
    '3era': 2,
    '4ta': 3,
    '5ta': 4,
    '6ta': 5,
};
