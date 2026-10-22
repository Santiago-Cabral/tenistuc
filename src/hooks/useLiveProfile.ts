// src/hooks/useLiveProfile.ts
// Mantiene el perfil propio (ELO, wins, losses, nivel) sincronizado en vivo.
//
// Cuando el motor de ELO de la BD actualiza `profiles.elo` al confirmar un
// partido, este hook.patchea el store al instante: el header, el panel de
// puntos y el winrate se actualizan sin recargar la pantalla.

import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLiveRefresh, LivePayload } from './useLiveRefresh';

// Campos del perfil que nos interesan para la UI en vivo.
// `expo_push_token` queda deliberadamente afuera.
const LIVE_FIELDS = [
    'elo',
    'wins',
    'losses',
    'level',
    'username',
    'full_name',
    'avatar_url',
    'city',
    'club',
    'play_style',
    'bio',
] as const;

export function useLiveProfile() {
    const session = useAuthStore((s) => s.session);
    const patchProfile = useAuthStore((s) => s.patchProfile);
    const userId = session?.user?.id ?? null;

    const onChange = useCallback(
        (payload: LivePayload) => {
            if (payload.eventType === 'DELETE') return;
            const row = payload.new;
            if (!row?.id) return;

            const patch: Record<string, unknown> = {};
            for (const field of LIVE_FIELDS) {
                if (row[field] !== undefined) patch[field] = row[field];
            }
            if (Object.keys(patch).length === 0) return;

            patchProfile(patch as any);
        },
        [patchProfile],
    );

    useLiveRefresh(
        'profiles',
        onChange,
        userId ? `id=eq.${userId}` : undefined,
        !!userId,
    );
}
