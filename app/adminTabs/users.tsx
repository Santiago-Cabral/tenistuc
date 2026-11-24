import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { LEVELS } from '../../src/constants/levels';
import { AGE_CATEGORIES } from '../../src/constants/ageCategories';
import {
    listUsers, deleteUser, updateUser,
    AdminUser, AdminGender, AdminUserChanges,
} from '../../src/services/adminService';
import { showAlert } from '../../src/services/appAlert';
import { Avatar, InputField } from '../../src/components/ui';
import {
    AdminHeader, Card, Chip, Loader, EmptyState, RowAction, OptionGroup, EditorModal,
} from '../../src/screens/admin/AdminUi';

const ROLE_OPTIONS = ['athlete', 'organizer', 'admin'] as const;
const GENDER_OPTIONS = ['ninguno', 'femenino', 'masculino', 'otro'] as const;

function roleTone(role: string): 'primary' | 'warning' | 'danger' {
    if (role === 'admin') return 'danger';
    if (role === 'organizer') return 'warning';
    return 'primary';
}

function emptyForm(): AdminUserChanges {
    return {
        username: '',
        fullName: '',
        role: 'athlete',
        city: '',
        club: '',
        elo: 1000,
        level: '6ta',
        ageCategory: 'libre',
        gender: null,
        bio: '',
    };
}

export default function AdminUsers() {
    const { profile } = useAuthStore();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState<AdminUser | null>(null);
    const [form, setForm] = useState<AdminUserChanges>(emptyForm);
    const [genderValue, setGenderValue] = useState<(typeof GENDER_OPTIONS)[number]>('ninguno');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setUsers(await listUsers());
        } catch (e) {
            showAlert('Error', e instanceof Error ? e.message : 'No se pudo cargar los usuarios.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const filtered = users.filter((u) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [u.full_name, u.username, u.city, u.club].some(
            (value) => value?.toLowerCase().includes(q)
        );
    });

    const openEditor = (user: AdminUser) => {
        setForm({
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            city: user.city ?? '',
            club: user.club ?? '',
            elo: user.elo,
            level: user.level,
            ageCategory: user.age_category,
            gender: user.gender,
            bio: user.bio ?? '',
        });
        setGenderValue(user.gender ?? 'ninguno');
        setEditing(user);
    };

    const confirmDelete = (user: AdminUser) => {
        showAlert(
            'Eliminar usuario',
            `Se va a borrar la cuenta de ${user.full_name || `@${user.username}`} y todos sus datos. No se puede deshacer.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteUser(user.id);
                            showAlert('Usuario eliminado', 'La cuenta y sus datos se borraron.');
                            load();
                        } catch (e) {
                            showAlert('No se pudo eliminar', e instanceof Error ? e.message : 'Intentá de nuevo.');
                        }
                    },
                },
            ]
        );
    };

    const save = async () => {
        if (!editing) return;
        if (!form.username.trim()) {
            showAlert('Falta info', 'El nombre de usuario es obligatorio.');
            return;
        }
        setSaving(true);
        try {
            await updateUser(editing.id, form);
            setEditing(null);
            showAlert('Cambios guardados', 'El perfil se actualizó.');
            load();
        } catch (e) {
            showAlert('No se pudo guardar', e instanceof Error ? e.message : 'Intentá de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const patch = (changes: Partial<AdminUserChanges>) => setForm((prev) => ({ ...prev, ...changes }));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                refreshControl={(
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
                )}
            >
                <AdminHeader title="Usuarios" subtitle="Buscá, editá o eliminá cuentas" />

                <View style={styles.searchWrap}>
                    <Ionicons name="search-outline" size={18} color={Colors.outline} />
                    <Text style={styles.searchLabel}>Buscar usuario</Text>
                </View>
                <InputField
                    placeholder="Nombre, @usuario, ciudad o club"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    style={styles.searchField}
                />
                <Text style={styles.count}>{filtered.length} de {users.length} usuarios</Text>

                {loading ? (
                    <Loader />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="people-outline"
                        title="Sin resultados"
                        message={query ? 'Probá con otro nombre o usuario.' : 'Todavía no hay usuarios registrados.'}
                    />
                ) : (
                    filtered.map((user) => (
                        <Card key={user.id}>
                            <View style={styles.rowHead}>
                                <Avatar uri={user.avatar_url} size={42} />
                                <View style={styles.rowInfo}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>
                                        {user.full_name || `@${user.username}`}
                                    </Text>
                                    <Text style={styles.rowSubtitle} numberOfLines={1}>@{user.username}</Text>
                                </View>
                                <Chip label={user.role} tone={roleTone(user.role)} />
                            </View>

                            <View style={styles.metaRow}>
                                <Text style={styles.meta}>Nivel {user.level}</Text>
                                <Text style={styles.meta}>{user.age_category === 'libre' ? 'Edad libre' : user.age_category}</Text>
                                <Text style={styles.meta}>ELO {user.elo}</Text>
                            </View>

                            <View style={styles.rowActions}>
                                <RowAction
                                    icon="create-outline"
                                    label="Editar"
                                    onPress={() => openEditor(user)}
                                />
                                <RowAction
                                    icon="trash-outline"
                                    label="Eliminar"
                                    tone="danger"
                                    onPress={() => confirmDelete(user)}
                                    disabled={user.id === profile?.id}
                                />
                            </View>
                        </Card>
                    ))
                )}
            </ScrollView>

            <EditorModal
                visible={!!editing}
                title="Editar usuario"
                onClose={() => setEditing(null)}
                onSave={save}
                saving={saving}
            >
                <OptionGroup
                    label="Rol"
                    options={ROLE_OPTIONS}
                    value={form.role}
                    onChange={(role) => patch({ role })}
                />
                <InputField label="Usuario" value={form.username} onChangeText={(username) => patch({ username })} autoCorrect={false} />
                <InputField label="Nombre completo" value={form.fullName} onChangeText={(fullName) => patch({ fullName })} />
                <InputField label="Ciudad" value={form.city} onChangeText={(city) => patch({ city })} />
                <InputField label="Club" value={form.club} onChangeText={(club) => patch({ club })} />
                <InputField
                    label="ELO"
                    value={String(form.elo)}
                    onChangeText={(text) => patch({ elo: Number.parseInt(text, 10) || 0 })}
                    keyboardType="numeric"
                />
                <OptionGroup label="Nivel" options={LEVELS} value={form.level} onChange={(level) => patch({ level })} />
                <OptionGroup
                    label="Categoría de edad"
                    options={AGE_CATEGORIES}
                    value={form.ageCategory}
                    onChange={(ageCategory) => patch({ ageCategory })}
                />
                <OptionGroup
                    label="Género"
                    options={GENDER_OPTIONS}
                    value={genderValue}
                    onChange={(value) => {
                        setGenderValue(value);
                        patch({ gender: value === 'ninguno' ? null : value as AdminGender });
                    }}
                />
                <InputField
                    label="Biografía"
                    value={form.bio}
                    onChangeText={(bio) => patch({ bio })}
                    multiline
                />
            </EditorModal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 100, gap: Spacing.sm },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    searchLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
    searchField: { marginBottom: Spacing.sm },
    count: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    rowInfo: { flex: 1, gap: 2 },
    rowTitle: { ...Typography.titleSm, color: Colors.onSurface },
    rowSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
    },
    meta: {
        fontSize: 11,
        color: Colors.onSurfaceVariant,
        backgroundColor: Colors.surfaceContainer,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    rowActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
});
