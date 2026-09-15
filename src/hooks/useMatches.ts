// src/hooks/useMatches.ts
// Hook central para gestión de partidos — adaptado al schema real de TenisTuc
// Status flow: pending → in_progress (resultado enviado) → completed (confirmado) | pending (disputado)

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type MatchFormat = 'singles' | 'doubles';
export type MatchType = 'friendly' | 'challenge' | 'tournament' | 'practice';
export type MatchStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface SetScore {
    p1: number;
    p2: number;
}

export interface MatchScore {
    sets: SetScore[];
    winner_id: string | null;
}

export interface MatchPlayer {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    level: string;
}

export interface Match {
    id: string;
    player1_id: string;
    player2_id: string;
    partner1_id: string | null;
    partner2_id: string | null;
    tournament_id: string | null;
    type: MatchType;
    match_format: MatchFormat;
    status: MatchStatus;
    scheduled_at: string | null;
    played_at: string | null;
    confirmed_at: string | null;
    location: string | null;
    score: MatchScore | null;
    elo_delta_p1: number;
    elo_delta_p2: number;
    notes: string | null;
    submitted_by: string | null;
    confirmed_by: string | null;
    disputed_by: string | null;
    dispute_reason: string | null;
    created_at: string;
    // Joins
    player1?: MatchPlayer;
    player2?: MatchPlayer;
    partner1?: MatchPlayer;
    partner2?: MatchPlayer;
}

export interface SubmitResultPayload {
    matchId: string;
    sets: SetScore[];
    winnerId: string;
}

