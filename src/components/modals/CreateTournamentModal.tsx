// src/components/modals/CreateTournamentModal.tsx
import React, { useEffect, useState } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet,
    Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import { InputField } from '../ui/InputField';
import { Button } from '../ui/Button';
import {
    createTournament, updateTournament,
    getTournamentDates, updateTournamentDate,
    Tournament, TournamentType, TournamentDateInput,
} from '../../services/organizerService';

interface Props {
    visible: boolean;
    onClose: () => void;
    organizerId: string;
    editingTournament: Tournament | null;
    onSaved: () => void;
}

const NUM_FECHAS = 5;

// Dado un viernes cualquiera, devuelve { start: viernes, end: domingo }
function weekendFromFriday(friday: Date): { start: Date; end: Date } {
    const start = new Date(friday);
    const end = new Date(friday);
    end.setDate(end.getDate() + 2); // domingo
    return { start, end };
}

// Próximo viernes a partir de una fecha base
function nextFriday(base: Date): Date {
    const d = new Date(base);
    const day = d.getDay(); // 0=domingo ... 5=viernes
    const diff = (5 - day + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    return d;
}

function defaultFechas(): Date[] {
    const base = nextFriday(new Date());
    return Array.from({ length: NUM_FECHAS }, (_, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() + i * 56); // ~8 semanas de separación por defecto, editable
        return d;
    });
}

