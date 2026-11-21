// src/screens/athlete/RankingScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, Alert, RefreshControl,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';
import { Avatar, Badge, Card, SkeletonList } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ageCategoryLabel, type AgeCategory } from '../../constants/ageCategories';
import { LEVELS, type Level } from '../../constants/levels';
import { useLiveRefresh, LivePayload } from '../../hooks/useLiveRefresh';
import CreateChallengeModal from '../../components/challenges/CreateChallengeModal';

interface RankedPlayer {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
    city: string | null;
    elo: number;
    level: Level | null;
    gender: 'femenino' | 'masculino' | 'otro' | null;
    age_category: AgeCategory | null;
    wins: number;
    losses: number;
}

type GenderFilter = 'all' | 'femenino' | 'masculino';
type LevelFilter = Level | 'all';

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
    { value: 'all', label: 'General' },
    { value: 'femenino', label: 'Mujeres' },
    { value: 'masculino', label: 'Hombres' },
];

const LEVEL_OPTIONS: { value: LevelFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    ...LEVELS.map(level => ({ value: level, label: level })),
];

const GENDER_LABELS: Record<string, string> = {
    femenino: 'Mujer',
    masculino: 'Hombre',
    otro: 'Otro',
};

export default function RankingScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [players, setPlayers] = useState<RankedPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
    const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
    const didInitialLoad = useRef(false);

    const [selectedRival, setSelectedRival] = useState<RankedPlayer | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [notifying, setNotifying] = useState(false);

    const loadPlayers = useCallback(async () => {
        if (!didInitialLoad.current) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            let query = supabase
                .from('profiles')
                .select('id, full_name, username, avatar_url, city, elo, level, gender, age_category, wins, losses');

            if (genderFilter !== 'all') {
                query = query.eq('gender', genderFilter);
            }
            if (levelFilter !== 'all') {
                query = query.eq('level', levelFilter);
            }

            const { data, error } = await query
                .order('elo', { ascending: false })
                .limit(100);

            if (error) {
                showAlert('Error', 'No se pudo cargar el ranking');
            } else if (data) {
                setPlayers(data as RankedPlayer[]);
            }
        } finally {
            didInitialLoad.current = true;
            setLoading(false);
            setRefreshing(false);
        }
    }, [genderFilter, levelFilter]);

    useEffect(() => { loadPlayers(); }, [loadPlayers]);

    // ── Actualización en vivo ──────────────────────────────────────────────────
    // Cuando el motor de ELO de la BD mueve el ELO de alguien (al confirmar
    // un partido por puntos), el ranking se reordena al instante, sin pull.
    const applyLiveProfile = useCallback((payload: LivePayload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new;
        if (!row?.id) return;

        setPlayers((prev) => {
            const idx = prev.findIndex((p) => p.id === row.id);
            const current = idx >= 0 ? prev[idx] : null;
            const nextGender = row.gender ?? current?.gender ?? null;
            const nextLevel = row.level ?? current?.level ?? null;

            const matchesFilters =
                (genderFilter === 'all' || nextGender === genderFilter) &&
                (levelFilter === 'all' || nextLevel === levelFilter);

            if (!matchesFilters) {
                return idx >= 0 ? prev.filter(p => p.id !== row.id) : prev;
            }

            const next =
                idx >= 0
                    ? prev.map((p, i) =>
                        i === idx
                            ? {
                                ...p,
                                elo: row.elo ?? p.elo,
                                wins: row.wins ?? p.wins,
                                losses: row.losses ?? p.losses,
                                level: (row.level ?? p.level) as Level | null,
                                gender: row.gender ?? p.gender,
                                age_category: row.age_category ?? p.age_category,
                                full_name: row.full_name ?? p.full_name,
                                avatar_url: row.avatar_url ?? p.avatar_url,
                            }
                            : p,
                    )
                    : [
                        ...prev,
                        {
                            id: row.id,
                            full_name: row.full_name ?? row.username ?? 'Jugador',
                            username: row.username ?? '',
                            avatar_url: row.avatar_url ?? null,
                            city: row.city ?? null,
                            elo: row.elo ?? 1000,
                            level: (row.level ?? '6ta') as Level,
                            gender: row.gender ?? null,
                            age_category: row.age_category ?? null,
                            wins: row.wins ?? 0,
                            losses: row.losses ?? 0,
                        },
                    ];

            return [...next]
                .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
                .slice(0, 100);
        });
    }, [genderFilter, levelFilter]);

    useLiveRefresh('profiles', applyLiveProfile);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadPlayers();
        setRefreshing(false);
    }, [loadPlayers]);

    const openChallengeModal = (player: RankedPlayer) => {
        if (player.id === profile?.id) return;
        setSelectedRival(player);
        setModalVisible(true);
    };

    const closeChallengeModal = () => {
        setModalVisible(false);
        setSelectedRival(null);
    };

    // Crea/encuentra la conversación y avisa por chat, igual que en RivalsScreen.
    const notifyByChat = async (challengeId: string, rival: RankedPlayer) => {
        if (!profile) return null;
        setNotifying(true);
        try {
            const p1 = profile.id < rival.id ? profile.id : rival.id;
            const p2 = profile.id < rival.id ? rival.id : profile.id;

            const { data: existingConv, error: convSelectErr } = await supabase
                .from('conversations')
                .select('id')
                .eq('participant1_id', p1)
                .eq('participant2_id', p2)
                .maybeSingle();
            if (convSelectErr) throw convSelectErr;

            let convId = existingConv?.id ?? null;

            if (!convId) {
                const { data: newConv, error: convErr } = await supabase
                    .from('conversations')
                    .insert({ participant1_id: p1, participant2_id: p2 })
                    .select()
                    .single();
                if (convErr) throw convErr;
                convId = newConv.id;
            }

            const { error: msgErr } = await supabase.from('messages').insert({
                conversation_id: convId,
                sender_id: profile.id,
                content: 'Te desafié a un partido.',
                message_type: 'challenge',
                metadata: { challenge_id: challengeId },
            });
            if (msgErr) throw msgErr;

            return convId;
        } catch (e: any) {
            console.warn('[RankingScreen] notifyByChat error:', e.message);
            return null;
        } finally {
            setNotifying(false);
        }
    };

    const handleChallengeCreated = async (challengeId: string) => {
        const rival = selectedRival;
        closeChallengeModal();
        if (!rival) return;

        const convId = await notifyByChat(challengeId, rival);

        showAlert(
            'Desafío enviado',
            `Se le notificó a ${rival.full_name ?? rival.username}. Podrá aceptarlo o reproponer fecha y sede.`,
            [
                { text: 'Ver desafío', onPress: () => router.push(`/challenge/${challengeId}` as any) },
                convId
                    ? { text: 'Ver chat', onPress: () => router.push(`/chat/${convId}` as any) }
                    : undefined,
                { text: 'OK' },
            ].filter(Boolean) as any
        );
    };

    const winrate = (p: RankedPlayer) => {
        const total = p.wins + p.losses;
        return total > 0 ? Math.round((p.wins / total) * 100) : 0;
    };

    const rankBadgeColor = (position: number) => {
        if (position === 1) return { bg: '#FFE08A', text: '#7A5B00' };
        if (position === 2) return { bg: '#E2E2E2', text: '#555' };
        if (position === 3) return { bg: '#E8C39E', text: '#6B3E14' };
        return { bg: Colors.surfaceContainerHigh, text: Colors.onSurfaceVariant };
    };

    const genderLabel = GENDER_OPTIONS.find(option => option.value === genderFilter)?.label ?? 'General';
    const levelLabel = levelFilter === 'all' ? 'Todas las categorías' : levelFilter;
    const hasFilters = genderFilter !== 'all' || levelFilter !== 'all';

    if (loading) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.header}>
                    <Text style={styles.title}>Ranking</Text>
                    <Text style={styles.subtitle}>Cargando jugadores...</Text>
                </View>
                <SkeletonList count={7} variant="row" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Ranking</Text>
                <Text style={styles.subtitle}>
                    {players.length} jugadores · {genderLabel} · {levelLabel}
                </Text>
            </View>

            <View style={styles.filtersWrap}>
                <Text style={styles.filtersLabel}>GÉNERO</Text>
                <View style={styles.filterRow}>
                    {GENDER_OPTIONS.map(option => {
                        const active = genderFilter === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                onPress={() => setGenderFilter(active ? 'all' : option.value)}
                                style={[styles.filterChip, active && styles.filterChipActive]}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View style={styles.filtersWrap}>
                <Text style={styles.filtersLabel}>CATEGORÍA</Text>
                <View style={styles.filterRow}>
                    {LEVEL_OPTIONS.map(option => {
                        const active = levelFilter === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                onPress={() => setLevelFilter(active ? 'all' : option.value)}
                                style={[styles.filterChip, active && styles.filterChipActive]}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <FlatList
                data={players}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                        colors={[Colors.primary]}
                    />
                }
                renderItem={({ item: player, index }) => {
                    const position = index + 1;
                    const badge = rankBadgeColor(position);
                    const isMe = player.id === profile?.id;

                    return (
                        <Card style={[styles.row, isMe && styles.rowMe]}>
                            <View style={[styles.rankCircle, { backgroundColor: badge.bg }]}>
                                <Text style={[styles.rankNumber, { color: badge.text }]}>{position}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.playerLeft}
                                onPress={() => router.push(`/profile/${player.id}` as any)}
                                activeOpacity={0.8}
                            >
                                <Avatar uri={player.avatar_url} size={48} />
                                <View style={styles.playerInfo}>
                                    <Text style={styles.playerName}>
                                        {player.full_name}{isMe ? ' (Vos)' : ''}
                                    </Text>
                                    <View style={styles.playerMeta}>
                                        <Badge
                                            label={player.level ?? '6ta'}
                                            color={Colors.primaryContainer}
                                            textColor={Colors.primary}
                                        />
                                        {player.gender && (
                                            <Badge
                                                label={GENDER_LABELS[player.gender] ?? player.gender}
                                                color={Colors.surfaceContainerHigh}
                                                textColor={Colors.onSurfaceVariant}
                                            />
                                        )}
                                        {ageCategoryLabel(player.age_category) && (
                                            <Badge
                                                label={ageCategoryLabel(player.age_category)!}
                                                color={Colors.surfaceContainerHigh}
                                                textColor={Colors.onSurfaceVariant}
                                            />
                                        )}
                                        <Text style={styles.playerWinrate}>{winrate(player)}% WR</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            <View style={styles.right}>
                                <Text style={styles.eloValue}>{player.elo ?? 1000}</Text>
                                <Text style={styles.eloLabel}>ELO</Text>
                                {!isMe && (
                                    <TouchableOpacity
                                        style={styles.challengeBtn}
                                        onPress={() => openChallengeModal(player)}
                                        disabled={notifying}
                                    >
                                        <Ionicons name="flash-outline" size={18} color={Colors.primary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="trophy-outline" size={48} color={Colors.onSurfaceVariant} />
                        <Text style={styles.emptyText}>
                            {hasFilters
                                ? `No hay jugadores en ${genderLabel} · ${levelLabel}`
                                : 'Todavía no hay jugadores en el ranking'}
                        </Text>
                        {hasFilters && (
                            <TouchableOpacity onPress={() => {
                                setGenderFilter('all');
                                setLevelFilter('all');
                            }}>
                                <Text style={styles.emptyAction}>Ver ranking general</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                }
            />

            {selectedRival && (
                <CreateChallengeModal
                    visible={modalVisible}
                    onClose={closeChallengeModal}
                    rivalId={selectedRival.id}
                    rivalName={selectedRival.full_name ?? selectedRival.username}
                    onCreated={handleChallengeCreated}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    title: { fontFamily: 'Lexend_700Bold', fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5 },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    filtersWrap: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.sm },
    filtersLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 0.8 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    filterChip: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterChipText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    filterChipTextActive: { color: Colors.onPrimary },
    list: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: 100 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    rowMe: { borderWidth: 1, borderColor: Colors.primary },
    rankCircle: {
        width: 32, height: 32, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    rankNumber: { fontFamily: 'Lexend_700Bold', fontSize: 14 },
    playerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    playerInfo: { flex: 1, gap: 3 },
    playerName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: Colors.onSurface },
    playerMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
    playerWinrate: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    right: { alignItems: 'center', gap: 2 },
    eloValue: { fontFamily: 'Lexend_700Bold', fontSize: 18, color: Colors.primary, letterSpacing: -0.5 },
    eloLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    challengeBtn: {
        marginTop: Spacing.sm,
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
    emptyAction: { ...Typography.labelLg, color: Colors.primary },
});