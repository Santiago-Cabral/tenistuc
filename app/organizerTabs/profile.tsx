// app/organizerTabs/profile.tsx
import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Spacing, Radius, Shadow } from '../../src/theme';
import { Text, Button, Avatar } from '../../src/components/ui';
import { getDashboardStats } from '../../src/services/organizerService';

export default function OrganizerProfileScreen() {
    const router = useRouter();
    const { session, profile, signOut } = useAuthStore();
    const [stats, setStats] = useState<{ totalTournaments: number; totalPlayers: number } | null>(null);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            if (!profile) return;
            getDashboardStats(profile.id)
                .then((s) => setStats({ totalTournaments: s.totalTournaments, totalPlayers: s.totalPlayers }))
                .finally(() => setLoading(false));
        }, [profile]),
    );

    const handleLogout = () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Seguro que querés salir?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await signOut();
                            router.replace('/login');
                        } catch (error) {
                            Alert.alert('Error', 'No se pudo cerrar la sesión');
                        }
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={styles.profileHeader}>
                    <Avatar uri={profile?.avatar_url} size={84} />
                    <Text variant="title" style={styles.name}>
                        {profile?.full_name ?? 'Organizador'}
                    </Text>
                    <Text style={styles.username}>@{profile?.username ?? 'usuario'}</Text>
                </View>

                {loading ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
                ) : (
                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Ionicons name="trophy-outline" size={18} color={Colors.primary} />
                            <Text style={styles.statValue}>{stats?.totalTournaments ?? 0}</Text>
                            <Text style={styles.statLabel}>Torneos creados</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <Ionicons name="people-outline" size={18} color={Colors.primary} />
                            <Text style={styles.statValue}>{stats?.totalPlayers ?? 0}</Text>
                            <Text style={styles.statLabel}>Jugadores gestionados</Text>
                        </View>
                    </View>
                )}

                <View style={styles.card}>
                    <View style={styles.infoBlock}>
                        <View style={styles.infoLabelRow}>
                            <Ionicons name="mail-outline" size={14} color={Colors.onSurfaceVariant} />
                            <Text variant="label">Email</Text>
                        </View>
                        <Text>{session?.user?.email}</Text>
                    </View>

                    <View style={styles.infoBlock}>
                        <View style={styles.infoLabelRow}>
                            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.onSurfaceVariant} />
                            <Text variant="label">Rol</Text>
                        </View>
                        <Text>Organizador</Text>
                    </View>

                    {!!profile?.club && (
                        <View style={styles.infoBlock}>
                            <View style={styles.infoLabelRow}>
                                <Ionicons name="business-outline" size={14} color={Colors.onSurfaceVariant} />
                                <Text variant="label">Club</Text>
                            </View>
                            <Text>{profile.club}</Text>
                        </View>
                    )}

                    {!!profile?.city && (
                        <View style={styles.infoBlock}>
                            <View style={styles.infoLabelRow}>
                                <Ionicons name="location-outline" size={14} color={Colors.onSurfaceVariant} />
                                <Text variant="label">Ciudad</Text>
                            </View>
                            <Text>{profile.city}</Text>
                        </View>
                    )}
                </View>

                <Button
                    label="Cerrar sesión"
                    variant="secondary"
                    style={styles.signOutBtn}
                    onPress={handleLogout}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    scroll: { padding: Spacing.xl, paddingBottom: 60, gap: Spacing.lg },

    profileHeader: { alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
    name: { marginTop: Spacing.sm },
    username: { color: Colors.onSurfaceVariant },

    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.lg,
        ...Shadow.ambient,
    },
    statBox: { flex: 1, alignItems: 'center', gap: 4 },
    statValue: { fontFamily: 'Lexend_700Bold', fontSize: 20, color: Colors.onSurface },
    statLabel: { fontSize: 11, color: Colors.onSurfaceVariant, textAlign: 'center' },
    statDivider: { width: 1, height: 36, backgroundColor: Colors.surfaceContainerHigh },

    card: {
        backgroundColor: Colors.surfaceContainerLowest,
        padding: Spacing.lg,
        borderRadius: Radius.lg,
        gap: Spacing.base,
        ...Shadow.ambient,
    },
    infoBlock: { gap: 4 },
    infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

    signOutBtn: { marginTop: Spacing.sm },
});