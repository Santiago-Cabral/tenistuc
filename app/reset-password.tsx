import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showAlert } from '../src/services/appAlert';
import { Colors, Typography, Spacing } from '../src/theme/index';
import { Button, InputField } from '../src/components/ui/index';
import { supabase } from '../src/lib/supabase';

type RawParams = Record<string, string | string[] | undefined>;

function pick(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function cleanToken(value: string | undefined): string | undefined {
    return value?.replace(/\*+$/, '');
}

function readParams(params: RawParams) {
    const normalized: RawParams = {};
    Object.entries(params).forEach(([key, value]) => {
        normalized[key.replace(/\*+$/, '')] = value;
    });

    const get = (key: string) => cleanToken(pick(normalized[key]));

    return {
        code: get('code'),
        tokenHash: get('token_hash'),
        type: pick(normalized.type),
        error: pick(normalized.error_description) ?? pick(normalized.error),
    };
}

export default function ResetPasswordScreen() {
    const router = useRouter();
    const url = Linking.useURL();
    const searchParams = useLocalSearchParams<{
        code?: string;
        token_hash?: string;
        type?: string;
        error?: string;
        error_description?: string;
    }>();
    const handled = useRef(false);
    const [ready, setReady] = useState(false);
    const [linkError, setLinkError] = useState(false);
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!url || handled.current) return;
        handled.current = true;

        const run = async () => {
            try {
                const parsed = Linking.parse(url);
                const values = readParams({
                    ...(parsed.queryParams ?? {}),
                    ...searchParams,
                } as RawParams);

                const hash = url.includes('#') ? url.split('#')[1] : '';
                const hashParams = new URLSearchParams(hash);
                const accessToken = cleanToken(hashParams.get('access_token') ?? undefined);
                const refreshToken = cleanToken(hashParams.get('refresh_token') ?? undefined);
                const error =
                    values.error ??
                    hashParams.get('error_description') ??
                    hashParams.get('error');

                if (error) { setLinkError(true); return; }

                if (values.code) {
                    const { error: exchangeError } =
                        await supabase.auth.exchangeCodeForSession(values.code);
                    if (exchangeError) {
                        const { data } = await supabase.auth.getSession();
                        if (!data.session) throw exchangeError;
                    }
                } else if (values.tokenHash) {
                    const { error: verifyError } = await supabase.auth.verifyOtp({
                        token_hash: values.tokenHash,
                        type: 'recovery',
                    });
                    if (verifyError) throw verifyError;
                } else if (accessToken && refreshToken) {
                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (sessionError) throw sessionError;
                } else {
                    setLinkError(true);
                    return;
                }

                setReady(true);
            } catch {
                setLinkError(true);
            }
        };

        run();
    }, [url, searchParams]);

    const handleSubmit = async () => {
        if (next.length < 6) { showAlert('Error', 'La contraseña debe tener al menos 6 caracteres'); return; }
        if (next !== confirm) { showAlert('Error', 'Las contraseñas no coinciden'); return; }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: next });
            if (error) throw error;
            showAlert('Listo', 'Tu contraseña fue actualizada');
            router.replace('/');
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    if (linkError) {
        return (
            <SafeAreaView style={styles.center}>
                <Text style={styles.subtitle}>El enlace es inválido o venció. Pedí uno nuevo.</Text>
                <Button label="PEDIR OTRO LINK" onPress={() => router.replace('/forgot-password')} />
            </SafeAreaView>
        );
    }

    if (!ready) {
        return (
            <SafeAreaView style={styles.center}>
                <ActivityIndicator color={Colors.primary} />
            </SafeAreaView>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <SafeAreaView style={styles.safe} edges={['top']}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>NUEVA{'\n'}CONTRASEÑA.</Text>
                    <Text style={styles.subtitle}>Elegí una contraseña nueva para tu cuenta.</Text>
                    <InputField
                        label="Nueva contraseña"
                        value={next}
                        onChangeText={setNext}
                        secureTextEntry
                        autoCapitalize="none"
                        placeholder="Mínimo 6 caracteres"
                        style={{ marginTop: Spacing.xxl }}
                    />
                    <InputField
                        label="Repetir contraseña"
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry
                        autoCapitalize="none"
                        placeholder="Repetí la contraseña"
                        style={{ marginTop: Spacing.lg }}
                    />
                    <Button
                        label="GUARDAR CONTRASEÑA"
                        onPress={handleSubmit}
                        loading={loading}
                        style={{ marginTop: Spacing.xl }}
                    />
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    center: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.xl },
    content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxxl, paddingBottom: Spacing.xxxl },
    title: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 40, lineHeight: 44,
        color: Colors.primary, letterSpacing: -1.5, marginBottom: Spacing.md,
    },
    subtitle: { ...Typography.bodyLg, color: Colors.onSurfaceVariant, lineHeight: 24 },
});
