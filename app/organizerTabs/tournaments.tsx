// app/organizerTabs/tournaments.tsx
import React, { useCallback, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import {
    getMyTournaments, deleteTournament, setTournamentListStatus, Tournament,
} from '../../src/services/organizerService';
import { notifyUser } from '../../src/services/notificationService';
import CreateTournamentModal from '../../src/components/modals/CreateTournamentModal';

function statusInfo(status: string) {
    if (status === 'open') return { label: 'Inscripciones abiertas', color: Colors.primary };
    if (status === 'closed') return { label: 'Lista cerrada', color: Colors.tertiary };
    if (status === 'in_progress') return { label: 'En curso', color: Colors.tertiary };
    return { label: 'Finalizado', color: Colors.onSurfaceVariant };
}

export default function TournamentsScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editing, setEditing] = useState<Tournament | null>(null);

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

    const handleToggleList = (t: Tournament) => {
        const closing = t.status === 'open';
        showAlert(
            closing ? 'Cerrar lista' : 'Reabrir lista',
            closing
                ? `¿Cerrar la inscripción para "${t.name}"? Nadie más podrá inscribirse y se avisará a los inscriptos.`
                : `¿Reabrir la inscripción para "${t.name}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: closing ? 'Cerrar' : 'Reabrir',
                    onPress: async () => {
                        try {
                            await setTournamentListStatus(t.id, closing ? 'closed' : 'open');
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
                                    {t.status === 'open' || t.status === 'closed' ? (
                                        <TouchableOpacity
                                            style={styles.actionBtn}
                                            onPress={() => handleToggleList(t)}
                                        >
                                            <Ionicons
                                                name={t.status === 'open' ? 'lock-closed-outline' : 'lock-open-outline'}
                                                size={16}
                                                color={Colors.primary}
                                            />
                                            <Text style={styles.actionBtnText}>
                                                {t.status === 'open' ? 'Cerrar lista' : 'Reabrir'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
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

    cardActions: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerHigh },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    actionBtnText: { ...Typography.labelSm, color: Colors.primary },
});