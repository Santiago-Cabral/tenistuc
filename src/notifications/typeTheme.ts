// src/notifications/typeTheme.ts
// Un único lugar con el ícono y los colores de cada tipo de notificación.
// Lo usan la bandeja (app/notifications.tsx) y el overlay dinámico.

import { Colors } from '../theme';
import type { NotificationType } from '../services/notificationService';

export interface NotificationTypeTheme {
    icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
    bg: string;
    fg: string;
}

export const NOTIFICATION_TYPE_THEME: Record<NotificationType, NotificationTypeTheme> = {
    challenge: { icon: 'flash', bg: Colors.primaryContainer, fg: Colors.primaryDim },
    challenge_received: { icon: 'flash', bg: Colors.primaryContainer, fg: Colors.primaryDim },
    challenge_accepted: { icon: 'checkmark-circle', bg: Colors.secondaryContainer, fg: Colors.onSecondaryContainer },
    challenge_rejected: { icon: 'close-circle', bg: Colors.errorContainer, fg: Colors.error },
    tournament_new: { icon: 'trophy', bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    tournament_start: { icon: 'flag', bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    tournament_registration: { icon: 'trophy', bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    tournament_update: { icon: 'megaphone', bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    fixture_ready: { icon: 'list', bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    match_scheduled: { icon: 'calendar', bg: Colors.primaryContainer, fg: Colors.primaryDim },
    message: { icon: 'chatbubble', bg: Colors.secondaryContainer, fg: Colors.onSecondaryContainer },
    match_result: { icon: 'tennisball', bg: Colors.primaryContainer, fg: Colors.primaryDim },
    match_confirmed: { icon: 'shield-checkmark', bg: Colors.primaryContainer, fg: Colors.primaryDim },
};

export function getNotificationTypeTheme(type: string | undefined | null): NotificationTypeTheme {
    return (
        (type && NOTIFICATION_TYPE_THEME[type as NotificationType]) || {
            icon: 'notifications',
            bg: Colors.surfaceContainerHigh,
            fg: Colors.onSurfaceVariant,
        }
    );
}
