import { supabase } from '../lib/supabase';
import { TournamentInput, TournamentStatus } from './organizerService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Tournament {
    location: string;
    entry_fee: number;
    max_players: number;
    description: string;
    id: string;
    name: string;
    status: TournamentStatus;
    image_url: string | null;
    prize_money: number;
    elo_points: number;
    starts_at: string | null;
    created_at: string;
}

export interface CreateTournamentData {
    name: string;
    prize_money: number;
    elo_points: number;
    image_url?: string | null;
    starts_at?: string | null;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los torneos, ordenados por fecha de inicio.
 */
export const getTournaments = async (): Promise<Tournament[]> => {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('starts_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
};

/**
 * Obtiene los torneos filtrados por estado.
 */
export const getTournamentsByStatus = async (
    status: TournamentStatus
): Promise<Tournament[]> => {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('status', status)
        .order('starts_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
};

/**
 * Obtiene un torneo por su ID.
 */
export const getTournamentById = async (
    tournamentId: string
): Promise<Tournament | null> => {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

    if (error) throw error;
    return data;
};

/**
 * Obtiene los partidos de un torneo con datos de jugadores.
 */
export const getTournamentMatches = async (tournamentId: string) => {
    const { data, error } = await supabase
        .from('matches')
        .select(`
      *,
      player1:profiles!matches_player1_id_fkey(id, full_name, avatar_url, elo),
      player2:profiles!matches_player2_id_fkey(id, full_name, avatar_url, elo)
    `)
        .eq('tournament_id', tournamentId)
        .order('scheduled_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
};

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Crea un nuevo torneo. Solo organizadores.
 */
export const createTournament = async (
organizerId: string, input: TournamentInput, tournamentData: CreateTournamentData): Promise<Tournament> => {
    const { data, error } = await supabase
        .from('tournaments')
        .insert({ ...tournamentData, status: 'open' })
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Actualiza el estado de un torneo.
 */
export const updateTournamentStatus = async (
    tournamentId: string,
    status: TournamentStatus
): Promise<void> => {
    const { error } = await supabase
        .from('tournaments')
        .update({ status })
        .eq('id', tournamentId);

    if (error) throw error;
};

/**
 * Actualiza datos generales de un torneo.
 */
export const updateTournament = async (
    tournamentId: string,
    updates: Partial<CreateTournamentData>
): Promise<Tournament> => {
    const { data, error } = await supabase
        .from('tournaments')
        .update(updates)
        .eq('id', tournamentId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Elimina un torneo (solo si está en estado 'open').
 */
export const deleteTournament = async (tournamentId: string): Promise<void> => {
    const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tournamentId)
        .eq('status', 'open');

    if (error) throw error;
};