import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface Challenge {
    id: string;
    challenger_id: string;
    challenged_id: string;
    status: ChallengeStatus;
    proposed_date: string | null;
    proposed_venue: string | null;
    message: string | null;
    match_id: string | null;
    created_at: string;
}

export interface ChallengeWithProfiles extends Challenge {
    challenger: { id: string; full_name: string; avatar_url: string | null; elo: number } | null;
    challenged: { id: string; full_name: string; avatar_url: string | null; elo: number } | null;
}

export interface CreateChallengeData {
    challenged_id: string;
    proposed_date?: string | null;
    proposed_venue?: string | null;
    message?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalize = <T>(val: T | T[]): T | null =>
    Array.isArray(val) ? (val[0] ?? null) : val;

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los retos de un usuario (enviados y recibidos).
 */
export const getChallengesByUser = async (
    userId: string
): Promise<ChallengeWithProfiles[]> => {
    const { data, error } = await supabase
        .from('challenges')
        .select(`
      *,
      challenger:profiles!challenges_challenger_id_fkey(id, full_name, avatar_url, elo),
      challenged:profiles!challenges_challenged_id_fkey(id, full_name, avatar_url, elo)
    `)
        .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((c) => ({
        ...c,
        challenger: normalize(c.challenger),
        challenged: normalize(c.challenged),
    }));
};

/**
 * Obtiene los retos pendientes recibidos por un usuario.
 */
export const getPendingChallenges = async (
    userId: string
): Promise<ChallengeWithProfiles[]> => {
    const { data, error } = await supabase
        .from('challenges')
        .select(`
      *,
      challenger:profiles!challenges_challenger_id_fkey(id, full_name, avatar_url, elo),
      challenged:profiles!challenges_challenged_id_fkey(id, full_name, avatar_url, elo)
    `)
        .eq('challenged_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((c) => ({
        ...c,
        challenger: normalize(c.challenger),
        challenged: normalize(c.challenged),
    }));
};

/**
 * Obtiene un reto por su ID.
 */
export const getChallengeById = async (
    challengeId: string
): Promise<ChallengeWithProfiles | null> => {
    const { data, error } = await supabase
        .from('challenges')
        .select(`
      *,
      challenger:profiles!challenges_challenger_id_fkey(id, full_name, avatar_url, elo),
      challenged:profiles!challenges_challenged_id_fkey(id, full_name, avatar_url, elo)
    `)
        .eq('id', challengeId)
        .single();

    if (error) throw error;
    if (!data) return null;

    return {
        ...data,
        challenger: normalize(data.challenger),
        challenged: normalize(data.challenged),
    };
};

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Envía un nuevo reto a otro jugador.
 */
export const createChallenge = async (
    challengerId: string,
    challengeData: CreateChallengeData
): Promise<Challenge> => {
    const { data, error } = await supabase
        .from('challenges')
        .insert({
            challenger_id: challengerId,
            ...challengeData,
            status: 'pending',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Acepta un reto. Crea automáticamente un match asociado.
 */
export const acceptChallenge = async (
    challengeId: string,
    challengerId: string,
    challengedId: string,
    proposedDate: string | null,
    proposedVenue: string | null
): Promise<void> => {
    // 1. Crear el match
    const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
            player1_id: challengerId,
            player2_id: challengedId,
            created_by: challengedId,
            type: 'challenge',
            status: 'confirmed',
            scheduled_at: proposedDate,
            location: proposedVenue,
        })
        .select()
        .single();

    if (matchError) throw matchError;

    // 2. Actualizar el reto con el match_id y el nuevo status
    const { error: challengeError } = await supabase
        .from('challenges')
        .update({ status: 'accepted', match_id: match.id })
        .eq('id', challengeId);

    if (challengeError) throw challengeError;
};

/**
 * Rechaza un reto.
 */
export const rejectChallenge = async (challengeId: string): Promise<void> => {
    const { error } = await supabase
        .from('challenges')
        .update({ status: 'rejected' })
        .eq('id', challengeId);

    if (error) throw error;
};

/**
 * Cancela un reto (solo el challenger puede cancelar).
 */
export const cancelChallenge = async (challengeId: string): Promise<void> => {
    const { error } = await supabase
        .from('challenges')
        .update({ status: 'cancelled' })
        .eq('id', challengeId);

    if (error) throw error;
};