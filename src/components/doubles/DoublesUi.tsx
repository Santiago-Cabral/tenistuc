import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Pressable, Modal, ScrollView,
    RefreshControl, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '../ui/DateTimeField';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { Avatar, Badge, Button, InputField, VenueChips } from '../ui';
import type { DoublesChallenge, DoublesTeam } from '../../services/doublesService';
import { CUSTOM_VENUE, VENUES } from '../../constants/venues';

export { VENUES };

export interface ChallengeFormPayload {
    date: string | null;
    venue: string | null;
    message: string | null;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'No se pudo completar la operación. Intentá de nuevo.';
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
    });
}

export function teamLabel(team: DoublesTeam | null | undefined): string {
    if (!team) return 'Dupla desconocida';
    const customName = team.name?.trim();
    if (customName) return customName;
    const names = [team.p1?.full_name?.trim(), team.p2?.full_name?.trim()]
        .filter((name): name is string => !!name);
    if (names.length) return names.join(' y ');
    return team.is_permanent ? 'Dupla permanente' : 'Dupla de dobles';
}

export function DoublesScreen({
    title, subtitle, refreshing, onRefresh, children,
}: {
    title: string;
    subtitle?: string;
    refreshing?: boolean;
    onRefresh?: () => void;
    children: React.ReactNode;
}) {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <DoublesHeader title={title} subtitle={subtitle} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.screenContent}
                refreshControl={onRefresh ? (
                    <RefreshControl
                        refreshing={!!refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                    />
                ) : undefined}
            >
                {children}
                <View style={styles.bottomSpace} />
            </ScrollView>
        </SafeAreaView>
    );
}

function DoublesHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    const router = useRouter();
    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backBtn}
                activeOpacity={0.8}
                accessibilityLabel="Volver"
            >
                <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
            </TouchableOpacity>
            <View style={styles.headerTitles}>
                <Text style={styles.headerTitle}>{title}</Text>
                {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
            </View>
        </View>
    );
}

export function DoublesEmpty({
    icon, title, message, children,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    message: string;
    children?: React.ReactNode;
}) {
    return (
        <View style={styles.empty}>
            <Ionicons name={icon} size={38} color={Colors.outline} />
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptyMessage}>{message}</Text>
            {children ? <View style={styles.emptyAction}>{children}</View> : null}
        </View>
    );
}

export function DoublesLoader({ label }: { label?: string }) {
    return (
        <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            {label ? <Text style={styles.loaderText}>{label}</Text> : null}
        </View>
    );
}

export function DoublesNotice({ text }: { text: string }) {
    return (
        <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.tertiary} />
            <Text style={styles.noticeText}>{text}</Text>
        </View>
    );
}

export function NavRow({
    icon, label, detail, onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    detail?: string;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.8}>
            <View style={styles.navIcon}>
                <Ionicons name={icon} size={19} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.navLabel}>{label}</Text>
                {detail ? <Text style={styles.navDetail}>{detail}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
        </TouchableOpacity>
    );
}

export function TeamIdentity({
    team, size = 44, meta,
}: {
    team: DoublesTeam | null | undefined;
    size?: number;
    meta?: string;
}) {
    const names = [team?.p1?.full_name, team?.p2?.full_name]
        .filter((name): name is string => !!name);
    const fallbackMeta = names.length === 2 ? names.join(' y ') : teamLabel(team);

    return (
        <View style={styles.teamIdentity}>
            <View style={styles.avatarPair}>
                <Avatar uri={team?.p1?.avatar_url} size={size} />
                <View style={styles.avatarSecond}>
                    <Avatar uri={team?.p2?.avatar_url} size={size} />
                </View>
            </View>
            <View style={styles.teamInfo}>
                <Text style={styles.teamTitle} numberOfLines={1}>{teamLabel(team)}</Text>
                <Text style={styles.teamMeta} numberOfLines={2}>{meta ?? fallbackMeta}</Text>
            </View>
        </View>
    );
}

