import React, { useState } from 'react';
import {
    View, Text, StyleSheet, Alert,
    KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../../theme/index';
import { Button, InputField } from '../../../components/ui/index';
import { useAuthStore } from '../../../stores/authStore';

export default function LoginScreen() {
    const router = useRouter();
    const { signIn } = useAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Completá todos los campos');
            return;
        }
        setLoading(true);
        try {
            await signIn(email.trim().toLowerCase(), password);
            // AuthGuard redirige automáticamente a /(tabs)
        } catch (e: any) {
            Alert.alert('Error al iniciar sesión', e.message ?? 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <SafeAreaView style={styles.safe} edges={['top']}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Logo / Brand */}
                    <View style={styles.brandRow}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDim]}
                            style={styles.logoCircle}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.logoEmoji}>🎾</Text>
                        </LinearGradient>
                        <Text style={styles.appName}>TENISTUC</Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>BIENVENIDO{'\n'}DE VUELTA.</Text>
                    <Text style={styles.subtitle}>
                        Iniciá sesión para continuar tu progreso en la cancha.
                    </Text>

                    {/* Form */}
                    <View style={styles.form}>
                        <InputField
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            placeholder="tu@email.com"
                        />
                        <InputField
                            label="Contraseña"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            placeholder="••••••••"
                        />

                        <TouchableOpacity
                            onPress={() => router.push('/forgot-password')}
                            style={styles.forgotBtn}
                        >
                            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Actions */}
                    <Button
                        label="INICIAR SESIÓN"
                        onPress={handleLogin}
                        loading={loading}
                        style={styles.loginBtn}
                    />

                    <View style={styles.registerRow}>
                        <Text style={styles.registerText}>¿No tenés cuenta? </Text>
                        <TouchableOpacity onPress={() => router.push('/register')}>
                            <Text style={styles.registerLink}>Registrate</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    content: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xxl,
        paddingBottom: Spacing.xxxl,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.xxxl,
    },
    logoCircle: {
        width: 44, height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoEmoji: { fontSize: 22 },
    appName: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 18,
        color: Colors.onSurface,
        letterSpacing: 3,
    },
    title: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 40,
        lineHeight: 44,
        color: Colors.primary,
        letterSpacing: -1.5,
        marginBottom: Spacing.md,
    },
    subtitle: {
        ...Typography.bodyLg,
        color: Colors.onSurfaceVariant,
        lineHeight: 24,
        marginBottom: Spacing.xxxl,
    },
    form: { gap: Spacing.lg },
    forgotBtn: { alignSelf: 'flex-end', marginTop: Spacing.sm },
    forgotText: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    loginBtn: { marginTop: Spacing.xxl },
    registerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xl,
    },
    registerText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    registerLink: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
});