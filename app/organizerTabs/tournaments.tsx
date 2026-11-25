// app/organizerTabs/tournaments.tsx
import React, { useCallback, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl, Modal, Pressable,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import {
    getMyTournaments, deleteTournament, setTournamentStatus,
    TOURNAMENT_STATUSES, TOURNAMENT_STATUS_LABEL, TOURNAMENT_STATUS_HINT,
    Tournament, TournamentStatus,
} from '../../src/services/organizerService';
import { notifyUser } from '../../src/services/notificationService';
import CreateTournamentModal from '../../src/components/modals/CreateTournamentModal';

const STATUS_COLOR: Record<TournamentStatus, string> = {
    upcoming: Colors.onSurfaceVariant,
    open: Colors.primary,
    closed: Colors.tertiary,
    in_progress: Colors.tertiary,
    completed: Colors.onSurfaceVariant,
};

function statusInfo(status: TournamentStatus) {
    return {
        label: TOURNAMENT_STATUS_LABEL[status] ?? status,
        color: STATUS_COLOR[status] ?? Colors.onSurfaceVariant,
    };
}

export default function TournamentsScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editing, setEditing] = useState<Tournament | null>(null);
    const [statusEditing, setStatusEditing] = useState<Tournament | null>(null);

    const load = useCallback(async () => {
        if (!profile) return;
        try {
            const data = await getMyTournaments(profile.id);
            setTournaments(data);
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

    const openCreate = () => {
        setEditing(null);
        setModalVisible(true);
    };

    const openEdit = (t: Tournament) => {
        setEditing(t);
        setModalVisible(true);
    };

    const handleDelete = (t: Tournament) => {
        showAlert(
            'Eliminar torneo',
            `¿Seguro que querés eliminar "${t.name}"? Esta acción no se puede deshacer.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteTournament(t.id);
                            load();
                        } catch (e: any) {
                            showAlert('No se pudo eliminar', e.message ?? 'Intentá de nuevo');
                        }
                    },
                },
            ],
        );
    };

    const handleChangeStatus = (t: Tournament, next: TournamentStatus) => {
        setStatusEditing(null);
        if (next === t.status) return;

        showAlert(
            'Cambiar estado',
            `¿Pasar "${t.name}" a ${TOURNAMENT_STATUS_LABEL[next]}? Los jugadores verán el nuevo estado y se avisará a los inscriptos.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: async () => {
                        try {
                            await setTournamentStatus(t.id, next);
                            showAlert('Estado actualizado', `${t.name} ahora está ${TOURNAMENT_STATUS_LABEL[next]}.`);
                            load();
                        } catch (e: any) {
                            showAlert('No se pudo actualizar', e.message ?? 'Intentá de nuevo');
                        }
                    },
                },
            ],
        );
    };

    const handleNotifyAll = async (t: Tournament) => {
        try {
            const { data: registrations, error } = await supabase
                .from('tournament_registrations')
                .select('player_id')
                .eq('tournament_id', t.id);
            if (error) throw error;

            if (!registrations || registrations.length === 0) {
                showAlert('Sin inscriptos', 'Todavía no hay jugadores para notificar.');
                return;
            }

            let sent = 0;
            for (const { player_id } of registrations) {
                await notifyUser({
                    userId: player_id,
                    type: 'tournament_update',
                    title: 'Aviso del organizador',
                    body: `Consultá las novedades del torneo "${t.name}" en la app.`,
                    relatedId: t.id,
                });
                sent += 1;
            }
            showAlert('Listo', `Aviso enviado a ${sent} inscripto(s).`);
        } catch (e: any) {
            showAlert('No se pudo notificar', e.message ?? 'Intentá de nuevo');
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Mis torneos</Text>
                <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
                    <Ionicons name="add" size={22} color={Colors.onPrimary} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={tournaments}
                    keyExtractor={(t) => t.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                    )}
                    renderItem={({ item: t }) => {
                        const info = statusInfo(t.status);
                        return (
                            <View style={styles.card}>
                                <View style={styles.cardTop}>
                                    <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
                                    <View style={[styles.statusPill, { backgroundColor: `${info.color}22` }]}>
                                        <Text style={[styles.statusPillText, { color: info.color }]}>{info.label}</Text>
                                    </View>
                                </View>

                                <View style={styles.cardMetaRow}>
                                    <Ionicons name="location-outline" size={13} color={Colors.onSurfaceVariant} />
                                    <Text style={styles.cardMetaText} numberOfLines={1}>
                                        {t.location ?? 'Sin sede definida'}
                                    </Text>
                                </View>
                                <View style={styles.cardMetaRow}>
                                    <Ionicons name="cash-outline" size={13} color={Colors.onSurfaceVariant} />
                                    <Text style={styles.cardMetaText}>
                                        Entrada ${t.entry_fee ?? 0} · Premio ${t.prize_money ?? 0}
                                    </Text>
                                </View>

                                <View style={styles.cardActions}>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => setStatusEditing(t)}
                                    >
                                        <Ionicons name="options-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.actionBtnText}>Estado</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleNotifyAll(t)}
                                    >
                                        <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.actionBtnText}>Aviso</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => openEdit(t)}
                                    >
                                        <Ionicons name="create-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.actionBtnText}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => router.push('/organizerTabs/fixture' as any)}
                                    >
                                        <Ionicons name="git-network-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.actionBtnText}>Fixture</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => handleDelete(t)}
                                    >
                                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                                        <Text style={[styles.actionBtnText, { color: Colors.error }]}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Ionicons name="trophy-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>Todavía no creaste ningún torneo.</Text>
                            <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreate}>
                                <Text style={styles.emptyCreateText}>Crear torneo</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {profile && (
                <CreateTournamentModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    organizerId={profile.id}
                    editingTournament={editing}
                    onSaved={() => {
                        setModalVisible(false);
                        load();
                    }}
                />
            )}

            <Modal
                visible={!!statusEditing}
                transparent
                animationType="fade"
                onRequestClose={() => setStatusEditing(null)}
            >
                <View style={styles.statusBackdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setStatusEditing(null)} />
                    <View style={styles.statusCard}>
                        <View style={styles.statusHeader}>
                            <Text style={styles.statusTitle}>Estado del torneo</Text>
                            <TouchableOpacity onPress={() => setStatusEditing(null)} hitSlop={8}>
                                <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                            </TouchableOpacity>
                        </View>
                        {statusEditing && (
                            <>
                                <Text style={styles.statusTournament} numberOfLines={1}>{statusEditing.name}</Text>
                                <Text style={styles.statusNote}>
                                    Los estados son los que ven los jugadores. Solo con Inscripciones abiertas se pueden anotar nuevos participantes.
                                </Text>
                                <View style={styles.statusOptions}>
                                    {TOURNAMENT_STATUSES.map((status) => {
                                        const active = statusEditing.status === status;
                                        return (
                                            <TouchableOpacity
                                                key={status}
                                                style={[styles.statusOption, active && styles.statusOptionActive]}
                                                onPress={() => handleChangeStatus(statusEditing, status)}
                                                activeOpacity={0.8}
                                            >
                                                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
                                                <View style={styles.statusOptionInfo}>
                                                    <Text style={[styles.statusOptionLabel, active && styles.statusOptionLabelActive]}>
                                                        {TOURNAMENT_STATUS_LABEL[status]}
                                                    </Text>
                                                    <Text style={styles.statusOptionHint}>{TOURNAMENT_STATUS_HINT[status]}</Text>
                                                </View>
                                                {active && (
                                                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl, paddingVertical: Spacing.base,
    },
    title: { ...Typography.headlineLg, color: Colors.onSurface },
    addBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingTop: 80, paddingHorizontal: Spacing.xxxl },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
    emptyCreateBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md },
    emptyCreateText: { ...Typography.labelLg, color: Colors.onPrimary },

    list: { paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: Spacing.md },
    card: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        gap: Spacing.sm,
        ...Shadow.ambient,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    cardName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: Colors.onSurface, flex: 1 },
    statusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
    statusPillText: { ...Typography.labelSm, fontSize: 11 },

    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMetaText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, flex: 1 },

    cardActions: {
        flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.lg, rowGap: Spacing.sm,
        marginTop: Spacing.sm, paddingTop: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.surfaceContainerHigh,
    },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    actionBtnText: { ...Typography.labelSm, color: Colors.primary },

    statusBackdrop: {
        flex: 1, backgroundColor: Colors.scrim,
        alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
    },
    statusCard: {
        width: '100%', maxWidth: 420, maxHeight: '85%',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.sm,
        ...Shadow.float,
    },
    statusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusTitle: { ...Typography.titleLg, color: Colors.onSurface, fontFamily: 'Lexend_700Bold' },
    statusTournament: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    statusNote: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
    statusOptions: { gap: Spacing.sm },
    statusOption: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.lg, padding: Spacing.base,
    },
    statusOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryContainer },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusOptionInfo: { flex: 1, gap: 2 },
    statusOptionLabel: { ...Typography.labelLg, color: Colors.onSurface },
    statusOptionLabelActive: { color: Colors.primary },
    statusOptionHint: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
});