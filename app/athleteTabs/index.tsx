// app/athleteTabs/index.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/theme/index';
import { Avatar, Badge, EloIndicator, Card, SectionHeader, Button } from '../../src/components/ui/index';
import { useAuthStore } from '../../src/stores/authStore';
import { useChallenges } from '../../src/hooks/useChallenges';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { useUnreadNotificationsCount } from '../../src/hooks/useNotifications';
import { MATCH_TYPE_LABELS } from '../../src/services/matchService';
import { supabase } from '../../src/lib/supabase';
import { isActuallyOnline } from '../../src/services/presenceService';

interface PlayerSnippet {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
}

interface MatchWithPlayers {
    id: string;
    type: string;
    status: string;
    scheduled_at: string | null;
    location: string | null;
    player1_id: string;
    player2_id: string;
    player1: PlayerSnippet | null;
    player2: PlayerSnippet | null;
}

interface Tournament {
    id: string;
    name: string;
    status: string;
    image_url: string | null;
    prize_money: number;
    elo_points: number;
    starts_at: string | null;
    location: string | null;
}

interface ChallengeItem {
    id: string;
    challenger_id: string;
    challenged_id: string;
    match_type: string;
    proposed_date: string | null;
    proposed_venue: string | null;
    proposed_by: string | null;
    message: string | null;
    created_at: string;
    challenger: PlayerSnippet | null;
    challenged: PlayerSnippet | null;
}

const TOURNEY_FALLBACK =
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600';

const TOURNEY_CARD_WIDTH = 280;

const TOURNEY_STATUS: Record<string, { label: string; color: string; textColor: string }> = {
    open: { label: 'INSCRIPCIONES ABIERTAS', color: Colors.primaryContainer, textColor: Colors.primary },
    closed: { label: 'LISTA CERRADA', color: Colors.tertiaryContainer, textColor: Colors.tertiary },
    in_progress: { label: 'EN JUEGO', color: Colors.tertiaryContainer, textColor: Colors.tertiary },
};

interface RecentResult {
    id: string;
    player1_id: string;
    player2_id: string;
    elo_delta_p1: number | null;
    elo_delta_p2: number | null;
    played_at: string | null;
}

type QuickAction = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    route: string;
};

const QUICK_ACTIONS: QuickAction[] = [
    { icon: 'flash', label: 'DESAFIAR', route: '/athleteTabs/rivals' },
    { icon: 'trophy', label: 'RANKING', route: '/athleteTabs/ranking' },
    { icon: 'calendar', label: 'TORNEOS', route: '/athleteTabs/tournament' },
    { icon: 'chatbubble', label: 'MENSAJES', route: '/athleteTabs/messages' },
];

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) return 'Jugando de madrugada,';
    if (h < 12) return 'Buenos días,';
    if (h < 19) return 'Buen juego,';
    return 'Buenas noches,';
}

