// src/screens/shared/BetaFeedbackScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';
import { Avatar, Badge, Button, Card } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { showAlert } from '../../services/appAlert';
import {
    getBetaFeedback,
    getMyVotedFeedbackIds,
    getMyReportedFeedbackIds,
    createBetaFeedback,
    voteBetaFeedback,
    removeBetaFeedbackVote,
    reportBetaFeedback,
    type BetaFeedback,
    type FeedbackReportReason,
} from '../../services/betaFeedbackService';

const MAX_LENGTH = 500;

const REPORT_REASONS: {
    value: FeedbackReportReason;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
}[] = [
    { value: 'spam', label: 'Spam o publicidad', icon: 'megaphone-outline' },
    { value: 'ofensivo', label: 'Contenido ofensivo', icon: 'alert-circle-outline' },
    { value: 'acoso', label: 'Acoso o insultos', icon: 'sad-outline' },
    { value: 'otro', label: 'Otro motivo', icon: 'help-circle-outline' },
];

const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
};

// El más votado arriba, en orden decreciente (desempate: el más nuevo).
const sortFeedback = (list: BetaFeedback[]): BetaFeedback[] =>
    [...list].sort(
        (a, b) => b.votes_count - a.votes_count || b.created_at.localeCompare(a.created_at)
    );

