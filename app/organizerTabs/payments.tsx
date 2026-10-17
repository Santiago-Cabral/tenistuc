// app/organizerTabs/payments.tsx
import React, { useCallback, useMemo, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { Avatar } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import {
    getPayments, markPaymentStatus, PendingPayment,
} from '../../src/services/organizerService';
import { notifyUser } from '../../src/services/notificationService';

type FilterKey = 'all' | 'pending' | 'paid';

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

function formatMoney(n: number | null | undefined) {
    return `$${Number(n ?? 0).toLocaleString('es-AR')}`;
}

export default function PaymentsScreen() {
    const { profile } = useAuthStore();
    const [payments, setPayments] = useState<PendingPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterKey>('pending');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!profile) return;
        try {
            const data = await getPayments(profile.id);
            setPayments(data);
        } catch (e) {
            console.warn('[payments] no se pudieron cargar los pagos:', e);
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

    const filtered = useMemo(() => {
        if (filter === 'all') return payments;
        return payments.filter((p) => p.payment_status === filter);
    }, [payments, filter]);

    const pendingTotal = payments.filter((p) => p.payment_status === 'pending').length;
    const collectedTotal = payments
        .filter((p) => p.payment_status === 'paid')
        .reduce((sum, p) => sum + (p.entry_fee ?? 0), 0);

    const togglePayment = async (item: PendingPayment) => {
        const nextStatus = item.payment_status === 'paid' ? 'pending' : 'paid';
        setUpdatingId(item.id);
        // optimista
        setPayments((prev) => prev.map((p) => (p.id === item.id ? { ...p, payment_status: nextStatus } : p)));
        try {
            await markPaymentStatus(item.id, nextStatus);

            // avisamos al jugador cuando se confirma su pago (manual/efectivo)
            if (nextStatus === 'paid') {
                try {
                    await notifyUser({
                        userId: item.player_id,
                        type: 'tournament_registration',
                        title: 'Inscripción confirmada',
                        body: `Tu lugar en ${item.tournament_name} quedó habilitado. ¡Nos vemos en la cancha!`,
                        relatedId: item.tournament_id,
                    });
                } catch {
                    // el flujo principal no debe romperse si el push falla
                }
            }
        } catch (e: any) {
            // revertir si falla
            setPayments((prev) => prev.map((p) => (p.id === item.id ? { ...p, payment_status: item.payment_status } : p)));
            showAlert('No se pudo actualizar', e.message ?? 'Intentá de nuevo');
        } finally {
            setUpdatingId(null);
        }
    };

    const notifyPlayer = (item: PendingPayment) => {
        showAlert(
            'Enviar aviso',
            `¿Avisar a ${item.player_name} sobre "${item.tournament_name}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Enviar',
                    onPress: async () => {
                        try {
                            await notifyUser({
                                userId: item.player_id,
                                type: 'tournament_update',
                                title: 'Aviso del organizador',
                                body: `Consultá las novedades del torneo "${item.tournament_name}" en la app.`,
                                relatedId: item.tournament_id,
                            });
                            showAlert('Listo', 'Aviso enviado.');
                        } catch (e: any) {
                            showAlert('No se pudo enviar', e.message ?? 'Intentá de nuevo');
                        }
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Jugadores</Text>
                <Text style={styles.subtitle}>
                    {pendingTotal} por habilitar · {formatMoney(collectedTotal)} en inscripciones
                </Text>
            </View>

            <View style={styles.filtersRow}>
                {([
                    { key: 'pending', label: 'Pendientes' },
                    { key: 'paid', label: 'Habilitados' },
                    { key: 'all', label: 'Todos' },
                ] as { key: FilterKey; label: string }[]).map((f) => (
                    <TouchableOpacity
                        key={f.key}
                        style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                        onPress={() => setFilter(f.key)}
                    >
                        <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                    )}
                    renderItem={({ item: p }) => {
                        const isEnabled = p.payment_status === 'paid';
                        return (
                            <View style={styles.row}>
                                <Avatar uri={p.player_avatar} size={44} />
                                <View style={styles.rowInfo}>
                                    <Text style={styles.rowName} numberOfLines={1}>{p.player_name}</Text>
                                    <Text style={styles.rowMeta} numberOfLines={1}>
                                        {p.tournament_name} · {formatDate(p.registered_at)}
                                    </Text>
                                </View>
                                <View style={styles.rowRight}>
                                    <Text style={styles.rowFee}>{formatMoney(p.entry_fee)}</Text>
                                    <TouchableOpacity
                                        style={styles.notifyBtn}
                                        onPress={() => notifyPlayer(p)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.statusBtn, isEnabled ? styles.statusBtnPaid : styles.statusBtnPending]}
                                        onPress={() => togglePayment(p)}
                                        disabled={updatingId === p.id}
                                    >
                                        {updatingId === p.id ? (
                                            <ActivityIndicator size="small" color={isEnabled ? Colors.primary : Colors.onSurfaceVariant} />
                                        ) : (
                                            <>
                                                <Ionicons
                                                    name={isEnabled ? 'checkmark-circle' : 'add-circle-outline'}
                                                    size={14}
                                                    color={isEnabled ? Colors.primary : Colors.onSurfaceVariant}
                                                />
                                                <Text style={[styles.statusBtnText, { color: isEnabled ? Colors.primary : Colors.onSurfaceVariant }]}>
                                                    {isEnabled ? 'Habilitado' : 'Habilitar'}
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Ionicons name="card-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>
                                {filter === 'pending' ? 'No hay jugadores por habilitar.' : 'No hay inscripciones todavía.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
    title: { ...Typography.headlineLg, color: Colors.onSurface },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },

    filtersRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
    filterChip: {
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterChipText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    filterChipTextActive: { color: Colors.onPrimary },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingTop: 80, paddingHorizontal: Spacing.xxxl },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },

    list: { paddingHorizontal: Spacing.xl, paddingBottom: 100 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
    rowInfo: { flex: 1, gap: 2 },
    rowName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: Colors.onSurface },
    rowMeta: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    rowRight: { alignItems: 'flex-end', gap: 6 },
    rowFee: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: Colors.onSurface },
    notifyBtn: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: `${Colors.primary}14`,
        alignItems: 'center', justifyContent: 'center',
    },
    statusBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 4,
        borderRadius: Radius.full,
    },
    statusBtnPaid: { backgroundColor: `${Colors.primary}1A` },
    statusBtnPending: { backgroundColor: Colors.surfaceContainerHigh },
    statusBtnText: { ...Typography.labelSm, fontSize: 11 },
    separator: { height: 1, backgroundColor: Colors.surfaceContainerLow },
});