export default function HomeScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const { acceptChallenge, rejectChallenge } = useChallenges();
    const unreadNotifications = useUnreadNotificationsCount();
    const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
    const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [globalRank, setGlobalRank] = useState<number | null>(null);
    const [eloDelta, setEloDelta] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [challengeActionId, setChallengeActionId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!profile) return;

        const [matchRes, tourneyRes, rankRes, recentRes, challengeRes] = await Promise.all([
            supabase
                .from('matches')
                .select(`
                    id, type, status, scheduled_at, location,
                    player1_id, player2_id,
                    player1:profiles!matches_player1_id_fkey(id, username, full_name, avatar_url),
                    player2:profiles!matches_player2_id_fkey(id, username, full_name, avatar_url)
                `)
                .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`)
                .in('status', ['pending', 'confirmed'])
                .order('scheduled_at', { ascending: true })
                .limit(3),

            supabase
                .from('tournaments')
                .select('id, name, status, image_url, prize_money, elo_points, starts_at, location')
                .in('status', ['upcoming', 'open', 'closed', 'in_progress'])
                .order('created_at', { ascending: false })
                .limit(6),

            supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'athlete')
                .gt('elo', profile.elo),

            supabase
                .from('matches')
                .select('id, player1_id, player2_id, elo_delta_p1, elo_delta_p2, played_at')
                .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`)
                .eq('status', 'completed')
                .order('played_at', { ascending: false })
                .limit(5),

            supabase
                .from('challenges')
                .select(`
                    id, challenger_id, challenged_id, match_type, proposed_date,
                    proposed_venue, proposed_by, message, created_at,
                    challenger:profiles!challenges_challenger_id_fkey(id, username, full_name, avatar_url),
                    challenged:profiles!challenges_challenged_id_fkey(id, username, full_name, avatar_url)
                `)
                .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(4),
        ]);

        if (matchRes.data) {
            const normalized: MatchWithPlayers[] = (matchRes.data as any[]).map(m => ({
                ...m,
                player1: Array.isArray(m.player1) ? m.player1[0] ?? null : m.player1,
                player2: Array.isArray(m.player2) ? m.player2[0] ?? null : m.player2,
            }));
            setMatches(normalized);
        }

        if (challengeRes.data) {
            const normalized: ChallengeItem[] = (challengeRes.data as any[]).map(c => ({
                ...c,
                challenger: Array.isArray(c.challenger) ? c.challenger[0] ?? null : c.challenger,
                challenged: Array.isArray(c.challenged) ? c.challenged[0] ?? null : c.challenged,
            }));
            setChallenges(normalized);
        }

        if (tourneyRes.data) setTournaments(tourneyRes.data as Tournament[]);
        if (rankRes.count !== null) setGlobalRank(rankRes.count + 1);

        if (recentRes.data) {
            const recent = recentRes.data as RecentResult[];
            const totalDelta = recent.reduce((sum, m) => {
                const delta = m.player1_id === profile.id ? m.elo_delta_p1 : m.elo_delta_p2;
                return sum + (delta ?? 0);
            }, 0);
            setEloDelta(totalDelta);
        }
    }, [profile]);

    useEffect(() => { loadData(); }, [loadData]);

    // Panel de puntos en vivo: el ELO, los partidos y los desafíos se actualizan
    // solos cuando el motor de ELO de la BD mueve algo o el rival actúa.
    useLiveRefresh('matches', () => { loadData(); });
    useLiveRefresh('challenges', () => { loadData(); });
    useLiveRefresh('tournaments', () => { loadData(); });

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const confirmMatch = async (matchId: string) => {
        setLoadingId(matchId);
        const { error } = await supabase
            .from('matches')
            .update({ status: 'confirmed' })
            .eq('id', matchId);
        setLoadingId(null);
        if (error) {
            showAlert('Error', 'No se pudo confirmar el partido.');
        } else {
            loadData();
        }
    };

    const cancelMatch = (matchId: string) => {
        showAlert('Rechazar partido', '¿Estás seguro que querés rechazar este partido?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Sí, rechazar', style: 'destructive',
                onPress: async () => {
                    setLoadingId(matchId);
                    const { error } = await supabase
                        .from('matches')
                        .update({ status: 'cancelled' })
                        .eq('id', matchId);
                    setLoadingId(null);
                    if (error) showAlert('Error', 'No se pudo cancelar el partido.');
                    else loadData();
                },
            },
        ]);
    };

    const respondToChallenge = (challengeId: string, accept: boolean) => {
        const doIt = async () => {
            setChallengeActionId(challengeId);
            const ok = accept
                ? await acceptChallenge(challengeId)
                : await rejectChallenge(challengeId);
            setChallengeActionId(null);
            if (ok) loadData();
            else showAlert('Error', 'No se pudo procesar el desafío.');
        };

        if (accept) {
            doIt();
            return;
        }

        showAlert('Rechazar desafío', '¿Seguro que querés rechazar este desafío?', [
            { text: 'No', style: 'cancel' },
            { text: 'Sí, rechazar', style: 'destructive', onPress: doIt },
        ]);
    };

    const wins = profile?.wins ?? 0;
    const losses = profile?.losses ?? 0;
    const winrate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        const diff = Math.round((d.getTime() - Date.now()) / 86_400_000);
        if (diff === 0) return `Hoy, ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
        if (diff === 1) return `Mañana, ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
        return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const getRival = (match: MatchWithPlayers) =>
        match.player1_id === profile?.id ? match.player2 : match.player1;

    const getChallengeRival = (c: ChallengeItem) =>
        c.challenger_id === profile?.id ? c.challenged : c.challenger;

    const formatTourneyDate = (iso: string | null) => {
        if (!iso) return 'Fecha a confirmar';
        return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
    };

    // Los desafíos donde me toca responder van primero (necesitan acción).
    const orderedChallenges = [
        ...challenges.filter(c => c.proposed_by !== profile?.id),
        ...challenges.filter(c => c.proposed_by === profile?.id),
    ];

    const nextMatch = matches.find(m => !!m.scheduled_at) ?? null;
    const daysToNext = nextMatch?.scheduled_at
        ? Math.round((new Date(nextMatch.scheduled_at).getTime() - Date.now()) / 86_400_000)
        : null;

    const renderChallengeCard = (c: ChallengeItem) => {
        const rival = getChallengeRival(c);
        const myTurn = c.proposed_by !== profile?.id;
        const busy = challengeActionId === c.id;
        const typeLabel =
            MATCH_TYPE_LABELS[c.match_type as keyof typeof MATCH_TYPE_LABELS] ?? c.match_type;

        return (
            <Card key={c.id} style={styles.matchCard}>
                <View style={styles.matchTop}>
                    <Badge label="DESAFÍO" color={Colors.primaryContainer} textColor={Colors.primary} />
                    <Badge
                        label={typeLabel.toUpperCase()}
                        color={Colors.surfaceContainerHigh}
                        textColor={Colors.onSurfaceVariant}
                    />
                    {myTurn && (
                        <Badge label="TU TURNO" color={Colors.tertiaryContainer} textColor={Colors.tertiary} />
                    )}
                </View>

                <View style={styles.matchDateRow}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.onSurfaceVariant} />
                    <Text style={styles.matchDate}>
                        {c.proposed_date ? formatDate(c.proposed_date) : 'Sin fecha definida'}
                    </Text>
                    {c.proposed_venue && (
                        <>
                            <Ionicons name="location-outline" size={13} color={Colors.onSurfaceVariant} />
                            <Text style={styles.matchDate}>{c.proposed_venue}</Text>
                        </>
                    )}
                </View>

                <View style={styles.matchVs}>
                    <View style={styles.matchPlayer}>
                        <Avatar uri={profile?.avatar_url} size={44} />
                        <Text style={styles.matchPlayerName}>
                            {profile?.full_name?.split(' ')[0] ?? 'Tú'}
                        </Text>
                    </View>
                    <View style={styles.vsWrap}>
                        <Text style={styles.vsText}>VS</Text>
                    </View>
                    <View style={styles.matchPlayer}>
                        <Avatar uri={rival?.avatar_url} size={44} />
                        <Text style={styles.matchPlayerName}>
                            {rival?.full_name?.split(' ')[0] ?? rival?.username ?? 'Rival'}
                        </Text>
                    </View>
                </View>

                {myTurn ? (
                    <View style={styles.matchBtns}>
                        <Button
                            label="Rechazar"
                            variant="ghost"
                            onPress={() => respondToChallenge(c.id, false)}
                            disabled={busy}
                            style={{ flex: 1 }}
                        />
                        <Button
                            label={busy ? 'Aceptando...' : 'Aceptar'}
                            onPress={() => respondToChallenge(c.id, true)}
                            disabled={busy}
                            style={{ flex: 1 }}
                        />
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={() => router.push(`/challenge/${c.id}` as any)}
                        style={styles.waitingRow}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="hourglass-outline" size={14} color={Colors.onSurfaceVariant} />
                        <Text style={styles.waitingText}>
                            Esperando respuesta de {rival?.full_name?.split(' ')[0] ?? 'el rival'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={Colors.onSurfaceVariant} />
                    </TouchableOpacity>
                )}
            </Card>
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                }
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>{getGreeting()}</Text>
                        <Text style={styles.name}>
                            {profile?.full_name?.split(' ')[0] ?? profile?.username ?? 'Atleta'}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => router.push('/notifications' as any)}
                            activeOpacity={0.85}
                            style={styles.bellBtn}
                        >
                            <Ionicons name="notifications-outline" size={22} color={Colors.onSurface} />
                            {unreadNotifications > 0 && (
                                <View style={styles.bellBadge}>
                                    <Text style={styles.bellBadgeText}>
                                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => router.push('/athleteTabs/profile')} activeOpacity={0.85}>
                            <Avatar uri={profile?.avatar_url} size={48} online={isActuallyOnline(profile)} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.content}>

                    {/* ── ELO Card ── */}
                    <LinearGradient
                        colors={[Colors.primary, Colors.primaryDim]}
                        style={styles.eloCard}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.eloHeaderRow}>
                            <Text style={styles.eloLabel}>ESTADO DEL RANKING</Text>
                            {nextMatch && daysToNext !== null && (
                                <View style={styles.nextMatchPill}>
                                    <Ionicons name="time-outline" size={11} color={Colors.primaryContainer} />
                                    <Text style={styles.nextMatchPillText}>
                                        {daysToNext <= 0 ? 'Hoy juegas' : `En ${daysToNext}d`}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.eloRow}>
                            <Text style={styles.eloValue}>
                                {(profile?.elo ?? 1000).toLocaleString('es')}
                            </Text>
                            <Text style={styles.eloUnit}>PTS</Text>
                        </View>
                        <EloIndicator delta={eloDelta} />
                        <View style={styles.eloStats}>
                            <View style={styles.eloStat}>
                                <Text style={styles.eloStatLabel}>Rango Global</Text>
                                <Text style={styles.eloStatValue}>
                                    {globalRank !== null ? `#${globalRank}` : '—'}
                                </Text>
                            </View>
                            <View style={styles.eloStat}>
                                <Text style={styles.eloStatLabel}>Winrate</Text>
                                <Text style={styles.eloStatValue}>{winrate}%</Text>
                            </View>
                            <View style={styles.eloStat}>
                                <Text style={styles.eloStatLabel}>Nivel</Text>
                                <Text style={styles.eloStatValue}>{profile?.level ?? '6ta'}</Text>
                            </View>
                        </View>
                    </LinearGradient>

                    {/* ── Quick Actions ── */}
                    <View style={styles.actionsRow}>
                        {QUICK_ACTIONS.map(a => (
                            <TouchableOpacity
                                key={a.label}
                                style={styles.actionBtn}
                                onPress={() => router.push(a.route as any)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.actionIconWrap}>
                                    <Ionicons name={a.icon} size={20} color={Colors.primary} />
                                </View>
                                <Text style={styles.actionLabel}>{a.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ── Tu racha (reemplaza el CTA redundante con "Desafiar") ── */}
                    <Card style={styles.streakCard}>
                        <View style={styles.streakRow}>
                            <View style={styles.streakStat}>
                                <Text style={styles.streakValue}>{wins}</Text>
                                <Text style={styles.streakLabel}>Ganados</Text>
                            </View>
                            <View style={styles.streakDivider} />
                            <View style={styles.streakStat}>
                                <Text style={styles.streakValue}>{losses}</Text>
                                <Text style={styles.streakLabel}>Perdidos</Text>
                            </View>
                            <View style={styles.streakDivider} />
                            <View style={styles.streakStat}>
                                <Text style={[styles.streakValue, { color: Colors.primary }]}>{winrate}%</Text>
                                <Text style={styles.streakLabel}>Efectividad</Text>
                            </View>
                        </View>

                        {wins + losses === 0 ? (
                            <Text style={styles.streakHint}>
                                Todavía no jugaste ningún partido. ¡Buscá tu primer rival!
                            </Text>
                        ) : (
                            <Text style={styles.streakHint}>
                                {eloDelta >= 0
                                    ? `Vas sumando puntos, +${eloDelta} ELO en tus últimos partidos.`
                                    : `Perdiste ${Math.abs(eloDelta)} ELO en tus últimos partidos, hora de revertirlo.`}
                            </Text>
                        )}
                    </Card>

                    {/* ── Desafíos pendientes + Próximos partidos ── */}
                    <SectionHeader
                        title="Desafíos y partidos"
                        action="Ver todos"
                        onAction={() => router.push('/matches' as any)}
                    />

                    {challenges.length === 0 && matches.length === 0 ? (
                        <Card style={styles.emptyCard}>
                            <Ionicons name="tennisball-outline" size={40} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>No tenés desafíos ni partidos</Text>
                            <Button
                                label="Buscar rival"
                                variant="ghost"
                                uppercase={false}
                                onPress={() => router.push('/athleteTabs/rivals')}
                            />
                        </Card>
                    ) : (
                        <>
                            {orderedChallenges.map(renderChallengeCard)}
                            {matches.map(match => {
                            const rival = getRival(match);
                            const isLoading = loadingId === match.id;
                            return (
                                <Card key={match.id} style={styles.matchCard}>
                                    <View style={styles.matchTop}>
                                        <Badge
                                            label={match.type.toUpperCase()}
                                            color={Colors.primaryContainer}
                                            textColor={Colors.primary}
                                        />
                                        <Badge
                                            label={match.status === 'pending' ? 'PENDIENTE' : 'CONFIRMADO'}
                                            color={match.status === 'pending' ? Colors.tertiaryContainer : Colors.primaryContainer}
                                            textColor={match.status === 'pending' ? Colors.tertiary : Colors.primary}
                                        />
                                    </View>

                                    <View style={styles.matchDateRow}>
                                        <Ionicons name="calendar-outline" size={13} color={Colors.onSurfaceVariant} />
                                        <Text style={styles.matchDate}>
                                            {match.scheduled_at ? formatDate(match.scheduled_at) : 'Pendiente'}
                                        </Text>
                                        {match.location && (
                                            <>
                                                <Ionicons name="location-outline" size={13} color={Colors.onSurfaceVariant} />
                                                <Text style={styles.matchDate}>{match.location}</Text>
                                            </>
                                        )}
                                    </View>

                                    <View style={styles.matchVs}>
                                        <View style={styles.matchPlayer}>
                                            <Avatar uri={profile?.avatar_url} size={44} />
                                            <Text style={styles.matchPlayerName}>
                                                {profile?.full_name?.split(' ')[0] ?? 'Tú'}
                                            </Text>
                                        </View>
                                        <View style={styles.vsWrap}>
                                            <Text style={styles.vsText}>VS</Text>
                                        </View>
                                        <View style={styles.matchPlayer}>
                                            <Avatar uri={rival?.avatar_url} size={44} />
                                            <Text style={styles.matchPlayerName}>
                                                {rival?.full_name?.split(' ')[0] ?? rival?.username ?? 'Rival'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.matchBtns}>
                                        <Button
                                            label="Ver detalles"
                                            variant="secondary"
                                            onPress={() => router.push('/matches' as any)}
                                            style={{ flex: 1 }}
                                        />
                                        {match.status === 'pending' && (
                                            <Button
                                                label={isLoading ? 'Confirmando...' : 'Confirmar'}
                                                onPress={() => confirmMatch(match.id)}
                                                disabled={isLoading}
                                                style={{ flex: 1 }}
                                            />
                                        )}
                                    </View>

                                    {match.status === 'pending' && (
                                        <TouchableOpacity
                                            onPress={() => cancelMatch(match.id)}
                                            disabled={isLoading}
                                            style={styles.rejectLink}
                                        >
                                            <Text style={styles.rejectLinkText}>Rechazar partido</Text>
                                        </TouchableOpacity>
                                    )}
                                </Card>
                            );
                        })}
                        </>
                    )}

                    <SectionHeader
                        title="Dobles"
                        action="Abrir"
                        onAction={() => router.push('/doubles' as any)}
                    />
                    <Card style={styles.matchCard}>
                        <TouchableOpacity
                            style={styles.doublesRow}
                            onPress={() => router.push('/doubles' as any)}
                            activeOpacity={0.85}
                        >
                            <View style={styles.doublesIconWrap}>
                                <Ionicons name="people-outline" size={22} color={Colors.primary} />
                            </View>
                            <View style={styles.doublesInfo}>
                                <Text style={styles.doublesTitle}>Jugá en pareja</Text>
                                <Text style={styles.doublesSubtitle}>Invitaciones, duplas y desafíos</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </Card>

                    {/* ── Torneos Activos ── */}
                    <SectionHeader
                        title="Torneos Activos"
                        action="Ver todos"
                        onAction={() => router.push('/athleteTabs/tournament')}
                    />

                    {tournaments.length === 0 ? (
                        <Card style={styles.emptyCard}>
                            <Ionicons name="calendar-outline" size={40} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>Sin torneos activos</Text>
                        </Card>
                    ) : (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.tourneyScrollBleed}
                            contentContainerStyle={styles.tourneyScroll}
                            snapToInterval={TOURNEY_CARD_WIDTH + Spacing.base}
                            decelerationRate="fast"
                        >
                            {tournaments.map(t => {
                                const st = TOURNEY_STATUS[t.status] ?? TOURNEY_STATUS.open;
                                return (
                                    <TouchableOpacity
                                        key={t.id}
                                        style={styles.tourneyCard}
                                        onPress={() => router.push(`/tournament/${t.id}` as any)}
                                        activeOpacity={0.9}
                                    >
                                        <Image
                                            source={{ uri: t.image_url || TOURNEY_FALLBACK }}
                                            style={StyleSheet.absoluteFill}
                                            contentFit="cover"
                                            transition={200}
                                        />
                                        <LinearGradient
                                            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
                                            style={StyleSheet.absoluteFill}
                                        />
                                        <View style={styles.tourneyBadgeWrap}>
                                            <Badge label={st.label} color={st.color} textColor={st.textColor} />
                                        </View>
                                        <View style={styles.tourneyContent}>
                                            <Text style={styles.tourneyName} numberOfLines={2}>
                                                {t.name}
                                            </Text>
                                            <View style={styles.tourneyMetaRow}>
                                                <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.85)" />
                                                <Text style={styles.tourneyMetaText}>
                                                    {formatTourneyDate(t.starts_at)}
                                                </Text>
                                            </View>
                                            <View style={styles.tourneyMetaRow}>
                                                <Ionicons name="cash-outline" size={12} color="rgba(255,255,255,0.85)" />
                                                <Text style={styles.tourneyMetaText}>
                                                    ${Number(t.prize_money).toLocaleString('es')} + {t.elo_points} pts
                                                </Text>
                                                {!!t.location && (
                                                    <>
                                                        <View style={styles.tourneyDot} />
                                                        <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
                                                        <Text style={styles.tourneyMetaText} numberOfLines={1}>
                                                            {t.location}
                                                        </Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                </View>
                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    },
    greeting: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    name: { fontFamily: 'Lexend_700Bold', fontSize: 24, color: Colors.onSurface, letterSpacing: -0.3 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    bellBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.surfaceContainerHigh,
    },
    bellBadge: {
        position: 'absolute', top: 2, right: 2,
        minWidth: 16, height: 16, borderRadius: 8,
        paddingHorizontal: 3,
        backgroundColor: Colors.error,
        alignItems: 'center', justifyContent: 'center',
    },
    bellBadgeText: { ...Typography.labelSm, color: '#fff', fontSize: 9, lineHeight: 12 },
    content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
    eloCard: { borderRadius: Radius.xxl, padding: Spacing.xl, gap: Spacing.sm, ...Shadow.float },
    eloHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eloLabel: { ...Typography.labelSm, color: Colors.primaryContainer, opacity: 0.75, letterSpacing: 1 },
    nextMatchPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.14)',
        paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full,
    },
    nextMatchPillText: { ...Typography.labelSm, color: Colors.primaryContainer, fontSize: 10 },
    eloRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    eloValue: {
        fontFamily: 'Lexend_800ExtraBold', fontSize: 52,
        color: Colors.primaryContainer, letterSpacing: -2, lineHeight: 56,
    },
    eloUnit: { ...Typography.headlineSm, color: Colors.primaryContainer, opacity: 0.7, marginBottom: 6 },
    eloStats: {
        flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md,
        borderTopWidth: 1, borderTopColor: 'rgba(212,250,87,0.15)',
    },
    eloStat: { flex: 1, gap: 2 },
    eloStatLabel: { ...Typography.labelSm, color: 'rgba(212,250,87,0.6)' },
    eloStatValue: { fontFamily: 'Lexend_700Bold', fontSize: 18, color: Colors.primaryContainer, letterSpacing: -0.3 },
    actionsRow: { flexDirection: 'row', gap: Spacing.md },
    actionBtn: {
        flex: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl,
        paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: 6,
        ...Shadow.ambient,
    },
    actionIconWrap: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center',
    },
    actionLabel: { ...Typography.labelSm, color: Colors.onSurface, textAlign: 'center', fontSize: 9, letterSpacing: 0.4 },

    streakCard: { gap: Spacing.md },
    streakRow: { flexDirection: 'row', alignItems: 'center' },
    streakStat: { flex: 1, alignItems: 'center', gap: 2 },
    streakValue: { fontFamily: 'Lexend_700Bold', fontSize: 22, color: Colors.onSurface, letterSpacing: -0.5 },
    streakLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    streakDivider: { width: 1, height: 32, backgroundColor: Colors.surfaceContainerHigh },
    streakHint: { ...Typography.bodySm, color: Colors.onSurfaceVariant, textAlign: 'center' },

    emptyCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    matchCard: { gap: Spacing.md },
    matchTop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    matchDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    matchDate: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    matchVs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    matchPlayer: { alignItems: 'center', gap: 6, flex: 1 },
    matchPlayerName: { ...Typography.titleMd, color: Colors.onSurface },
    vsWrap: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center',
    },
    vsText: { fontFamily: 'Lexend_700Bold', fontSize: 11, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
    matchBtns: { flexDirection: 'row', gap: Spacing.sm },
    doublesRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    doublesIconWrap: {
        width: 44, height: 44, borderRadius: Radius.lg,
        backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center',
    },
    doublesInfo: { flex: 1, gap: 2 },
    doublesTitle: { ...Typography.titleSm, color: Colors.onSurface },
    doublesSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    rejectLink: { alignItems: 'center', paddingTop: 2 },
    rejectLinkText: { ...Typography.labelSm, color: Colors.error },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
    waitingText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, flex: 1 },

    tourneyScrollBleed: { marginHorizontal: -Spacing.xl },
    tourneyScroll: { paddingHorizontal: Spacing.xl, gap: Spacing.base },
    tourneyCard: {
        width: TOURNEY_CARD_WIDTH, height: 168, borderRadius: Radius.xl, overflow: 'hidden',
        justifyContent: 'flex-end', ...Shadow.ambient,
    },
    tourneyBadgeWrap: { position: 'absolute', top: Spacing.base, left: Spacing.base },
    tourneyContent: { padding: Spacing.base, gap: 4 },
    tourneyName: { fontFamily: 'Lexend_700Bold', fontSize: 19, color: '#fff', letterSpacing: -0.4 },
    tourneyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tourneyMetaText: { ...Typography.bodySm, color: 'rgba(255,255,255,0.85)' },
    tourneyDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.7)', marginHorizontal: 2 },
});