export function TeamBadges({ team }: { team: DoublesTeam }) {
    return (
        <View style={styles.badgeRow}>
            <Badge
                label={team.is_permanent ? 'PERMANENTE' : 'EN FORMACIÓN'}
                color={team.is_permanent ? Colors.primaryContainer : Colors.surfaceContainerHigh}
                textColor={team.is_permanent ? Colors.primary : Colors.onSurfaceVariant}
            />
            <Badge
                label={`${team.elo} ELO`}
                color={Colors.secondaryContainer}
                textColor={Colors.onSecondaryContainer}
            />
            <Badge
                label={`${team.wins} V · ${team.losses} D`}
                color={Colors.tertiaryContainer}
                textColor={Colors.onTertiaryContainer}
            />
        </View>
    );
}

export function ChallengeDetails({ challenge }: { challenge: DoublesChallenge }) {
    return (
        <View style={styles.challengeDetails}>
            <TeamIdentity team={challenge.challenger_team} />
            <View style={styles.metaList}>
                <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.onSurfaceVariant} />
                    <Text style={styles.metaText}>{formatDate(challenge.proposed_date)}</Text>
                </View>
                {challenge.proposed_venue ? (
                    <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={14} color={Colors.onSurfaceVariant} />
                        <Text style={styles.metaText}>{challenge.proposed_venue}</Text>
                    </View>
                ) : null}
            </View>
            {challenge.message ? (
                <Text style={styles.challengeMessage}>“{challenge.message}”</Text>
            ) : null}
        </View>
    );
}

