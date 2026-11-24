import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore, type UserRole } from '../../src/stores/authStore';
import { Colors, Typography, Spacing, Radius } from '../../src/theme/index';

const ROLE_ROUTE: Record<UserRole, string> = {
    admin: '/adminTabs/dashboard',
    organizer: '/organizerTabs/dashboard',
    athlete: '/athleteTabs',
};

export default function AuthCallbackScreen() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        handled.current = true;

        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(
                window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, '')
            );
            const providerError = params.get('error_description') ?? params.get('error');
            if (providerError) {
                setError(providerError);
                return;
            }
        }

        let cancelled = false;
        let attempts = 0;

        const timer = setInterval(async () => {
            attempts += 1;

            try {
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;

                if (!data.session && attempts < 12) return;

                clearInterval(timer);

                if (!data.session) {
                    router.replace('/login');
                    return;
                }

                await useAuthStore.getState().initialize();
                if (cancelled) return;

                if (!useAuthStore.getState().profile) {
                    await useAuthStore.getState().fetchProfile();
                }
                if (cancelled) return;

                const role = useAuthStore.getState().profile?.role;
                router.replace((role ? ROLE_ROUTE[role] : '/') as any);
            } catch (e: any) {
                clearInterval(timer);
                setError(e?.message ?? 'No se pudo completar el inicio de sesión');
            }
        }, 250);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [router]);

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorTitle}>No se pudo completar el inicio de sesión</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
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
    loadingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    errorTitle: { ...Typography.titleMd, color: Colors.onSurface, textAlign: 'center' },
    errorText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
    button: {
        marginTop: Spacing.md,
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xxl,
    },
    buttonText: { ...Typography.labelLg, color: Colors.onPrimary },
});
