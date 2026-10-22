// src/notifications/notificationNavigation.ts
// Traduce el `data` de una notificación a la pantalla a la que hay que ir.
// Lo comparten el tap del push del sistema y el overlay dinámico.

import { router } from 'expo-router';
import type { NotificationData } from '../services/notificationService';

export function navigateToNotification(data?: NotificationData | null) {
    const targetId =
        data?.challenge_id ??
        data?.tournament_id ??
        data?.conversation_id ??
        data?.match_id;

    switch (data?.type) {
        case 'challenge':
        case 'challenge_received':
        case 'challenge_accepted':
        case 'challenge_rejected':
            targetId
                ? router.push(`/challenge/${targetId}` as any)
                : router.push('/matches' as any);
            break;
        case 'tournament_new':
        case 'tournament_start':
        case 'tournament_update':
        case 'tournament_registration':
        case 'fixture_ready':
            targetId
                ? router.push(`/tournament/${targetId}` as any)
                : router.push('/athleteTabs/tournament' as any);
            break;
        case 'message':
            targetId
                ? router.push(`/chat/${targetId}` as any)
                : router.push('/athleteTabs/messages' as any);
            break;
        case 'match_result':
        case 'match_confirmed':
        case 'match_scheduled':
            router.push('/matches' as any);
            break;
        default:
            router.push('/notifications' as any);
            break;
    }
}
