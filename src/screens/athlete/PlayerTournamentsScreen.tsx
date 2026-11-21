// src/screens/athlete/PlayerTournamentsScreen.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../theme';
import { Card, Badge, SkeletonList } from '../../components/ui';

interface TournamentRow {
    id: string;
    name: string;
    status: 'upcoming' | 'open' | 'in_progress' | 'completed';
    image_url: string | null;
    prize_money: number;
    elo_points: number;
    entry_fee: number | null;
    max_players: number | null;
    starts_at: string | null;
    location: string | null;
}

interface Registration {
    id: string;
    payment_status: string;
    tournament: TournamentRow;
}

type Tab = 'open' | 'mine';

const STATUS_LABEL: Record<string, string> = {
    upcoming: 'Próximamente',
    open: 'Inscripciones abiertas',
    in_progress: 'En juego',
    completed: 'Finalizado',
};

export default function PlayerTournamentsScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();

    const [tab, setTab] = useState<Tab>('open');
    const [openTournaments, setOpenTournaments] = useState<TournamentRow[]>([]);
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        if (!profile) return;

        const [openRes, regRes] = await Promise.all([
            supabase
                .from('tournaments')
                .select('id, name, status, image_url, prize_money, elo_points, entry_fee, max_players, starts_at, location')
                .in('status', ['open', 'in_progress'])
                .order('starts_at', { ascending: true }),

            supabase
                .from('tournament_registrations')
                .select('id, payment_status, tournament:tournaments(id, name, status, image_url, prize_money, elo_points, entry_fee, max_players, starts_at, location)')
                .eq('player_id', profile.id)
                .order('registered_at', { ascending: false }),
        ]);

        if (openRes.data) setOpenTournaments(openRes.data as TournamentRow[]);

        if (regRes.data) {
            const normalized = (regRes.data as any[]).map(r => ({
                ...r,
                tournament: Array.isArray(r.tournament) ? r.tournament[0] : r.tournament,
            })).filter(r => r.tournament);
            setRegistrations(normalized as Registration[]);
        }

        setLoading(false);
    }, [profile]);

    useEffect(() => { load(); }, [load]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const registeredIds = useMemo(
        () => new Set(registrations.map(r => r.tournament.id)),
        [registrations]
    );

    const formatDate = (iso: string | null) => {
        if (!iso) return 'Fecha a confirmar';
        return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const renderTournamentCard = (t: TournamentRow, isRegistered: boolean) => (
        <TouchableOpacity
            key={t.id}
            style={styles.tCard}
            activeOpacity={0.9}
            onPress={() => router.push(`/tournament/${t.id}` as any)}
        >
            <View style={styles.tImageWrap}>
                <Image
                    source={{ uri: t.image_url ?? 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400' }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={StyleSheet.absoluteFill}
                />
                {isRegistered && (
                    <View style={styles.registeredPill}>
                        <Ionicons name="checkmark-circle" size={13} color="#fff" />
                        <Text style={styles.registeredPillText}>INSCRIPTO</Text>
                    </View>
                )}
            </View>

            <View style={styles.tBody}>
                <View style={styles.tTopRow}>
                    <Badge
                        label={STATUS_LABEL[t.status]?.toUpperCase() ?? t.status.toUpperCase()}
                        color={t.status === 'open' ? Colors.primaryContainer : Colors.tertiaryContainer}
                        textColor={t.status === 'open' ? Colors.primary : Colors.tertiary}
                    />
                </View>

                <Text style={styles.tName}>{t.name}</Text>

                <View style={styles.tMetaRow}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.onSurfaceVariant} />
                    <Text style={styles.tMetaText}>{formatDate(t.starts_at)}</Text>
                    {t.location && (
                        <>
                            <View style={styles.metaDot} />
                            <Ionicons name="location-outline" size={13} color={Colors.onSurfaceVariant} />
                            <Text style={styles.tMetaText}>{t.location}</Text>
                        </>
                    )}
                </View>

                <View style={styles.tStatsRow}>
                    <View style={styles.tStat}>
                        <Ionicons name="cash-outline" size={14} color={Colors.primary} />
                        <Text style={styles.tStatText}>
                            ${Number(t.prize_money ?? 0).toLocaleString('es')}
                        </Text>
                    </View>
                    <View style={styles.tStat}>
                        <Ionicons name="trending-up-outline" size={14} color={Colors.primary} />
                        <Text style={styles.tStatText}>{t.elo_points} pts</Text>
                    </View>
                    {!!t.entry_fee && (
                        <View style={styles.tStat}>
                            <Ionicons name="ticket-outline" size={14} color={Colors.primary} />
                            <Text style={styles.tStatText}>
                                ${Number(t.entry_fee).toLocaleString('es')}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );

    const data = tab === 'open' ? openTournaments : registrations.map(r => r.tournament);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Torneos</Text>
                <Text style={styles.subtitle}>Competí, sumá puntos y subí en el ranking</Text>
            </View>

            <View style={styles.tabsRow}>
                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'open' && styles.tabBtnActive]}
                    onPress={() => setTab('open')}
                >
                    <Ionicons
                        name="globe-outline"
                        size={15}
                        color={tab === 'open' ? Colors.onPrimary : Colors.onSurfaceVariant}
                    />
                    <Text style={[styles.tabBtnText, tab === 'open' && styles.tabBtnTextActive]}>
                        Disponibles
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
                    onPress={() => setTab('mine')}
                >
                    <Ionicons
                        name="person-outline"
                        size={15}
                        color={tab === 'mine' ? Colors.onPrimary : Colors.onSurfaceVariant}
                    />
                    <Text style={[styles.tabBtnText, tab === 'mine' && styles.tabBtnTextActive]}>
                        Mis torneos
                    </Text>
                    {registrations.length > 0 && (
                        <View style={styles.tabCount}>
                            <Text style={styles.tabCountText}>{registrations.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {loading ? (
                <SkeletonList count={4} />
            ) : (
                <FlatList
                    data={data}
                    keyExtractor={(t) => t.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                    }
                    renderItem={({ item }) => renderTournamentCard(item, registeredIds.has(item.id))}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons
                                name={tab === 'open' ? 'trophy-outline' : 'ribbon-outline'}
                                size={48}
                                color={Colors.onSurfaceVariant}
                            />
                            <Text style={styles.emptyText}>
                                {tab === 'open'
                                    ? 'No hay torneos abiertos por ahora'
                                    : 'Todavía no estás inscripto en ningún torneo'}
                            </Text>
                            {tab === 'mine' && (
                                <TouchableOpacity onPress={() => setTab('open')}>
                                    <Text style={styles.emptyAction}>Ver torneos disponibles</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    title: { fontFamily: 'Lexend_700Bold', fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5 },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },

    tabsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
    tabBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: Spacing.sm + 2,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabBtnText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    tabBtnTextActive: { color: Colors.onPrimary },
    tabCount: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: Radius.full,
        paddingHorizontal: 6,
        paddingVertical: 1,
        marginLeft: 2,
    },
    tabCountText: { fontFamily: 'Lexend_700Bold', fontSize: 10, color: Colors.onPrimary },

    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: Spacing.xl, gap: Spacing.lg, paddingBottom: 100 },

    tCard: {
        borderRadius: Radius.xl,
        backgroundColor: Colors.surfaceContainerLowest,
        overflow: 'hidden',
        ...Shadow.ambient,
    },
    tImageWrap: { height: 110, position: 'relative' },
    registeredPill: {
        position: 'absolute', top: Spacing.sm, right: Spacing.sm,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.sm, paddingVertical: 3,
    },
    registeredPillText: { fontFamily: 'Lexend_600SemiBold', fontSize: 9, color: '#fff', letterSpacing: 0.3 },

    tBody: { padding: Spacing.base, gap: Spacing.sm },
    tTopRow: { flexDirection: 'row' },
    tName: { fontFamily: 'Lexend_700Bold', fontSize: 17, color: Colors.onSurface, letterSpacing: -0.3 },
    tMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    tMetaText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.onSurfaceVariant, marginHorizontal: 2 },
    tStatsRow: { flexDirection: 'row', gap: Spacing.base, marginTop: 2 },
    tStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tStatText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: Colors.onSurface },

    empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
    emptyAction: { ...Typography.labelLg, color: Colors.primary },
});