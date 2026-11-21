import React, { useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    Alert, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme/index';
import { AgeCategoryField, InputField, Button, Chip } from '../src/components/ui';
import { useAuthStore } from '../src/stores/authStore';
import { LEVELS, type Level } from '../src/constants/levels';
import { ageSelectionFromCategory, type AgeSelection } from '../src/constants/ageCategories';
import { supabase } from '../src/lib/supabase';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLAY_STYLES = [
    'Drive Diestro', 'Drive Zurdo',
    'Revés a dos manos', 'Revés a una mano',
    'Saque plano', 'Saque con efecto',
];

const GENDER_OPTIONS: { value: 'femenino' | 'masculino' | 'otro'; label: string }[] = [
    { value: 'femenino', label: 'Mujer' },
    { value: 'masculino', label: 'Hombre' },
    { value: 'otro', label: 'Otro' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
    const router = useRouter();
    const { profile, updateProfile } = useAuthStore();

    const [fullName, setFullName] = useState(profile?.full_name ?? '');
    const [username, setUsername] = useState(profile?.username ?? '');
    const [city, setCity] = useState(profile?.city ?? '');
    const [club, setClub] = useState(profile?.club ?? '');
    const [bio, setBio] = useState(profile?.bio ?? '');
    const [level, setLevel] = useState<Level>(profile?.level ?? '6ta');
    const [ageSelection, setAgeSelection] = useState<AgeSelection>(
        () => ageSelectionFromCategory(profile?.age_category)
    );
    const [gender, setGender] = useState<'femenino' | 'masculino' | 'otro' | null>(profile?.gender ?? null);
    const [selectedStyles, setSelectedStyles] = useState<string[]>(profile?.play_style ?? []);
    const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const toggleStyle = (s: string) =>
        setSelectedStyles(prev =>
            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
        );

    // ── Subir foto ────────────────────────────────────────────────────────────

    const pickAndUploadPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            showAlert(
                'Permiso requerido',
                'Necesitamos acceso a tu galería para cambiar la foto.'
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        setUploadingPhoto(true);

        try {
            const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            const path = `${profile!.id}/avatar.${ext}`;

            // Leer como bytes directamente (Nuevo API de SDK 52+)
            const file = new FileSystem.File(asset.uri);
            const bytes = await file.bytes();

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, bytes.buffer, {
                    contentType: mime,
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            // URL pública con cache-buster
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(path);

            const urlWithBust = `${publicUrl}?t=${Date.now()}`;
            setAvatarUri(urlWithBust);

            // Guardar en perfil inmediatamente
            await updateProfile({ avatar_url: urlWithBust });

        } catch (e: any) {
            showAlert('Error al subir foto', e.message ?? 'Intentá de nuevo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    // ── Guardar perfil ────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!fullName.trim() || !username.trim()) {
            showAlert('Campos requeridos', 'Nombre y usuario son obligatorios.');
            return;
        }
        setSaving(true);
        try {
            await updateProfile({
                full_name: fullName.trim(),
                username: username.trim().toLowerCase(),
                city: city.trim() || null,
                club: club.trim() || null,
                bio: bio.trim() || null,
                level,
                age_category: ageSelection.category,
                gender,
                play_style: selectedStyles,
            });
            router.back();
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <SafeAreaView style={styles.safe} edges={['top']}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.headerBtn}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="close" size={22} color={Colors.onSurface} />
                    </TouchableOpacity>

                    <Text style={styles.title}>Editar Perfil</Text>

                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving || uploadingPhoto}
                        style={[styles.headerBtn, styles.saveBtnWrap]}
                        activeOpacity={0.7}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                            <Text style={styles.saveBtnText}>Guardar</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >

                    {/* ── Avatar ── */}
                    <View style={styles.avatarSection}>
                        <TouchableOpacity
                            style={styles.avatarWrap}
                            onPress={pickAndUploadPhoto}
                            disabled={uploadingPhoto}
                            activeOpacity={0.85}
                        >
                            {/* Imagen o placeholder */}
                            {avatarUri ? (
                                <Image
                                    source={{ uri: avatarUri }}
                                    style={styles.avatar}
                                    contentFit="cover"
                                />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Ionicons
                                        name="person"
                                        size={48}
                                        color={Colors.onSurfaceVariant}
                                    />
                                </View>
                            )}

                            {/* Overlay con ícono de cámara */}
                            <View style={styles.avatarOverlay}>
                                {uploadingPhoto ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Ionicons name="image-outline" size={22} color="#fff" />
                                )}
                            </View>
                        </TouchableOpacity>

                        <Text style={styles.avatarHint}>
                            {uploadingPhoto
                                ? 'Subiendo foto...'
                                : 'Tocá para cambiar la foto'
                            }
                        </Text>
                    </View>

                    {/* ── Formulario ── */}
                    <View style={styles.form}>
                        <InputField
                            label="Nombre completo *"
                            value={fullName}
                            onChangeText={setFullName}
                            placeholder="Tu nombre completo"
                        />
                        <InputField
                            label="Usuario *"
                            value={username}
                            onChangeText={setUsername}
                            placeholder="usuario"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <InputField
                            label="Ciudad"
                            value={city}
                            onChangeText={setCity}
                            placeholder="Ej: Tucumán"
                        />
                        <InputField
                            label="Club"
                            value={club}
                            onChangeText={setClub}
                            placeholder="Ej: Club El Estudiante"
                        />
                        <InputField
                            label="Bio"
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Contá algo sobre vos..."
                            multiline
                            numberOfLines={3}
                            style={{ minHeight: 80 } as any}
                        />
                    </View>

                    {/* ── Categoría / Nivel (solo athletes) ── */}
                    {profile?.role === 'athlete' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>CATEGORÍA / NIVEL</Text>
                            <View style={styles.stylesGrid}>
                                {LEVELS.map(l => (
                                    <Chip
                                        key={l}
                                        label={l}
                                        active={level === l}
                                        onPress={() => setLevel(l)}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ── Categoría de edad ── */}
                    {profile?.role === 'athlete' && (
                        <View style={styles.section}>
                            <AgeCategoryField
                                value={ageSelection}
                                onChange={setAgeSelection}
                            />
                        </View>
                    )}

                    {/* ── Género (para torneos exclusivos) ── */}
                    {profile?.role === 'athlete' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>GÉNERO</Text>
                            <Text style={styles.genderHint}>
                                Algunos torneos son solo para mujeres o solo para hombres.
                            </Text>
                            <View style={styles.stylesGrid}>
                                {GENDER_OPTIONS.map(g => (
                                    <Chip
                                        key={g.value}
                                        label={g.label}
                                        active={gender === g.value}
                                        onPress={() => setGender(g.value)}
                                    />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* ── Estilo de juego (solo athletes) ── */}
                    {profile?.role === 'athlete' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>ESTILO DE JUEGO</Text>
                            <View style={styles.stylesGrid}>
                                {PLAY_STYLES.map(s => (
                                    <Chip
                                        key={s}
                                        label={s}
                                        active={selectedStyles.includes(s)}
                                        onPress={() => toggleStyle(s)}
                                    />
                                ))}
                            </View>
                        </View>
                    )}
                        
                    {/* ── Botón guardar (al fondo) ── */}
                    <Button
                        label="Guardar cambios"
                        onPress={handleSave}
                        loading={saving}
                        style={{ marginTop: Spacing.lg }}
                    />

                    <View style={{ height: 60 }} />
                </ScrollView>

            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHighest,
    },
    headerBtn: {
        width: 80,
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 18,
        color: Colors.onSurface,
    },
    saveBtnWrap: {
        alignItems: 'flex-end',
    },
    saveBtnText: {
        ...Typography.labelLg,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_700Bold',
    },

    // Scroll content
    content: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
    },

    // Avatar
    avatarSection: {
        alignItems: 'center',
        marginBottom: Spacing.xxl,
        gap: Spacing.sm,
    },
    avatarWrap: {
        width: 100,
        height: 100,
        borderRadius: 50,
        overflow: 'hidden',
        ...Shadow.float,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarPlaceholder: {
        flex: 1,
        backgroundColor: Colors.surfaceContainerHigh,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.38)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarHint: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
    },

    // Form
    form: {
        gap: Spacing.base,
        marginBottom: Spacing.xl,
    },

    // Play styles
    section: {
        marginBottom: Spacing.xl,
    },
    sectionLabel: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
        letterSpacing: 0.8,
        marginBottom: Spacing.md,
    },
    stylesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    genderHint: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        marginBottom: Spacing.md,
    },
});