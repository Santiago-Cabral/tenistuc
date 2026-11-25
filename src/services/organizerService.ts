// src/services/organizerService.ts
import { supabase } from '../lib/supabase';

// ----------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------

export type TournamentType = 'relampago' | 'por_fechas';

/** Estados del torneo que se muestran también a quien quiere inscribirse. */
export const TOURNAMENT_STATUSES = [
    'upcoming', 'open', 'closed', 'in_progress', 'completed',
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
    upcoming: 'Próximamente',
    open: 'Inscripciones abiertas',
    closed: 'Lista cerrada',
    in_progress: 'En juego',
    completed: 'Finalizado',
};

export const TOURNAMENT_STATUS_HINT: Record<TournamentStatus, string> = {
    upcoming: 'Todavía no abrió la inscripción.',
    open: 'Podés inscribirte mientras haya lugares.',
    closed: 'No se aceptan inscripciones nuevas.',
    in_progress: 'El torneo ya comenzó.',
    completed: 'El torneo terminó. Mirá el fixture y los resultados.',
};

export function isRegistrationOpen(status: string): boolean {
    return status === 'open';
}

/** Para quién está diseñado el torneo (restricción de género). */
export type TournamentGender = 'todos' | 'femenino' | 'masculino';

/** Categoría requerida para inscribirse ('todas' = sin restricción). */
export type TournamentLevelFilter = 'todas' | '1era' | '2da' | '3era' | '4era' | '5ta' | '6ta';

export interface Tournament {
    id: string;
    name: string;
    description: string | null;
    status: TournamentStatus;
    image_url: string | null;
    prize_money: number;
    elo_points: number;
    champion_id: string | null;
    champion_match_id: string | null;
    champion_elo: number;
    champion_elo_applied: boolean;
    entry_fee: number;
    max_players: number | null;
    location: string | null;
    starts_at: string | null;
    tournament_type: TournamentType;
    allowed_gender: TournamentGender;
    allowed_level: TournamentLevelFilter;
    organizer_id: string;
    created_at: string;
}

export interface TournamentDate {
    id: string;
    tournament_id: string;
    numero: number;
    starts_at: string; // viernes
    ends_at: string;   // domingo
    location: string | null;
    status: 'pending' | 'in_progress' | 'completed';
    created_at: string;
}

export interface TournamentDateInput {
    numero: number;
    starts_at: string; // viernes (ISO)
    ends_at: string;   // domingo (ISO)
    location?: string;
}

export interface Court {
    id: string;
    organizer_id: string;
    name: string;
    address: string | null;
    surface: 'clay' | 'hard' | 'grass' | 'carpet';
    indoor: boolean;
    notes: string | null;
    created_at: string;
}

export interface PendingPayment {
    id: string; // registration id
    tournament_id: string;
    tournament_name: string;
    player_id: string;
    player_name: string;
    player_avatar: string | null;
    payment_status: 'pending' | 'paid' | 'refunded';
    registered_at: string;
    entry_fee: number;
}

const normalize = (val: any) => (Array.isArray(val) ? val[0] ?? null : val);

// ----------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------
export async function getDashboardStats(organizerId: string) {
    const { data: tournaments, error: tErr } = await supabase
        .from('tournaments')
        .select('id, status, entry_fee')
        .eq('organizer_id', organizerId);

    if (tErr) throw tErr;

    const tournamentIds = (tournaments ?? []).map((t) => t.id);
    const activeTournaments = (tournaments ?? []).filter((t) => t.status !== 'completed').length;

    let totalPlayers = 0;
    let totalRevenue = 0;
    let pendingCount = 0;

    if (tournamentIds.length > 0) {
        const { data: registrations, error: rErr } = await supabase
            .from('tournament_registrations')
            .select('id, tournament_id, payment_status')
            .in('tournament_id', tournamentIds);

        if (rErr) throw rErr;

        totalPlayers = registrations?.length ?? 0;
        pendingCount = (registrations ?? []).filter((r) => r.payment_status === 'pending').length;

        const feeByTournament = new Map((tournaments ?? []).map((t) => [t.id, t.entry_fee ?? 0]));
        totalRevenue = (registrations ?? [])
            .filter((r) => r.payment_status === 'paid')
            .reduce((sum, r) => sum + (feeByTournament.get(r.tournament_id) ?? 0), 0);
    }

    return {
        totalTournaments: tournaments?.length ?? 0,
        activeTournaments,
        totalPlayers,
        totalRevenue,
        pendingPayments: pendingCount,
    };
}

// ----------------------------------------------------------------
// Torneos
// ----------------------------------------------------------------
export async function getMyTournaments(organizerId: string): Promise<Tournament[]> {
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export interface TournamentInput {
    name: string;
    description?: string;
    location?: string;
    starts_at?: string;
    entry_fee?: number;
    max_players?: number;
    prize_money?: number;
    elo_points?: number;
    image_url?: string;
    tournament_type?: TournamentType;
    allowed_gender?: TournamentGender;
    allowed_level?: TournamentLevelFilter;
    status?: TournamentStatus;
}

/**
 * Crea un torneo. Si tournament_type === 'por_fechas', además inserta
 * las filas en tournament_dates (típicamente 5 fines de semana vie-dom).
 */
export async function createTournament(
    organizerId: string,
    input: TournamentInput,
    dates?: TournamentDateInput[],
) {
    const { data, error } = await supabase
        .from('tournaments')
        .insert({
            ...input,
            tournament_type: input.tournament_type ?? 'relampago',
            organizer_id: organizerId,
            status: 'upcoming',
        })
        .select()
        .single();

    if (error) throw error;

    const tournament = data as Tournament;

    if (tournament.tournament_type === 'por_fechas' && dates && dates.length > 0) {
        const rows = dates.map((d) => ({
            tournament_id: tournament.id,
            numero: d.numero,
            starts_at: d.starts_at,
            ends_at: d.ends_at,
            location: d.location ?? null,
        }));

        const { error: datesError } = await supabase.from('tournament_dates').insert(rows);
        if (datesError) throw datesError;
    }

    return tournament;
}

export async function updateTournament(id: string, input: Partial<TournamentInput>) {
    const { data, error } = await supabase
        .from('tournaments')
        .update(input)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as Tournament;
}

export async function deleteTournament(id: string) {
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) throw error;
}

