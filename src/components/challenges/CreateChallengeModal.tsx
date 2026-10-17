// src/components/modals/CreateChallengeModal.tsx
import React, { useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Alert,
    ScrollView,
    Platform,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import { useChallenges } from '../../hooks/useChallenges';
import { MATCH_TYPE_LABELS, type MatchType } from '../../services/matchService';
import { Avatar } from '../ui';

interface Props {
    visible: boolean;
    onClose: () => void;
    rivalId: string;
    rivalName: string;
    rivalAvatar?: string | null;
    onCreated: (challengeId: string) => void;
}

const VENUES = [
    'Lawn Tenis Club',
    'Club Atlético San Martín',
    'Tucumán Lawn Tennis',
    'Club Universitario',
    'Club Social Sportivo',
    'Otro',
];

const MATCH_TYPES: {
    value: MatchType;
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
}[] = [
    { value: 'friendly', title: MATCH_TYPE_LABELS.friendly, subtitle: 'Sin puntos', icon: 'happy-outline' },
    { value: 'training', title: MATCH_TYPE_LABELS.training, subtitle: 'A practicar', icon: 'barbell-outline' },
    { value: 'competitive', title: MATCH_TYPE_LABELS.competitive, subtitle: '5 pts', icon: 'trophy-outline' },
];

export default function CreateChallengeModal({
    visible,
    onClose,
    rivalId,
    rivalName,
    rivalAvatar = null,
    onCreated,
}: Props) {
    const { createChallenge } = useChallenges();
    const [matchType, setMatchType] = useState<MatchType>('friendly');
    const [date, setDate] = useState<Date | null>(null);
    const [venue, setVenue] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);

    const reset = () => {
        setMatchType('friendly');
        setDate(null);
        setVenue('');
        setMessage('');
        setPickerMode(null);
    };

    const handleClose = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const openDatePicker = () => setPickerMode('date');

    const openTimePicker = () => {
        if (!date) {
            showAlert('Elegí primero la fecha', 'Tocá "Fecha" antes de elegir el horario.');
            return;
        }
        setPickerMode('time');
    };

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

    const handleCreate = async () => {
        if (!date || !venue) {
            showAlert('Falta info', 'Debés elegir fecha y sede');
            return;
        }

        setLoading(true);

        const challenge = await createChallenge({
            challengedId: rivalId,
            proposedDate: date.toISOString(),
            proposedVenue: venue,
            message: message || undefined,
            matchType,
        });

        setLoading(false);

        if (!challenge) {
            showAlert('No se pudo enviar', 'Puede que ya tengas un desafío pendiente con este jugador.');
            return;
        }

        onCreated(challenge.id);
        reset();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Avatar uri={rivalAvatar} size={44} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Desafiar a {rivalName}</Text>
                            <Text style={styles.subtitle}>
                                Elegí el tipo, fecha, sede y un mensaje. El rival podrá aceptar o reproponer.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} disabled={loading}>
                            <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
                        <Text style={styles.label}>Tipo de desafío</Text>
                        <View style={styles.typeRow}>
                            {MATCH_TYPES.map((opt) => {
                                const active = matchType === opt.value;
                                return (
                                    <TouchableOpacity
                                        key={opt.value}
                                        onPress={() => setMatchType(opt.value)}
                                        activeOpacity={0.8}
                                        style={[styles.typeCard, active && styles.typeCardActive]}
                                    >
                                        <Ionicons
                                            name={opt.icon}
                                            size={20}
                                            color={active ? Colors.primaryDim : Colors.onSurfaceVariant}
                                        />
                                        <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>
                                            {opt.title}
                                        </Text>
                                        <Text style={[styles.typeSub, active && styles.typeSubActive]}>
                                            {opt.subtitle}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {matchType === 'competitive' && (
                            <Text style={styles.typeNote}>El ganador suma 5 puntos.</Text>
                        )}

                        <Text style={styles.label}>Fecha y hora</Text>
                        <View style={styles.dateRow}>
                            <TouchableOpacity style={styles.dateBtn} onPress={openDatePicker}>
                                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                                <Text style={styles.dateBtnText}>{formattedDate}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.dateBtn} onPress={openTimePicker}>
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

                        <Text style={styles.label}>Sede</Text>
                        <View style={styles.venuesWrap}>
                            {VENUES.map((v) => (
                                <TouchableOpacity
                                    key={v}
                                    onPress={() => setVenue(v)}
                                    style={[styles.venueChip, venue === v && styles.venueChipActive]}
                                >
                                    <Text
                                        style={[
                                            styles.venueChipText,
                                            venue === v && styles.venueChipTextActive,
                                        ]}
                                    >
                                        {v}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Mensaje (opcional)</Text>
                        <TextInput
                            placeholder="Ej: ¿Te animás a la revancha?"
                            placeholderTextColor={Colors.onSurfaceVariant}
                            value={message}
                            onChangeText={setMessage}
                            style={[styles.input, styles.messageInput]}
                            multiline
                        />
                    </ScrollView>

                    <View style={styles.row}>
                        <TouchableOpacity onPress={handleClose} disabled={loading} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleCreate}
                            disabled={loading}
                            style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
                        >
                            <Text style={styles.sendText}>
                                {loading ? 'Enviando...' : 'Enviar desafío'}
                            </Text>
                        </TouchableOpacity>
                    </View>
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
    typeRow: { flexDirection: 'row', gap: Spacing.sm },
    typeCard: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: Spacing.base,
        paddingHorizontal: Spacing.sm,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    typeCardActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
    typeTitle: { ...Typography.labelMd, color: Colors.onSurface },
    typeTitleActive: { color: Colors.primaryDim },
    typeSub: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    typeSubActive: { color: Colors.primaryDim },
    typeNote: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: Spacing.sm },
    input: {
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.md,
        padding: Spacing.base,
        color: Colors.onSurface,
        ...Typography.bodyMd,
    },
    messageInput: { minHeight: 70, textAlignVertical: 'top' },
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
    venuesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    venueChip: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
    },
    venueChipActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
    venueChipText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    venueChipTextActive: { color: Colors.primaryDim },
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
    sendBtn: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: Radius.full,
        backgroundColor: Colors.primary,
    },
    sendBtnDisabled: { opacity: 0.6 },
    sendText: { ...Typography.labelLg, color: Colors.onPrimary },
});