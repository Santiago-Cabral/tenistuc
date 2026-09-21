// src/components/modals/CourtFormModal.tsx
import React, { useEffect, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, Alert, Switch,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import {
    createCourt, updateCourt, Court, CourtInput,
} from '../../services/organizerService';

interface Props {
    visible: boolean;
    onClose: () => void;
    organizerId: string;
    editingCourt?: Court | null;
    onSaved: () => void;
}

const SURFACES: { key: CourtInput['surface']; label: string }[] = [
    { key: 'clay', label: 'Polvo de ladrillo' },
    { key: 'hard', label: 'Cemento' },
    { key: 'grass', label: 'Césped' },
    { key: 'carpet', label: 'Alfombra' },
];

export default function CourtFormModal({
    visible, onClose, organizerId, editingCourt, onSaved,
}: Props) {
    const isEditing = !!editingCourt;
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [surface, setSurface] = useState<CourtInput['surface']>('clay');
    const [indoor, setIndoor] = useState(false);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (editingCourt) {
            setName(editingCourt.name);
            setAddress(editingCourt.address ?? '');
            setSurface(editingCourt.surface);
            setIndoor(editingCourt.indoor);
            setNotes(editingCourt.notes ?? '');
        } else {
            reset();
        }
    }, [editingCourt, visible]);

    const reset = () => {
        setName('');
        setAddress('');
        setSurface('clay');
        setIndoor(false);
        setNotes('');
    };

    const handleClose = () => {
        if (loading) return;
        onClose();
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            showAlert('Falta info', 'Ponele un nombre a la cancha.');
            return;
        }

        const input: CourtInput = {
            name: name.trim(),
            address: address.trim() || undefined,
            surface,
            indoor,
            notes: notes.trim() || undefined,
        };

        setLoading(true);
        try {
            if (isEditing) {
                await updateCourt(editingCourt!.id, input);
            } else {
                await createCourt(organizerId, input);
            }
            reset();
            onSaved();
        } catch (e: any) {
            showAlert('No se pudo guardar', e.message ?? 'Intentá de nuevo');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{isEditing ? 'Editar cancha' : 'Nueva cancha'}</Text>
                        <TouchableOpacity onPress={handleClose} disabled={loading}>
                            <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder="Ej: Cancha 3 - Polvo de ladrillo"
                        placeholderTextColor={Colors.onSurfaceVariant}
                    />

                    <Text style={styles.label}>Dirección (opcional)</Text>
                    <TextInput
                        style={styles.input}
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Ej: Av. Roca 1234"
                        placeholderTextColor={Colors.onSurfaceVariant}
                    />

                    <Text style={styles.label}>Superficie</Text>
                    <View style={styles.surfaceWrap}>
                        {SURFACES.map((s) => (
                            <TouchableOpacity
                                key={s.key}
                                style={[styles.surfaceChip, surface === s.key && styles.surfaceChipActive]}
                                onPress={() => setSurface(s.key)}
                            >
                                <Text style={[styles.surfaceChipText, surface === s.key && styles.surfaceChipTextActive]}>
                                    {s.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.switchRow}>
                        <Text style={styles.label}>Bajo techo</Text>
                        <Switch
                            value={indoor}
                            onValueChange={setIndoor}
                            trackColor={{ true: Colors.primary, false: Colors.surfaceContainerHigh }}
                        />
                    </View>

                    <Text style={styles.label}>Notas (opcional)</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Ej: Iluminación, vestuarios, etc."
                        placeholderTextColor={Colors.onSurfaceVariant}
                        multiline
                    />

                    <TouchableOpacity
                        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <Text style={styles.submitText}>
                            {loading ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar cancha'}
                        </Text>
                    </TouchableOpacity>
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
        gap: Spacing.sm,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    title: { ...Typography.titleMd, color: Colors.onSurface },
    label: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginTop: Spacing.base, marginBottom: Spacing.sm },
    input: {
        backgroundColor: Colors.surfaceContainerLow,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.md,
        ...Typography.bodyMd,
        color: Colors.onSurface,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
    },
    textArea: { minHeight: 60, textAlignVertical: 'top' },
    surfaceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    surfaceChip: {
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
    },
    surfaceChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    surfaceChipText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    surfaceChipTextActive: { color: Colors.onPrimary },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    submitBtn: {
        marginTop: Spacing.base,
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { ...Typography.labelLg, color: Colors.onPrimary },
});