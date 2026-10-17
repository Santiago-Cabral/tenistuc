// src/services/fixtureService.ts
import { supabase } from '../lib/supabase';

export interface SetScore {
    p1: number;
    p2: number;
}

export interface BracketPlayer {
    id: string;
    full_name: string;
    avatar_url: string | null;
    elo: number;
}

export interface FixtureCourt {
    id: string;
    name: string;
}

export interface FixtureMatch {
    id: string;
    tournament_id: string;
    round: number;
    bracket_position: number;
    player1_id: string | null;
    player2_id: string | null;
    next_match_id: string | null;
    next_match_slot: number | null;
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
    is_bye: boolean;
    score: { sets: SetScore[]; winner_id: string } | null;
    scheduled_at: string | null;
    location: string | null;
    court_id: string | null;
    court?: FixtureCourt | null;
    player1?: BracketPlayer | null;
    player2?: BracketPlayer | null;
}

const normalize = (val: any) => (Array.isArray(val) ? val[0] ?? null : val);

// ----------------------------------------------------------------
// Orden de seeding estándar de torneos (1 vs 8, 2 vs 7, etc. para 8)
// ----------------------------------------------------------------
function seedOrder(size: number): number[] {
    if (size === 1) return [1];
    const prev = seedOrder(size / 2);
    const result: number[] = [];
    prev.forEach((s) => {
        result.push(s);
        result.push(size + 1 - s);
    });
    return result;
}

