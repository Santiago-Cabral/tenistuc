// src/components/modals/MatchScoreModal.tsx
import React, { useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '../../theme';
import { submitMatchScore, SetScore } from '../../services/fixtureService';

interface Props {
    visible: boolean;
    onClose: () => void;
    matchId: string;
    player1Name: string;
    player2Name: string;
    onSubmitted: () => void;
}

function Stepper({
    value, onChange,
}: { value: number; onChange: (v: number) => void }) {
    return (
        <View style={styles.stepperCol}>
            <View style={styles.stepperRow}>
                <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => onChange(Math.max(0, value - 1))}
                >
                    <Ionicons name="remove" size={16} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{value}</Text>
                <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => onChange(Math.min(7, value + 1))}
                >
                    <Ionicons name="add" size={16} color={Colors.primary} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function MatchScoreModal({
    visible, onClose, matchId, player1Name, player2Name, onSubmitted,
}: Props) {
    const [sets, setSets] = useState<SetScore[]>([
        { p1: 0, p2: 0 },
        { p1: 0, p2: 0 },
        { p1: 0, p2: 0 },
    ]);
    const [setsPlayed, setSetsPlayed] = useState(2); // mejor de 3, 3er set opcional
    const [loading, setLoading] = useState(false);

    const updateSet = (index: number, key: 'p1' | 'p2', value: number) => {
        setSets((prev) => prev.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
    };

    const reset = () => {
        setSets([{ p1: 0, p2: 0 }, { p1: 0, p2: 0 }, { p1: 0, p2: 0 }]);
        setSetsPlayed(2);
    };

    const handleClose = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const handleSubmit = async () => {
        const finalSets = sets.slice(0, setsPlayed);

        if (finalSets.some((s) => s.p1 === s.p2)) {
            Alert.alert('Set empatado', 'Ningún set puede terminar en empate de games.');
            return;
        }

        setLoading(true);
        try {
            await submitMatchScore(matchId, finalSets);
            reset();
            onSubmitted();
        } catch (e: any) {
            Alert.alert('No se pudo guardar', e.message ?? 'Intentá de nuevo');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Cargar resultado</Text>
                        <TouchableOpacity onPress={handleClose} disabled={loading}>
                            <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.namesRow}>
                        <Text style={styles.nameText} numberOfLines={1}>{player1Name}</Text>
                        <Text style={styles.vsText}>vs</Text>
                        <Text style={[styles.nameText, { textAlign: 'right' }]} numberOfLines={1}>
                            {player2Name}
                        </Text>
                    </View>

                    {Array.from({ length: setsPlayed }).map((_, i) => (
                        <View key={i} style={styles.setRow}>
                            <Text style={styles.setLabel}>SET {i + 1}</Text>
                            <View style={styles.setInputsRow}>
                                <Stepper
                                    value={sets[i].p1}
                                    onChange={(v) => updateSet(i, 'p1', v)}
                                />
                                <Text style={styles.dash}>—</Text>
                                <Stepper
                                    value={sets[i].p2}
                                    onChange={(v) => updateSet(i, 'p2', v)}
                                />
                            </View>
                        </View>
                    ))}

                    {setsPlayed === 2 && (
                        <TouchableOpacity onPress={() => setSetsPlayed(3)} style={styles.addSetBtn}>
                            <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                            <Text style={styles.addSetText}>Agregar 3er set</Text>
                        </TouchableOpacity>
                    )}
                    {setsPlayed === 3 && (
                        <TouchableOpacity onPress={() => setSetsPlayed(2)} style={styles.addSetBtn}>
                            <Ionicons name="remove-circle-outline" size={16} color={Colors.onSurfaceVariant} />
                            <Text style={[styles.addSetText, { color: Colors.onSurfaceVariant }]}>
                                Quitar 3er set
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <Text style={styles.submitText}>
                            {loading ? 'Guardando...' : 'Confirmar resultado'}
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
        gap: Spacing.base,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...Typography.titleMd, color: Colors.onSurface },
    namesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nameText: { ...Typography.titleMd, color: Colors.onSurface, flex: 1 },
    vsText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, paddingHorizontal: Spacing.sm },

    setRow: { gap: Spacing.sm },
    setLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
    setInputsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
    dash: { ...Typography.titleMd, color: Colors.onSurfaceVariant },

    stepperCol: { alignItems: 'center', gap: 4 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    stepperBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    stepperValue: { fontFamily: 'Lexend_700Bold', fontSize: 22, color: Colors.onSurface, width: 28, textAlign: 'center' },

    addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
    addSetText: { ...Typography.labelSm, color: Colors.primary },

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