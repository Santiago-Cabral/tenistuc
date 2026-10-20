// src/constants/levels.ts
// Lista canónica de niveles/categorías de jugadores.
// Debe coincidir con el check constraint de `profiles.level` en Supabase.

export const LEVELS = [
    'Amateur I',
    'Amateur II',
    'Intermedio',
    'Avanzado',
    'Competitivo',
    'Semi-Pro I',
    'Semi-Pro II',
    'Pro I',
    'Pro II',
    'Elite',
    'Legendary',
] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_ORDER: Record<Level, number> = {
    'Amateur I': 0,
    'Amateur II': 1,
    'Intermedio': 2,
    'Avanzado': 3,
    'Competitivo': 4,
    'Semi-Pro I': 5,
    'Semi-Pro II': 6,
    'Pro I': 7,
    'Pro II': 8,
    'Elite': 9,
    'Legendary': 10,
};