export function ChallengeFormModal({
    visible, title, subtitle, onClose, onSubmit,
}: {
    visible: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    onSubmit: (payload: ChallengeFormPayload) => Promise<void>;
}) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
    const [customVenue, setCustomVenue] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setSelectedDate(null);
        setShowDatePicker(false);
        setShowTimePicker(false);
        setSelectedVenue(null);
        setCustomVenue('');
        setMessage('');
    }, [visible]);

    const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
        setShowDatePicker(false);
        if (!date) return;
        const combined = selectedDate ? new Date(selectedDate) : new Date();
        combined.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setSelectedDate(combined);
        setTimeout(() => setShowTimePicker(true), 250);
    };

    const onTimeChange = (_: DateTimePickerEvent, time?: Date) => {
        setShowTimePicker(false);
        if (!time || !selectedDate) return;
        const combined = new Date(selectedDate);
        combined.setHours(time.getHours(), time.getMinutes());
        setSelectedDate(combined);
    };

    const handleSubmit = async () => {
        const venue = selectedVenue === CUSTOM_VENUE
            ? customVenue.trim() || null
            : selectedVenue;
        setSaving(true);
        try {
            await onSubmit({
                date: selectedDate?.toISOString() ?? null,
                venue,
                message: message.trim() || null,
            });
        } finally {
            setSaving(false);
        }
    };

    const formattedDate = selectedDate
        ? selectedDate.toLocaleDateString('es', {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit',
        })
        : null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    disabled={saving}
                />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.modalTitle}>{title}</Text>
                    {subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}

                    <ScrollView
                        style={styles.modalScroll}
                        contentContainerStyle={styles.modalBody}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.fieldLabel}>Fecha y hora</Text>
                        <TouchableOpacity
                            style={styles.dateBtn}
                            onPress={() => setShowDatePicker(true)}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name={selectedDate ? 'calendar' : 'calendar-outline'}
                                size={20}
                                color={selectedDate ? Colors.primary : Colors.onSurfaceVariant}
                            />
                            <Text style={[styles.dateBtnText, selectedDate && styles.dateBtnTextActive]}>
                                {formattedDate ?? 'Elegí fecha y hora'}
                            </Text>
                            {selectedDate ? (
                                <TouchableOpacity
                                    onPress={() => setSelectedDate(null)}
                                    hitSlop={8}
                                >
                                    <Ionicons
                                        name="close-circle"
                                        size={18}
                                        color={Colors.onSurfaceVariant}
                                    />
                                </TouchableOpacity>
                            ) : null}
                        </TouchableOpacity>

                        {showDatePicker ? (
                            <DateTimePicker
                                value={selectedDate ?? new Date()}
                                mode="date"
                                minimumDate={new Date()}
                                onChange={onDateChange}
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            />
                        ) : null}
                        {showTimePicker ? (
                            <DateTimePicker
                                value={selectedDate ?? new Date()}
                                mode="time"
                                onChange={onTimeChange}
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            />
                        ) : null}

                        <Text style={styles.fieldLabel}>Sede</Text>
                        <VenueChips
                            selected={selectedVenue}
                            onSelect={venue => setSelectedVenue(prev => prev === venue ? null : venue)}
                        />
                        {selectedVenue === CUSTOM_VENUE ? (
                            <InputField
                                label="¿Dónde se juega?"
                                value={customVenue}
                                onChangeText={setCustomVenue}
                                placeholder="Escribí el lugar..."
                            />
                        ) : null}

                        <InputField
                            label="Mensaje (opcional)"
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Contales algo sobre el partido..."
                            multiline
                            numberOfLines={3}
                        />
                    </ScrollView>

                    <View style={styles.footerRow}>
                        <Button
                            label="Cancelar"
                            variant="secondary"
                            uppercase={false}
                            onPress={onClose}
                            disabled={saving}
                            style={styles.footerBtn}
                        />
                        <Button
                            label={saving ? 'Enviando...' : 'Enviar desafío'}
                            uppercase={false}
                            onPress={handleSubmit}
                            loading={saving}
                            style={styles.footerBtn}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    screenContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, gap: Spacing.md },
    bottomSpace: { height: Spacing.xxxl },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHighest,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitles: { flex: 1, gap: 2 },
    headerTitle: { fontFamily: 'Lexend_700Bold', fontSize: 20, color: Colors.onSurface },
    headerSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    empty: {
        alignItems: 'center',
        paddingVertical: Spacing.xxl,
        gap: Spacing.sm,
        backgroundColor: Colors.surfaceContainerLow,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.lg,
    },
    emptyTitle: { ...Typography.titleMd, color: Colors.onSurface, textAlign: 'center' },
    emptyMessage: { ...Typography.bodySm, color: Colors.onSurfaceVariant, textAlign: 'center' },
    emptyAction: { width: '100%', marginTop: Spacing.sm },

    loader: { paddingVertical: Spacing.xxxl, alignItems: 'center', gap: Spacing.md },
    loaderText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    notice: {
        flexDirection: 'row',
        gap: Spacing.sm,
        alignItems: 'flex-start',
        backgroundColor: Colors.tertiaryContainer,
        borderRadius: Radius.lg,
        padding: Spacing.md,
    },
    noticeText: { flex: 1, ...Typography.bodySm, color: Colors.onTertiaryContainer },

    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        ...Shadow.ambient,
    },
    navIcon: {
        width: 36,
        height: 36,
        borderRadius: Radius.full,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navLabel: { ...Typography.titleMd, color: Colors.onSurface },
    navDetail: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    teamIdentity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    avatarPair: { flexDirection: 'row', alignItems: 'center' },
    avatarSecond: { marginLeft: -14 },
    teamInfo: { flex: 1, gap: 2 },
    teamTitle: { fontFamily: 'Lexend_600SemiBold', fontSize: 15, color: Colors.onSurface },
    teamMeta: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

    challengeDetails: { gap: Spacing.md },
    metaList: { gap: Spacing.xs },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    metaText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    challengeMessage: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        fontStyle: 'italic',
    },

    backdrop: {
        flex: 1,
        backgroundColor: Colors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        maxHeight: '90%',
        backgroundColor: Colors.surface,
        borderTopLeftRadius: Radius.xxl,
        borderTopRightRadius: Radius.xxl,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.xl,
        gap: Spacing.md,
        ...Shadow.float,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
        alignSelf: 'center',
    },
    modalTitle: { fontFamily: 'Lexend_700Bold', fontSize: 20, color: Colors.onSurface },
    modalSubtitle: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    modalScroll: { width: '100%' },
    modalBody: { gap: Spacing.md, paddingBottom: Spacing.sm },
    fieldLabel: {
        fontFamily: 'Lexend_600SemiBold',
        fontSize: 14,
        color: Colors.onSurface,
    },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
    },
    dateBtnText: { flex: 1, ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    dateBtnTextActive: { color: Colors.onSurface },
    footerRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
    footerBtn: { flex: 1 },
});
