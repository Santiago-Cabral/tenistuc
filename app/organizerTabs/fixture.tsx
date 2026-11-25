// app/organizerTabs/fixture.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '../../src/theme';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import {
    generateFixture, getFixture, FixtureMatch,
} from '../../src/services/fixtureService';
import { getCourts, Court } from '../../src/services/organizerService';
import MatchScoreModal from '../../src/components/modals/MatchScoreModal';
import MatchScheduleModal, { ScheduleBooking } from '../../src/components/modals/MatchScheduleModal';

interface TournamentOption {
    id: string;
    name: string;
    status: string;
    champion_id: string | null;
    champion_elo: number;
    champion_elo_applied: boolean;
    champion?: { full_name: string } | null;
}

function roundLabel(round: number, totalRounds: number) {
    const diff = totalRounds - round;
    if (diff === 0) return 'Final';
    if (diff === 1) return 'Semifinal';
    if (diff === 2) return 'Cuartos de final';
    return `Ronda ${round}`;
}

function formatSchedule(iso: string) {
    const d = new Date(iso);
    const day = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time}`;
}

function MatchCard({
    match, onPress, onSchedule,
}: { match: FixtureMatch; totalRounds: number; onPress: () => void; onSchedule: () => void }) {
    const winnerId = match.score?.winner_id;
    const isCompleted = match.status === 'completed';
    const canLoad = !isCompleted && match.player1_id && match.player2_id;
    const canSchedule = !match.is_bye && !isCompleted;
    const sets = match.score?.sets ?? [];

    const scheduleLabel = match.scheduled_at
        ? `${formatSchedule(match.scheduled_at)}${match.court?.name ? ` · ${match.court.name}` : ''}`
        : 'Sin programar';

    const renderPlayer = (
        player: FixtureMatch['player1'],
        isWinner: boolean,
    ) => (
        <View style={styles.playerRow}>
            <Text
                style={[
                    styles.playerName,
                    isWinner && styles.playerNameWinner,
                    !player && styles.playerNamePending,
                ]}
                numberOfLines={1}
            >
                {player ? player.full_name : 'Por definir'}
            </Text>
            {isWinner && (
                <Ionicons name="trophy" size={14} color={Colors.primary} />
            )}
        </View>
    );

    return (
        <View style={[styles.matchCard, match.is_bye && styles.matchCardBye]}>
            <TouchableOpacity
                style={styles.matchBody}
                onPress={onPress}
                disabled={!canLoad}
                activeOpacity={0.85}
            >
                {renderPlayer(match.player1, winnerId === match.player1_id)}
                <View style={styles.matchDivider} />
                {renderPlayer(match.player2, winnerId === match.player2_id)}

                {match.is_bye && (
                    <Text style={styles.byeLabel}>BYE</Text>
                )}

                {isCompleted && sets.length > 0 && (
                    <View style={styles.scoreRow}>
                        {sets.map((s, i) => (
                            <View key={i} style={styles.setBadge}>
                                <Text style={styles.setBadgeText}>{s.p1}-{s.p2}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {canLoad && (
                    <View style={styles.loadHint}>
                        <Ionicons name="create-outline" size={12} color={Colors.primary} />
                        <Text style={styles.loadHintText}>Cargar resultado</Text>
                    </View>
                )}
            </TouchableOpacity>

            {canSchedule && (
                <TouchableOpacity
                    style={styles.scheduleRow}
                    onPress={onSchedule}
                    activeOpacity={0.85}
                >
                    <Ionicons
                        name="calendar-outline"
                        size={13}
                        color={match.scheduled_at ? Colors.primary : Colors.onSurfaceVariant}
                    />
                    <Text
                        style={[styles.scheduleText, !match.scheduled_at && styles.scheduleTextMuted]}
                        numberOfLines={1}
                    >
                        {scheduleLabel}
                    </Text>
                    <Ionicons
                        name={match.scheduled_at ? 'create-outline' : 'add'}
                        size={15}
                        color={Colors.primary}
                    />
                </TouchableOpacity>
            )}
        </View>
    );
}

export default function FixtureScreen() {
    const { profile } = useAuthStore();
    const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
    const [selectedTournament, setSelectedTournament] = useState<TournamentOption | null>(null);
    const [rounds, setRounds] = useState<FixtureMatch[][]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeMatch, setActiveMatch] = useState<FixtureMatch | null>(null);
    const [schedulingMatch, setSchedulingMatch] = useState<FixtureMatch | null>(null);
    const [courts, setCourts] = useState<Court[]>([]);

    const loadCourts = useCallback(async () => {
        if (!profile) return;
        try {
            setCourts(await getCourts(profile.id));
        } catch {
            // silencioso: sin canchas igual se puede programar la fecha/hora
        }
    }, [profile]);

    const loadTournaments = useCallback(async () => {
        if (!profile) return;

        const { data, error } = await supabase
            .from('tournaments')
            .select('id, name, status, champion_id, champion_elo, champion_elo_applied, champion:profiles!tournaments_champion_id_fkey(full_name)')
            .eq('organizer_id', profile.id)
            .in('status', ['upcoming', 'open', 'closed', 'in_progress', 'completed'])
            .order('starts_at', { ascending: false });

        if (!error && data) {
            const mapped: TournamentOption[] = (data as any[]).map((t) => ({
                ...t,
                champion: Array.isArray(t.champion) ? t.champion[0] ?? null : t.champion ?? null,
            }));
            setTournaments(mapped);
            setSelectedTournament((prev) => prev ?? (mapped.length > 0 ? mapped[0] : null));
        }
    }, [profile]);

    const loadFixture = useCallback(async (tournamentId: string) => {
        setLoading(true);
        try {
            const grouped = await getFixture(tournamentId);
            setRounds(grouped);
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo cargar el fixture.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadTournaments();
            loadCourts();
        }, [loadTournaments, loadCourts]),
    );

    useEffect(() => {
        if (selectedTournament) {
            loadFixture(selectedTournament.id);
        }
    }, [selectedTournament, loadFixture]);

    const handleGenerate = async () => {
        if (!selectedTournament || !profile) return;
        setGenerating(true);
        try {
            const result = await generateFixture(selectedTournament.id, profile.id);
            showAlert(
                'Fixture generado',
                `Cuadro de ${result.bracketSize} lugares, ${result.totalRounds} rondas` +
                (result.byes > 0 ? `, ${result.byes} bye(s) para los mejores seeds.` : '.'),
            );
            loadFixture(selectedTournament.id);
        } catch (e: any) {
            showAlert('No se pudo generar', e.message ?? 'Intentá de nuevo');
        } finally {
            setGenerating(false);
        }
    };

    const handleRefresh = () => {
        if (!selectedTournament) return;
        setRefreshing(true);
        loadFixture(selectedTournament.id);
    };

    const totalRounds = rounds.length;
    const hasFixture = totalRounds > 0;

    // Reservas ya cargadas (para avisar de doble uso de cancha/horario).
    const bookings: ScheduleBooking[] = rounds
        .flat()
        .filter((m) => !m.is_bye)
        .map((m) => ({
            id: m.id,
            court_id: m.court_id,
            scheduled_at: m.scheduled_at,
            label: `${m.player1?.full_name ?? 'A definir'} vs ${m.player2?.full_name ?? 'A definir'}`,
        }));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.headerBar}>
                <Text style={styles.headerTitle}>Fixture</Text>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tournamentPicker}
                contentContainerStyle={styles.tournamentPickerContent}
            >
                {tournaments.map((t) => (
                    <TouchableOpacity
                        key={t.id}
                        style={[
                            styles.tournamentChip,
                            selectedTournament?.id === t.id && styles.tournamentChipActive,
                        ]}
                        onPress={() => setSelectedTournament(t)}
                    >
                        <Text
                            style={[
                                styles.tournamentChipText,
                                selectedTournament?.id === t.id && styles.tournamentChipTextActive,
                            ]}
                            numberOfLines={1}
                        >
                            {t.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {selectedTournament?.champion_elo_applied && selectedTournament.champion?.full_name && (
                <View style={styles.championBanner}>
                    <Ionicons name="trophy" size={18} color={Colors.primary} />
                    <Text style={styles.championBannerText}>
                        Campeón: {selectedTournament.champion.full_name} · +{selectedTournament.champion_elo} pts acreditados
                    </Text>
                </View>
            )}

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            ) : !selectedTournament ? (
                <View style={styles.centered}>
                    <Ionicons name="trophy-outline" size={40} color={Colors.onSurfaceVariant} />
                    <Text style={styles.emptyText}>No hay torneos creados todavía.</Text>
                </View>
            ) : !hasFixture ? (
                <View style={styles.centered}>
                    <Ionicons name="git-network-outline" size={40} color={Colors.onSurfaceVariant} />
                    <Text style={styles.emptyText}>
                        Todavía no generaste el fixture de {selectedTournament.name}.
                    </Text>
                    <TouchableOpacity
                        style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
                        onPress={handleGenerate}
                        disabled={generating}
                    >
                        <Text style={styles.generateBtnText}>
                            {generating ? 'Generando...' : 'Generar fixture'}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                    )}
                >
                    <View style={styles.bracketRow}>
                        {rounds.map((roundMatches, idx) => (
                            <View key={idx} style={styles.roundColumn}>
                                <Text style={styles.roundTitle}>
                                    {roundLabel(idx + 1, totalRounds)}
                                </Text>
                                <View style={styles.roundMatches}>
                                    {roundMatches.map((m) => (
                                        <MatchCard
                                            key={m.id}
                                            match={m}
                                            totalRounds={totalRounds}
                                            onPress={() => setActiveMatch(m)}
                                            onSchedule={() => setSchedulingMatch(m)}
                                        />
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}

            {activeMatch && (
                <MatchScoreModal
                    visible
                    matchId={activeMatch.id}
                    player1Name={activeMatch.player1?.full_name ?? 'Jugador 1'}
                    player2Name={activeMatch.player2?.full_name ?? 'Jugador 2'}
                    onClose={() => setActiveMatch(null)}
                    onSubmitted={() => {
                        setActiveMatch(null);
                        if (selectedTournament) loadFixture(selectedTournament.id);
                    }}
                />
            )}

            {schedulingMatch && (
                <MatchScheduleModal
                    visible
                    matchId={schedulingMatch.id}
                    player1Name={schedulingMatch.player1?.full_name ?? 'A definir'}
                    player2Name={schedulingMatch.player2?.full_name ?? 'A definir'}
                    courts={courts}
                    bookings={bookings}
                    initialScheduledAt={schedulingMatch.scheduled_at}
                    initialCourtId={schedulingMatch.court_id}
                    onClose={() => setSchedulingMatch(null)}
                    onSaved={() => {
                        setSchedulingMatch(null);
                        if (selectedTournament) loadFixture(selectedTournament.id);
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    headerBar: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.base },
    headerTitle: { ...Typography.titleLg, color: Colors.onSurface },

    tournamentPicker: { flexGrow: 0 },
    tournamentPickerContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingBottom: Spacing.base },
    tournamentChip: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerLow,
        marginRight: Spacing.sm,
        maxWidth: 200,
    },
    tournamentChipActive: { backgroundColor: Colors.primary },
    tournamentChipText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    tournamentChipTextActive: { color: Colors.onPrimary },

    championBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        marginHorizontal: Spacing.xl, marginBottom: Spacing.base,
        padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.primaryContainer,
    },
    championBannerText: { ...Typography.labelMd, color: Colors.primaryDim, flex: 1 },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xxxl },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },

    generateBtn: {
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.xxl,
        paddingVertical: Spacing.md,
    },
    generateBtnDisabled: { opacity: 0.6 },
    generateBtnText: { ...Typography.labelLg, color: Colors.onPrimary },

    bracketRow: { flexDirection: 'row', padding: Spacing.xl, gap: Spacing.xxl },
    roundColumn: { width: 220, gap: Spacing.base },
    roundTitle: { ...Typography.labelMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
    roundMatches: { flex: 1, justifyContent: 'space-around', gap: Spacing.xl },

    matchCard: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        overflow: 'hidden',
    },
    matchBody: { padding: Spacing.base, gap: Spacing.sm },
    matchCardBye: { opacity: 0.6 },
    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: Colors.surfaceContainerHigh,
    },
    scheduleText: { ...Typography.labelSm, color: Colors.onSurface, flex: 1 },
    scheduleTextMuted: { color: Colors.onSurfaceVariant },
    matchDivider: { height: 1, backgroundColor: Colors.surfaceContainerHigh },
    playerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    playerName: { ...Typography.bodySm, color: Colors.onSurface, flex: 1 },
    playerNameWinner: { fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.primary },
    playerNamePending: { color: Colors.onSurfaceVariant, fontStyle: 'italic' },
    byeLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, textAlign: 'center', letterSpacing: 1 },

    scoreRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 2 },
    setBadge: {
        backgroundColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.sm,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    setBadgeText: { ...Typography.labelSm, color: Colors.onSurface, fontSize: 11 },

    loadHint: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', paddingTop: 2 },
    loadHintText: { ...Typography.labelSm, color: Colors.primary },
});