// src/services/paymentsService.ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

export interface MpStatus {
    connected: boolean;
    mp_user_id: string | null;
    connected_at: string | null;
}

export interface CreatePreferenceResult {
    init_point: string | null;
    already_paid: boolean;
    preference_id?: string;
}

// ----------------------------------------------------------------
// Estado de la cuenta MercadoPago del organizador actual
// ----------------------------------------------------------------
export async function getMyMpStatus(): Promise<MpStatus> {
    const { data, error } = await supabase.rpc('get_my_mp_status');
    if (error) throw error;
    return {
        connected: data?.connected ?? false,
        mp_user_id: data?.mp_user_id ?? null,
        connected_at: data?.connected_at ?? null,
    };
}

export async function disconnectMp() {
    const { error } = await supabase.rpc('disconnect_mp');
    if (error) throw error;
}

// ----------------------------------------------------------------
// Vincular / iniciar sesión de MercadoPago del organizador (OAuth)
// Devuelve el deep link en el que la app debe detectar el regreso
// (tenistuc://mp-oauth). El intercambio de tokens lo hace el server.
// ----------------------------------------------------------------
export async function startMpOAuthFlow(): Promise<{ url: string; returnTo: string }> {
    const { data, error } = await supabase.functions.invoke('mp-oauth-url', { method: 'POST' });
    if (error) throw new Error(typeof error === 'string' ? error : error.message);

    const url: string | undefined = data?.url;
    if (!url) throw new Error('No se pudo generar el enlace de MercadoPago');

    return { url, returnTo: 'tenistuc://mp-oauth' };
}

export async function openMpOAuthUrl(url: string) {
    await WebBrowser.openBrowserAsync(url, {
        enableBarCollapsing: true,
    });
}

export function watchMpOAuthReturn(): { subscribe: (cb: () => void) => () => void } {
    return {
        subscribe: (cb: () => void) => {
            const sub = Linking.addEventListener('url', ({ url }) => {
                if (url.startsWith('tenistuc://mp-oauth')) cb();
            });
            const check = async () => {
                const url = await Linking.getInitialURL();
                if (url?.startsWith('tenistuc://mp-oauth')) cb();
            };
            check();
            return () => sub.remove();
        },
    };
}

// ----------------------------------------------------------------
// Flujo de pago de una inscripción
// ----------------------------------------------------------------
export async function createMpPreference(tournamentId: string): Promise<CreatePreferenceResult> {
    const { data, error } = await supabase.functions.invoke('create-mp-preference', {
        method: 'POST',
        body: { tournament_id: tournamentId },
    });
    if (error) {
        throw new Error(friendlyMpError(await extractEdgeError(error)));
    }
    if (data?.error) {
        throw new Error(friendlyMpError(String(data.error)));
    }
    return {
        init_point: data?.init_point ?? null,
        already_paid: data?.already_paid ?? false,
        preference_id: data?.preference_id,
    };
}

export async function openCheckout(initPoint: string) {
    await WebBrowser.openBrowserAsync(initPoint, {
        enableBarCollapsing: true,
    });
}

export async function checkPayment(tournamentId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('check-mp-payment', {
        method: 'POST',
        body: { tournament_id: tournamentId },
    });
    if (error) throw new Error(await extractEdgeError(error));
    if (data?.error) throw new Error(String(data.error));
    return data?.payment_status ?? 'pending';
}

// supabase-js v2 devuelve en `error.context` el Response del edge function
async function extractEdgeError(error: any): Promise<string> {
    if (typeof error === 'string') return error;
    if (error?.context instanceof Response) {
        try {
            const body = await error.context.json();
            if (body?.error) return String(body.error);
        } catch {
            // el body puede no ser JSON
        }
    }
    return error?.message ?? 'Error desconocido';
}

// traduce errores del edge function a mensajes amigables
function friendlyMpError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('cerrada')) return 'La inscripción para este torneo está cerrada';
    if (lower.includes('cupo')) return 'El torneo alcanzó su cupo máximo';
    if (lower.includes('todavía no vinculó') || lower.includes('mercadopago'))
        return 'El organizador todavía no vinculó su cuenta de MercadoPago';
    return raw;
}