export interface CreateMatchPayload {
    matchFormat?: MatchFormat;
    matchType?: MatchType;
    opponentId: string;
    partnerId?: string;
    opponentPartnerId?: string;
    scheduledAt?: string;
    location?: string;
    tournamentId?: string;
    notes?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLAYER_FIELDS = 'id, full_name, username, avatar_url, elo, level';

const MATCH_SELECT = `
  *,
  player1:profiles!player1_id(${PLAYER_FIELDS}),
  player2:profiles!player2_id(${PLAYER_FIELDS}),
  partner1:profiles!partner1_id(${PLAYER_FIELDS}),
  partner2:profiles!partner2_id(${PLAYER_FIELDS})
`;

// ─── Helpers (sin exports — uso interno) ──────────────────────────────────────

const isParticipant = (match: Match, userId: string): boolean =>
    [match.player1_id, match.player2_id, match.partner1_id, match.partner2_id]
        .filter(Boolean)
        .includes(userId);

const countSetWins = (sets: SetScore[]) => {
    let p1 = 0, p2 = 0;
    sets.forEach(s => { if (s.p1 > s.p2) p1++; else if (s.p2 > s.p1) p2++; });
    return { p1, p2 };
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useMatches = () => {
    const { profile } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async <T>(fn: () => Promise<T>): Promise<T | null> => {
        setLoading(true);
        setError(null);
        try {
            return await fn();
        } catch (e: any) {
            setError(e.message ?? 'Error desconocido');
            return null;
        } finally {
            setLoading(false);
        }
    };

    // ── Obtener partido por ID ──────────────────────────────────────────────────
    const getMatch = useCallback(async (matchId: string): Promise<Match | null> => {
        return run(async () => {
            const { data, error: err } = await supabase
                .from('matches')
                .select(MATCH_SELECT)
                .eq('id', matchId)
                .single();
            if (err) throw err;
            return data as Match;
        });
    }, []);

    // ── Mis partidos (con filtro opcional de status) ────────────────────────────
    const getMyMatches = useCallback(async (statusFilter?: MatchStatus[]): Promise<Match[]> => {
        if (!profile?.id) return [];
        const result = await run(async () => {
            const uid = profile.id;
            let query = supabase
                .from('matches')
                .select(MATCH_SELECT)
                .or(
                    `player1_id.eq.${uid},player2_id.eq.${uid},` +
                    `partner1_id.eq.${uid},partner2_id.eq.${uid}`
                )
                .order('created_at', { ascending: false });

            if (statusFilter?.length) query = query.in('status', statusFilter);

            const { data, error: err } = await query;
            if (err) throw err;
            return (data ?? []) as Match[];
        });
        return result ?? [];
    }, [profile?.id]);

    // ── Crear partido ───────────────────────────────────────────────────────────
    const createMatch = useCallback(async (payload: CreateMatchPayload): Promise<Match | null> => {
        if (!profile?.id) return null;
        return run(async () => {
            const { data, error: err } = await supabase
                .from('matches')
                .insert({
                    player1_id: profile.id,
                    player2_id: payload.opponentId,
                    partner1_id: payload.partnerId ?? null,
                    partner2_id: payload.opponentPartnerId ?? null,
                    match_format: payload.matchFormat ?? 'singles',
                    type: payload.matchType ?? 'friendly',
                    tournament_id: payload.tournamentId ?? null,
                    scheduled_at: payload.scheduledAt ?? null,
                    location: payload.location ?? null,
                    notes: payload.notes ?? null,
                    status: 'pending',
                })
                .select(MATCH_SELECT)
                .single();
            if (err) throw err;
            return data as Match;
        });
    }, [profile?.id]);

    // ── Enviar resultado — status → 'in_progress' ──────────────────────────────
    const submitResult = useCallback(async (payload: SubmitResultPayload): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const match = await getMatch(payload.matchId);
            if (!match) throw new Error('Partido no encontrado');
            if (!isParticipant(match, profile.id)) throw new Error('No sos participante');
            if (match.status === 'completed') throw new Error('El partido ya fue confirmado');
            if (match.status === 'in_progress') throw new Error('Hay un resultado esperando confirmación');
            if (match.status === 'cancelled') throw new Error('El partido fue cancelado');

            const { error: err } = await supabase
                .from('matches')
                .update({
                    score: { sets: payload.sets, winner_id: payload.winnerId },
                    status: 'in_progress',
                    submitted_by: profile.id,
                    played_at: new Date().toISOString(),
                })
                .eq('id', payload.matchId);
            if (err) throw err;
            return true;
        });
        return result === true;
    }, [profile?.id, getMatch]);

    // ── Confirmar resultado — status → 'completed' (dispara ELO en DB) ─────────
    const confirmResult = useCallback(async (matchId: string): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const match = await getMatch(matchId);
            if (!match) throw new Error('Partido no encontrado');
            if (match.status !== 'in_progress') throw new Error('No hay resultado pendiente');
            if (match.submitted_by === profile.id) throw new Error('No podés confirmar tu propio resultado');
            if (!isParticipant(match, profile.id)) throw new Error('No sos participante');

            const { error: err } = await supabase
                .from('matches')
                .update({
                    status: 'completed',
                    confirmed_by: profile.id,
                    confirmed_at: new Date().toISOString(),
                })
                .eq('id', matchId);
            if (err) throw err;
            return true;
        });
        return result === true;
    }, [profile?.id, getMatch]);

    // ── Disputar resultado — resetea a 'pending' ────────────────────────────────
    const disputeResult = useCallback(async (matchId: string, reason: string): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const match = await getMatch(matchId);
            if (!match) throw new Error('Partido no encontrado');
            if (match.status !== 'in_progress') throw new Error('No hay resultado pendiente');
            if (match.submitted_by === profile.id) throw new Error('No podés disputar tu propio resultado');
            if (!isParticipant(match, profile.id)) throw new Error('No sos participante');

            const { error: err } = await supabase
                .from('matches')
                .update({
                    status: 'pending',
                    score: null,
                    submitted_by: null,
                    played_at: null,
                    disputed_by: profile.id,
                    dispute_reason: reason,
                })
                .eq('id', matchId);
            if (err) throw err;
            return true;
        });
        return result === true;
    }, [profile?.id, getMatch]);

    // ── Helpers de UI ───────────────────────────────────────────────────────────

    const getScoreString = useCallback((score: MatchScore | null): string => {
        if (!score?.sets?.length) return 'Sin resultado';
        return score.sets.map(s => `${s.p1}-${s.p2}`).join(', ');
    }, []);

    const getWinnerName = useCallback((match: Match): string => {
        const wid = match.score?.winner_id;
        if (!wid) return '–';
        if (wid === match.player1_id) return match.player1?.full_name ?? 'Jugador 1';
        if (wid === match.player2_id) return match.player2?.full_name ?? 'Jugador 2';
        return '–';
    }, []);

    const canSubmitResult = useCallback((match: Match): boolean => {
        if (!profile?.id) return false;
        if (!isParticipant(match, profile.id)) return false;
        return match.status === 'pending' || match.status === 'confirmed';
    }, [profile?.id]);

    const canConfirmResult = useCallback((match: Match): boolean => {
        if (!profile?.id) return false;
        return (
            match.status === 'in_progress' &&
            match.submitted_by !== profile.id &&
            isParticipant(match, profile.id)
        );
    }, [profile?.id]);

    const canDisputeResult = useCallback((match: Match): boolean => {
        if (!profile?.id) return false;
        return (
            match.status === 'in_progress' &&
            match.submitted_by !== profile.id &&
            isParticipant(match, profile.id)
        );
    }, [profile?.id]);

    const deduceWinner = useCallback((
        sets: SetScore[],
        p1Id: string,
        p2Id: string
    ): string | null => {
        const { p1, p2 } = countSetWins(sets);
        if (p1 > p2) return p1Id;
        if (p2 > p1) return p2Id;
        return null; // empate de sets → usuario elige manualmente
    }, []);

    const getUserSideInMatch = useCallback((match: Match): 'p1' | 'p2' | null => {
        if (!profile?.id) return null;
        if ([match.player1_id, match.partner1_id].includes(profile.id)) return 'p1';
        if ([match.player2_id, match.partner2_id].includes(profile.id)) return 'p2';
        return null;
    }, [profile?.id]);

    return {
        loading,
        error,
        getMatch,
        getMyMatches,
        createMatch,
        submitResult,
        confirmResult,
        disputeResult,
        getScoreString,
        getWinnerName,
        canSubmitResult,
        canConfirmResult,
        canDisputeResult,
        deduceWinner,
        getUserSideInMatch,
    };
};