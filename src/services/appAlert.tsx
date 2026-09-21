import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../theme/index';

export interface AppAlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
    id: number;
    title: string;
    message?: string;
    buttons?: AppAlertButton[];
}

let current: AlertState | null = null;
const listeners = new Set<(s: AlertState | null) => void>();
let seq = 0;

export function showAlert(title: string, message?: string, buttons?: AppAlertButton[]): void {
    current = { id: ++seq, title, message, buttons };
    listeners.forEach((l) => l(current));
}

export function dismissAlert(): void {
    current = null;
    listeners.forEach((l) => l(null));
}

type Tone = 'success' | 'danger' | 'info';

function pickTone(state: AlertState): Tone {
    if (state.buttons?.some((b) => b.style === 'destructive')) return 'danger';
    if (/no se pudo|error|inv[lá]lid|cerrada|requerido|falta info|rechazar|cancelar|eliminar|no hay/i.test(state.title)) {
        return 'danger';
    }
    if (/^[¡]/i.test(state.title) || /listo|confirmad|enviado|programado|inscripto|create|aceptado/i.test(state.title)) {
        return 'success';
    }
    return 'info';
}

const TONE_STYLE: Record<Tone, { bg: string; color: string; icon: 'checkmark-circle' | 'alert-circle' | 'information-circle' }> = {
    success: { bg: Colors.primaryContainer, color: Colors.primaryDim, icon: 'checkmark-circle' },
    danger: { bg: Colors.errorContainer, color: Colors.error, icon: 'alert-circle' },
    info: { bg: Colors.secondaryContainer, color: Colors.secondary, icon: 'information-circle' },
};

export function AppAlertHost() {
    const [state, setState] = useState<AlertState | null>(null);

    useEffect(() => {
        const listener = (s: AlertState | null) => setState(s);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    if (!state) return null;

    const tone = pickTone(state);
    const toneStyle = TONE_STYLE[tone];
    const hasCancel = state.buttons?.some((b) => b.style === 'cancel') ?? false;

    const pressButton = (button: AppAlertButton) => {
        dismissAlert();
        button.onPress?.();
    };

    return (
        <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={hasCancel ? dismissAlert : undefined}
            statusBarTranslucent
        >
            <View style={styles.backdrop}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={hasCancel ? dismissAlert : undefined}
                    accessibilityLabel="Cerrar"
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <View style={[styles.iconWrap, { backgroundColor: toneStyle.bg }]}>
                        <Ionicons name={toneStyle.icon} size={26} color={toneStyle.color} />
                    </View>

                    <Text style={styles.title}>{state.title}</Text>
                    {!!state.message && <Text style={styles.message}>{state.message}</Text>}

                    <View style={styles.buttonsRow}>
                        {(state.buttons ?? [{ text: 'OK' }]).map((button, index) => {
                            const isCancel = button.style === 'cancel';
                            const isDestructive = button.style === 'destructive';
                            const buttonStyle = isDestructive ? styles.btnDanger : isCancel ? styles.btnCancel : styles.btnPrimary;
                            const buttonTextStyle = isDestructive ? styles.btnDangerText : isCancel ? styles.btnCancelText : styles.btnPrimaryText;
                            return (
                                <Pressable
                                    key={`${state.id}-${index}`}
                                    style={({ pressed }) => [styles.btn, buttonStyle, pressed && styles.btnPressed]}
                                    onPress={() => pressButton(button)}
                                >
                                    <Text style={[styles.btnText, buttonTextStyle]}>{button.text}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: Colors.scrim,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xxl,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xxl,
        padding: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.base,
        ...Shadow.float,
    },
    iconWrap: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.sm,
    },
    title: {
        ...Typography.titleLg,
        color: Colors.onSurface,
        textAlign: 'center',
        fontFamily: 'Lexend_700Bold',
    },
    message: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonsRow: {
        flexDirection: 'row',
        gap: Spacing.base,
        marginTop: Spacing.sm,
        alignSelf: 'stretch',
    },
    btn: {
        flex: 1,
        minHeight: 48,
        borderRadius: Radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.lg,
    },
    btnPressed: { opacity: 0.85 },
    btnPrimary: { backgroundColor: Colors.primary },
    btnPrimaryText: { color: Colors.onPrimary },
    btnCancel: {
        backgroundColor: Colors.surfaceContainerHigh,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    btnCancelText: { color: Colors.onSurface },
    btnDanger: { backgroundColor: Colors.error },
    btnDangerText: { color: Colors.onError },
    btnText: {
        ...Typography.labelLg,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
});