// app/organizerTabs/courts.tsx
import React, { useCallback, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { getCourts, deleteCourt, Court } from '../../src/services/organizerService';
import CourtFormModal from '../../src/components/modals/CourtFormModal';

const SURFACE_LABEL: Record<Court['surface'], string> = {
    clay: 'Polvo de ladrillo',
    hard: 'Cemento',
    grass: 'Césped',
    carpet: 'Alfombra',
};

const SURFACE_ICON: Record<Court['surface'], keyof typeof Ionicons.glyphMap> = {
    clay: 'ellipse',
    hard: 'square',
    grass: 'leaf',
    carpet: 'layers',
};

export default function CourtsScreen() {
    const { profile } = useAuthStore();
    const [courts, setCourts] = useState<Court[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editing, setEditing] = useState<Court | null>(null);

    const load = useCallback(async () => {
        if (!profile) return;
        try {
            const data = await getCourts(profile.id);
            setCourts(data);
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

    const openEdit = (c: Court) => {
        setEditing(c);
        setModalVisible(true);
    };

    const handleDelete = (c: Court) => {
        showAlert('Eliminar cancha', `¿Eliminar "${c.name}"?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteCourt(c.id);
                        load();
                    } catch (e: any) {
                        showAlert('No se pudo eliminar', e.message ?? 'Intentá de nuevo');
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Canchas y sedes</Text>
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
                    data={courts}
                    keyExtractor={(c) => c.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                    )}
                    renderItem={({ item: c }) => (
                        <View style={styles.card}>
                            <View style={styles.cardIcon}>
                                <Ionicons name={SURFACE_ICON[c.surface]} size={18} color={Colors.primary} />
                            </View>
                            <View style={styles.cardInfo}>
                                <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
                                <Text style={styles.cardMeta} numberOfLines={1}>
                                    {SURFACE_LABEL[c.surface]} · {c.indoor ? 'Bajo techo' : 'Aire libre'}
                                </Text>
                                {!!c.address && (
                                    <Text style={styles.cardAddress} numberOfLines={1}>{c.address}</Text>
                                )}
                            </View>
                            <View style={styles.cardActions}>
                                <TouchableOpacity onPress={() => openEdit(c)} style={styles.iconBtn}>
                                    <Ionicons name="create-outline" size={18} color={Colors.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleDelete(c)} style={styles.iconBtn}>
                                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Ionicons name="business-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>Todavía no cargaste ninguna cancha.</Text>
                            <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreate}>
                                <Text style={styles.emptyCreateText}>Agregar cancha</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {profile && (
                <CourtFormModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    organizerId={profile.id}
                    editingCourt={editing}
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
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        gap: Spacing.md,
        ...Shadow.ambient,
    },
    cardIcon: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    cardInfo: { flex: 1, gap: 2 },
    cardName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: Colors.onSurface },
    cardMeta: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    cardAddress: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontSize: 12 },
    cardActions: { flexDirection: 'row', gap: Spacing.sm },
    iconBtn: { padding: 6 },
});