// ----------------------------------------------------------------
// Estado del torneo / lista de inscripción
// ----------------------------------------------------------------
export async function setTournamentStatus(tournamentId: string, status: TournamentStatus) {
    if (!TOURNAMENT_STATUSES.includes(status)) {
        throw new Error('Estado de torneo inválido.');
    }

    const { data, error } = await supabase
        .from('tournaments')
        .update({ status })
        .eq('id', tournamentId)
        .select()
        .single();

    if (error) throw error;
    return data as Tournament;
}

/** Alias usado por el toggle rápido de lista cerrada / abierta. */
export async function setTournamentListStatus(tournamentId: string, status: 'open' | 'closed') {
    return setTournamentStatus(tournamentId, status);
}

// ----------------------------------------------------------------
// Fechas de torneo (circuito tipo ATT: 5 fechas vie-sáb-dom al año)
// ----------------------------------------------------------------
export async function getTournamentDates(tournamentId: string): Promise<TournamentDate[]> {
    const { data, error } = await supabase
        .from('tournament_dates')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('numero', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function updateTournamentDate(id: string, input: Partial<TournamentDateInput & { status: string }>) {
    const { data, error } = await supabase
        .from('tournament_dates')
        .update(input)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as TournamentDate;
}

export async function deleteTournamentDate(id: string) {
    const { error } = await supabase.from('tournament_dates').delete().eq('id', id);
    if (error) throw error;
}

// ----------------------------------------------------------------
// Canchas / sedes
// ----------------------------------------------------------------
export async function getCourts(organizerId: string): Promise<Court[]> {
    const { data, error } = await supabase
        .from('courts')
        .select('*')
        .eq('organizer_id', organizerId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export interface CourtInput {
    name: string;
    address?: string;
    surface: 'clay' | 'hard' | 'grass' | 'carpet';
    indoor: boolean;
    notes?: string;
}

export async function createCourt(organizerId: string, input: CourtInput) {
    const { data, error } = await supabase
        .from('courts')
        .insert({ ...input, organizer_id: organizerId })
        .select()
        .single();

    if (error) throw error;
    return data as Court;
}

export async function updateCourt(id: string, input: Partial<CourtInput>) {
    const { error } = await supabase.from('courts').update(input).eq('id', id);
    if (error) throw error;
}

export async function deleteCourt(id: string) {
    const { error } = await supabase.from('courts').delete().eq('id', id);
    if (error) throw error;
}

// ----------------------------------------------------------------
// Pagos
// ----------------------------------------------------------------
export async function getPayments(organizerId: string): Promise<PendingPayment[]> {
    const { data: tournaments, error: tErr } = await supabase
        .from('tournaments')
        .select('id, name, entry_fee')
        .eq('organizer_id', organizerId);

    if (tErr) throw tErr;

    const tournamentIds = (tournaments ?? []).map((t) => t.id);
    if (tournamentIds.length === 0) return [];

    const feeByTournament = new Map((tournaments ?? []).map((t) => [t.id, t.entry_fee ?? 0]));
    const nameByTournament = new Map((tournaments ?? []).map((t) => [t.id, t.name]));

    const { data, error } = await supabase
        .from('tournament_registrations')
        .select(`
            id, tournament_id, payment_status, registered_at,
            player:profiles!tournament_registrations_player_id_fkey(id, full_name, avatar_url)
        `)
        .in('tournament_id', tournamentIds)
        .order('registered_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((r: any) => {
        const player = normalize(r.player);
        return {
            id: r.id,
            tournament_id: r.tournament_id,
            tournament_name: nameByTournament.get(r.tournament_id) ?? '',
            player_id: player?.id,
            player_name: player?.full_name ?? 'Jugador',
            player_avatar: player?.avatar_url ?? null,
            payment_status: r.payment_status,
            registered_at: r.registered_at,
            entry_fee: feeByTournament.get(r.tournament_id) ?? 0,
        };
    });
}

export async function markPaymentStatus(registrationId: string, status: 'paid' | 'pending' | 'refunded') {
    const { error } = await supabase
        .from('tournament_registrations')
        .update({ payment_status: status })
        .eq('id', registrationId);

    if (error) throw error;
}

/**
 * Quita a un participante de un torneo (organizador).
 * Si el fixture ya se generó, sus partidos quedan sin ese jugador
 * (player1_id/player2_id en null) y se borra la inscripción.
 */
export async function removeParticipant(tournamentId: string, playerId: string, registrationId: string) {
    const { error: m1 } = await supabase
        .from('matches')
        .update({ player1_id: null })
        .eq('tournament_id', tournamentId)
        .eq('player1_id', playerId);
    if (m1) throw m1;

    const { error: m2 } = await supabase
        .from('matches')
        .update({ player2_id: null })
        .eq('tournament_id', tournamentId)
        .eq('player2_id', playerId);
    if (m2) throw m2;

    const { error } = await supabase
        .from('tournament_registrations')
        .delete()
        .eq('id', registrationId);
    if (error) throw error;
}