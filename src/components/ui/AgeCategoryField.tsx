import React, { useState } from 'react';
import {
    Modal, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Typography } from '../../theme';
import {
    AGE_CATEGORIES, AGE_CATEGORY_LABELS, ageCategoryFromBirthDate,
    type AgeSelection, formatBirthDate, toDateInputValue,
} from '../../constants/ageCategories';

interface Props {
    value: AgeSelection;
    onChange: (next: AgeSelection) => void;
    label?: string;
}

export function AgeCategoryField({
    value,
    onChange,
    label = 'CATEGORÍA DE EDAD',
}: Props) {
    const [showPicker, setShowPicker] = useState(false);
    const birthDateLabel = formatBirthDate(value.birthDate);

    const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS !== 'ios') setShowPicker(false);
        if (event.type === 'dismissed' || !selected) return;
        const iso = toDateInputValue(selected);
        onChange({
            mode: 'birth',
            birthDate: iso,
            category: ageCategoryFromBirthDate(iso),
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.hint}>
                Elegí una categoría o cargá tu fecha de nacimiento para calcularla.
            </Text>

            <View style={styles.modeRow}>
                <TouchableOpacity
                    style={[styles.modeChip, value.mode === 'category' && styles.chipActive]}
                    onPress={() => onChange({ ...value, mode: 'category' })}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.modeText, value.mode === 'category' && styles.textActive]}>
                        Por categoría
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.modeChip, value.mode === 'birth' && styles.chipActive]}
                    onPress={() => onChange({ ...value, mode: 'birth' })}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.modeText, value.mode === 'birth' && styles.textActive]}>
                        Por fecha de nacimiento
                    </Text>
                </TouchableOpacity>
            </View>

            {value.mode === 'category' ? (
                <View style={styles.optionsRow}>
                    {AGE_CATEGORIES.map((category) => (
                        <TouchableOpacity
                            key={category}
                            style={[
                                styles.optionChip,
                                value.category === category && styles.chipActive,
                            ]}
                            onPress={() => onChange({
                                mode: 'category',
                                category,
                                birthDate: null,
                            })}
                            activeOpacity={0.85}
                        >
                            <Text style={[
                                styles.optionText,
                                value.category === category && styles.textActive,
                            ]}>
                                {AGE_CATEGORY_LABELS[category]}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : (
                <View style={styles.birthWrap}>
                    <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => setShowPicker(true)}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                        <Text style={[styles.dateText, !birthDateLabel && styles.datePlaceholder]}>
                            {birthDateLabel ?? 'Elegí tu fecha de nacimiento'}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={Colors.onSurfaceVariant} />
                    </TouchableOpacity>
                    {birthDateLabel && (
                        <View style={styles.birthResult}>
                            <Text style={styles.birthResultText}>
                                Tu categoría será {AGE_CATEGORY_LABELS[value.category]}
                            </Text>
                            <TouchableOpacity
                                onPress={() => onChange({
                                    mode: 'birth',
                                    category: 'libre',
                                    birthDate: null,
                                })}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text style={styles.clearText}>Borrar</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            <Modal
                visible={showPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPicker(false)}
            >
                <View style={styles.backdrop}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setShowPicker(false)}
                    />
                    <View style={styles.pickerCard}>
                        <Text style={styles.pickerTitle}>Fecha de nacimiento</Text>
                        <DateTimePicker
                            value={value.birthDate
                                ? new Date(`${value.birthDate}T12:00:00`)
                                : new Date(1990, 0, 1)}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            locale="es-AR"
                            minimumDate={new Date(1900, 0, 1)}
                            maximumDate={new Date()}
                            onChange={handleDateChange}
                        />
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => setShowPicker(false)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.doneText}>Listo</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { gap: Spacing.sm },
    label: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
        letterSpacing: 0.8,
    },
    hint: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        lineHeight: 17,
    },
    modeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    modeChip: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerLow,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    optionChip: {
        minHeight: 44,
        minWidth: 56,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    chipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    modeText: {
        ...Typography.labelMd,
        color: Colors.onSurfaceVariant,
    },
    optionText: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
    },
    textActive: {
        color: Colors.onPrimary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    birthWrap: { gap: Spacing.sm, marginTop: Spacing.xs },
    dateButton: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.lg,
        backgroundColor: Colors.surfaceContainerLowest,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    dateText: {
        ...Typography.labelLg,
        color: Colors.onSurface,
        flex: 1,
    },
    datePlaceholder: { color: Colors.onSurfaceVariant },
    birthResult: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.md,
    },
    birthResultText: {
        ...Typography.bodySm,
        color: Colors.primary,
    },
    clearText: {
        ...Typography.labelMd,
        color: Colors.onSurfaceVariant,
        textDecorationLine: 'underline',
    },
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: Colors.scrim,
    },
    pickerCard: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderTopLeftRadius: Radius.xxl,
        borderTopRightRadius: Radius.xxl,
        padding: Spacing.xl,
        paddingBottom: Spacing.xxxl,
    },
    pickerTitle: {
        ...Typography.titleMd,
        color: Colors.onSurface,
        marginBottom: Spacing.md,
    },
    doneButton: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.lg,
        backgroundColor: Colors.primary,
        marginTop: Spacing.md,
    },
    doneText: {
        ...Typography.labelLg,
        color: Colors.onPrimary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
});
