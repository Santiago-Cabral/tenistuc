import { supabase } from '../lib/supabase';
import type { UserRole } from '../stores/authStore';
import type { Level } from '../constants/levels';
import type { AgeCategory } from '../constants/ageCategories';

const USER_COLUMNS =
    'id, username, full_name, avatar_url, role, city, club, elo, level, age_category, gender, bio, wins, losses, created_at';

const TOURNAMENT_COLUMNS =
    'id, name, description, status, max_players, location, starts_at, allowed_gender, allowed_level, prize_money, entry_fee, tournament_type, organizer_id, created_at';

export type AdminGender = 'femenino' | 'masculino' | 'otro';
export type AdminTournamentGender = 'todos' | 'femenino' | 'masculino';
export type AdminTournamentLevel = 'todas' | Level;
export type AdminTournamentStatus = 'upcoming' | 'open' | 'closed' | 'in_progress' | 'completed';

export interface AdminUser {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    role: UserRole;
    city: string | null;
    club: string | null;
    elo: number;
    level: Level;
    age_category: AgeCategory;
    gender: AdminGender | null;
    bio: string | null;
    wins: number;
    losses: number;
    created_at: string;
}

export interface AdminTournament {
    id: string;
    name: string;
    description: string | null;
    status: AdminTournamentStatus;
    max_players: number | null;
    location: string | null;
    starts_at: string | null;
    allowed_gender: AdminTournamentGender;
    allowed_level: AdminTournamentLevel;
    prize_money: number;
    entry_fee: number;
    tournament_type: 'relampago' | 'por_fechas';
    organizer_id: string;
    created_at: string;
}

export interface AdminUserChanges {
    username: string;
    fullName: string;
    role: UserRole;
    city: string;
    club: string;
    elo: number;
    level: Level;
    ageCategory: AgeCategory;
    gender: AdminGender | null;
    bio: string;
}

export interface AdminTournamentChanges {
    name: string;
    description: string;
    status: AdminTournamentStatus;
    maxPlayers: number | null;
    location: string;
    startsAt: string | null;
    allowedGender: AdminTournamentGender;
    allowedLevel: AdminTournamentLevel;
    prizeMoney: number;
    entryFee: number;
}

export async function listUsers(): Promise<AdminUser[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select(USER_COLUMNS)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as AdminUser[];
}

export async function listTournaments(): Promise<AdminTournament[]> {
    const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_COLUMNS)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as AdminTournament[];
}

export async function deleteUser(userId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
    if (error) throw error;
}

export async function updateUser(userId: string, changes: AdminUserChanges): Promise<void> {
    const { error } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_username: changes.username,
        p_full_name: changes.fullName,
        p_role: changes.role,
        p_city: changes.city,
        p_club: changes.club,
        p_elo: changes.elo,
        p_level: changes.level,
        p_age_category: changes.ageCategory,
        p_gender: changes.gender,
        p_bio: changes.bio,
    });
    if (error) throw error;
}

export async function deleteTournament(tournamentId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_tournament', {
        p_tournament_id: tournamentId,
    });
    if (error) throw error;
}

export async function updateTournament(
    tournamentId: string,
    changes: AdminTournamentChanges
): Promise<void> {
    const { error } = await supabase.rpc('admin_update_tournament', {
        p_tournament_id: tournamentId,
        p_name: changes.name,
        p_description: changes.description,
        p_status: changes.status,
        p_max_players: changes.maxPlayers,
        p_location: changes.location,
        p_starts_at: changes.startsAt,
        p_allowed_gender: changes.allowedGender,
        p_allowed_level: changes.allowedLevel,
        p_prize_money: changes.prizeMoney,
        p_entry_fee: changes.entryFee,
    });
    if (error) throw error;
}
