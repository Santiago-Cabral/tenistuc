import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { listUsers, listTournaments, AdminUser, AdminTournament } from '../../src/services/adminService';
import { showAlert } from '../../src/services/appAlert';
import {
    AdminHeader, Card, Chip, StatCard, SectionTitle, Loader, RowAction,
} from '../../src/screens/admin/AdminUi';

function roleTone(role: string): 'primary' | 'warning' | 'danger' | 'neutral' {
    if (role === 'admin') return 'danger';
    if (role === 'organizer') return 'warning';
    return 'primary';
}

function statusLabel(status: string) {
    if (status === 'open') return 'Inscripciones abiertas';
    if (status === 'upcoming') return 'Próximo';
    if (status === 'closed') return 'Lista cerrada';
    if (status === 'in_progress') return 'En curso';
    return 'Finalizado';
}

export default function AdminDashboard() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const [u, t] = await Promise.all([listUsers(), listTournaments()]);
            setUsers(u);
            setTournaments(t);
        } catch (e) {
            showAlert('Error', e instanceof Error ? e.message : 'No se pudo cargar el panel.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const activeTournaments = tournaments.filter(
        (t) => t.status === 'open' || t.status === 'upcoming' || t.status === 'in_progress'
    ).length;
    const admins = users.filter((u) => u.role === 'admin').length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                refreshControl={(
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
                )}
            >
                <AdminHeader
                    title={`Hola, ${profile?.full_name?.split(' ')[0] ?? 'Admin'}`}
                    subtitle="Panel de administración de TenisTuc"
                />

                <View style={styles.privacyNote}>
                    <Ionicons name="eye-off-outline" size={17} color={Colors.secondary} />
                    <Text style={styles.privacyText}>
                        Este panel no tiene bandeja de mensajes: sólo gestionás usuarios y torneos.
                    </Text>
                </View>

                {loading ? (
                    <Loader />
                ) : (
                    <>
                        <View style={styles.statsGrid}>
                            <StatCard icon="people-outline" label="Usuarios" value={String(users.length)} />
                            <StatCard icon="trophy-outline" label="Torneos activos" value={String(activeTournaments)} tone="warning" />
                            <StatCard icon="shield-checkmark-outline" label="Administradores" value={String(admins)} tone="danger" />
                            <StatCard icon="calendar-outline" label="Torneos totales" value={String(tournaments.length)} tone="neutral" />
                        </View>

                        <SectionTitle>Accesos rápidos</SectionTitle>
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={styles.action}
                                onPress={() => router.push('/adminTabs/users' as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="people-outline" size={22} color={Colors.primary} />
                                <Text style={styles.actionText}>Usuarios</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.action}
                                onPress={() => router.push('/adminTabs/tournaments' as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="trophy-outline" size={22} color={Colors.primary} />
                                <Text style={styles.actionText}>Torneos</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.action}
                                onPress={() => router.push('/adminTabs/account' as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="settings-outline" size={22} color={Colors.primary} />
                                <Text style={styles.actionText}>Cuenta</Text>
                            </TouchableOpacity>
                        </View>

                        <SectionTitle>Últimos usuarios</SectionTitle>
                        <Card>
                            {users.length === 0 ? (
                                <Text style={styles.emptyText}>No hay usuarios registrados.</Text>
                            ) : users.slice(0, 5).map((u) => (
                                <View key={u.id} style={styles.row}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowTitle} numberOfLines={1}>
                                            {u.full_name || `@${u.username}`}
                                        </Text>
                                        <Text style={styles.rowSubtitle} numberOfLines={1}>@{u.username}</Text>
                                    </View>
                                    <Chip label={u.role} tone={roleTone(u.role)} />
                                </View>
                            ))}
                            <View style={styles.cardFooter}>
                                <RowAction
                                    icon="arrow-forward-outline"
                                    label="Ver todos"
                                    tone="neutral"
                                    onPress={() => router.push('/adminTabs/users' as any)}
                                />
                            </View>
                        </Card>

                        <SectionTitle>Últimos torneos</SectionTitle>
                        <Card>
                            {tournaments.length === 0 ? (
                                <Text style={styles.emptyText}>No hay torneos creados.</Text>
                            ) : tournaments.slice(0, 5).map((t) => (
                                <View key={t.id} style={styles.row}>
                                    <View style={styles.rowInfo}>
                                        <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
                                        <Text style={styles.rowSubtitle}>{statusLabel(t.status)}</Text>
                                    </View>
                                    <Chip label={t.status} tone={t.status === 'open' ? 'primary' : 'neutral'} />
                                </View>
                            ))}
                            <View style={styles.cardFooter}>
                                <RowAction
                                    icon="arrow-forward-outline"
                                    label="Ver todos"
                                    tone="neutral"
                                    onPress={() => router.push('/adminTabs/tournaments' as any)}
                                />
                            </View>
                        </Card>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 100, gap: Spacing.sm },
    privacyNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.secondaryContainer,
        borderRadius: Radius.lg,
        padding: Spacing.base,
        marginBottom: Spacing.lg,
    },
    privacyText: { ...Typography.bodySm, color: Colors.onSecondaryContainer, flex: 1 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
    actions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
    action: {
        flex: 1,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        gap: Spacing.sm,
        ...Shadow.ambient,
    },
    actionText: { ...Typography.labelSm, color: Colors.onSurface },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHigh,
    },
    rowInfo: { flex: 1, gap: 2 },
    rowTitle: { ...Typography.titleSm, color: Colors.onSurface },
    rowSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    rowActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    cardFooter: { alignItems: 'flex-start', paddingTop: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingVertical: Spacing.lg },
});
