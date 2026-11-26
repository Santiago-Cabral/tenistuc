import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography } from '../../theme/index';

interface Props {
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

export function PrivacyConsent({ checked, onChange, disabled }: Props) {
    const router = useRouter();

    const toggle = () => onChange(!checked);

    return (
        <View style={styles.wrap}>
            <TouchableOpacity
                style={styles.row}
                onPress={toggle}
                disabled={disabled}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={checked ? Colors.primary : Colors.onSurfaceVariant}
                />
                <Text style={styles.text}>
                    Leí y acepto la{' '}
                    <Text
                        style={styles.link}
                        onPress={(e) => {
                            e.stopPropagation();
                            router.push('/privacy-policy');
                        }}
                    >
                        Política de Privacidad
                    </Text>
                    {' y los '}
                    <Text
                        style={styles.link}
                        onPress={(e) => {
                            e.stopPropagation();
                            router.push('/terms');
                        }}
                    >
                        Términos y Condiciones
                    </Text>
                    {'.'}
                </Text>
            </TouchableOpacity>
            {!checked && (
                <Text style={styles.hint}>
                    Es obligatorio aceptarlos para poder usar TucuPlay.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    text: {
        ...Typography.bodyMd,
        color: Colors.onSurface,
        flex: 1,
        lineHeight: 20,
    },
    link: {
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    hint: {
        ...Typography.bodySm,
        color: Colors.error,
        marginLeft: 30,
    },
});