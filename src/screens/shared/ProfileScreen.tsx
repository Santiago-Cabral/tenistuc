import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { Badge, Button, Card, SectionHeader } from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import { ageCategoryLabel } from '../../constants/ageCategories';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
    const router = useRouter();
    const { profile, signOut, fetchProfile, deleteAccount } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);
    const [globalRank, setGlobalRank] = useState<number | null>(null);
    const ageLabel = ageCategoryLabel(profile?.age_category);
    const push = usePushNotifications();

    const loadRank = async () => {

        if (!profile) return;
        const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .gt('elo', profile.elo);
        if (count !== null) setGlobalRank(count + 1);
    };

    useEffect(() => { loadRank(); }, [profile?.elo]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchProfile();
        await loadRank();
        setRefreshing(false);
    };

    const handleDeleteAccount = () => {
        showAlert(
            'Eliminar mi cuenta',
            'Se eliminará tu cuenta, tu perfil, tus partidos, ranking y toda tu información. Esta acción es definitiva y no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        showAlert(
                            'Última confirmación',
                            '¿Estás seguro? Esta acción es irreversible: eliminá tu cuenta solo si estás 100% seguro.',
                            [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Eliminar definitivamente',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            await deleteAccount();
                                            router.replace('/login');
                                        } catch (e: any) {
                                            showAlert('Error', e?.message ?? 'No se pudo eliminar la cuenta');
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    };

    const winrate = profile && (profile.wins + profile.losses) > 0
        ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
        : 0;

    const stats = [
        { label: 'Partidos', value: (profile?.wins ?? 0) + (profile?.losses ?? 0) },
        { label: 'Victorias', value: profile?.wins ?? 0 },
        { label: 'Derrotas', value: profile?.losses ?? 0 },
        { label: 'Winrate', value: `${winrate}%` },
    ];

    const infoItems = [
        { icon: 'location-outline' as const, text: profile?.city ?? 'Sin ciudad' },
        { icon: 'tennisball-outline' as const, text: profile?.club ?? 'Sin club' },
    ];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                    />
                }
            >
                {/* ── Header gradiente ── */}
                <LinearGradient
                    colors={[Colors.primary, Colors.primaryDim]}
                    style={styles.headerGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => router.push('/edit-profile')}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="pencil" size={14} color={Colors.primaryContainer} />
                        <Text style={styles.editBtnText}>Editar</Text>
                    </TouchableOpacity>

                    {/* Avatar */}
                    <TouchableOpacity
                        style={styles.avatarWrap}
                        onPress={() => router.push('/edit-profile')}
                        activeOpacity={0.85}
                    >
                        {profile?.avatar_url ? (
                            <Image
                                source={{ uri: profile.avatar_url }}
                                style={styles.avatar}
                                contentFit="cover"
                            />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons name="person" size={44} color="rgba(255,255,255,0.6)" />
                            </View>
                        )}
                        {/* Indicador de cámara */}
                        <View style={styles.cameraChip}>
                            <Ionicons name="camera" size={12} color={Colors.primary} />
                        </View>
                    </TouchableOpacity>

                    <Text style={styles.name}>{profile?.full_name ?? 'Atleta'}</Text>
                    <Text style={styles.username}>@{profile?.username ?? 'usuario'}</Text>

                    <View style={styles.levelBadgeWrap}>
                        <Badge
                            label={profile?.level ?? '6ta'}
                            color="rgba(183,228,199,0.2)"
                            textColor={Colors.primaryContainer}
                        />
                        {ageLabel && (
                            <Badge
                                label={ageLabel}
                                color="rgba(255,255,255,0.18)"
                                textColor={Colors.onPrimary}
                            />
                        )}
                    </View>
                </LinearGradient>

                <View style={styles.content}>

                    {/* ── ELO + Ranking ── */}
                    <Card style={styles.eloCard}>
                        <View style={styles.eloLeft}>
                            <Text style={styles.eloLabel}>PUNTOS ELO</Text>
                            <Text style={styles.eloValue}>
                                {(profile?.elo ?? 1000).toLocaleString('es')}
                            </Text>
                        </View>
                        <View style={styles.eloDivider} />
                        <View style={styles.eloRight}>
                            <Text style={styles.rankLabel}>RANKING</Text>
                            <Text style={styles.rankValue}>
                                {globalRank !== null ? `#${globalRank}` : '—'}
                            </Text>
                        </View>
                    </Card>

                    {/* ── Stats grid ── */}
                    <View style={styles.statsGrid}>
                        {stats.map(s => (
                            <Card key={s.label} style={styles.statCard}>
                                <Text style={styles.statValue}>{s.value}</Text>
                                <Text style={styles.statLabel}>{s.label}</Text>
                            </Card>
                        ))}
                    </View>

                    {/* ── Bio ── */}
                    {profile?.bio ? (
                        <Card>
                            <Text style={styles.sectionLabel}>BIO</Text>
                            <Text style={styles.bioText}>{profile.bio}</Text>
                        </Card>
                    ) : null}

                    {/* ── Info ── */}
                    <Card style={styles.infoCard}>
                        {infoItems.map((item, i) => (
                            <View key={i} style={[styles.infoRow, i > 0 && styles.infoRowBorder]}>
                                <View style={styles.infoIconWrap}>
                                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                                </View>
                                <Text style={styles.infoText}>{item.text}</Text>
                            </View>
                        ))}
                    </Card>

                    {/* ── Estilos de juego ── */}
                    {profile?.play_style && profile.play_style.length > 0 && (
                        <Card style={styles.stylesCard}>
                            <Text style={styles.sectionLabel}>ESTILO DE JUEGO</Text>
                            <View style={styles.stylesWrap}>
                                {profile.play_style.map(s => (
                                    <View key={s} style={styles.styleChip}>
                                        <Text style={styles.styleChipText}>{s}</Text>
                                    </View>
                                ))}
                            </View>
                        </Card>
                    )}

                    {/* ── Beta: comentarios ── */}
                    <TouchableOpacity
                        onPress={() => router.push('/beta-feedback' as any)}
                        activeOpacity={0.7}
                        style={styles.betaCard}
                    >
                        <View style={styles.betaIconWrap}>
                            <Ionicons name="chatbox-ellipses-outline" size={18} color={Colors.primary} />
                        </View>
                        <View style={styles.betaTextCol}>
                            <View style={styles.betaTitleRow}>
                                <Text style={styles.betaTitle}>Comentarios de la beta</Text>
                                <Badge label="BETA" color={Colors.primaryContainer} textColor={Colors.primary} />
                            </View>
                            <Text style={styles.betaSub}>
                                Sugerí ideas y votá las que más te gusten
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.onSurfaceVariant} />
                    </TouchableOpacity>

                    {/* ── Notificaciones ── */}
                    <Card style={styles.pushCard}>
                        <View style={styles.pushHeaderRow}>
                            <View style={styles.pushIconWrap}>
                                <Ionicons
                                    name={
                                        push.state?.status === 'granted'
                                            ? 'notifications'
                                            : 'notifications-off-outline'
                                    }
                                    size={18}
                                    color={push.state?.status === 'granted' ? Colors.primary : Colors.onSurfaceVariant}
                                />
                            </View>
                            <View style={styles.pushTextCol}>
                                <Text style={styles.sectionLabel}>NOTIFICACIONES</Text>
                                <Text style={styles.pushStatus}>
                                    {push.state?.message ?? 'Verificando...'}
                                </Text>
                            </View>
                        </View>

                        {push.state?.status !== 'granted' && (
                            <Button
                                label={push.loading ? 'Activando...' : 'Activar notificaciones'}
                                variant="secondary"
                                onPress={push.enable}
                                disabled={push.loading || !push.state?.canRequest}
                                style={styles.pushBtn}
                            />
                        )}

                        <TouchableOpacity
                            onPress={() => router.push('/notifications' as any)}
                            activeOpacity={0.7}
                            style={styles.pushInboxRow}
                        >
                            <Ionicons name="file-tray-outline" size={16} color={Colors.onSurfaceVariant} />
                            <Text style={styles.pushInboxText}>Ver bandeja de notificaciones</Text>
                            <Ionicons name="chevron-forward" size={16} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </Card>

                    {/* ── Cerrar sesión ── */}
                    <Button
                        label="Cerrar sesión"
                        variant="secondary"
                        onPress={signOut}
                        style={styles.signOutBtn}
                    />

                    {/* ── Eliminar cuenta ── */}
                    <TouchableOpacity
                        onPress={handleDeleteAccount}
                        style={styles.deleteBtn}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        <Text style={styles.deleteBtnText}>Eliminar mi cuenta</Text>
                    </TouchableOpacity>

                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },

    headerGradient: {
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xxxl,
        paddingHorizontal: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.sm,
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        gap: 5,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    editBtnText: {
        ...Typography.labelMd,
        color: Colors.primaryContainer,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },

    avatarWrap: {
        width: 96, height: 96,
        borderRadius: 48,
        overflow: 'visible',
        marginTop: Spacing.md,
    },
    avatar: {
        width: 96, height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    avatarPlaceholder: {
        width: 96, height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cameraChip: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 28, height: 28,
        borderRadius: 14,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: Colors.primary,
    },

    name: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 24,
        color: Colors.primaryContainer,
        letterSpacing: -0.5,
        marginTop: Spacing.sm,
    },
    username: { ...Typography.bodyMd, color: 'rgba(183,228,199,0.75)' },
    levelBadgeWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },

    content: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
        gap: Spacing.lg,
    },

    eloCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
    },
    eloLeft: { flex: 1, gap: 4 },
    eloDivider: {
        width: 1, height: 40,
        backgroundColor: Colors.outlineVariant,
        marginHorizontal: Spacing.xl,
    },
    eloRight: { flex: 1, alignItems: 'flex-end', gap: 4 },
    eloLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1 },
    eloValue: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 36,
        color: Colors.primary,
        letterSpacing: -1,
    },
    rankLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1 },
    rankValue: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 28,
        color: Colors.onSurface,
        letterSpacing: -0.5,
    },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    statCard: { flex: 1, minWidth: '45%', alignItems: 'center', gap: 4 },
    statValue: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 28,
        color: Colors.onSurface,
        letterSpacing: -0.5,
    },
    statLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

    sectionLabel: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
        letterSpacing: 0.8,
        marginBottom: Spacing.sm,
    },
    bioText: { ...Typography.bodyMd, color: Colors.onSurface, lineHeight: 22 },

    infoCard: { gap: 0, padding: 0, overflow: 'hidden' },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    infoRowBorder: {
        borderTopWidth: 1,
        borderTopColor: Colors.surfaceContainerLow,
    },
    infoIconWrap: {
        width: 36, height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoText: { ...Typography.bodyMd, color: Colors.onSurface },

    stylesCard: { gap: Spacing.sm },
    stylesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    styleChip: {
        paddingVertical: 5,
        paddingHorizontal: Spacing.md,
        borderRadius: Radius.full,
        backgroundColor: Colors.primaryContainer,
    },
    styleChipText: {
        ...Typography.labelSm,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },

    pushCard: { gap: Spacing.md },    pushHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    pushIconWrap: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    pushTextCol: { flex: 1, gap: 2 },
    pushStatus: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    pushBtn: { marginTop: Spacing.sm },
    pushInboxRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow,
    },
    pushInboxText: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1 },

    betaCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl,
        padding: Spacing.lg,
        ...Shadow.ambient,
    },
    betaIconWrap: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    betaTextCol: { flex: 1, gap: 2 },
    betaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    betaTitle: {
        ...Typography.bodyMd,
        color: Colors.onSurface,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    betaSub: { ...Typography.bodySm, color: Colors.onSurfaceVariant },

    signOutBtn: { marginTop: Spacing.sm },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: Spacing.md,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.error,
        marginTop: Spacing.base,
    },
    deleteBtnText: {
        ...Typography.labelLg,
        color: Colors.error,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
});