// app/organizerTabs/dashboard.tsx
import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import {
    getDashboardStats, getMyTournaments, Tournament,
} from '../../src/services/organizerService';
import CreateTournamentModal from '../../src/components/modals/CreateTournamentModal';

interface Stats {
    totalTournaments: number;
    activeTournaments: number;
    totalPlayers: number;
    totalRevenue: number;
    pendingPayments: number;
}

function StatCard({
    icon, label, value, color,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
    return (
        <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

function statusLabel(status: string) {
    if (status === 'open') return 'Inscripciones abiertas';
    if (status === 'in_progress') return 'En curso';
    return 'Finalizado';
}

function statusColor(status: string) {
    if (status === 'open') return Colors.primary;
    if (status === 'in_progress') return Colors.tertiary;
    return Colors.onSurfaceVariant;
}

export default function Dashboard() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [stats, setStats] = useState<Stats | null>(null);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createVisible, setCreateVisible] = useState(false);

    const load = useCallback(async () => {
        if (!profile) return;
        try {
            const [s, t] = await Promise.all([
                getDashboardStats(profile.id),
                getMyTournaments(profile.id),
            ]);
            setStats(s);
            setTournaments(t.slice(0, 5));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [profile]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const handleRefresh = () => {
        setRefreshing(true);
        load();
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                refreshControl={(
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                )}
            >
                <Text style={styles.greeting}>Hola, {profile?.full_name?.split(' ')[0] ?? 'Organizador'}</Text>
                <Text style={styles.subtitle}>Así está tu actividad hoy</Text>

                {loading ? (
                    <View style={styles.loaderBox}>
                        <ActivityIndicator color={Colors.primary} />
                    </View>
                ) : (
                    <>
                        <View style={styles.statsGrid}>
                            <StatCard
                                icon="trophy-outline"
                                label="Torneos activos"
                                value={String(stats?.activeTournaments ?? 0)}
                                color={Colors.primary}
                            />
                            <StatCard
                                icon="people-outline"
                                label="Inscriptos totales"
                                value={String(stats?.totalPlayers ?? 0)}
                                color={Colors.tertiary}
                            />
                            <StatCard
                                icon="cash-outline"
                                label="Recaudado"
                                value={`$${(stats?.totalRevenue ?? 0).toLocaleString('es-AR')}`}
                                color={Colors.primary}
                            />
                            <StatCard
                                icon="alert-circle-outline"
                                label="Pagos pendientes"
                                value={String(stats?.pendingPayments ?? 0)}
                                color={Colors.error}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>Accesos rápidos</Text>
                        <View style={styles.quickActions}>
                            <TouchableOpacity
                                style={styles.quickAction}
                                onPress={() => setCreateVisible(true)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="add-circle" size={22} color={Colors.primary} />
                                <Text style={styles.quickActionText}>Crear torneo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickAction}
                                onPress={() => router.push('/organizerTabs/payments' as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="card" size={22} color={Colors.primary} />
                                <Text style={styles.quickActionText}>Ver pagos pendientes</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickAction}
                                onPress={() => router.push('/organizerTabs/fixture' as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="git-network" size={22} color={Colors.primary} />
                                <Text style={styles.quickActionText}>Armar fixture</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Tus últimos torneos</Text>
                            <TouchableOpacity onPress={() => router.push('/organizerTabs/tournaments' as any)}>
                                <Text style={styles.seeAll}>Ver todos</Text>
                            </TouchableOpacity>
                        </View>

                        {tournaments.length === 0 ? (
                            <View style={styles.emptyTournaments}>
                                <Ionicons name="trophy-outline" size={36} color={Colors.onSurfaceVariant} />
                                <Text style={styles.emptyText}>Todavía no creaste ningún torneo.</Text>
                                <TouchableOpacity onPress={() => setCreateVisible(true)}>
                                    <Text style={styles.emptyAction}>Crear el primero</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            tournaments.map((t) => (
                                <TouchableOpacity
                                    key={t.id}
                                    style={styles.tournamentRow}
                                    onPress={() => router.push(`/tournament/${t.id}` as any)}
                                    activeOpacity={0.85}
                                >
                                    <View style={styles.tournamentInfo}>
                                        <Text style={styles.tournamentName} numberOfLines={1}>{t.name}</Text>
                                        <Text style={[styles.tournamentStatus, { color: statusColor(t.status) }]}>
                                            {statusLabel(t.status)}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={Colors.onSurfaceVariant} />
                                </TouchableOpacity>
                            ))
                        )}
                    </>
                )}
            </ScrollView>

            {profile && (
                <CreateTournamentModal
                    visible={createVisible}
                    onClose={() => setCreateVisible(false)}
                    organizerId={profile.id}
                    editingTournament={null}
                    onSaved={() => {
                        setCreateVisible(false);
                        load();
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 100, gap: Spacing.sm },
    greeting: { ...Typography.headlineLg, color: Colors.onSurface },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginBottom: Spacing.lg },
    loaderBox: { paddingVertical: 60, alignItems: 'center' },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.xl },
    statCard: {
        width: '47%',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        gap: 4,
        ...Shadow.ambient,
    },
    statIcon: {
        width: 32, height: 32, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    statValue: { fontFamily: 'Lexend_700Bold', fontSize: 22, color: Colors.onSurface },
    statLabel: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    sectionTitle: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: Spacing.md },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg },
    seeAll: { ...Typography.labelSm, color: Colors.primary },

    quickActions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
    quickAction: {
        flex: 1,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        gap: Spacing.sm,
        ...Shadow.ambient,
    },
    quickActionText: { ...Typography.labelSm, color: Colors.onSurface, textAlign: 'center' },

    tournamentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.sm,
        ...Shadow.ambient,
    },
    tournamentInfo: { flex: 1, gap: 2 },
    tournamentName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: Colors.onSurface },
    tournamentStatus: { ...Typography.bodySm, fontSize: 12 },

    emptyTournaments: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.sm },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    emptyAction: { ...Typography.labelLg, color: Colors.primary },
});