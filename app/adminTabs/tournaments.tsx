import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '../../src/theme';
import { LEVELS } from '../../src/constants/levels';
import {
    listTournaments, deleteTournament, updateTournament,
    AdminTournament, AdminTournamentChanges, AdminTournamentGender,
    AdminTournamentLevel, AdminTournamentStatus,
} from '../../src/services/adminService';
import { showAlert } from '../../src/services/appAlert';
import { InputField } from '../../src/components/ui';
import {
    AdminHeader, Card, Chip, Loader, EmptyState, RowAction, OptionGroup, EditorModal,
} from '../../src/screens/admin/AdminUi';

const STATUS_OPTIONS: readonly AdminTournamentStatus[] = [
    'upcoming', 'open', 'closed', 'in_progress', 'completed',
];
const GENDER_OPTIONS: readonly AdminTournamentGender[] = ['todos', 'femenino', 'masculino'];
const LEVEL_OPTIONS: readonly AdminTournamentLevel[] = ['todas', ...LEVELS];

const STATUS_LABEL: Record<AdminTournamentStatus, string> = {
    upcoming: 'Próximo',
    open: 'Inscripciones abiertas',
    closed: 'Lista cerrada',
    in_progress: 'En curso',
    completed: 'Finalizado',
};

function statusTone(status: AdminTournamentStatus): 'primary' | 'warning' | 'danger' | 'neutral' {
    if (status === 'open') return 'primary';
    if (status === 'upcoming' || status === 'in_progress') return 'warning';
    if (status === 'completed') return 'neutral';
    return 'danger';
}

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function emptyForm(): AdminTournamentChanges {
    return {
        name: '',
        description: '',
        status: 'open',
        maxPlayers: null,
        location: '',
        startsAt: null,
        allowedGender: 'todos',
        allowedLevel: 'todas',
        prizeMoney: 0,
        entryFee: 0,
    };
}

