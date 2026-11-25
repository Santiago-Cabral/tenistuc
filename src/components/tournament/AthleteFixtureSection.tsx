// src/components/tournament/AthleteFixtureSection.tsx
//
// Fixture de un torneo, versión jugador (solo lectura):
//  - cuadro por ronda (final, semifinal, ...) con resultados
//  - fecha/hora y cancha asignadas de cada partido
//  - resalta los partidos propios
//  - se actualiza en vivo cuando el organizador programa o carga resultados
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import { SectionHeader } from '../ui';
import { supabase } from '../../lib/supabase';
import { getFixture, FixtureMatch } from '../../services/fixtureService';

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

function FixtureMatchCard({ match, myId }: { match: FixtureMatch; myId?: string }) {
    const router = useRouter();
    const winnerId = match.score?.winner_id;
    const isCompleted = match.status === 'completed';
    const isMine = !!myId && (match.player1_id === myId || match.player2_id === myId);
    const sets = match.score?.sets ?? [];

    const scheduleLabel = match.scheduled_at
        ? `${formatSchedule(match.scheduled_at)}${match.court?.name ? ` · ${match.court.name}` : ''}`
        : 'Sin programar';

    const renderPlayer = (
        player: FixtureMatch['player1'],
        isWinner: boolean,
        isMe: boolean,
    ) => {
        const name = player
            ? player.full_name
            : match.is_bye
                ? 'Libre (BYE)'
                : 'Por definir';

        const content = (
            <View style={styles.playerRow}>
                <Text
                    style={[
                        styles.playerName,
                        isWinner && styles.playerNameWinner,
                        !player && styles.playerNamePending,
                    ]}
                    numberOfLines={1}
                >
                    {name}
                </Text>
                {isMe && <Text style={styles.meTag}>VOS</Text>}
                {isWinner && !isMe && (
                    <Ionicons name="trophy" size={13} color={Colors.primary} />
                )}
            </View>
        );

        if (!player) return content;

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push(`/profile/${player.id}` as any)}
            >
                {content}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.matchCard, isMine && styles.matchCardMine]}>
            {renderPlayer(match.player1, winnerId === match.player1_id, match.player1_id === myId)}
            <View style={styles.matchDivider} />
            {renderPlayer(match.player2, winnerId === match.player2_id, match.player2_id === myId)}

            {isCompleted && sets.length > 0 && (
                <View style={styles.scoreRow}>
                    {sets.map((s, i) => (
                        <View key={i} style={styles.setBadge}>
                            <Text style={styles.setBadgeText}>{s.p1}-{s.p2}</Text>
                        </View>
                    ))}
                </View>
            )}

            {!match.is_bye && (
                <View style={styles.scheduleRow}>
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
                </View>
            )}
        </View>
    );
}

interface Props {
    tournamentId: string;
    myPlayerId?: string;
    reloadKey?: number;
}

export default function AthleteFixtureSection({ tournamentId, myPlayerId, reloadKey = 0 }: Props) {
    const [rounds, setRounds] = useState<FixtureMatch[][]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        try {
            const grouped = await getFixture(tournamentId);
            setRounds(grouped);
            setError(null);
        } catch (e: any) {
            setError(e.message ?? 'No se pudo cargar el fixture.');
        } finally {
            setLoading(false);
        }
    }, [tournamentId]);

    useEffect(() => {
        load();
    }, [load, reloadKey]);

    // Realtime: el fixture se actualiza solo cuando el organizador
    // programa fechas, carga resultados o avanza jugadores de ronda.
    // (con debounce: generar el fixture inserta muchos partidos juntos)
    useEffect(() => {
        const channel = supabase
            .channel(`fixture-${tournamentId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
                () => {
                    if (debounce.current) clearTimeout(debounce.current);
                    debounce.current = setTimeout(() => { load(); }, 500);
                },
            )
            .subscribe();

        return () => {
            if (debounce.current) clearTimeout(debounce.current);
            supabase.removeChannel(channel);
        };
    }, [tournamentId, load]);

    if (loading) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.stateWrap}>
                <Text style={styles.stateText}>{error}</Text>
                <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
                    <Text style={styles.retryText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const totalRounds = rounds.length;

    return (
        <View style={styles.wrap}>
            <SectionHeader title="Fixture y fechas" />
            <Text style={styles.publicNote}>
                El cuadro es público: cualquier jugador puede ver los partidos, horarios y canchas.
            </Text>

            {totalRounds === 0 ? (
                <View style={styles.stateWrap}>
                    <Ionicons name="git-network-outline" size={28} color={Colors.onSurfaceVariant} />
                    <Text style={styles.stateText}>
                        El organizador todavía no generó el fixture.{'\n'}
                        Aparece acá apenas esté listo.
                    </Text>
                </View>
            ) : (
                rounds.map((roundMatches, idx) => (
                    <View key={idx} style={styles.roundWrap}>
                        <Text style={styles.roundTitle}>
                            {roundLabel(idx + 1, totalRounds)}
                        </Text>
                        <View style={styles.roundMatches}>
                            {roundMatches.map((m) => (
                                <FixtureMatchCard key={m.id} match={m} myId={myPlayerId} />
                            ))}
                        </View>
                    </View>
                ))
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: Spacing.md },
    publicNote: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: -Spacing.sm },
    loader: { paddingVertical: Spacing.xl, alignItems: 'center' },
    stateWrap: {
        alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.xl,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
    },
    stateText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, textAlign: 'center' },
    retryText: { ...Typography.labelLg, color: Colors.primary },

    roundWrap: { gap: Spacing.sm },
    roundTitle: { ...Typography.labelMd, color: Colors.onSurfaceVariant, letterSpacing: 0.4 },
    roundMatches: { gap: Spacing.sm },

    matchCard: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        padding: Spacing.base,
        gap: Spacing.sm,
    },
    matchCardMine: { borderColor: Colors.primary, borderWidth: 1.5 },
    matchDivider: { height: 1, backgroundColor: Colors.surfaceContainerHigh },
    playerRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', gap: Spacing.sm,
        minHeight: 22,
    },
    playerName: { ...Typography.bodySm, color: Colors.onSurface, flex: 1 },
    playerNameWinner: { fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.primary },
    playerNamePending: { color: Colors.onSurfaceVariant, fontStyle: 'italic' },
    meTag: {
        fontFamily: 'Lexend_700Bold', fontSize: 9,
        color: Colors.onPrimary, backgroundColor: Colors.primary,
        borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 1,
        letterSpacing: 0.5,
    },
    scoreRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    setBadge: {
        backgroundColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2,
    },
    setBadgeText: { ...Typography.labelSm, color: Colors.onSurface, fontSize: 11 },
    scheduleRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderTopWidth: 1, borderTopColor: Colors.surfaceContainerHigh,
        paddingTop: Spacing.sm,
    },
    scheduleText: { ...Typography.labelSm, color: Colors.onSurface, flex: 1 },
    scheduleTextMuted: { color: Colors.onSurfaceVariant },
});
