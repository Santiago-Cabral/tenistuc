// src/services/notificationService.ts
import { supabase } from '../lib/supabase';

// Tipos que emite la edge function (variables de las alertas que ves): también
// se conservan los legados usados por notifyUser() para no romper nada.
export type NotificationType =
    // Tipos emitidos por la edge function `notify`
    | 'challenge'            // data: { type, challenge_id }
    | 'tournament_new'       // data: { type, tournament_id }
    | 'tournament_start'     // data: { type, tournament_id }
    | 'message'              // data: { type, conversation_id }
    // Tipos legados (notifyUser / código anterior)
    | 'challenge_received'
    | 'challenge_accepted'
    | 'challenge_rejected'
    | 'match_result'
    | 'match_confirmed'
    | 'tournament_registration'
    | 'tournament_update'
    | 'fixture_ready';

export interface NotificationData {
    type?: string;
    challenge_id?: string;
    tournament_id?: string;
    conversation_id?: string;
}

export interface AppNotification {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    related_id: string | null;
    data: NotificationData | null;
    read: boolean;
    read_at: string | null;
    created_at: string;
}

// ----------------------------------------------------------------
// Trae las notificaciones del usuario actual
// ----------------------------------------------------------------
export async function getNotifications(userId: string): Promise<AppNotification[]> {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) throw error;
    return data ?? [];
}

export async function getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);

    if (error) throw error;
    return count ?? 0;
}

export async function markAsRead(notificationId: string) {
    const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

    if (error) throw error;
}

export async function markAllAsRead(userId: string) {
    const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

    if (error) throw error;
}

// ----------------------------------------------------------------
// Crea una notificación in-app PARA OTRO usuario y, si tiene push token
// guardado, le manda también la push. Usar esto en cualquier acción que
// genere una notificación: desafiar a alguien, cargar un resultado, etc.
// El insert se hace vía la RPC notify_user (security definer) que además
// valida que el emisor sea organizer y dueño del torneo relacionado.
// ----------------------------------------------------------------
export async function notifyUser(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    relatedId?: string;
}) {
    const { userId, type, title, body, relatedId } = params;

    const { data: ok, error } = await supabase.rpc('notify_user', {
        p_user_id: userId,
        p_type: type,
        p_title: title,
        p_body: body,
        p_related_id: relatedId ?? null,
        p_data: {
            type,
            tournament_id: relatedId ?? null,
        } as Record<string, any>,
    });

    if (error) throw error;
    if (ok === false) throw new Error('No tenés permisos para notificar a ese usuario');

    // Push best-effort: si falla (sin token, app sin permisos, etc.) no
    // rompemos el flujo principal de la acción que disparó la notificación.
    try {
        await sendPushToUser(userId, title, body, { type, relatedId });
    } catch (e) {
        console.warn('[notificationService] push falló:', e);
    }
}

async function sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, any>,
) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', userId)
        .single();

    if (error || !profile?.expo_push_token) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            to: profile.expo_push_token,
            title,
            body,
            data,
            sound: 'default',
        }),
    });
}