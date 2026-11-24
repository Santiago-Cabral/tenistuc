import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { showAlert } from '../../src/services/appAlert';
import { Avatar } from '../../src/components/ui';
import { AdminHeader, Card, Chip } from '../../src/screens/admin/AdminUi';

export default function AdminAccount() {
    const router = useRouter();
    const { session, profile, signOut } = useAuthStore();

    const handleLogout = () => {
        showAlert('Cerrar sesión', '¿Seguro que querés salir?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Cerrar sesión',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await signOut();
                        router.replace('/login');
                    } catch {
                        showAlert('Error', 'No se pudo cerrar la sesión');
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <AdminHeader title="Cuenta" subtitle="Tu sesión de administrador" />

                <Card>
                    <View style={styles.identity}>
                        <Avatar uri={profile?.avatar_url} size={64} />
                        <View style={styles.identityInfo}>
                            <Text style={styles.name} numberOfLines={1}>
                                {profile?.full_name || `@${profile?.username ?? ''}`}
                            </Text>
                            <Text style={styles.username}>@{profile?.username ?? ''}</Text>
                            <Chip label="admin" tone="danger" />
                        </View>
                    </View>
                </Card>

                <Card>
                    <InfoRow label="Email" value={session?.user?.email ?? '—'} icon="mail-outline" />
                    <InfoRow label="Ciudad" value={profile?.city ?? 'Sin definir'} icon="location-outline" />
                    <InfoRow label="Club" value={profile?.club ?? 'Sin definir'} icon="tennisball-outline" />
                    <InfoRow label="Nivel" value={profile?.level ?? '—'} icon="bar-chart-outline" />
                </Card>

                <View style={styles.noMessages}>
                    <Ionicons name="eye-off-outline" size={20} color={Colors.secondary} />
                    <Text style={styles.noMessagesText}>
                        Como administrador no tenés bandeja de mensajes ni notificaciones emergentes:
                        sólo las herramientas de este panel.
                    </Text>
                </View>

                <TouchableOpacity style={styles.logout} onPress={handleLogout} activeOpacity={0.85}>
                    <Ionicons name="log-out-outline" size={20} color={Colors.error} />
                    <Text style={styles.logoutText}>Cerrar sesión</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon} size={18} color={Colors.outline} />
            <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 100, gap: Spacing.lg },
    identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
    identityInfo: { flex: 1, gap: Spacing.xs, alignItems: 'flex-start' },
    name: { ...Typography.titleLg, color: Colors.onSurface },
    username: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHigh,
    },
    infoText: { flex: 1, gap: 2 },
    infoLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    infoValue: { ...Typography.bodyMd, color: Colors.onSurface },
    noMessages: {
        flexDirection: 'row',
        gap: Spacing.md,
        backgroundColor: Colors.secondaryContainer,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
    },
    noMessagesText: { ...Typography.bodySm, color: Colors.onSecondaryContainer, flex: 1 },
    logout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.lg,
        ...Shadow.ambient,
    },
    logoutText: { ...Typography.labelLg, color: Colors.error },
});