function nextPowerOfTwo(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

// ----------------------------------------------------------------
// Genera el cuadro completo de un torneo (elimina cualquier intento previo)
// ----------------------------------------------------------------
export async function generateFixture(tournamentId: string, organizerId: string) {
    // 1. Ya hay fixture generado?
    const { data: existing } = await supabase
        .from('matches')
        .select('id')
        .eq('tournament_id', tournamentId)
        .limit(1);

    if (existing && existing.length > 0) {
        throw new Error('Este torneo ya tiene un fixture generado.');
    }

    // 2. Jugadores inscriptos y confirmados, ordenados por ELO desc
    const { data: registrations, error: regError } = await supabase
        .from('tournament_registrations')
        .select('player:profiles!tournament_registrations_player_id_fkey(id, full_name, avatar_url, elo)')
        .eq('tournament_id', tournamentId)
        .eq('payment_status', 'paid');

    if (regError) throw regError;

    const players: BracketPlayer[] = (registrations ?? [])
        .map((r: any) => normalize(r.player))
        .filter(Boolean)
        .sort((a: BracketPlayer, b: BracketPlayer) => b.elo - a.elo);

    if (players.length < 2) {
        throw new Error('Hace falta al menos 2 jugadores confirmados para generar el fixture.');
    }

    const bracketSize = nextPowerOfTwo(players.length);
    const totalRounds = Math.log2(bracketSize);
    const order = seedOrder(bracketSize); // seed -> posición en el cuadro

    // slot (1-indexed) -> jugador real o null (bye)
    const slots: (BracketPlayer | null)[] = order.map((seed) =>
        seed <= players.length ? players[seed - 1] : null
    );

    // 3. Crear partidos de atrás para adelante (final primero) para poder
    //    encadenar next_match_id hacia adelante.
    const matchesByRound: Record<number, { id: string; position: number }[]> = {};

    for (let r = totalRounds; r >= 1; r -= 1) {
        const numMatches = bracketSize / 2 ** r;
        const rows = [];

        for (let p = 1; p <= numMatches; p += 1) {
            let nextMatchId: string | null = null;
            let nextSlot: number | null = null;

            if (r < totalRounds) {
                const nextRoundMatches = matchesByRound[r + 1];
                const nextPosition = Math.ceil(p / 2) - 1;
                nextMatchId = nextRoundMatches[nextPosition].id;
                nextSlot = p % 2 === 1 ? 1 : 2;
            }

            rows.push({
                tournament_id: tournamentId,
                created_by: organizerId,
                type: 'tournament',
                round: r,
                bracket_position: p,
                player1_id: null,
                player2_id: null,
                next_match_id: nextMatchId,
                next_match_slot: nextSlot,
                status: 'pending',
            });
        }

        // supabase-js devuelve las filas insertadas en el mismo orden en que
        // se enviaron dentro del array, así que el índice = posición - 1.
        const { data: inserted, error: insertError } = await supabase
            .from('matches')
            .insert(rows)
            .select('id');

        if (insertError) throw insertError;

        matchesByRound[r] = (inserted ?? []).map((row: any, idx: number) => ({
            id: row.id,
            position: idx + 1,
        }));
    }

    // 4. Llenar la ronda 1 con jugadores reales / byes, y avanzar byes ya mismo
    const round1 = matchesByRound[1];
    const updates: PromiseLike<any>[] = [];
    const byeAdvances: { matchId: string; winnerId: string }[] = [];

    for (let p = 1; p <= round1.length; p += 1) {
        const slotA = slots[(p - 1) * 2];
        const slotB = slots[(p - 1) * 2 + 1];
        const matchRow = round1[p - 1];

        const isBye = !slotA || !slotB;
        const winner = slotA ?? slotB ?? null;

        updates.push(
            supabase
                .from('matches')
                .update({
                    player1_id: slotA?.id ?? null,
                    player2_id: slotB?.id ?? null,
                    is_bye: isBye,
                    status: isBye ? 'completed' : 'pending',
                    played_at: isBye ? new Date().toISOString() : null,
                    score: isBye && winner ? { sets: [], winner_id: winner.id } : null,
                })
                .eq('id', matchRow.id)
                .then((response) => response)
        );

        if (isBye && winner) {
            byeAdvances.push({ matchId: matchRow.id, winnerId: winner.id });
        }
    }

    await Promise.all(updates);

    // 5. Propagar los byes a la ronda 2 (si el cuadro tiene más de una ronda)
    if (totalRounds > 1) {
        const { data: r1Full } = await supabase
            .from('matches')
            .select('id, next_match_id, next_match_slot')
            .in('id', byeAdvances.map((b) => b.matchId));

        const advancePromises = (r1Full ?? []).map((m: any) => {
            const adv = byeAdvances.find((b) => b.matchId === m.id);
            if (!adv || !m.next_match_id) return Promise.resolve();
            const field = m.next_match_slot === 1 ? 'player1_id' : 'player2_id';
            return supabase
                .from('matches')
                .update({ [field]: adv.winnerId })
                .eq('id', m.next_match_id);
        });

        await Promise.all(advancePromises);
    }

    return { bracketSize, totalRounds, byes: bracketSize - players.length };
}

// ----------------------------------------------------------------
// Trae el fixture completo de un torneo, agrupado por ronda
// ----------------------------------------------------------------
export async function getFixture(tournamentId: string): Promise<FixtureMatch[][]> {
    const { data, error } = await supabase
        .from('matches')
        .select(`
            id, tournament_id, round, bracket_position, player1_id, player2_id,
            next_match_id, next_match_slot, status, is_bye, score,
            scheduled_at, location, court_id,
            court:courts!matches_court_id_fkey(id, name),
            player1:profiles!matches_player1_id_fkey(id, full_name, avatar_url, elo),
            player2:profiles!matches_player2_id_fkey(id, full_name, avatar_url, elo)
        `)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('bracket_position', { ascending: true });

    if (error) throw error;

    const matches: FixtureMatch[] = (data ?? []).map((m: any) => ({
        ...m,
        court: normalize(m.court),
        player1: normalize(m.player1),
        player2: normalize(m.player2),
    }));

    const totalRounds = Math.max(...matches.map((m) => m.round), 0);
    const grouped: FixtureMatch[][] = [];
    for (let r = 1; r <= totalRounds; r += 1) {
        grouped.push(matches.filter((m) => m.round === r));
    }
    return grouped;
}

// ----------------------------------------------------------------
// Carga el resultado de un partido (sets tipo tenis) y avanza al ganador
// ----------------------------------------------------------------
export async function submitMatchScore(matchId: string, sets: SetScore[]) {
    if (sets.length === 0) {
        throw new Error('Tenés que cargar al menos un set.');
    }

    const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('id, player1_id, player2_id, next_match_id, next_match_slot')
        .eq('id', matchId)
        .single();

    if (matchError) throw matchError;
    if (!match.player1_id || !match.player2_id) {
        throw new Error('Faltan los dos jugadores para cargar el resultado.');
    }

    const setsWonP1 = sets.filter((s) => s.p1 > s.p2).length;
    const setsWonP2 = sets.filter((s) => s.p2 > s.p1).length;

    if (setsWonP1 === setsWonP2) {
        throw new Error('El resultado no puede terminar empatado.');
    }

    const winnerId = setsWonP1 > setsWonP2 ? match.player1_id : match.player2_id;

    const { error: updateError } = await supabase
        .from('matches')
        .update({
            score: { sets, winner_id: winnerId },
            status: 'completed',
            played_at: new Date().toISOString(),
        })
        .eq('id', matchId);

    if (updateError) throw updateError;

    // Avanzar al ganador a la próxima ronda
    if (match.next_match_id) {
        const field = match.next_match_slot === 1 ? 'player1_id' : 'player2_id';
        const { error: advanceError } = await supabase
            .from('matches')
            .update({ [field]: winnerId })
            .eq('id', match.next_match_id);

        if (advanceError) throw advanceError;
    }

    return { winnerId };
}

// ----------------------------------------------------------------
// Programar un partido: fecha/hora + cancha (opcional) + sede (texto)
// ----------------------------------------------------------------
export interface MatchScheduleInput {
    scheduled_at: string | null;
    court_id: string | null;
    location?: string | null;
}

export async function scheduleMatch(matchId: string, input: MatchScheduleInput) {
    const { error } = await supabase
        .from('matches')
        .update({
            scheduled_at: input.scheduled_at,
            court_id: input.court_id,
            location: input.location ?? null,
        })
        .eq('id', matchId);

    if (error) throw error;
}