export default function BetaFeedbackScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();

    const [feedback, setFeedback] = useState<BetaFeedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [text, setText] = useState('');

    const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
    const [votingIds, setVotingIds] = useState<Set<string>>(new Set());

    const [reportTarget, setReportTarget] = useState<BetaFeedback | null>(null);
    const [reporting, setReporting] = useState(false);

    const loadAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [items, voted, reported] = await Promise.all([
                getBetaFeedback(),
                profile ? getMyVotedFeedbackIds(profile.id) : Promise.resolve(new Set<string>()),
                profile ? getMyReportedFeedbackIds(profile.id) : Promise.resolve(new Set<string>()),
            ]);
            setFeedback(sortFeedback(items));
            setVotedIds(voted);
            setReportedIds(reported);
        } catch (e: any) {
            if (!silent) showAlert('Error', e?.message ?? 'No se pudo cargar los comentarios');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [profile]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Realtime: votos de otros y comentarios nuevos llegan en vivo
    useEffect(() => {
        const sub = supabase
            .channel('beta-feedback-live')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'beta_feedback' },
                (payload: any) => {
                    if (payload.eventType === 'UPDATE') {
                        const upd = payload.new as Partial<BetaFeedback>;
                        if (!upd?.id) return;
                        setFeedback((prev) =>
                            sortFeedback(prev.map((f) => (f.id === upd.id ? { ...f, ...upd } : f)))
                        );
                    } else if (payload.eventType === 'DELETE') {
                        const old = payload.old as Partial<BetaFeedback>;
                        if (!old?.id) return;
                        setFeedback((prev) => prev.filter((f) => f.id !== old.id));
                    } else {
                        // INSERT: recarga silenciosa para traer el autor del join
                        loadAll(true);
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(sub); };
    }, [loadAll]);

    const publish = async () => {
        if (!profile || !text.trim() || posting) return;
        setPosting(true);
        try {
            const created = await createBetaFeedback(profile.id, text);
            setFeedback((prev) => sortFeedback([created, ...prev]));
            setText('');
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'No se pudo publicar tu comentario');
        } finally {
            setPosting(false);
        }
    };

    const toggleVote = async (item: BetaFeedback) => {
        if (!profile || votingIds.has(item.id)) return;
        const voted = votedIds.has(item.id);

        // Optimista: cambia el contador y el estado del botón al instante
        setVotingIds((prev) => new Set(prev).add(item.id));
        setVotedIds((prev) => {
            const next = new Set(prev);
            voted ? next.delete(item.id) : next.add(item.id);
            return next;
        });
        setFeedback((prev) =>
            sortFeedback(
                prev.map((f) =>
                    f.id === item.id
                        ? { ...f, votes_count: Math.max(0, f.votes_count + (voted ? -1 : 1)) }
                        : f
                )
            )
        );

        try {
            voted
                ? await removeBetaFeedbackVote(item.id, profile.id)
                : await voteBetaFeedback(item.id, profile.id);
        } catch (e: any) {
            // Revertir si falla
            setVotedIds((prev) => {
                const next = new Set(prev);
                voted ? next.add(item.id) : next.delete(item.id);
                return next;
            });
            setFeedback((prev) =>
                sortFeedback(
                    prev.map((f) =>
                        f.id === item.id
                            ? { ...f, votes_count: Math.max(0, f.votes_count + (voted ? 1 : -1)) }
                            : f
                    )
                )
            );
            showAlert('Error', e?.message ?? 'No se pudo registrar tu voto');
        } finally {
            setVotingIds((prev) => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }
    };

    const openReport = (item: BetaFeedback) => {
        if (reportedIds.has(item.id)) {
            showAlert('Ya lo reportaste', 'Este comentario ya fue reportado por vos. Gracias por ayudarnos a moderar.');
            return;
        }
        setReportTarget(item);
    };

    const closeReport = () => {
        if (reporting) return;
        setReportTarget(null);
    };

    const confirmReport = async (reason: FeedbackReportReason) => {
        const item = reportTarget;
        if (!item || !profile || reporting) return;
        setReporting(true);
        try {
            await reportBetaFeedback(item.id, profile.id, reason);
            setReportedIds((prev) => new Set(prev).add(item.id));
            setReportTarget(null);
            showAlert('Reporte enviado', 'Gracias por ayudarnos a mejorar la comunidad.');
        } catch (e: any) {
            showAlert('Error', e?.message ?? 'No se pudo enviar el reporte');
        } finally {
            setReporting(false);
        }
    };

    const renderAuthorName = (item: BetaFeedback) =>
        item.author?.full_name?.trim() || item.author?.username || 'Jugador';

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                >
                    <Ionicons name="chevron-back" size={22} color={Colors.onSurface} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>Comentarios Beta</Text>
                        <Badge label="BETA" color={Colors.primaryContainer} textColor={Colors.primary} />
                    </View>
                    <Text style={styles.subtitle}>
                        Sugerí ideas y votá las que querés que veamos primero
                    </Text>
                </View>
            </View>

            {/* ── Composer ── */}
            <Card style={styles.composer}>
                <Text style={styles.composerLabel}>TU COMENTARIO</Text>
                <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="¿Qué podemos mejorar? Contanos tu idea..."
                    placeholderTextColor={Colors.onSurfaceVariant}
                    multiline
                    maxLength={MAX_LENGTH}
                    style={styles.composerInput}
                />
                <View style={styles.composerFooter}>
                    <Text style={styles.charCount}>
                        {text.length}/{MAX_LENGTH}
                    </Text>
                    <Button
                        label={posting ? 'Publicando...' : 'Publicar'}
                        onPress={publish}
                        disabled={!text.trim() || posting}
                        style={styles.publishBtn}
                    />
                </View>
            </Card>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : (
                <FlatList
                    data={feedback}
                    keyExtractor={f => f.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => {
                        const voted = votedIds.has(item.id);
                        const reported = reportedIds.has(item.id);
                        const voting = votingIds.has(item.id);

                        return (
                            <Card style={styles.feedbackCard}>
                                {/* Botón de voto estilo Product Hunt */}
                                <TouchableOpacity
                                    style={[styles.voteBtn, voted && styles.voteBtnActive]}
                                    onPress={() => toggleVote(item)}
                                    disabled={voting}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons
                                        name="caret-up"
                                        size={20}
                                        color={voted ? Colors.onPrimary : Colors.primary}
                                    />
                                    <Text style={[styles.voteCount, voted && styles.voteCountActive]}>
                                        {item.votes_count}
                                    </Text>
                                </TouchableOpacity>

                                <View style={styles.feedbackBody}>
                                    <View style={styles.authorRow}>
                                        <Avatar uri={item.author?.avatar_url} size={28} />
                                        <Text style={styles.authorName}>{renderAuthorName(item)}</Text>
                                        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>

                                        <TouchableOpacity
                                            style={styles.reportBtn}
                                            onPress={() => openReport(item)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={reported ? 'flag' : 'flag-outline'}
                                                size={15}
                                                color={reported ? Colors.error : Colors.onSurfaceVariant}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.content}>{item.content}</Text>
                                </View>
                            </Card>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>
                                Todavía no hay comentarios. ¡Sé el primero en sugerir algo!
                            </Text>
                        </View>
                    }
                />
            )}

            {/* ── Bottom sheet: motivo del reporte ── */}
            <Modal
                visible={!!reportTarget}
                transparent
                animationType="slide"
                onRequestClose={closeReport}
            >
                <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={closeReport}>
                    <TouchableOpacity style={styles.sheet} activeOpacity={1}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Reportar comentario</Text>
                        <Text style={styles.sheetSubtitle}>
                            ¿Por qué querés reportar el comentario de{' '}
                            {reportTarget ? renderAuthorName(reportTarget) : ''}?
                        </Text>

                        {REPORT_REASONS.map(r => (
                            <TouchableOpacity
                                key={r.value}
                                style={styles.reasonRow}
                                onPress={() => confirmReport(r.value)}
                                disabled={reporting}
                                activeOpacity={0.8}
                            >
                                <View style={styles.reasonIconWrap}>
                                    <Ionicons name={r.icon} size={18} color={Colors.primary} />
                                </View>
                                <Text style={styles.reasonLabel}>{r.label}</Text>
                                <Ionicons name="chevron-forward" size={16} color={Colors.outlineVariant} />
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={closeReport}
                            disabled={reporting}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surfaceContainerLow,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitles: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { fontFamily: 'Lexend_700Bold', fontSize: 24, color: Colors.onSurface, letterSpacing: -0.5 },
    subtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    composer: { marginHorizontal: Spacing.xl, gap: Spacing.md },
    composerLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1 },
    composerInput: {
        backgroundColor: Colors.surfaceContainer,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        minHeight: 84,
        textAlignVertical: 'top',
        ...Typography.bodyMd,
        color: Colors.onSurface,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    composerFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.md,
    },
    charCount: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    publishBtn: { paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.xl },

    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },

    feedbackCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
    },

    // Botón de voto vertical (estilo Product Hunt)
    voteBtn: {
        width: 46,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.sm,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLow,
        gap: 0,
    },
    voteBtnActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    voteCount: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 14,
        color: Colors.primary,
        lineHeight: 18,
    },
    voteCountActive: { color: Colors.onPrimary },

    feedbackBody: { flex: 1, gap: Spacing.sm },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    authorName: {
        ...Typography.labelMd,
        color: Colors.onSurface,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        flexShrink: 1,
    },
    timeAgo: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    reportBtn: {
        marginLeft: 'auto',
        width: 30, height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: { ...Typography.bodyMd, color: Colors.onSurface, lineHeight: 22 },

    empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },

    // Bottom sheet de reporte
    sheetOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderTopLeftRadius: Radius.xxl,
        borderTopRightRadius: Radius.xxl,
        padding: Spacing.xl,
        gap: Spacing.sm,
        paddingBottom: Spacing.xxxl,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 40, height: 4,
        borderRadius: 2,
        backgroundColor: Colors.surfaceContainerHigh,
        marginBottom: Spacing.sm,
    },
    sheetTitle: { ...Typography.titleMd, color: Colors.onSurface },
    sheetSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.base,
        paddingHorizontal: Spacing.md,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    reasonIconWrap: {
        width: 32, height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reasonLabel: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1 },
    cancelBtn: {
        alignItems: 'center',
        paddingVertical: Spacing.md,
        marginTop: Spacing.sm,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainer,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    cancelText: { ...Typography.labelLg, color: Colors.onSurface },
});
