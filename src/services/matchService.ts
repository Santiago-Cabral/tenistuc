import { supabase } from '../lib/supabase';

export type MatchType = 'friendly' | 'competitive' | 'training' | 'tournament' | 'challenge';

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
    friendly: 'Amistoso',
    competitive: 'Competitivo',
    training: 'Entrenamiento',
    tournament: 'Torneo',
    challenge: 'Desafío',
};

// Solo estas dos modalidades afectan el ELO de los jugadores
export const ELO_AFFECTING_TYPES: MatchType[] = ['competitive', 'tournament'];

export const affectsElo = (type: MatchType): boolean =>
    ELO_AFFECTING_TYPES.includes(type);

const matchQuery = `
  id, type, status, scheduled_at, location, notes, score, created_at,
  player1_id, player2_id, created_by,
  submitted_by, played_at, confirmed_by, confirmed_at,
  disputed_by, dispute_reason, elo_delta_p1, elo_delta_p2,
  player1:profiles!matches_player1_id_fkey(id, full_name, avatar_url),
  player2:profiles!matches_player2_id_fkey(id, full_name, avatar_url)
`;

const challengeQuery = `
  id, challenger_id, challenged_id, status, created_at,
  proposed_date, proposed_venue, proposed_by, message, match_id, match_type,
  challenger:profiles!challenges_challenger_id_fkey(id, full_name, avatar_url, elo, is_online, last_seen),
  challenged:profiles!challenges_challenged_id_fkey(id, full_name, avatar_url, elo, is_online, last_seen)
`;

export interface CreateChallengeInput {
    challengedId: string;
    matchType: MatchType;
    proposedDate: string;
    proposedVenue: string;
    message?: string;
}

export interface ReproposeInput {
    challengeId: string;
    proposedDate?: string | null;
    proposedVenue?: string | null;
}

