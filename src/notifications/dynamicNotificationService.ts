// src/notifications/dynamicNotificationService.ts
// Convierte una fila de la tabla `notifications` en el objeto que consume el
// overlay de notificaciones dinámicas (src/dynamic-notifications).

import type { IDynamicNotification } from '../dynamic-notifications';
import { markAsRead } from '../services/notificationService';
import type { NotificationData } from '../services/notificationService';
import { navigateToNotification } from './notificationNavigation';
import { getNotificationTypeTheme } from './typeTheme';

export interface DynamicNotificationRow {
    id: string;
    type?: string | null;
    title: string;
    body: string;
    data?: NotificationData | null;
    avatar_url?: string | null;
}

/**
 * Arma la notificación del overlay.
 *
 * - Ícono y color salen del tipo de notificación (mismo criterio que la bandeja).
 * - Si la notificación trae el avatar del remitente (chat, desafío), se muestra
 *   en la gota en lugar del ícono genérico.
 * - Al tocarla se marca como leída y se navega a la pantalla correspondiente.
 */
export function toDynamicNotification(
    row: DynamicNotificationRow,
    options?: { onDismiss?: (id: string) => void },
): IDynamicNotification {
    const theme = getNotificationTypeTheme(row.type);
    const avatar = row.data?.avatar_url ?? row.avatar_url ?? undefined;

    return {
        id: row.id,
        title: row.title,
        message: row.body,
        icon: theme.icon,
        accent: theme.fg,
        avatar,
        onPress: () => {
            markAsRead(row.id).catch(() => {});
            navigateToNotification(row.data);
        },
    };
}

/** Notificación de ejemplo (para probar el overlay sin backend). */
export function sampleDynamicNotification(
    onPress?: () => void,
): IDynamicNotification {
    return {
        id: 'sample',
        title: 'Nuevo desafío',
        message: 'Ana te desafió a un partido por puntos',
        icon: 'tennisball',
        accent: '#2D6A4F',
        onPress,
    };
}
