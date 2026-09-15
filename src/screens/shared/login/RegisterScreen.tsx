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

const LEVELS = ['Amateur I', 'Amateur II', 'Intermedio', 'Avanzado', 'Competitivo'];

export default function RegisterScreen() {
    const router = useRouter();
    const { signUp } = useAuthStore();
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [level, setLevel] = useState('Amateur I');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!fullName || !username || !email || !password) {
            Alert.alert('Error', 'Completá todos los campos obligatorios');
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Error', 'Las contraseñas no coinciden');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
            return;
        }
        setLoading(true);
        try {
            await signUp(email.trim().toLowerCase(), password, username.trim(), fullName.trim(), level);
            Alert.alert(
                '¡Cuenta creada!',
                'Revisá tu email para confirmar tu cuenta.',
                [{ text: 'OK', onPress: () => router.replace('/login') }]
            );
        } catch (e: any) {
            Alert.alert('Error al registrarse', e.message ?? 'Intentá de nuevo');
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
                    {/* Back */}
                    <Text style={styles.back} onPress={() => router.back()}>← Volver</Text>

                    {/* Brand */}
                    <View style={styles.brandRow}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDim]}
                            style={styles.logoCircle}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.logoEmoji}>🎾</Text>
                        </LinearGradient>
                    </View>

                    <Text style={styles.title}>CREAR{'\n'}CUENTA.</Text>
                    <Text style={styles.subtitle}>
                        Unite a la comunidad de tenis de Tucumán.
                    </Text>

                    {/* Form */}
                    <View style={styles.form}>
                        <InputField
                            label="Nombre completo *"
                            value={fullName}
                            onChangeText={setFullName}
                            placeholder="Juan Pérez"
                            autoCapitalize="words"
                        />
                        <InputField
                            label="Nombre de usuario *"
                            value={username}
                            onChangeText={setUsername}
                            placeholder="juantenista"
                            autoCapitalize="none"
                        />
                        <InputField
                            label="Email *"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            placeholder="tu@email.com"
                        />
                        <InputField
                            label="Contraseña *"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholder="Mínimo 6 caracteres"
                        />
                        <InputField
                            label="Confirmar contraseña *"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                            placeholder="Repetí tu contraseña"
                        />

                        {/* Nivel */}
                        <Text style={styles.levelLabel}>NIVEL DE JUEGO</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.levelScroll}
                        >
                            <View style={styles.levelRow}>
                                {LEVELS.map(l => (
                                    <TouchableOpacity
                                        key={l}
                                        style={[styles.levelChip, level === l && styles.levelChipActive]}
                                        onPress={() => setLevel(l)}
                                    >
                                        <Text style={[
                                            styles.levelChipText,
                                            level === l && styles.levelChipTextActive,
                                        ]}>
                                            {l}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>

                    <Button
                        label="CREAR CUENTA"
                        onPress={handleRegister}
                        loading={loading}
                        style={styles.registerBtn}
                    />

                    <View style={styles.loginRow}>
                        <Text style={styles.loginText}>¿Ya tenés cuenta? </Text>
                        <TouchableOpacity onPress={() => router.replace('/login')}>
                            <Text style={styles.loginLink}>Iniciá sesión</Text>
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
    back: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        marginBottom: Spacing.xl,
    },
    brandRow: { marginBottom: Spacing.xl },
    logoCircle: {
        width: 44, height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoEmoji: { fontSize: 22 },
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
    levelLabel: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
        marginTop: Spacing.sm,
    },
    levelScroll: { marginTop: Spacing.sm },
    levelRow: { flexDirection: 'row', gap: Spacing.md },
    levelChip: {
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    levelChipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    levelChipText: {
        ...Typography.labelMd,
        color: Colors.onSurfaceVariant,
    },
    levelChipTextActive: {
        color: Colors.onPrimary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    registerBtn: { marginTop: Spacing.xxl },
    loginRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xl,
    },
    loginText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    loginLink: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
});