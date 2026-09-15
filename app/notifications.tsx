// app/notifications.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import {
    AppNotification, NotificationType,
    getNotifications, markAllAsRead, markAsRead,
} from '../src/services/notificationService';

const ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
    challenge_received: 'flash-outline',
    challenge_accepted: 'checkmark-circle-outline',
    challenge_rejected: 'close-circle-outline',
    match_result: 'tennisball-outline',
    match_confirmed: 'shield-checkmark-outline',
    tournament_registration: 'trophy-outline',
    tournament_update: 'megaphone-outline',
    fixture_ready: 'git-network-outline',
    message: 'chatbubble-outline',
};

function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString('es');
}

function routeFor(n: AppNotification): string | null {
    if (!n.related_id) return null;
    switch (n.type) {
        case 'message': return `/chat/${n.related_id}`;
        case 'challenge_received':
        case 'challenge_accepted':
        case 'challenge_rejected': return `/challenge/${n.related_id}`;
        case 'tournament_registration':
        case 'tournament_update':
        case 'fixture_ready': return `/tournament/${n.related_id}`;
        case 'match_result':
        case 'match_confirmed': return '/matches';
        default: return null;
    }
}

export default function NotificationsScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [items, setItems] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        if (!profile) return;
        try {
            const data = await getNotifications(profile.id);
            setItems(data);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [profile]);

    useEffect(() => {
        load();
        if (!profile) return;

        const channel = supabase
            .channel(`notifications:${profile.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
                (payload) => setItems((prev) => [payload.new as AppNotification, ...prev]),
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [profile, load]);

    const handlePress = async (n: AppNotification) => {
        if (!n.read_at) {
            setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
            markAsRead(n.id).catch(() => {});
        }
        const route = routeFor(n);
        if (route) router.push(route as any);
    };

    const handleMarkAllRead = async () => {
        if (!profile) return;
        setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
        await markAllAsRead(profile.id).catch(() => {});
    };

    const handleRefresh = () => {
        setRefreshing(true);
        load();
    };

    const unreadCount = items.filter((i) => !i.read_at).length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.title}>Notificaciones</Text>
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={handleMarkAllRead}>
                        <Text style={styles.markAllText}>Marcar todas</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(n) => n.id}
                    showsVerticalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                    )}
                    contentContainerStyle={{ paddingBottom: 60 }}
                    renderItem={({ item: n }) => (
                        <TouchableOpacity
                            style={[styles.row, !n.read_at && styles.rowUnread]}
                            onPress={() => handlePress(n)}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.iconCircle, !n.read_at && styles.iconCircleUnread]}>
                                <Ionicons
                                    name={ICONS[n.type] ?? 'notifications-outline'}
                                    size={18}
                                    color={!n.read_at ? Colors.primary : Colors.onSurfaceVariant}
                                />
                            </View>
                            <View style={styles.rowInfo}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                                <Text style={styles.rowBody} numberOfLines={2}>{n.body}</Text>
                            </View>
                            <View style={styles.rowMeta}>
                                <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
                                {!n.read_at && <View style={styles.unreadDot} />}
                            </View>
                        </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Ionicons name="notifications-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyTitle}>Sin notificaciones</Text>
                            <Text style={styles.emptySubtitle}>
                                Acá vas a ver desafíos, resultados y novedades de tus torneos.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHighest,
    },
    backBtn: { padding: 4 },
    title: { ...Typography.titleLg, color: Colors.onSurface, flex: 1 },
    markAllText: { ...Typography.labelSm, color: Colors.primary },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, paddingHorizontal: Spacing.xxxl, paddingTop: 60 },
    emptyTitle: { ...Typography.headlineSm, color: Colors.onSurface },
    emptySubtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },

    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.base,
        gap: Spacing.md,
    },
    rowUnread: { backgroundColor: Colors.surfaceContainerLow },
    iconCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.surfaceContainerHigh,
        alignItems: 'center', justifyContent: 'center',
    },
    iconCircleUnread: { backgroundColor: Colors.primaryContainer },
    rowInfo: { flex: 1, gap: 2 },
    rowTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: Colors.onSurface },
    rowBody: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    rowMeta: { alignItems: 'flex-end', gap: 6 },
    rowTime: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontSize: 11 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
    separator: { height: 1, backgroundColor: Colors.surfaceContainerLow, marginLeft: 66 },
});