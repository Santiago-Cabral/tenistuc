// src/hooks/usePushNotifications.ts
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

// Cómo se muestra una notificación si llega con la app abierta
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

async function registerForPushToken(): Promise<string | null> {
    if (!Device.isDevice) {
        console.warn('[push] las notificaciones push no funcionan en el simulador');
        return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.warn('[push] permiso de notificaciones denegado');
        return null;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
        });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
}

/**
 * Pide permisos, registra el token de push del dispositivo en el perfil del
 * usuario, y maneja la navegación cuando se toca una notificación push.
 * Llamar una sola vez, típicamente en el _layout raíz una vez que hay sesión.
 */
export function usePushNotifications(userId: string | null | undefined) {
    const router = useRouter();
    const registered = useRef(false);

    useEffect(() => {
        if (!userId || registered.current) return;
        registered.current = true;

        registerForPushToken().then(async (token) => {
            if (!token) return;
            await supabase
                .from('profiles')
                .update({ expo_push_token: token })
                .eq('id', userId);
        });
    }, [userId]);

    useEffect(() => {
        // Notificación tocada con la app en background/cerrada
        const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content.data as {
                type?: string;
                relatedId?: string;
            };
            navigateFromNotification(router, data?.type, data?.relatedId);
        });

        return () => responseSub.remove();
    }, [router]);
}

function navigateFromNotification(router: ReturnType<typeof useRouter>, type?: string, relatedId?: string) {
    if (!relatedId) {
        router.push('/notifications' as any);
        return;
    }

    switch (type) {
        case 'message':
            router.push(`/chat/${relatedId}` as any);
            break;
        case 'challenge_received':
        case 'challenge_accepted':
        case 'challenge_rejected':
            router.push(`/challenge/${relatedId}` as any);
            break;
        case 'tournament_registration':
        case 'tournament_update':
        case 'fixture_ready':
            router.push(`/tournament/${relatedId}` as any);
            break;
        case 'match_result':
        case 'match_confirmed':
            router.push('/matches' as any);
            break;
        default:
            router.push('/notifications' as any);
    }
}