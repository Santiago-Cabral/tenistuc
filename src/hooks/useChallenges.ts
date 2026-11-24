// src/hooks/useChallenges.ts
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { MatchType } from '@/services/matchService'; // ajustá el path si tu archivo está en otro lado

export type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface ChallengeProfile {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    level: string;
    is_online?: boolean;
    last_seen?: string | null;
}

export interface Challenge {
    id: string;
    challenger_id: string;
    challenged_id: string;
    match_id: string | null;
    match_type: MatchType;
    status: ChallengeStatus;
    proposed_date: string | null;
    proposed_venue: string | null;
    proposed_by: string | null;
    message: string | null;
    created_at: string;
    challenger?: ChallengeProfile;
    challenged?: ChallengeProfile;
    match_format?: 'singles' | 'doubles' | null;
    team1_id?: string | null;
    team2_id?: string | null;
    partner1_id?: string | null;
    partner2_id?: string | null;
    challenger_partner_id?: string | null;
    challenged_partner_id?: string | null;
    challenger_team_id?: string | null;
    challenged_team_id?: string | null;
    partner1?: ChallengeProfile | null;
    partner2?: ChallengeProfile | null;
}

export interface CreateChallengePayload {
    challengedId: string;
    matchType: MatchType;     // obligatorio ahora
    proposedDate: string;     // obligatorio
    proposedVenue: string;    // obligatorio
    message?: string;
}

export interface ReproposePayload {
    challengeId: string;
    proposedDate?: string | null;
    proposedVenue?: string | null;
}

const PROFILE_FIELDS = 'id, full_name, username, avatar_url, elo, level, is_online, last_seen';

const CHALLENGE_SELECT = `
  *,
  challenger:profiles!challenges_challenger_id_fkey(${PROFILE_FIELDS}),
  challenged:profiles!challenges_challenged_id_fkey(${PROFILE_FIELDS})
`;

