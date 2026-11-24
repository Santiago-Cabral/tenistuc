// src/screens/shared/MessagesScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';
import { Avatar } from '../../components/ui/Avatar';
import { SkeletonList } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { isActuallyOnline } from '../../services/presenceService';
import { markMessageNotificationsRead } from '../../services/notificationService';

interface Conversation {
    id: string;
    other_user: { id: string; full_name: string; avatar_url?: string; is_online?: boolean; last_seen?: string };
    last_message: string;
    last_message_at: string;
    isDoubles: boolean;
}

// Una conversación se considera "reciente" si tuvo actividad en las últimas 24hs
const isRecent = (iso: string) => {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
};

export default function MessagesScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadConversations = useCallback(async () => {
        if (!profile) return;
        const { data, error } = await supabase
            .from('conversations')
            .select(`
                id, last_message, last_message_at, kind,
                p1:profiles!conversations_participant1_id_fkey(id, full_name, avatar_url, is_online, last_seen),
                p2:profiles!conversations_participant2_id_fkey(id, full_name, avatar_url, is_online, last_seen)
            `)
            .or(`participant1_id.eq.${profile.id},participant2_id.eq.${profile.id}`)
            .order('last_message_at', { ascending: false });

        if (!error && data) {
            setConversations(data.map((c: any) => {
                const p1 = Array.isArray(c.p1) ? c.p1[0] : c.p1;
                const p2 = Array.isArray(c.p2) ? c.p2[0] : c.p2;
                return {
                    id: c.id,
                    other_user: p1?.id === profile.id ? p2 : p1,
                    last_message: c.last_message ?? '',
                    last_message_at: c.last_message_at,
                    isDoubles: c.kind === 'doubles',
                };
            }));
        }
        setLoading(false);
        setRefreshing(false);
    }, [profile]);

    useEffect(() => {
        loadConversations();
        const sub = supabase
            .channel('inbox')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, loadConversations)
            .subscribe();
        // Presencia en vivo: si un interlocutor cambia is_online/last_seen,
        // parchamos la fila local sin relanzar la query completa (el heartbeat
        // de cada usuario dispara un UPDATE cada 30s).
        const presenceSub = supabase
            .channel('inbox-presence')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                const upd = payload.new as { id?: string; is_online?: boolean; last_seen?: string } | null;
                if (!upd?.id) return;
                setConversations((prev) =>
                    prev.map((c) =>
                        c.other_user?.id === upd.id
                            ? {
                                ...c,
                                other_user: {
                                    ...c.other_user,
                                    is_online: upd.is_online ?? c.other_user.is_online,
                                    last_seen: upd.last_seen ?? c.other_user.last_seen,
                                },
                            }
                            : c
                    )
                );
            })
            .subscribe();
        return () => { supabase.removeChannel(sub); supabase.removeChannel(presenceSub); };
    }, [loadConversations]);

    useEffect(() => {
        // Al abrir la bandeja, las notificaciones de mensajes quedan leídas:
        // se apaga el punto rojo del ícono de Mensajes.
        markMessageNotificationsRead();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        loadConversations();
    };

    const formatTime = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (diff === 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        if (diff === 1) return 'Ayer';
        return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()];
    };

    const recentCount = conversations.filter((c) => isRecent(c.last_message_at)).length;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Mensajes</Text>
                {recentCount > 0 && (
                    <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>{recentCount} HOY</Text>
                    </View>
                )}
            </View>

            {loading ? (
                <SkeletonList count={6} variant="row" />
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(c) => c.id}
                    showsVerticalScrollIndicator={false}
                    refreshControl={(
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={Colors.primary}
                        />
                    )}
                    renderItem={({ item: c, index }) => (
                        <TouchableOpacity
                            style={[
                                styles.convRow,
                                index === 0 && styles.convRowHighlight,
                            ]}
                            onPress={() => router.push(`/chat/${c.id}` as any)}
                            activeOpacity={0.85}
                        >
                            <View>
                                {index === 0 && <View style={styles.activeLine} />}
                                <Avatar uri={c.other_user?.avatar_url} size={54} online={isActuallyOnline(c.other_user)} />
                            </View>
                            <View style={styles.convInfo}>
                                <View style={styles.convTopRow}>
                                    <Text style={styles.convName} numberOfLines={1}>
                                        {c.other_user?.full_name ?? 'Usuario'}
                                    </Text>
                                    {c.isDoubles && (
                                        <Text style={styles.doublesTag}>DOBLES</Text>
                                    )}
                                    <Text style={styles.convTime}>{formatTime(c.last_message_at)}</Text>
                                </View>
                                <Text style={styles.convLast} numberOfLines={1}>
                                    {c.last_message || 'Sin mensajes todavía'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyTitle}>Sin conversaciones</Text>
                            <Text style={styles.emptySubtitle}>
                                Desafiá a un rival para empezar a chatear.
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
        paddingTop: Spacing.base,
        paddingBottom: Spacing.lg,
        gap: Spacing.md,
    },
    title: { ...Typography.headlineLg, color: Colors.onSurface, flex: 1 },
    loaderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    newBadge: {
        backgroundColor: Colors.primaryContainer,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: Radius.full,
    },
    newBadgeText: { ...Typography.labelSm, color: Colors.primary, fontFamily: 'PlusJakartaSans_700Bold' },
    convRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
        backgroundColor: Colors.surface,
    },
    convRowHighlight: { backgroundColor: Colors.surfaceContainerLow },
    activeLine: {
        position: 'absolute',
        left: -4,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: 2,
        backgroundColor: Colors.primary,
    },
    convInfo: { flex: 1 },
    convTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, gap: Spacing.sm },
    convName: { ...Typography.titleMd, color: Colors.onSurface, flex: 1 },
    doublesTag: {
        ...Typography.labelSm,
        color: Colors.primary,
        backgroundColor: Colors.primaryContainer,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        marginRight: Spacing.xs,
        overflow: 'hidden',
    },
    convTime: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    convLast: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    separator: { height: 1, backgroundColor: Colors.surfaceContainerLow, marginLeft: 86 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xxxl, gap: Spacing.md },
    emptyTitle: { ...Typography.headlineSm, color: Colors.onSurface },
    emptySubtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
});