export const matchesService = {
    async getMatches(userId: string) {
        const [
            { data: upcoming, error: upcomingError },
            { data: history, error: historyError },
            { data: challenges, error: challengesError },
        ] = await Promise.all([
            supabase
                .from('matches')
                .select(matchQuery)
                .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
                .in('status', ['pending', 'confirmed', 'in_progress'])
                .order('scheduled_at', { ascending: true }),

            supabase
                .from('matches')
                .select(matchQuery)
                .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
                .eq('status', 'completed')
                .order('played_at', { ascending: false })
                .limit(20),

            supabase
                .from('challenges')
                .select(challengeQuery)
                .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
                .in('status', ['pending'])
                .order('created_at', { ascending: false }),
        ]);

        if (upcomingError) throw upcomingError;
        if (historyError) throw historyError;
        if (challengesError) throw challengesError;

        return {
            upcoming: upcoming ?? [],
            history: history ?? [],
            challenges: challenges ?? [],
        };
    },

    async scheduleMatch(matchId: string, date: Date | null, venue: string | null) {
        const { error } = await supabase
            .from('matches')
            .update({
                scheduled_at: date ? date.toISOString() : null,
                location: venue,
            })
            .eq('id', matchId);

        if (error) throw error;
    },

    async submitResult(matchId: string, myId: string, sets: { p1: number; p2: number }[], winnerId: string) {
        const { error } = await supabase
            .from('matches')
            .update({
                score: { sets, winner_id: winnerId },
                status: 'in_progress',
                submitted_by: myId,
                played_at: new Date().toISOString(),
            })
            .eq('id', matchId);

        if (error) throw error;
    },

    async confirmResult(matchId: string, myId: string) {
        const { error } = await supabase
            .from('matches')
            .update({
                status: 'completed',
                confirmed_by: myId,
                confirmed_at: new Date().toISOString(),
            })
            .eq('id', matchId);

        if (error) throw error;
    },

    async disputeResult(matchId: string, myId: string, reason: string) {
        const { error } = await supabase
            .from('matches')
            .update({
                status: 'pending',
                score: null,
                submitted_by: null,
                played_at: null,
                disputed_by: myId,
                dispute_reason: reason.trim(),
            })
            .eq('id', matchId);

        if (error) throw error;
    },

    async confirmPendingMatch(matchId: string) {
        const { error } = await supabase
            .from('matches')
            .update({ status: 'confirmed' })
            .eq('id', matchId);

        if (error) throw error;
    },

    async cancelMatch(matchId: string) {
        const { error } = await supabase
            .from('matches')
            .update({ status: 'cancelled' })
            .eq('id', matchId);

        if (error) throw error;
    },

    // ── Crear reto — exige modalidad, fecha y lugar ─────────────────────────────
    async createChallenge(challengerId: string, input: CreateChallengeInput) {
        const { data: existing } = await supabase
            .from('challenges')
            .select('id')
            .or(
                `and(challenger_id.eq.${challengerId},challenged_id.eq.${input.challengedId}),` +
                `and(challenger_id.eq.${input.challengedId},challenged_id.eq.${challengerId})`
            )
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            throw new Error('Ya existe un reto pendiente con este jugador');
        }

        const { data, error } = await supabase
            .from('challenges')
            .insert({
                challenger_id: challengerId,
                challenged_id: input.challengedId,
                match_type: input.matchType,
                proposed_date: input.proposedDate,
                proposed_venue: input.proposedVenue,
                proposed_by: challengerId,
                message: input.message ?? null,
                status: 'pending',
            })
            .select(challengeQuery)
            .single();

        if (error) throw error;
        return data;
    },

    // ── Reproponer fecha/lugar — quien no hizo la última propuesta puede mover ──
    async reproposeChallenge(input: ReproposeInput, myId: string) {
        const { data: challenge, error: fetchError } = await supabase
            .from('challenges')
            .select('*')
            .eq('id', input.challengeId)
            .single();
        if (fetchError || !challenge) throw new Error('Reto no encontrado');
        if (challenge.status !== 'pending') throw new Error('El reto ya no está pendiente');
        if (![challenge.challenger_id, challenge.challenged_id].includes(myId)) {
            throw new Error('No participás en este reto');
        }

        const updates: Record<string, any> = { proposed_by: myId };
        if (input.proposedDate !== undefined) updates.proposed_date = input.proposedDate;
        if (input.proposedVenue !== undefined) updates.proposed_venue = input.proposedVenue;

        const { error } = await supabase
            .from('challenges')
            .update(updates)
            .eq('id', input.challengeId);
        if (error) throw error;
    },

    // ── Aceptar — el que hizo la última propuesta no puede aceptar la suya propia
    async acceptChallenge(challenge: any, currentUserId: string) {
        if (challenge.proposed_by === currentUserId) {
            throw new Error('Ya hiciste la última propuesta, esperá que el otro jugador confirme');
        }

        const matchType: MatchType = challenge.match_type ?? 'friendly';

        const { data: match, error: matchError } = await supabase
            .from('matches')
            .insert({
                player1_id: challenge.challenger_id,
                player2_id: challenge.challenged_id,
                created_by: currentUserId,
                type: matchType,
                status: 'confirmed',
                scheduled_at: challenge.proposed_date ?? null,
                location: challenge.proposed_venue ?? null,
                notes: challenge.message ?? null,
            })
            .select('id')
            .single();

        if (matchError) throw matchError;

        const { error: challengeError } = await supabase
            .from('challenges')
            .update({ status: 'accepted', match_id: match.id })
            .eq('id', challenge.id);

        if (challengeError) throw challengeError;

        return match;
    },

    async rejectChallenge(challengeId: string) {
        const { error } = await supabase
            .from('challenges')
            .update({ status: 'rejected' })
            .eq('id', challengeId);

        if (error) throw error;
    },

    async getOrCreateConversation(myId: string, otherId: string): Promise<string | null> {
        const { data: existing, error: existingError } = await supabase
            .from('conversations')
            .select('id')
            .or(
                `and(participant1_id.eq.${myId},participant2_id.eq.${otherId}),and(participant1_id.eq.${otherId},participant2_id.eq.${myId})`
            )
            .maybeSingle();

        if (existingError) throw existingError;
        if (existing?.id) return existing.id;

        const { data: created, error: createError } = await supabase
            .from('conversations')
            .insert({
                participant1_id: myId,
                participant2_id: otherId,
            })
            .select('id')
            .single();

        if (createError) throw createError;
        return created?.id ?? null;
    },
};