export const useChallenges = () => {
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

    const getChallenge = useCallback(async (challengeId: string): Promise<Challenge | null> => {
        setError(null);
        try {
            const { data, error: err } = await supabase
                .from('challenges')
                .select(CHALLENGE_SELECT)
                .eq('id', challengeId)
                .single();
            if (err) throw err;
            return data as Challenge;
        } catch (e: any) {
            setError(e.message ?? 'Error desconocido');
            return null;
        }
    }, []);

    const getMyChallenges = useCallback(async (
        statusFilter: ChallengeStatus[] = ['pending']
    ): Promise<Challenge[]> => {
        if (!profile?.id) return [];
        const result = await run(async () => {
            const { data, error: err } = await supabase
                .from('challenges')
                .select(CHALLENGE_SELECT)
                .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
                .in('status', statusFilter)
                .order('created_at', { ascending: false });
            if (err) throw err;
            return (data ?? []) as Challenge[];
        });
        return result ?? [];
    }, [profile?.id]);

    // ── Crear reto — ahora exige modalidad, fecha y lugar ──────────────────────
    const createChallenge = useCallback(async (
        payload: CreateChallengePayload
    ): Promise<Challenge | null> => {
        if (!profile?.id) return null;

        const { data: existing } = await supabase
            .from('challenges')
            .select('id')
            .or(
                `and(challenger_id.eq.${profile.id},challenged_id.eq.${payload.challengedId}),` +
                `and(challenger_id.eq.${payload.challengedId},challenged_id.eq.${profile.id})`
            )
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            setError('Ya existe un reto pendiente con este jugador');
            return null;
        }

        return run(async () => {
            const { data, error: err } = await supabase
                .from('challenges')
                .insert({
                    challenger_id: profile.id,
                    challenged_id: payload.challengedId,
                    match_type: payload.matchType,
                    proposed_date: payload.proposedDate,
                    proposed_venue: payload.proposedVenue,
                    proposed_by: profile.id,
                    message: payload.message ?? null,
                    status: 'pending',
                })
                .select(CHALLENGE_SELECT)
                .single();
            if (err) throw err;
            return data as Challenge;
        });
    }, [profile?.id]);

    // ── Reproponer fecha/lugar — el que NO hizo la última propuesta puede mover ─
    const reproposeChallenge = useCallback(async (
        payload: ReproposePayload
    ): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const { data: challenge, error: fetchErr } = await supabase
                .from('challenges')
                .select('*')
                .eq('id', payload.challengeId)
                .single();
            if (fetchErr || !challenge) throw new Error('Reto no encontrado');
            if (challenge.status !== 'pending') throw new Error('El reto ya no está pendiente');
            if (![challenge.challenger_id, challenge.challenged_id].includes(profile.id)) {
                throw new Error('No participás en este reto');
            }

            const updates: Record<string, any> = { proposed_by: profile.id };
            if (payload.proposedDate !== undefined) updates.proposed_date = payload.proposedDate;
            if (payload.proposedVenue !== undefined) updates.proposed_venue = payload.proposedVenue;

            const { error: updErr } = await supabase
                .from('challenges')
                .update(updates)
                .eq('id', payload.challengeId);
            if (updErr) throw updErr;
            return true;
        });
        return result === true;
    }, [profile?.id]);

    // ── Aceptar — no podés aceptar tu propia última propuesta ───────────────────
    const acceptChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const { data: challenge, error: fetchErr } = await supabase
                .from('challenges')
                .select('*')
                .eq('id', challengeId)
                .single();
            if (fetchErr || !challenge) throw new Error('Reto no encontrado');
            if (challenge.status !== 'pending') throw new Error('El reto ya no está pendiente');
            if (![challenge.challenger_id, challenge.challenged_id].includes(profile.id)) {
                throw new Error('No participás en este reto');
            }
            if (challenge.proposed_by === profile.id) {
                throw new Error('Ya hiciste la última propuesta, esperá que el otro jugador confirme');
            }

            const { data: match, error: matchErr } = await supabase
                .from('matches')
                .insert({
                    player1_id: challenge.challenger_id,
                    player2_id: challenge.challenged_id,
                    created_by: profile.id,
                    type: challenge.match_type ?? 'friendly',
                    status: 'confirmed',
                    scheduled_at: challenge.proposed_date ?? null,
                    location: challenge.proposed_venue ?? null,
                    notes: challenge.message ?? null,
                })
                .select('id')
                .single();
            if (matchErr) throw matchErr;

            const { error: updErr } = await supabase
                .from('challenges')
                .update({ status: 'accepted', match_id: match.id })
                .eq('id', challengeId);
            if (updErr) throw updErr;

            return true;
        });
        return result === true;
    }, [profile?.id]);

    const rejectChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const { error: err } = await supabase
                .from('challenges')
                .update({ status: 'rejected' })
                .eq('id', challengeId)
                .eq('challenged_id', profile.id);
            if (err) throw err;
            return true;
        });
        return result === true;
    }, [profile?.id]);

    const cancelChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
        if (!profile?.id) return false;
        const result = await run(async () => {
            const { error: err } = await supabase
                .from('challenges')
                .update({ status: 'expired' })
                .eq('id', challengeId)
                .eq('challenger_id', profile.id)
                .eq('status', 'pending');
            if (err) throw err;
            return true;
        });
        return result === true;
    }, [profile?.id]);

    const getPendingCount = useCallback(async (): Promise<number> => {
        if (!profile?.id) return 0;
        const { count } = await supabase
            .from('challenges')
            .select('id', { count: 'exact', head: true })
            .eq('challenged_id', profile.id)
            .eq('status', 'pending');
        return count ?? 0;
    }, [profile?.id]);

    return {
        loading,
        error,
        getChallenge,
        getMyChallenges,
        createChallenge,
        reproposeChallenge,
        acceptChallenge,
        rejectChallenge,
        cancelChallenge,
        getPendingCount,
    };
};