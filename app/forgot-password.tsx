import React, { useState } from 'react';
import {
    View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { showAlert } from '../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '../src/theme/index';
import { Button, InputField } from '../src/components/ui/index';
import { supabase } from '../src/lib/supabase';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleReset = async () => {
        if (!email) { showAlert('Error', 'Ingresá tu email'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'tenistuc://reset-password',
            });
            if (error) throw error;
            setSent(true);
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo enviar el email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <SafeAreaView style={styles.safe} edges={['top']}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={styles.back} onPress={() => router.back()}>← Volver</Text>

                    {sent ? (
                        <View style={styles.sentContainer}>
                            <Text style={{ fontSize: 60 }}></Text>
                            <Text style={styles.title}>¡Email enviado!</Text>
                            <Text style={styles.subtitle}>
                                Revisá tu bandeja de entrada y seguí el link para restablecer tu contraseña.
                            </Text>
                            <Button label="Volver al inicio" onPress={() => router.replace('/login')}
                                style={{ marginTop: Spacing.xxl }} />
                        </View>
                    ) : (
                        <>
                            <Text style={styles.title}>OLVIDÉ MI{'\n'}CONTRASEÑA.</Text>
                            <Text style={styles.subtitle}>
                                Ingresá tu email y te enviaremos un link para restablecer tu contraseña.
                            </Text>
                            <InputField
                                label="Email"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                placeholder="tu@email.com"
                                style={{ marginTop: Spacing.xxl }}
                            />
                            <Button
                                label="ENVIAR LINK"
                                onPress={handleReset}
                                loading={loading}
                                style={{ marginTop: Spacing.xl }}
                            />
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, paddingBottom: Spacing.xxxl },
    back: { ...Typography.bodyMd, color: Colors.primary, fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: Spacing.xxl },
    title: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 40, lineHeight: 44,
        color: Colors.primary, letterSpacing: -1.5, marginBottom: Spacing.md,
    },
    subtitle: { ...Typography.bodyLg, color: Colors.onSurfaceVariant, lineHeight: 24 },
    sentContainer: { alignItems: 'center', paddingTop: Spacing.xxxl, gap: Spacing.md },
});
