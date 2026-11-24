import { supabase } from '../lib/supabase';

const normalize = (v: any) => (Array.isArray(v) ? v[0] ?? null : v);

type DoublesStatus = 'invited' | 'ready' | 'declined' | 'disbanded';
type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface DoublesProfile {
    id: string;
    role: string;
    full_name: string;
    avatar_url: string | null;
    elo: number;
    level: string;
}

export interface DoublesTeam {
    id: string;
    player1_id: string;
    player2_id: string;
    created_by: string;
    status: DoublesStatus;
    is_permanent: boolean;
    keep_p1: boolean;
    keep_p2: boolean;
    name: string | null;
    elo: number;
    wins: number;
    losses: number;
    created_at: string;
    p1: DoublesProfile | null;
    p2: DoublesProfile | null;
}

export interface DoublesChallenge {
    id: string;
    challenger_team_id: string;
    challenged_team_id: string | null;
    status: ChallengeStatus;
    proposed_date: string | null;
    proposed_venue: string | null;
    message: string | null;
    match_id: string | null;
    created_by: string;
    created_at: string;
    challenger_team: DoublesTeam | null;
    challenged_team: DoublesTeam | null;
}

const PLAYER_FIELDS = 'id, role, full_name, avatar_url, elo, level';

export function isAthleteTeam(team: DoublesTeam | null | undefined): boolean {
    return team?.p1?.role === 'athlete' && team?.p2?.role === 'athlete';
}

export function isAthleteChallenge(challenge: DoublesChallenge | null | undefined): boolean {
    return !!challenge &&
        isAthleteTeam(challenge.challenger_team) &&
        (!challenge.challenged_team || isAthleteTeam(challenge.challenged_team));
}

const TEAM_SELECT = `
    id, player1_id, player2_id, created_by, status, is_permanent,
    keep_p1, keep_p2, name, elo, wins, losses, created_at,
    p1:profiles!doubles_teams_player1_id_fkey(${PLAYER_FIELDS}),
    p2:profiles!doubles_teams_player2_id_fkey(${PLAYER_FIELDS})
`;

const CHALLENGE_SELECT = `
    id, challenger_team_id, challenged_team_id, status,
    proposed_date, proposed_venue, message, match_id, created_by, created_at,
    challenger_team:doubles_teams!doubles_challenges_challenger_team_id_fkey(${TEAM_SELECT}),
    challenged_team:doubles_teams!doubles_challenges_challenged_team_id_fkey(${TEAM_SELECT})
`;

function cleanTeam(raw: any): DoublesTeam | null {
    if (!raw) return null;
    return { ...raw, p1: normalize(raw.p1), p2: normalize(raw.p2) } as DoublesTeam;
}

function cleanChallenge(raw: any): DoublesChallenge | null {
    if (!raw) return null;
    return {
        ...raw,
        challenger_team: cleanTeam(raw.challenger_team),
        challenged_team: cleanTeam(raw.challenged_team),
    } as DoublesChallenge;
}

export async function getMyTeams(userId: string): Promise<DoublesTeam[]> {
    const { data, error } = await supabase
        .from('doubles_teams')
        .select(TEAM_SELECT)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .in('status', ['invited', 'ready'])
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(cleanTeam).filter((t): t is DoublesTeam => !!t);
}

export async function getReceivedInvites(userId: string): Promise<DoublesTeam[]> {
    const { data, error } = await supabase
        .from('doubles_teams')
        .select(TEAM_SELECT)
        .eq('player2_id', userId)
        .eq('status', 'invited')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(cleanTeam).filter((t): t is DoublesTeam => !!t);
}

export async function getPermanentTeams(): Promise<DoublesTeam[]> {
    const { data, error } = await supabase
        .from('doubles_teams')
        .select(TEAM_SELECT)
        .eq('status', 'ready')
        .eq('is_permanent', true)
        .order('elo', { ascending: false });

    if (error) throw error;
    return (data ?? [])
        .map(cleanTeam)
        .filter((t): t is DoublesTeam => !!t && isAthleteTeam(t));
}

export async function getRankedTeams(): Promise<DoublesTeam[]> {
    const { data, error } = await supabase
        .from('doubles_teams')
        .select(TEAM_SELECT)
        .eq('status', 'ready')
        .order('elo', { ascending: false })
        .limit(100);

    if (error) throw error;
    return (data ?? [])
        .map(cleanTeam)
        .filter((t): t is DoublesTeam => !!t && isAthleteTeam(t));
}

export async function getOpenChallenges(): Promise<DoublesChallenge[]> {
    const { data, error } = await supabase
        .from('doubles_challenges')
        .select(CHALLENGE_SELECT)
        .is('challenged_team_id', null)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? [])
        .map(cleanChallenge)
        .filter((c): c is DoublesChallenge => !!c && isAthleteChallenge(c));
}

export async function getDirectChallenges(userId: string): Promise<DoublesChallenge[]> {
    const teams = await supabase
        .from('doubles_teams')
        .select('id')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

    if (teams.error) throw teams.error;
    const ids = (teams.data ?? []).map((t) => t.id as string);
    if (ids.length === 0) return [];

    const [sent, received] = await Promise.all([
        supabase
            .from('doubles_challenges')
            .select(CHALLENGE_SELECT)
            .in('challenger_team_id', ids)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        supabase
            .from('doubles_challenges')
            .select(CHALLENGE_SELECT)
            .in('challenged_team_id', ids)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
    ]);

    if (sent.error) throw sent.error;
    if (received.error) throw received.error;

    const byId = new Map<string, DoublesChallenge>();
    [...(sent.data ?? []), ...(received.data ?? [])].forEach((raw) => {
        const item = cleanChallenge(raw);
        if (item && isAthleteChallenge(item)) byId.set(item.id, item);
    });
    return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function inviteToDoubles(partnerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('invite_to_doubles', { p_partner: partnerId });
    if (error) throw error;
    return data as string;
}

export async function respondDoublesInvite(teamId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_doubles_invite', {
        p_team: teamId,
        p_accept: accept,
    });
    if (error) throw error;
}

export async function keepDoublesTeam(teamId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('keep_doubles_team', { p_team: teamId });
    if (error) throw error;
    return !!data;
}

export async function leaveDoublesTeam(teamId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_doubles_team', { p_team: teamId });
    if (error) throw error;
}

export interface ChallengeDoublesInput {
    teamId: string;
    targetTeamId?: string | null;
    date?: string | null;
    venue?: string | null;
    message?: string | null;
}

export async function challengeDoubles(input: ChallengeDoublesInput): Promise<string> {
    const { data, error } = await supabase.rpc('challenge_doubles', {
        p_team: input.teamId,
        p_target: input.targetTeamId ?? null,
        p_date: input.date ?? null,
        p_venue: input.venue ?? null,
        p_message: input.message ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function acceptDoublesChallenge(challengeId: string, teamId?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('accept_doubles_challenge', {
        p_challenge: challengeId,
        ...(teamId ? { p_team: teamId } : {}),
    });
    if (error) throw error;
    return data as string;
}

export async function rejectDoublesChallenge(challengeId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_doubles_challenge', { p_challenge: challengeId });
    if (error) throw error;
}

export async function cancelDoublesChallenge(challengeId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_doubles_challenge', { p_challenge: challengeId });
    if (error) throw error;
}

export async function getOrCreateDoublesChat(teamId: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_or_create_doubles_chat', {
        p_team: teamId,
    });
    if (error) throw error;
    return data as string;
}