export default function CreateTournamentModal({
    visible, onClose, organizerId, editingTournament, onSaved,
}: Props) {
    const isEditing = !!editingTournament;

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [entryFee, setEntryFee] = useState('');
    const [maxPlayers, setMaxPlayers] = useState('');
    const [prizeMoney, setPrizeMoney] = useState('');
    const [eloPoints, setEloPoints] = useState('');

    const [tournamentType, setTournamentType] = useState<TournamentType>('relampago');

    // Relámpago: una sola fecha
    const [singleStart, setSingleStart] = useState<Date>(nextFriday(new Date()));
    const [showSinglePicker, setShowSinglePicker] = useState(false);

    // Por fechas: 5 viernes (cada uno arma su propio finde vie-dom)
    const [fechas, setFechas] = useState<Date[]>(defaultFechas());
    const [pickerIndex, setPickerIndex] = useState<number | null>(null);
    const [fechaIds, setFechaIds] = useState<(string | null)[]>(Array(NUM_FECHAS).fill(null));

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible) return;

        if (editingTournament) {
            setName(editingTournament.name);
            setDescription(editingTournament.description ?? '');
            setLocation(editingTournament.location ?? '');
            setEntryFee(String(editingTournament.entry_fee ?? ''));
            setMaxPlayers(editingTournament.max_players ? String(editingTournament.max_players) : '');
            setPrizeMoney(String(editingTournament.prize_money ?? ''));
            setEloPoints(String(editingTournament.elo_points ?? ''));
            setTournamentType(editingTournament.tournament_type ?? 'relampago');

            if (editingTournament.starts_at) {
                setSingleStart(new Date(editingTournament.starts_at));
            }

            if (editingTournament.tournament_type === 'por_fechas') {
                getTournamentDates(editingTournament.id)
                    .then((rows) => {
                        if (rows.length === 0) return;
                        setFechas(rows.map((r) => new Date(r.starts_at)));
                        setFechaIds(rows.map((r) => r.id));
                    })
                    .catch(() => {});
            }
        } else {
            setName('');
            setDescription('');
            setLocation('');
            setEntryFee('');
            setMaxPlayers('');
            setPrizeMoney('');
            setEloPoints('');
            setTournamentType('relampago');
            setSingleStart(nextFriday(new Date()));
            setFechas(defaultFechas());
            setFechaIds(Array(NUM_FECHAS).fill(null));
        }
    }, [visible, editingTournament]);

    const handleSingleDateChange = (_event: any, date?: Date) => {
        setShowSinglePicker(Platform.OS === 'ios');
        if (date) setSingleStart(date);
    };

    const handleFechaChange = (_event: any, date?: Date) => {
        const idx = pickerIndex;
        if (Platform.OS !== 'ios') setPickerIndex(null);
        if (date && idx !== null) {
            setFechas((prev) => {
                const next = [...prev];
                next[idx] = date;
                return next;
            });
        }
    };

    const validate = (): string | null => {
        if (!name.trim()) return 'Ponele un nombre al torneo.';
        if (tournamentType === 'por_fechas') {
            const sorted = [...fechas].sort((a, b) => a.getTime() - b.getTime());
            for (let i = 1; i < sorted.length; i += 1) {
                if (sorted[i].toDateString() === sorted[i - 1].toDateString()) {
                    return 'Hay dos fechas repetidas, revisá el calendario.';
                }
            }
        }
        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            Alert.alert('Faltan datos', err);
            return;
        }

        setSaving(true);
        try {
            const baseInput = {
                name: name.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                entry_fee: entryFee ? Number(entryFee) : 0,
                max_players: maxPlayers ? Number(maxPlayers) : undefined,
                prize_money: prizeMoney ? Number(prizeMoney) : 0,
                elo_points: eloPoints ? Number(eloPoints) : 0,
                tournament_type: tournamentType,
                starts_at: tournamentType === 'relampago'
                    ? singleStart.toISOString()
                    : fechas[0].toISOString(), // primera fecha como referencia general del circuito
            };

            if (isEditing && editingTournament) {
                await updateTournament(editingTournament.id, baseInput);

                if (tournamentType === 'por_fechas') {
                    await Promise.all(
                        fechas.map((f, i) => {
                            const { start, end } = weekendFromFriday(f);
                            const id = fechaIds[i];
                            if (id) {
                                return updateTournamentDate(id, {
                                    numero: i + 1,
                                    starts_at: start.toISOString(),
                                    ends_at: end.toISOString(),
                                });
                            }
                            return Promise.resolve();
                        }),
                    );
                }
            } else {
                const dates: TournamentDateInput[] | undefined = tournamentType === 'por_fechas'
                    ? fechas.map((f, i) => {
                        const { start, end } = weekendFromFriday(f);
                        return {
                            numero: i + 1,
                            starts_at: start.toISOString(),
                            ends_at: end.toISOString(),
                        };
                    })
                    : undefined;

                await createTournament(organizerId, baseInput, dates);
            }

            onSaved();
        } catch (e: any) {
            Alert.alert('No se pudo guardar', e.message ?? 'Intentá de nuevo');
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (d: Date) =>
        d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{isEditing ? 'Editar torneo' : 'Nuevo torneo'}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        <InputField label="Nombre del torneo" value={name} onChangeText={setName} placeholder="Ej: Copa Primavera" />
                        <InputField label="Descripción" value={description} onChangeText={setDescription} placeholder="Opcional" />
                        <InputField label="Sede" value={location} onChangeText={setLocation} placeholder="Ej: Lawn Tenis Club" />

                        <View style={styles.row}>
                            <View style={styles.rowItem}>
                                <InputField label="Entrada ($)" value={entryFee} onChangeText={setEntryFee} placeholder="0" />
                            </View>
                            <View style={styles.rowItem}>
                                <InputField label="Cupo máx." value={maxPlayers} onChangeText={setMaxPlayers} placeholder="Opcional" />
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={styles.rowItem}>
                                <InputField label="Premio ($)" value={prizeMoney} onChangeText={setPrizeMoney} placeholder="0" />
                            </View>
                            <View style={styles.rowItem}>
                                <InputField label="Puntos ELO" value={eloPoints} onChangeText={setEloPoints} placeholder="0" />
                            </View>
                        </View>

                        {/* ── Selector de modalidad ─────────────────────────── */}
                        <Text style={styles.sectionLabel}>Modalidad</Text>
                        <View style={styles.typeSelector}>
                            <TouchableOpacity
                                style={[styles.typeOption, tournamentType === 'relampago' && styles.typeOptionActive]}
                                onPress={() => setTournamentType('relampago')}
                                activeOpacity={0.85}
                            >
                                <Ionicons
                                    name="flash"
                                    size={20}
                                    color={tournamentType === 'relampago' ? Colors.primary : Colors.onSurfaceVariant}
                                />
                                <Text style={[styles.typeLabel, tournamentType === 'relampago' && styles.typeLabelActive]}>
                                    Relámpago
                                </Text>
                                <Text style={styles.typeDesc}>Un solo fin de semana</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.typeOption, tournamentType === 'por_fechas' && styles.typeOptionActive]}
                                onPress={() => setTournamentType('por_fechas')}
                                activeOpacity={0.85}
                            >
                                <Ionicons
                                    name="calendar"
                                    size={20}
                                    color={tournamentType === 'por_fechas' ? Colors.primary : Colors.onSurfaceVariant}
                                />
                                <Text style={[styles.typeLabel, tournamentType === 'por_fechas' && styles.typeLabelActive]}>
                                    Por fechas
                                </Text>
                                <Text style={styles.typeDesc}>Circuito de 5 fechas (vie-dom)</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Relámpago: una fecha ──────────────────────────── */}
                        {tournamentType === 'relampago' && (
                            <View>
                                <Text style={styles.sectionLabel}>Fecha de inicio</Text>
                                <TouchableOpacity style={styles.dateRow} onPress={() => setShowSinglePicker(true)}>
                                    <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                                    <Text style={styles.dateRowText}>{formatDate(singleStart)}</Text>
                                </TouchableOpacity>
                                {showSinglePicker && (
                                    <DateTimePicker
                                        value={singleStart}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                        onChange={handleSingleDateChange}
                                    />
                                )}
                            </View>
                        )}

                        {/* ── Por fechas: 5 weekends ────────────────────────── */}
                        {tournamentType === 'por_fechas' && (
                            <View>
                                <Text style={styles.sectionLabel}>Fechas del circuito</Text>
                                <Text style={styles.helperText}>
                                    Cada fecha arranca el viernes y termina el domingo, como hace la ATT. Tocá una para cambiar el viernes.
                                </Text>

                                {fechas.map((f, i) => {
                                    const { start, end } = weekendFromFriday(f);
                                    return (
                                        <TouchableOpacity
                                            key={i}
                                            style={styles.fechaCard}
                                            onPress={() => setPickerIndex(i)}
                                            activeOpacity={0.85}
                                        >
                                            <View style={styles.fechaBadge}>
                                                <Text style={styles.fechaBadgeText}>{i + 1}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.fechaTitle}>Fecha {i + 1}</Text>
                                                <Text style={styles.fechaRange}>
                                                    Vie {start.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                                    {'  →  '}
                                                    Dom {end.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={18} color={Colors.onSurfaceVariant} />
                                        </TouchableOpacity>
                                    );
                                })}

                                {pickerIndex !== null && (
                                    <DateTimePicker
                                        value={fechas[pickerIndex]}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                        onChange={handleFechaChange}
                                    />
                                )}
                                {Platform.OS === 'ios' && pickerIndex !== null && (
                                    <Button label="Listo" onPress={() => setPickerIndex(null)} variant="ghost" />
                                )}
                            </View>
                        )}
                    </ScrollView>

                    <View style={styles.footer}>
                        <Button label="Cancelar" onPress={onClose} variant="ghost" style={{ flex: 1 }} />
                        <Button
                            label={saving ? 'Guardando...' : (isEditing ? 'Guardar cambios' : 'Crear torneo')}
                            onPress={handleSave}
                            disabled={saving}
                            style={{ flex: 1 }}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderTopLeftRadius: Radius.xxl,
        borderTopRightRadius: Radius.xxl,
        maxHeight: '90%',
        paddingTop: Spacing.lg,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl, marginBottom: Spacing.base,
    },
    title: { ...Typography.headlineLg, color: Colors.onSurface },

    scrollContent: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.base },

    row: { flexDirection: 'row', gap: Spacing.base },
    rowItem: { flex: 1 },

    sectionLabel: {
        fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: Colors.onSurface,
        marginTop: Spacing.sm,
    },
    helperText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },

    typeSelector: { flexDirection: 'row', gap: Spacing.md },
    typeOption: {
        flex: 1, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceContainerHigh,
        padding: Spacing.base, gap: 4, backgroundColor: Colors.surfaceContainerLowest,
    },
    typeOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryContainer },
    typeLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: Colors.onSurfaceVariant },
    typeLabelActive: { color: Colors.primaryDim },
    typeDesc: { ...Typography.bodySm, fontSize: 11, color: Colors.onSurfaceVariant },

    dateRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md,
        paddingHorizontal: Spacing.base, paddingVertical: Spacing.base,
    },
    dateRowText: { ...Typography.bodyMd, color: Colors.onSurface },

    fechaCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.base,
        backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
        padding: Spacing.base, marginBottom: Spacing.sm,
    },
    fechaBadge: {
        width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    fechaBadgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: Colors.primaryDim },
    fechaTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: Colors.onSurface },
    fechaRange: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: 2 },

    footer: {
        flexDirection: 'row', gap: Spacing.base,
        paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, paddingBottom: Spacing.xl,
        borderTopWidth: 1, borderTopColor: Colors.surfaceContainerHigh,
    },
});