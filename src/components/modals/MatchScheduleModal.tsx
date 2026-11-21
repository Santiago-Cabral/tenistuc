// src/components/modals/MatchScheduleModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet,
    ScrollView, Platform,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import { scheduleMatch } from '../../services/fixtureService';
import { Court } from '../../services/organizerService';

export interface ScheduleBooking {
    id: string;
    court_id: string | null;
    scheduled_at: string | null;
    label: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    player1Name: string;
    player2Name: string;
    courts: Court[];
    bookings: ScheduleBooking[];
    initialScheduledAt: string | null;
    initialCourtId: string | null;
    onSaved: () => void;
}

export default function MatchScheduleModal({
    visible,
    onClose,
    matchId,
    player1Name,
    player2Name,
    courts,
    bookings,
    initialScheduledAt,
    initialCourtId,
    onSaved,
}: Props) {
    const [date, setDate] = useState<Date | null>(null);
    const [courtId, setCourtId] = useState<string | null>(null);
    const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!visible) return;
        setDate(initialScheduledAt ? new Date(initialScheduledAt) : null);
        setCourtId(initialCourtId);
        setPickerMode(null);
    }, [visible, initialScheduledAt, initialCourtId]);

    // Doble reserva: misma cancha, mismo minuto, otro partido.
    const conflict = useMemo(() => {
        if (!date || !courtId) return null;
        const key = Math.floor(date.getTime() / 60000);
        return (
            bookings.find(
                (b) =>
                    b.id !== matchId &&
                    b.court_id === courtId &&
                    !!b.scheduled_at &&
                    Math.floor(new Date(b.scheduled_at).getTime() / 60000) === key,
            ) ?? null
        );
    }, [date, courtId, bookings, matchId]);

    const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
        const mode = pickerMode;
        setPickerMode(Platform.OS === 'ios' ? pickerMode : null);

        if (event.type === 'dismissed' || !selected) return;

        if (mode === 'date') {
            const base = date ?? new Date();
            const next = new Date(selected);
            next.setHours(base.getHours(), base.getMinutes());
            setDate(next);
        } else if (mode === 'time') {
            const base = date ?? new Date();
            const next = new Date(base);
            next.setHours(selected.getHours(), selected.getMinutes());
            setDate(next);
        }
    };

    const formattedDate = date
        ? date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })
        : 'Elegir fecha';

    const formattedTime = date
        ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : 'Elegir hora';

    const doSave = async () => {
        setLoading(true);
        try {
            const court = courts.find((c) => c.id === courtId) ?? null;
            await scheduleMatch(matchId, {
                scheduled_at: date ? date.toISOString() : null,
                court_id: courtId,
                location: court?.name ?? null,
            });
            onSaved();
        } catch (e: any) {
            showAlert('No se pudo programar', e.message ?? 'Intentá de nuevo');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = () => {
        if (!date) {
            showAlert('Falta la fecha', 'Elegí la fecha y la hora del partido.');
            return;
        }
        if (conflict) {
            showAlert(
                'Horario ocupado',
                `Ese horario ya está tomado en esa cancha por ${conflict.label}.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Programar igual', onPress: doSave },
                ],
            );
            return;
        }
        doSave();
    };

    const handleClear = async () => {
        setLoading(true);
        try {
            await scheduleMatch(matchId, { scheduled_at: null, court_id: null, location: null });
            onSaved();
        } catch (e: any) {
            showAlert('No se pudo quitar', e.message ?? 'Intentá de nuevo');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading) return;
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={[styles.container, { paddingBottom: Spacing.sm + insets.bottom }]}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Programar partido</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {player1Name} vs {player2Name}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} disabled={loading}>
                            <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
                        <Text style={styles.label}>Fecha y hora</Text>
                        <View style={styles.dateRow}>
                            <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerMode('date')}>
                                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                                <Text style={styles.dateBtnText}>{formattedDate}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.dateBtn}
                                onPress={() => {
                                    if (!date) {
                                        showAlert('Elegí primero la fecha', 'Tocá "Fecha" antes del horario.');
                                        return;
                                    }
                                    setPickerMode('time');
                                }}
                            >
                                <Ionicons name="time-outline" size={18} color={Colors.primary} />
                                <Text style={styles.dateBtnText}>{formattedTime}</Text>
                            </TouchableOpacity>
                        </View>

                        {pickerMode && (
                            <DateTimePicker
                                value={date ?? new Date()}
                                mode={pickerMode}
                                is24Hour
                                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                                onChange={onPickerChange}
                            />
                        )}

                        <Text style={styles.label}>Cancha</Text>
                        {courts.length === 0 ? (
                            <Text style={styles.hint}>
                                Todavía no cargaste canchas. Agregalas en la pestaña "Canchas" para asignarlas.
                            </Text>
                        ) : (
                            <View style={styles.courtsWrap}>
                                {courts.map((c) => {
                                    const active = courtId === c.id;
                                    return (
                                        <TouchableOpacity
                                            key={c.id}
                                            onPress={() => setCourtId(active ? null : c.id)}
                                            style={[styles.courtChip, active && styles.courtChipActive]}
                                        >
                                            <Ionicons
                                                name="tennisball-outline"
                                                size={14}
                                                color={active ? Colors.primaryDim : Colors.onSurfaceVariant}
                                            />
                                            <Text style={[styles.courtChipText, active && styles.courtChipTextActive]}>
                                                {c.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {conflict && (
                            <View style={styles.conflictBox}>
                                <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
                                <Text style={styles.conflictText}>
                                    Ese horario ya está ocupado por {conflict.label}.
                                </Text>
                            </View>
                        )}
                    </ScrollView>

                    <View style={styles.row}>
                        <TouchableOpacity onPress={handleClose} disabled={loading} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={loading}
                            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                        >
                            <Text style={styles.saveText}>
                                {loading ? 'Guardando...' : 'Programar'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {!!initialScheduledAt && (
                        <TouchableOpacity onPress={handleClear} disabled={loading} style={styles.clearBtn}>
                            <Ionicons name="trash-outline" size={14} color={Colors.onSurfaceVariant} />
                            <Text style={styles.clearText}>Quitar programación</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
    container: {
        backgroundColor: Colors.surfaceContainerLowest,
        padding: Spacing.xl,
        borderTopLeftRadius: Radius.xxl,
        borderTopRightRadius: Radius.xxl,
        gap: Spacing.base,
        maxHeight: '88%',
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
    title: { ...Typography.titleMd, color: Colors.onSurface },
    subtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: 2 },
    body: { flexGrow: 0 },
    label: { ...Typography.labelLg, color: Colors.onSurface, marginTop: Spacing.base, marginBottom: Spacing.sm },
    hint: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    dateRow: { flexDirection: 'row', gap: Spacing.sm },
    dateBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.md,
        paddingVertical: Spacing.base,
    },
    dateBtnText: { ...Typography.bodyMd, color: Colors.onSurface },
    courtsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    courtChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
    },
    courtChipActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
    courtChipText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    courtChipTextActive: { color: Colors.primaryDim, fontFamily: 'PlusJakartaSans_600SemiBold' },
    conflictBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: Spacing.base,
        padding: Spacing.md,
        borderRadius: Radius.md,
        backgroundColor: Colors.errorContainer,
    },
    conflictText: { ...Typography.bodySm, color: Colors.error, flex: 1 },
    row: { flexDirection: 'row', gap: Spacing.base, marginTop: Spacing.base },
    cancelBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
    },
    cancelText: { ...Typography.labelLg, color: Colors.onSurfaceVariant },
    saveBtn: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: Radius.full,
        backgroundColor: Colors.primary,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveText: { ...Typography.labelLg, color: Colors.onPrimary },
    clearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: Spacing.sm,
    },
    clearText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
});