export default function AdminTournaments() {
    const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState<AdminTournament | null>(null);
    const [form, setForm] = useState<AdminTournamentChanges>(emptyForm);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setTournaments(await listTournaments());
        } catch (e) {
            showAlert('Error', e instanceof Error ? e.message : 'No se pudo cargar los torneos.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const filtered = tournaments.filter((t) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [t.name, t.location, STATUS_LABEL[t.status]].some(
            (value) => value?.toLowerCase().includes(q)
        );
    });

    const openEditor = (tournament: AdminTournament) => {
        setForm({
            name: tournament.name,
            description: tournament.description ?? '',
            status: tournament.status,
            maxPlayers: tournament.max_players,
            location: tournament.location ?? '',
            startsAt: tournament.starts_at,
            allowedGender: tournament.allowed_gender,
            allowedLevel: tournament.allowed_level,
            prizeMoney: tournament.prize_money,
            entryFee: tournament.entry_fee,
        });
        setEditing(tournament);
    };

    const confirmDelete = (tournament: AdminTournament) => {
        showAlert(
            'Eliminar torneo',
            `Se va a borrar "${tournament.name}" junto con sus inscripciones y partidos. No se puede deshacer.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteTournament(tournament.id);
                            showAlert('Torneo eliminado', 'El torneo se borró del sistema.');
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
        if (!form.name.trim()) {
            showAlert('Falta info', 'El nombre del torneo es obligatorio.');
            return;
        }
        if (form.startsAt && Number.isNaN(Date.parse(form.startsAt))) {
            showAlert('Fecha inválida', 'Usá un formato como 2026-06-20T18:00');
            return;
        }
        setSaving(true);
        try {
            await updateTournament(editing.id, form);
            setEditing(null);
            showAlert('Cambios guardados', 'El torneo se actualizó.');
            load();
        } catch (e) {
            showAlert('No se pudo guardar', e instanceof Error ? e.message : 'Intentá de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const patch = (changes: Partial<AdminTournamentChanges>) => setForm((prev) => ({ ...prev, ...changes }));

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
                <AdminHeader title="Torneos" subtitle="Modificá estados o eliminá torneos" />

                <View style={styles.searchWrap}>
                    <Ionicons name="search-outline" size={18} color={Colors.outline} />
                    <Text style={styles.searchLabel}>Buscar torneo</Text>
                </View>
                <InputField
                    placeholder="Nombre, sede o estado"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    style={styles.searchField}
                />
                <Text style={styles.count}>{filtered.length} de {tournaments.length} torneos</Text>

                {loading ? (
                    <Loader />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="trophy-outline"
                        title="Sin resultados"
                        message={query ? 'Probá con otro nombre.' : 'Todavía no hay torneos creados.'}
                    />
                ) : (
                    filtered.map((tournament) => (
                        <Card key={tournament.id}>
                            <View style={styles.rowHead}>
                                <View style={styles.rowIcon}>
                                    <Ionicons name="trophy-outline" size={20} color={Colors.primary} />
                                </View>
                                <View style={styles.rowInfo}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>{tournament.name}</Text>
                                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                                        {formatDate(tournament.starts_at)} · {tournament.location ?? 'Sin sede'}
                                    </Text>
                                </View>
                                <Chip label={STATUS_LABEL[tournament.status]} tone={statusTone(tournament.status)} />
                            </View>

                            <View style={styles.metaRow}>
                                <Text style={styles.meta}>{tournament.tournament_type === 'por_fechas' ? 'Por fechas' : 'Relámpago'}</Text>
                                <Text style={styles.meta}>
                                    {tournament.max_players ? `${tournament.max_players} jugadores` : 'Cupo libre'}
                                </Text>
                                <Text style={styles.meta}>{tournament.allowed_level === 'todas' ? 'Todos los niveles' : tournament.allowed_level}</Text>
                            </View>

                            <View style={styles.rowActions}>
                                <RowAction icon="create-outline" label="Editar" onPress={() => openEditor(tournament)} />
                                <RowAction
                                    icon="trash-outline"
                                    label="Eliminar"
                                    tone="danger"
                                    onPress={() => confirmDelete(tournament)}
                                />
                            </View>
                        </Card>
                    ))
                )}
            </ScrollView>

            <EditorModal
                visible={!!editing}
                title="Editar torneo"
                onClose={() => setEditing(null)}
                onSave={save}
                saving={saving}
            >
                <InputField label="Nombre" value={form.name} onChangeText={(name) => patch({ name })} />
                <OptionGroup
                    label="Estado"
                    options={STATUS_OPTIONS}
                    value={form.status}
                    onChange={(status) => patch({ status })}
                />
                <InputField
                    label="Descripción"
                    value={form.description}
                    onChangeText={(description) => patch({ description })}
                    multiline
                />
                <InputField label="Sede" value={form.location} onChangeText={(location) => patch({ location })} />
                <InputField
                    label="Fecha (YYYY-MM-DDTHH:mm)"
                    value={form.startsAt ?? ''}
                    onChangeText={(text) => patch({ startsAt: text.trim() || null })}
                    placeholder="2026-06-20T18:00"
                />
                <InputField
                    label="Cupo máximo"
                    value={form.maxPlayers === null ? '' : String(form.maxPlayers)}
                    onChangeText={(text) => patch({ maxPlayers: Number.parseInt(text, 10) || null })}
                    keyboardType="numeric"
                />
                <OptionGroup
                    label="Género permitido"
                    options={GENDER_OPTIONS}
                    value={form.allowedGender}
                    onChange={(allowedGender) => patch({ allowedGender })}
                />
                <OptionGroup
                    label="Nivel permitido"
                    options={LEVEL_OPTIONS}
                    value={form.allowedLevel}
                    onChange={(allowedLevel) => patch({ allowedLevel })}
                />
                <InputField
                    label="Premio ($)"
                    value={String(form.prizeMoney)}
                    onChangeText={(text) => patch({ prizeMoney: Number.parseInt(text, 10) || 0 })}
                    keyboardType="numeric"
                />
                <InputField
                    label="Inscripción ($)"
                    value={String(form.entryFee)}
                    onChangeText={(text) => patch({ entryFee: Number.parseInt(text, 10) || 0 })}
                    keyboardType="numeric"
                />
            </EditorModal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 100, gap: Spacing.sm },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
    searchLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
    searchField: { marginBottom: Spacing.sm },
    count: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    rowIcon: {
        width: 42, height: 42, borderRadius: Radius.lg,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.primaryContainer,
    },
    rowInfo: { flex: 1, gap: 2 },
    rowTitle: { ...Typography.titleSm, color: Colors.onSurface },
    rowSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.sm },
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
