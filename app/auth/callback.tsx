import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/index';

// Pantalla de retorno del OAuth (Google/Apple).
//
// Con `WebBrowser.openAuthSessionAsync` el redirect suele interceptarse y esta
// ruta no se ejecuta; pero si el deep link `tenistuc://auth/callback` abre la
// app en frío, expo-router cae acá y canjeamos el `code` igual.
export default function AuthCallbackScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        code?: string;
        error?: string;
        error_description?: string;
    }>();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const pick = (value: string | string[] | undefined) =>
            Array.isArray(value) ? value[0] : value;

        (async () => {
            // Si ya hay sesión (p.ej. openAuthSessionAsync ya canjeó el code),
            // no hacemos nada más.
            const { data: { session } } = await supabase.auth.getSession();
            if (cancelled) return;
            if (session) {
                router.replace('/');
                return;
            }

            const providerError =
                pick(params.error_description) ?? pick(params.error);
            if (providerError) {
                setError(providerError);
                return;
            }

            const code = pick(params.code);
            if (!code) {
                router.replace('/login');
                return;
            }

            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (cancelled) return;
            if (exchangeError) {
                // Puede que authService ya haya canjeado el mismo code.
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    router.replace('/');
                    return;
                }
                setError(exchangeError.message);
                return;
            }

            router.replace('/');
        })();

        return () => { cancelled = true; };
    }, []);

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorTitle}>No se pudo completar el inicio de sesión</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => router.replace('/login')}
                    activeOpacity={0.85}
                >
                    <Text style={styles.buttonText}>Volver al inicio</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Completando inicio de sesión…</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        paddingHorizontal: Spacing.xl,
        gap: Spacing.lg,
    },
    loadingText: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
    },
    errorTitle: {
        ...Typography.titleMd,
        color: Colors.onSurface,
        textAlign: 'center',
    },
    errorText: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
    },
    button: {
        marginTop: Spacing.md,
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xxl,
    },
    buttonText: {
        ...Typography.labelLg,
        color: Colors.onPrimary,
    },
});
