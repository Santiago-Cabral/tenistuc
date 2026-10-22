import { Colors } from '../theme';

/**
 * Paleta del overlay de notificaciones dinámicas.
 * Los colores vienen del tema de la app para que el overlay se vea nativo.
 */
export const PALETTE = {
    /** La "isla" de la que cae la gota. */
    island: Colors.primary,
    /** Fondo de la tarjeta de contenido. */
    card: '#FFFFFF',
    /** Color por defecto del título. */
    accent: Colors.primary,
    /** Color del texto secundario. */
    message: Colors.onSurfaceVariant,
    /** Fondo del placeholder del avatar. */
    avatar: Colors.surfaceContainerHigh,
    /** Sombra de la tarjeta. */
    shadow: 'rgba(10, 30, 20, 0.22)',
} as const;
