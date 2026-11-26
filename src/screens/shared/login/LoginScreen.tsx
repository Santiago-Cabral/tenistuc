import React, { useState } from 'react';
import {
    View, Text, StyleSheet, Alert,
    KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../../theme/index';
import { Button, InputField, PrivacyConsent } from '../../../components/ui/index';
import { useAuthStore } from '../../../stores/authStore';
import { isGoogleSignInAvailable, signInWithGoogle } from '../../../services/authService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
    const router = useRouter();
    const { signIn } = useAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [consent, setConsent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [socialLoading, setSocialLoading] = useState(false);
    const googleAvailable = isGoogleSignInAvailable();

    const handleLogin = async () => {
        if (!email || !password) {
            showAlert('Error', 'Completá todos los campos');
            return;
        }
        if (!EMAIL_REGEX.test(email.trim())) {
            showAlert('Error', 'Ingresá un email válido');
            return;
        }
        setLoading(true);
        try {
            await signIn(email.trim().toLowerCase(), password);
            // AuthGuard redirige automáticamente a /(tabs)
        } catch (e: any) {
            showAlert('Error al iniciar sesión', e.message ?? 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        if (!consent) {
            showAlert('Política de Privacidad', 'Debés aceptar la política de privacidad para usar TucuPlay.');
            return;
        }
        setSocialLoading(true);
        try {
            const ok = await signInWithGoogle();
            // Si `ok` es false el usuario canceló: no mostramos error.
            // Si se creó la sesión, onAuthStateChange + AuthGuard redirigen.
            if (!ok) return;
        } catch (e: any) {
            showAlert('Error con Google', e.message ?? 'No se pudo iniciar sesión');
        } finally {
            setSocialLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
                            <Image
                                source={require('../../../../logoverde.png')}
                                style={styles.logoImg}
                                contentFit="contain"
                            />
                        </LinearGradient>
                        <View style={styles.brandTextCol}>
                            <Text style={styles.appName}>TENISTUC</Text>
                            <Text style={styles.appTagline}>Tenis en Tucumán</Text>
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>BIENVENIDO{'\n'}DE VUELTA.</Text>
                    <Text style={styles.subtitle}>
                        Iniciá sesión para continuar tu progreso en la cancha.
                    </Text>

                    {/* Form */}
                    <View style={styles.formCard}>
                        <InputField
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            textContentType="emailAddress"
                            placeholder="tu@email.com"
                            editable={!loading}
                        />
                        <InputField
                            label="Contraseña"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            textContentType="password"
                            placeholder="••••••••"
                            editable={!loading}
                            returnKeyType="done"
                            onSubmitEditing={handleLogin}
                            rightAccessory={(
                                <TouchableOpacity
                                    onPress={() => setShowPassword((v) => !v)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    disabled={loading}
                                >
                                    <Ionicons
                                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                        size={22}
                                        color={Colors.onSurfaceVariant}
                                    />
                                </TouchableOpacity>
                            )}
                        />

                        <TouchableOpacity
                            onPress={() => router.push('/forgot-password')}
                            style={styles.forgotBtn}
                            disabled={loading}
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

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>o creá tu cuenta con</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Consentimiento (solo aplica a registros nuevos vía proveedor) */}
                    <View style={styles.consentWrap}>
                        <PrivacyConsent checked={consent} onChange={setConsent} disabled={loading} />
                    </View>

                    {/* Social login */}
                    {googleAvailable ? (
                        <View style={styles.socialRow}>
                            <TouchableOpacity
                                style={[styles.socialBtn, (loading || socialLoading) && styles.socialBtnDisabled]}
                                onPress={handleGoogleSignIn}
                                disabled={loading || socialLoading}
                                activeOpacity={0.85}
                            >
                                {socialLoading ? (
                                    <ActivityIndicator size="small" color={Colors.primary} />
                                ) : (
                                    <>
                                        <Ionicons name="logo-google" size={20} color={Colors.onSurface} />
                                        <Text style={styles.socialBtnText}>Google</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Text style={styles.socialUnavailable}>
                            Google disponible en la app instalada (no en Expo Go).
                        </Text>
                    )}

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
        flexGrow: 1,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xxl,
        paddingBottom: Spacing.xxxl,
        justifyContent: 'center',
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.xxxl,
    },
    brandTextCol: { gap: 2 },
    logoCircle: {
        width: 52, height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...Shadow.float,
    },
    logoImg: {
        width: 52, height: 52,
        borderRadius: 26,
    },
    appName: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 18,
        color: Colors.onSurface,
        letterSpacing: 3,
    },
    appTagline: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        letterSpacing: 0.5,
    },
    title: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 36,
        lineHeight: 40,
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
    formCard: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xxl,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        padding: Spacing.xl,
        gap: Spacing.lg,
        ...Shadow.ambient,
    },
    forgotBtn: { alignSelf: 'flex-end', marginTop: Spacing.sm },
    forgotText: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    consentWrap: { marginTop: Spacing.lg },
    loginBtn: { marginTop: Spacing.xxl },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.base,
        marginTop: Spacing.xl,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.outlineVariant },
    dividerText: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        letterSpacing: 0.5,
    },
    socialRow: {
        flexDirection: 'row',
        gap: Spacing.base,
        marginTop: Spacing.lg,
    },
    socialBtn: {
        flex: 1,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    socialBtnDisabled: { opacity: 0.5 },
    socialUnavailable: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
        marginTop: Spacing.lg,
    },
    socialBtnText: {
        ...Typography.labelLg,
        color: Colors.onSurface,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
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