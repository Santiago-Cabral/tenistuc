// src/theme/index.ts

export const Colors = {
    // Brand
    primary: '#2D6A4F',
    primaryDim: '#1B4332',
    primaryContainer: '#B7E4C7',
    primaryFixed: '#D8F3DC',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#0A3D22',

    secondary: '#52796F',
    secondaryContainer: '#CAE8DF',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#0D3329',

    tertiary: '#74712E',
    tertiaryContainer: '#FDFAAD',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#3C390B',

    // Surfaces
    surface: '#F8FAF9',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F2F5F3',
    surfaceContainer: '#EEF2F0',
    surfaceContainerHigh: '#E4EAE7',
    surfaceContainerHighest: '#D9E1DD',
    onSurface: '#191C1A',
    onSurfaceVariant: '#3F4945',

    // States
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    onError: '#FFFFFF',

    // Misc
    outline: '#6F7972',
    outlineVariant: '#BFC9C3',
    scrim: 'rgba(0,0,0,0.4)',
} as const;

export const Typography = {
    displayLg: { fontFamily: 'Lexend_700Bold', fontSize: 57, lineHeight: 64 },
    displayMd: { fontFamily: 'Lexend_700Bold', fontSize: 45, lineHeight: 52 },
    displaySm: { fontFamily: 'Lexend_600SemiBold', fontSize: 36, lineHeight: 44 },

    headlineLg: { fontFamily: 'Lexend_600SemiBold', fontSize: 32, lineHeight: 40 },
    headlineMd: { fontFamily: 'Lexend_600SemiBold', fontSize: 28, lineHeight: 36 },
    headlineSm: { fontFamily: 'Lexend_500Medium', fontSize: 24, lineHeight: 32 },

    titleLg: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 22, lineHeight: 28 },
    titleMd: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, lineHeight: 24 },
    titleSm: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, lineHeight: 20 },

    bodyLg: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 16, lineHeight: 24 },
    bodyMd: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 20 },
    bodySm: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, lineHeight: 16 },

    labelLg: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, lineHeight: 20 },
    labelMd: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 16 },
    labelSm: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 16 },
} as const;

export const Spacing = {
    xs: 2,
    sm: 4,
    md: 8,
    base: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    xxxxl: 40,
} as const;

export const Radius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    full: 9999,
} as const;

export const Shadow = {
    ambient: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    float: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 12,
        elevation: 6,
    },
} as const;