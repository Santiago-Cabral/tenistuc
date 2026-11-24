// src/hooks/useDynamicNotificationFeed.ts
//
// Conecta la tabla `notifications` de Supabase con el overlay de
// notificaciones dinámicas (src/dynamic-notifications).
//
// · Realtime INSERT → la notificación cae desde arriba, con el efecto gooey.
// · Al abrir la app → si quedó alguna sin leer de la sesión anterior, se
//   muestra la más reciente (una sola vez).

import { useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useDynamicNotifications } from '../dynamic-notifications';
import {
    toDynamicNotification,
    type DynamicNotificationRow,
} from '../notifications/dynamicNotificationService';

const LAST_SHOWN_KEY = 'tenistuc:last-dynamic-notification';

/** Evita mostrar dos veces la misma notificación (carrera entre realtime y fetch). */
const shownIds = new Set<string>();

export function useDynamicNotificationFeed(enabled = true) {
    const { session } = useAuthStore();
    const { trigger } = useDynamicNotifications();
    const userId = session?.user?.id ?? null;

    const showRow = useCallback(
        (row: DynamicNotificationRow) => {
            if (!row?.id) return;
            if (shownIds.has(row.id)) return;

            shownIds.add(row.id);
            // La lista es corta: la podamos para que no crezca sin límite.
            if (shownIds.size > 20) {
                const first = shownIds.values().next().value;
                if (first) shownIds.delete(first);
            }

            AsyncStorage.setItem(LAST_SHOWN_KEY, row.id).catch(() => {});
            trigger(toDynamicNotification(row));
        },
        [trigger],
    );

    // ── Realtime: cada INSERT en `notifications` se muestra en pantalla ────────
    useEffect(() => {
        if (!enabled || !userId) return;

        const channel = supabase
            .channel(`dynamic-notifications:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const row = payload.new as DynamicNotificationRow;
                    if (!row?.id) return;
                    showRow(row);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [enabled, userId, showRow]);

    // ── Al abrir la app: mostrar la sin leer más reciente (una sola vez) ───────
    useEffect(() => {
        if (!enabled || !userId) return;

        let cancelled = false;

        (async () => {
            try {
                const [lastShown, { data }] = await Promise.all([
                    AsyncStorage.getItem(LAST_SHOWN_KEY),
                    supabase
                        .from('notifications')
                        .select('id, type, title, body, data')
                        .eq('user_id', userId)
                        .eq('read', false)
                        .order('created_at', { ascending: false })
                        .limit(1),
                ]);

                if (cancelled) return;

                const row = data?.[0] as DynamicNotificationRow | undefined;
                if (!row?.id) return;
                if (row.id === lastShown) return;

                showRow(row);
            } catch (e) {
                console.warn('[DynamicNotifications] no se pudo leer la pendiente:', e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, userId, showRow]);
}
