// src/constants/ageCategories.ts
// Categorías de edad. Debe coincidir con el check constraint de
// `profiles.age_category` en Supabase.

export const AGE_CATEGORIES = [
    'libre',
    '+30',
    '+40',
    '+50',
    '+60',
    '+70',
    '+80',
] as const;

export type AgeCategory = (typeof AGE_CATEGORIES)[number];

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
    libre: 'Libre',
    '+30': '+30',
    '+40': '+40',
    '+50': '+50',
    '+60': '+60',
    '+70': '+70',
    '+80': '+80',
};

export type AgeInputMode = 'category' | 'birth';

export interface AgeSelection {
    mode: AgeInputMode;
    category: AgeCategory;
    birthDate: string | null;
}

export const DEFAULT_AGE_SELECTION: AgeSelection = {
    mode: 'category',
    category: 'libre',
    birthDate: null,
};

export function ageCategoryFromBirthDate(birthDate: string): AgeCategory {
    const [year, month, day] = birthDate.split('-').map(Number);
    if (!year || !month || !day) return 'libre';

    const today = new Date();
    let age = today.getFullYear() - year;
    const hadBirthday =
        today.getMonth() + 1 > month ||
        (today.getMonth() + 1 === month && today.getDate() >= day);
    if (!hadBirthday) age -= 1;

    if (age < 30) return 'libre';
    return `+${Math.min(Math.floor(age / 10) * 10, 80)}` as AgeCategory;
}

export function ageSelectionFromCategory(category: AgeCategory | null | undefined): AgeSelection {
    return {
        mode: 'category',
        category: category ?? 'libre',
        birthDate: null,
    };
}

export function ageCategoryLabel(category: AgeCategory | null | undefined): string | null {
    if (!category) return null;
    return AGE_CATEGORY_LABELS[category] ?? null;
}

export function toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatBirthDate(value: string | null): string | null {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}
