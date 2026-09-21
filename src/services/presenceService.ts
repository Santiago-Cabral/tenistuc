// src/services/presenceService.ts
import { supabase } from '../lib/supabase';

const now = () => new Date().toISOString();

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

// Un usuario se considera "realmente en línea" si su perfil dice is_online=true
// Y last_seen es reciente. last_seen sobrevive a cierres abruptos de la app
// (el flag is_online quedaría en true si el teléfono se mata sin avisar).
export function isActuallyOnline(p?: {
    is_online?: boolean | null;
    last_seen?: string | null;
} | null): boolean {
    if (!p?.is_online) return false;
    if (!p.last_seen) return false;
    return Date.now() - new Date(p.last_seen).getTime() < ONLINE_WINDOW_MS;
}

// Serialización "latest-wins" para is_online: si se disparan markOffline y
// markOnline en rápida sucesión (background → foreground), el ÚLTIMO estado
// deseado gana siempre, aunque las respuestas HTTP lleguen en orden inverso.
let opSeq = 0;
let writeQueue: Promise<unknown> = Promise.resolve();

function apply(userId: string, seq: number, values: Record<string, unknown>) {
    writeQueue = writeQueue
        .then(async () => {
            if (seq !== opSeq) return;
            await supabase
                .from('profiles')
                .update({ ...values, last_seen: now() })
                .eq('id', userId);
        })
        .catch(() => {});
    return writeQueue;
}

export const presenceService = {
    async markOnline(userId: string) {
        const seq = ++opSeq;
        await apply(userId, seq, { is_online: true });
    },

    async markOffline(userId: string) {
        const seq = ++opSeq;
        await apply(userId, seq, { is_online: false });
    },

    // Renueva last_seen sin tocar is_online: sirve de heartbeat para que los
    // demás clientes vean al usuario "fresco" mientras la app está en foco.
    async touch(userId: string) {
        await supabase
            .from('profiles')
            .update({ last_seen: now() })
            .eq('id', userId);
    },
};