// app/challenge-respond/[id].tsx
// Pantalla para responder a un reto: aceptar, rechazar o reproponer fecha/lugar

import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    TextInput, Platform, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '../../src/components/ui/DateTimeField';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/theme/index';
import { Avatar, Badge, Button } from '../../src/components/ui/index';
import { useAuthStore } from '../../src/stores/authStore';
import { useChallenges, Challenge } from '../../src/hooks/useChallenges';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { MATCH_TYPE_LABELS, affectsElo } from '../../src/services/matchService';

const VENUES = [
    'Lawn Tenis Club',
    'Club Atlético San Martín',
    'Tucumán Lawn Tennis',
    'Club Universitario',
    'Club Social Sportivo',
    'Otro',
];

export default function ChallengeRespondScreen() {
    const router = useRouter();
    const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
    const { profile } = useAuthStore();
    const { getChallenge, acceptChallenge, rejectChallenge, reproposeChallenge, loading, error } = useChallenges();

    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [fetching, setFetching] = useState(true);
    const [editing, setEditing] = useState(false);

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
    const [customVenue, setCustomVenue] = useState('');

    const loadChallenge = useCallback(async () => {
        if (!challengeId) return;
        const data = await getChallenge(challengeId);
        setChallenge(data);
        if (data) {
            setSelectedDate(data.proposed_date ? new Date(data.proposed_date) : null);
            setSelectedVenue(VENUES.includes(data.proposed_venue ?? '') ? data.proposed_venue : (data.proposed_venue ? 'Otro' : null));
            setCustomVenue(VENUES.includes(data.proposed_venue ?? '') ? '' : (data.proposed_venue ?? ''));
        }
        setFetching(false);
    }, [challengeId, getChallenge]);

    useEffect(() => { loadChallenge(); }, [loadChallenge]);

    useLiveRefresh('challenges', () => { loadChallenge(); }, challengeId ? `id=eq.${challengeId}` : undefined);

    if (fetching) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} size="large" />
        </SafeAreaView>
    );

    if (!challenge || !profile) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant }}>Reto no encontrado</Text>
        </SafeAreaView>
    );

    const isChallenger = challenge.challenger_id === profile.id;
    const me = isChallenger ? challenge.challenger : challenge.challenged;
    const other = isChallenger ? challenge.challenged : challenge.challenger;
    const lastProposalWasMine = challenge.proposed_by === profile.id;
    const isPending = challenge.status === 'pending';

    const formatDate = (d: Date | null) => d
        ? d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : 'Sin fecha propuesta';

    const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
        setShowDatePicker(false);
        if (date) {
            const combined = selectedDate ? new Date(selectedDate) : new Date();
            combined.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            setSelectedDate(combined);
            setTimeout(() => setShowTimePicker(true), 300);
        }
    };

    const onTimeChange = (_: DateTimePickerEvent, time?: Date) => {
        setShowTimePicker(false);
        if (time && selectedDate) {
            const combined = new Date(selectedDate);
            combined.setHours(time.getHours(), time.getMinutes());
            setSelectedDate(combined);
        }
    };

    const getFinalVenue = () => selectedVenue === 'Otro' ? (customVenue.trim() || null) : selectedVenue;

    const handleAccept = async () => {
        const ok = await acceptChallenge(challenge.id);
        if (ok) {
            showAlert('Reto aceptado', `Ya está cargado en tus partidos.`, [
                { text: 'OK', onPress: () => router.back() },
            ]);
        }
    };

    const handleReject = async () => {
        showAlert('Rechazar reto', '¿Seguro que querés rechazar este reto?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Rechazar', style: 'destructive',
                onPress: async () => {
                    const ok = await rejectChallenge(challenge.id);
                    if (ok) router.back();
                },
            },
        ]);
    };

    const handleRepropose = async () => {
        const venue = getFinalVenue();
        const ok = await reproposeChallenge({
            challengeId: challenge.id,
            proposedDate: selectedDate?.toISOString() ?? null,
            proposedVenue: venue,
        });
        if (ok) {
            setEditing(false);
            await loadChallenge();
            showAlert('Propuesta actualizada', `Le avisamos a ${other?.full_name} sobre el cambio.`);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Reto</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    {/* VS */}
                    <View style={styles.opponentCard}>
                        <View style={styles.opponentVs}>
                            <View style={styles.playerSide}>
                                <Avatar uri={me?.avatar_url} size={64} />
                                <Text style={styles.playerName}>{me?.full_name?.split(' ')[0] ?? 'Tú'}</Text>
                            </View>
                            <View style={styles.vsBubble}>
                                <Ionicons name="flash" size={22} color={Colors.primary} />
                            </View>
                            <View style={styles.playerSide}>
                                <Avatar uri={other?.avatar_url} size={64} />
                                <Text style={styles.playerName}>{other?.full_name?.split(' ')[0] ?? '...'}</Text>
                            </View>
                        </View>

                        <View style={styles.levelWrap}>
                            <Badge label={MATCH_TYPE_LABELS[challenge.match_type]} color={Colors.primaryContainer} textColor={Colors.primary} />
                        </View>
                    </View>

                    {/* Aviso ELO */}
                    <View style={[styles.eloNotice, affectsElo(challenge.match_type) ? styles.eloNoticeActive : styles.eloNoticeInactive]}>
                        <Ionicons
                            name={affectsElo(challenge.match_type) ? 'flash' : 'information-circle-outline'}
                            size={16}
                            color={affectsElo(challenge.match_type) ? Colors.primary : Colors.onSurfaceVariant}
                        />
                        <Text style={[styles.eloNoticeText, affectsElo(challenge.match_type) && { color: Colors.primary }]}>
                            {affectsElo(challenge.match_type)
                                ? 'Este partido va a afectar el ELO de ambos'
                                : 'Este partido no afecta el ELO de ninguno'}
                        </Text>
                    </View>

                    {/* Estado de la propuesta actual */}
                    {!editing && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                <Ionicons name="calendar-outline" size={16} color={Colors.primary} /> Propuesta actual
                            </Text>
                            <View style={styles.proposalBox}>
                                <Text style={styles.proposalText}>{formatDate(selectedDate)}</Text>
                                <Text style={styles.proposalText}>{getFinalVenue() ?? 'Sin lugar propuesto'}</Text>
                                {challenge.message && (
                                    <Text style={styles.proposalMessage}>"{challenge.message}"</Text>
                                )}
                            </View>
                            <Text style={styles.proposalMeta}>
                                {lastProposalWasMine
                                    ? `Esperando confirmación de ${other?.full_name}`
                                    : `Última propuesta de ${other?.full_name ?? 'el otro jugador'}`}
                            </Text>
                        </View>
                    )}

                    {/* Form de reproponer */}
                    {editing && (
                        <>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    <Ionicons name="calendar-outline" size={16} color={Colors.primary} /> Nueva fecha y hora
                                </Text>
                                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                                    <Ionicons name="calendar" size={20} color={Colors.primary} />
                                    <Text style={[styles.dateBtnText, styles.dateBtnTextActive]}>{formatDate(selectedDate)}</Text>
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker value={selectedDate ?? new Date()} mode="date" minimumDate={new Date()} onChange={onDateChange} display={Platform.OS === 'ios' ? 'spinner' : 'default'} />
                                )}
                                {showTimePicker && (
                                    <DateTimePicker value={selectedDate ?? new Date()} mode="time" onChange={onTimeChange} display={Platform.OS === 'ios' ? 'spinner' : 'default'} />
                                )}
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    <Ionicons name="location-outline" size={16} color={Colors.primary} /> Nuevo lugar
                                </Text>
                                <View style={styles.venueGrid}>
                                    {VENUES.map(v => (
                                        <TouchableOpacity
                                            key={v}
                                            style={[styles.venueChip, selectedVenue === v && styles.venueChipActive]}
                                            onPress={() => setSelectedVenue(prev => prev === v ? null : v)}
                                        >
                                            <Text style={[styles.venueChipText, selectedVenue === v && styles.venueChipTextActive]}>{v}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {selectedVenue === 'Otro' && (
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Escribí el lugar..."
                                        placeholderTextColor={Colors.onSurfaceVariant}
                                        value={customVenue}
                                        onChangeText={setCustomVenue}
                                    />
                                )}
                            </View>
                        </>
                    )}

                    {error && (
                        <View style={styles.errorBanner}>
                            <Ionicons name="warning-outline" size={16} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <View style={{ height: 20 }} />
                </ScrollView>

                {isPending && (
                    <View style={styles.footer}>
                        {editing ? (
                            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                                <Button label="Cancelar" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
                                <Button
                                    label={loading ? 'Guardando...' : 'Reproponer'}
                                    onPress={handleRepropose}
                                    disabled={loading || !selectedDate || !getFinalVenue()}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        ) : (
                            <View style={{ gap: Spacing.md }}>
                                {!lastProposalWasMine && (
                                    <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                                        <TouchableOpacity style={[styles.actionBtnCustom, styles.actionBtnSecondary]} onPress={handleReject}>
                                            <Ionicons name="close" size={18} color={Colors.error} />
                                            <Text style={[styles.actionBtnTextSecondary, { color: Colors.error }]}>Rechazar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.actionBtnCustom, styles.actionBtnPrimary]} onPress={handleAccept} disabled={loading}>
                                            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                                                <>
                                                    <Ionicons name="checkmark" size={18} color="#fff" />
                                                    <Text style={styles.actionBtnTextPrimary}>Aceptar</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                                <Button label="Reproponer fecha o lugar" variant="secondary" onPress={() => setEditing(true)} />
                            </View>
                        )}
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: 'Lexend_700Bold', fontSize: 18, color: Colors.onSurface, letterSpacing: -0.3 },
    content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl, paddingTop: Spacing.sm },
    opponentCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xxl, padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center', ...Shadow.ambient },
    opponentVs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    playerSide: { alignItems: 'center', gap: 6, flex: 1 },
    playerName: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: Colors.onSurface, letterSpacing: -0.2 },
    vsBubble: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
    levelWrap: {},
    section: { gap: Spacing.md },
    sectionTitle: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: Colors.onSurface, letterSpacing: -0.2 },
    proposalBox: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, padding: Spacing.base, borderWidth: 1, borderColor: Colors.surfaceContainerHigh, gap: 4 },
    proposalText: { ...Typography.bodyMd, color: Colors.onSurface },
    proposalMessage: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: 4, fontStyle: 'italic' },
    proposalMeta: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceContainerHigh },
    dateBtnText: { flex: 1, ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    dateBtnTextActive: { color: Colors.onSurface },
    venueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    venueChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.surfaceContainerHigh },
    venueChipActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
    venueChipText: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
    venueChipTextActive: { color: Colors.primary },
    input: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceContainerHigh, ...Typography.bodyMd, color: Colors.onSurface, fontFamily: 'PlusJakartaSans_400Regular' },
    eloNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.md },
    eloNoticeActive: { backgroundColor: Colors.primaryContainer },
    eloNoticeInactive: { backgroundColor: Colors.surfaceContainerHigh },
    eloNoticeText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, flex: 1 },
    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#FFE5E5', borderRadius: Radius.lg, padding: Spacing.md },
    errorText: { ...Typography.bodySm, color: Colors.error, flex: 1 },
    footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerHigh },
    actionBtnCustom: { flex: 1, height: 52, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    actionBtnPrimary: { backgroundColor: Colors.primary },
    actionBtnSecondary: { backgroundColor: Colors.primaryContainer, borderWidth: 1, borderColor: Colors.primary + '33' },
    actionBtnTextPrimary: { ...Typography.labelLg, color: '#fff' },
    actionBtnTextSecondary: { ...Typography.labelLg, color: Colors.primary },
});