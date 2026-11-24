import React from 'react';
import {
    View, Text, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';

type Tone = 'primary' | 'warning' | 'danger' | 'neutral';

const TONE: Record<Tone, { bg: string; fg: string }> = {
    primary: { bg: Colors.primaryContainer, fg: Colors.onPrimaryContainer },
    warning: { bg: Colors.tertiaryContainer, fg: Colors.onTertiaryContainer },
    danger: { bg: Colors.errorContainer, fg: Colors.error },
    neutral: { bg: Colors.surfaceContainerHigh, fg: Colors.onSurfaceVariant },
};

export function AdminHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <View style={styles.header}>
            <View style={styles.headerBadge}>
                <Ionicons name="shield-checkmark" size={13} color={Colors.onPrimary} />
                <Text style={styles.headerBadgeText}>ADMIN</Text>
            </View>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
    );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
    const c = TONE[tone];
    return (
        <View style={[styles.chip, { backgroundColor: c.bg }]}>
            <Text style={[styles.chipText, { color: c.fg }]}>{label}</Text>
        </View>
    );
}

export function Card({ children }: { children: React.ReactNode }) {
    return <View style={styles.card}>{children}</View>;
}

export function StatCard({
    icon, label, value, tone = 'primary',
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    tone?: Tone;
}) {
    return (
        <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: TONE[tone].bg }]}>
                <Ionicons name={icon} size={18} color={TONE[tone].fg} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
    return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Loader() {
    return (
        <View style={styles.loader}>
            <ActivityIndicator color={Colors.primary} size="large" />
        </View>
    );
}

export function EmptyState({
    icon, title, message,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    message: string;
}) {
    return (
        <View style={styles.empty}>
            <Ionicons name={icon} size={34} color={Colors.outline} />
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptyMessage}>{message}</Text>
        </View>
    );
}

export function RowAction({
    icon, label, onPress, tone = 'primary', disabled = false,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    tone?: Tone;
    disabled?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.rowAction,
                { backgroundColor: TONE[tone].bg },
                pressed && styles.pressed,
                disabled && styles.disabled,
            ]}
        >
            <Ionicons name={icon} size={15} color={TONE[tone].fg} />
            <Text style={[styles.rowActionText, { color: TONE[tone].fg }]}>{label}</Text>
        </Pressable>
    );
}

export function OptionGroup<T extends string>({
    label, options, value, onChange,
}: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <View style={styles.optionGroup}>
            <Text style={styles.optionLabel}>{label}</Text>
            <View style={styles.options}>
                {options.map((option) => (
                    <Pressable
                        key={option}
                        onPress={() => onChange(option)}
                        style={({ pressed }) => [
                            styles.option,
                            value === option && styles.optionActive,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Text style={[styles.optionText, value === option && styles.optionTextActive]}>
                            {option}
                        </Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

export function EditorModal({
    visible, title, onClose, onSave, saving, children,
}: {
    visible: boolean;
    title: string;
    onClose: () => void;
    onSave: () => void;
    saving: boolean;
    children: React.ReactNode;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <Pressable onPress={onClose} hitSlop={8}>
                            <Ionicons name="close" size={22} color={Colors.onSurfaceVariant} />
                        </Pressable>
                    </View>
                    <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                        {children}
                    </ScrollView>
                    <View style={styles.modalFooter}>
                        <RowAction icon="close-outline" label="Cancelar" tone="neutral" onPress={onClose} disabled={saving} />
                        <RowAction
                            icon="checkmark-circle-outline"
                            label={saving ? 'Guardando...' : 'Guardar'}
                            onPress={onSave}
                            disabled={saving}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    header: { gap: Spacing.sm, marginBottom: Spacing.xl },
    headerBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: Colors.primaryDim,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    headerBadgeText: { ...Typography.labelSm, color: Colors.onPrimary, letterSpacing: 1 },
    headerTitle: { ...Typography.headlineLg, color: Colors.onSurface },
    headerSubtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },

    chip: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    chipText: { ...Typography.labelSm, letterSpacing: 0.3 },
    card: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        ...Shadow.ambient,
    },

    statCard: {
        width: '47%',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        gap: Spacing.xs,
        ...Shadow.ambient,
    },
    statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontFamily: 'Lexend_700Bold', fontSize: 22, color: Colors.onSurface },
    statLabel: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    sectionTitle: { ...Typography.titleMd, color: Colors.onSurface, marginTop: Spacing.lg, marginBottom: Spacing.md },
    loader: { paddingVertical: 60, alignItems: 'center' },
    empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.sm },
    emptyTitle: { ...Typography.titleMd, color: Colors.onSurface, marginTop: Spacing.sm },
    emptyMessage: { ...Typography.bodySm, color: Colors.onSurfaceVariant, textAlign: 'center' },

    rowAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    rowActionText: { ...Typography.labelSm },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.4 },

    optionGroup: { gap: Spacing.sm, marginBottom: Spacing.base },
    optionLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    option: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainer,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    optionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optionText: { ...Typography.labelSm, color: Colors.onSurface },
    optionTextActive: { color: Colors.onPrimary },

    backdrop: {
        flex: 1,
        backgroundColor: Colors.scrim,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    modalCard: {
        width: '100%',
        maxHeight: '88%',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl,
        padding: Spacing.xl,
        gap: Spacing.base,
        ...Shadow.float,
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { ...Typography.titleLg, fontFamily: 'Lexend_700Bold', color: Colors.onSurface },
    modalBody: { width: '100%' },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, paddingTop: Spacing.sm },
});
