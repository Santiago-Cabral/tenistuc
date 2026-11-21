// src/services/betaFeedbackService.ts
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeedbackReportReason = 'spam' | 'ofensivo' | 'acoso' | 'otro';

export interface FeedbackAuthor {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
}

export interface BetaFeedback {
    id: string;
    user_id: string;
    content: string;
    votes_count: number;
    created_at: string;
    author: FeedbackAuthor | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalize = <T>(val: T | T[]): T | null =>
    Array.isArray(val) ? (val[0] ?? null) : val;

const AUTHOR_COLUMNS = 'id, full_name, username, avatar_url';

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los comentarios de la beta, ordenados por votos
 * de forma decreciente (el más votado arriba). Desempate: el más nuevo.
 */
export const getBetaFeedback = async (): Promise<BetaFeedback[]> => {
    const { data, error } = await supabase
        .from('beta_feedback')
        .select(`*, author:profiles!beta_feedback_user_id_fkey(${AUTHOR_COLUMNS})`)
        .order('votes_count', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((f) => ({
        ...f,
        author: normalize(f.author),
    }));
};

/**
 * Devuelve los ids de comentarios que el usuario ya votó
 * (para pintar el botón de voto como activo).
 */
export const getMyVotedFeedbackIds = async (userId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
        .from('beta_feedback_votes')
        .select('feedback_id')
        .eq('user_id', userId);

    if (error) throw error;
    return new Set((data ?? []).map((v) => v.feedback_id as string));
};

/**
 * Devuelve los ids de comentarios que el usuario ya reportó
 * (para deshabilitar el botón de reporte).
 */
export const getMyReportedFeedbackIds = async (userId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
        .from('beta_feedback_reports')
        .select('feedback_id')
        .eq('reporter_id', userId);

    if (error) throw error;
    return new Set((data ?? []).map((r) => r.feedback_id as string));
};

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Publica un comentario nuevo en el tablero de la beta.
 */
export const createBetaFeedback = async (
    userId: string,
    content: string
): Promise<BetaFeedback> => {
    const { data, error } = await supabase
        .from('beta_feedback')
        .insert({ user_id: userId, content: content.trim() })
        .select(`*, author:profiles!beta_feedback_user_id_fkey(${AUTHOR_COLUMNS})`)
        .single();

    if (error) throw error;

    return {
        ...data,
        author: normalize(data.author),
    };
};

/**
 * Vota un comentario (un voto por usuario; ignora si ya votó).
 */
export const voteBetaFeedback = async (
    feedbackId: string,
    userId: string
): Promise<void> => {
    const { error } = await supabase
        .from('beta_feedback_votes')
        .upsert(
            { feedback_id: feedbackId, user_id: userId },
            { onConflict: 'feedback_id,user_id', ignoreDuplicates: true }
        );
    if (error) throw error;
};

/**
 * Quita el voto de un comentario.
 */
export const removeBetaFeedbackVote = async (
    feedbackId: string,
    userId: string
): Promise<void> => {
    const { error } = await supabase
        .from('beta_feedback_votes')
        .delete()
        .eq('feedback_id', feedbackId)
        .eq('user_id', userId);
    if (error) throw error;
};

/**
 * Reporta un comentario con un motivo (un reporte por usuario).
 */
export const reportBetaFeedback = async (
    feedbackId: string,
    userId: string,
    reason: FeedbackReportReason
): Promise<void> => {
    const { error } = await supabase
        .from('beta_feedback_reports')
        .upsert(
            { feedback_id: feedbackId, reporter_id: userId, reason },
            { onConflict: 'feedback_id,reporter_id', ignoreDuplicates: true }
        );
    if (error) throw error;
};
