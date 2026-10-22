// src/hooks/useLiveRefresh.ts
// Suscripciones a Supabase Realtime para que la UI se actualice al instante
// (ranking, ELO, estado de partidos y desafíos) sin esperar un pull-to-refresh.
//
// Requisitos (BD):
//   - la tabla debe estar en la publicación `supabase_realtime`
//     (ver supabase/migration_2026_10_21_elo_engine.sql)
//   - el RLS de la tabla filtra qué filas recibe cada usuario, así que acá
//     no hace falta filtrar a mano por participant_id.

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type LiveTable =
    | 'profiles'
    | 'matches'
    | 'challenges'
    | 'notifications'
    | 'tournaments'
    | 'messages';

export interface LivePayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    schema: string;
    table: string;
    new: Record<string, any>;
    old: Record<string, any>;
}

/**
 * Llama `onChange(payload)` cada vez que la tabla indicada cambia.
 *
 * @param table   tabla a escuchar
 * @param onChange callback con el payload del cambio
 * @param filter  filtro opcional de PostgREST, ej. `id=eq.<uuid>`
 */
export function useLiveRefresh(
    table: LiveTable,
    onChange: (payload: LivePayload) => void,
    filter?: string,
    enabled = true,
) {
    const cb = useRef(onChange);
    const topicId = useRef(Math.random().toString(36).slice(2, 10));

    useEffect(() => {
        cb.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (!enabled) return;

        const channel = supabase
            .channel(`live:${table}:${filter ?? 'all'}:${topicId.current}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table,
                    ...(filter ? { filter } : {}),
                },
                (payload: any) => {
                    cb.current({
                        eventType: payload.eventType,
                        schema: payload.schema,
                        table: payload.table,
                        new: payload.new ?? {},
                        old: payload.old ?? {},
                    });
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, filter, enabled]);
}
