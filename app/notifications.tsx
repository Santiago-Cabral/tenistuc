// app/notifications.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, SectionList, TouchableOpacity, StyleSheet,
    ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import {
    AppNotification, NotificationType,
    getNotifications, markAllAsRead, markAsRead,
} from '../src/services/notificationService';
import { NOTIFICATION_TYPE_THEME } from '../src/notifications/typeTheme';

type IconConfig = {
    icon: keyof typeof Ionicons.glyphMap;
    bg: string;
    fg: string;
};

const TYPE_THEME: Record<NotificationType, IconConfig> = NOTIFICATION_TYPE_THEME;

function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days}d`;
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function dayLabel(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function routeFor(n: AppNotification): string | null {
    const targetId =
        n.data?.challenge_id ??
        n.data?.tournament_id ??
        n.data?.conversation_id ??
        n.data?.match_id ??
        n.related_id;

    switch (n.type) {
        case 'message':
            return targetId ? `/chat/${targetId}` : '/athleteTabs/messages';
        case 'challenge':
            return targetId ? `/challenge/${targetId}` : '/matches';
        case 'tournament_new':
        case 'tournament_start':
            return targetId ? `/tournament/${targetId}` : '/athleteTabs/tournament';
        case 'challenge_received':
        case 'challenge_accepted':
        case 'challenge_rejected':
            return targetId ? `/challenge/${targetId}` : '/matches';
        case 'tournament_registration':
        case 'tournament_update':
        case 'fixture_ready':
            return targetId ? `/tournament/${targetId}` : '/athleteTabs/tournament';
        case 'match_result':
        case 'match_confirmed':
        case 'match_scheduled':
            return '/matches';
        default:
            return null;
    }
}

type Section = { title: string; data: AppNotification[] };

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

    const sections = useMemo(() => {
        const grouped = new Map<string, AppNotification[]>();
        for (const n of items) {
            const label = dayLabel(n.created_at);
            const list = grouped.get(label) ?? [];
            list.push(n);
            grouped.set(label, list);
        }
        return Array.from(grouped.entries()).map(
            ([title, data]): Section => ({ title, data }),
        );
    }, [items]);

    const unreadCount = items.filter((i) => !i.read_at).length;

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
        setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })));
        await markAllAsRead(profile.id).catch(() => {});
    };

    const handleRefresh = () => {
        setRefreshing(true);
        load();
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.headerBtn}
                    accessibilityLabel="Volver"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Ionicons name="chevron-back" size={24} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.title}>Notificaciones</Text>
                {unreadCount > 0 ? (
                    <TouchableOpacity
                        onPress={handleMarkAllRead}
                        style={styles.markAllBtn}
                        accessibilityLabel="Marcar todas como leídas"
                        hitSlop={{ top: 8, bottom: 8 }}
                    >
                        <Text style={styles.markAllText}>Marcar todas</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerBtn} />
                )}
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(n) => n.id}
                    showsVerticalScrollIndicator={false}
                    stickySectionHeadersEnabled={false}
                    refreshControl={(
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
                    )}
                    contentContainerStyle={styles.listContent}
                    renderSectionHeader={({ section }) => (
                        <Text style={styles.sectionHeader}>{section.title}</Text>
                    )}
                    renderItem={({ item: n }) => (
                        <TouchableOpacity
                            style={[styles.row, !n.read_at && styles.rowUnread]}
                            onPress={() => handlePress(n)}
                            activeOpacity={0.7}
                        >
                            {!n.read_at && <View style={styles.accentBar} />}
                            <View style={[styles.iconCircle, { backgroundColor: TYPE_THEME[n.type]?.bg ?? Colors.surfaceContainerHigh }]}>
                                <Ionicons
                                    name={TYPE_THEME[n.type]?.icon ?? 'notifications-outline'}
                                    size={18}
                                    color={TYPE_THEME[n.type]?.fg ?? Colors.onSurfaceVariant}
                                />
                            </View>
                            <View style={styles.rowInfo}>
                                <Text
                                    style={[styles.rowTitle, !n.read_at && styles.rowTitleUnread]}
                                    numberOfLines={1}
                                >
                                    {n.title}
                                </Text>
                                <Text style={styles.rowBody} numberOfLines={2}>{n.body}</Text>
                            </View>
                            <View style={styles.rowMeta}>
                                <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
                                {!n.read_at ? (
                                    <View style={styles.unreadDot} accessibilityLabel="No leída" />
                                ) : (
                                    <Ionicons name="ellipse-outline" size={8} color={Colors.outlineVariant} />
                                )}
                            </View>
                        </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <View style={styles.emptyIconCircle}>
                                <Ionicons name="notifications" size={32} color={Colors.primary} />
                            </View>
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
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHighest,
    },
    headerBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { ...Typography.titleLg, color: Colors.onSurface },
    markAllBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    markAllText: { ...Typography.labelLg, color: Colors.primary },

    listContent: { paddingBottom: 60, paddingHorizontal: Spacing.lg },

    sectionHeader: {
        ...Typography.labelSm,
        color: Colors.onSurfaceVariant,
        textTransform: 'capitalize',
        marginTop: Spacing.xl,
        marginBottom: Spacing.md,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        paddingVertical: Spacing.base,
        paddingHorizontal: Spacing.md,
        gap: Spacing.base,
        minHeight: 64,
        overflow: 'hidden',
        ...Shadow.ambient,
    },
    rowUnread: { backgroundColor: Colors.surfaceContainerLow },
    accentBar: {
        position: 'absolute',
        left: 0,
        top: Spacing.base,
        bottom: Spacing.base,
        width: 3,
        borderTopRightRadius: Radius.sm,
        borderBottomRightRadius: Radius.sm,
        backgroundColor: Colors.primary,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: Radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    rowInfo: { flex: 1, gap: 2 },
    rowTitle: { ...Typography.titleSm, color: Colors.onSurface },
    rowTitleUnread: { fontFamily: 'PlusJakartaSans_700Bold' },
    rowBody: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    rowMeta: { alignItems: 'flex-end', gap: 8, paddingTop: 3 },
    rowTime: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontSize: 12 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
    separator: { height: Spacing.md },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.base,
        paddingHorizontal: Spacing.xxxl,
        paddingTop: 80,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: Radius.full,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.sm,
    },
    emptyTitle: { ...Typography.headlineSm, color: Colors.onSurface },
    emptySubtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
});