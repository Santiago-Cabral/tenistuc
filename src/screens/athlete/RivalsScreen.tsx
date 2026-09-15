// src/screens/athlete/RivalsScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { Avatar, Badge, Card } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import CreateChallengeModal from '../../components/challenges/CreateChallengeModal';

interface Rival {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
    city: string | null;
    elo: number;
    level: string;
    wins: number;
    losses: number;
    is_online: boolean;
}

type FilterKey = 'all' | 'level' | 'city' | 'online';

export default function RivalsScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [rivals, setRivals] = useState<Rival[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');

    const [selectedRival, setSelectedRival] = useState<Rival | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [notifying, setNotifying] = useState(false);

    const loadRivals = useCallback(async () => {
        if (!profile) return;
        setLoading(true);
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, city, elo, level, wins, losses, is_online')
            .neq('id', profile.id)
            .limit(80);

        if (data) {
            // Por defecto, los rivales más parejos a tu ELO aparecen primero:
            // un buscador de oponentes, no una tabla de posiciones.
            const sorted = [...(data as Rival[])].sort(
                (a, b) => Math.abs(a.elo - (profile.elo ?? 1000)) - Math.abs(b.elo - (profile.elo ?? 1000))
            );
            setRivals(sorted);
        }
        setLoading(false);
    }, [profile]);

    useEffect(() => { loadRivals(); }, [loadRivals]);

    const filtered = useMemo(() => {
        let list = rivals;

        if (filter === 'level' && profile?.level) {
            list = list.filter(r => r.level === profile.level);
        } else if (filter === 'city' && profile?.city) {
            list = list.filter(r => r.city === profile.city);
        } else if (filter === 'online') {
            list = list.filter(r => r.is_online);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(r =>
                r.full_name?.toLowerCase().includes(q) || r.username?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [rivals, filter, search, profile?.level, profile?.city]);

    const openChallengeModal = (rival: Rival) => {
        setSelectedRival(rival);
        setModalVisible(true);
    };

    const closeChallengeModal = () => {
        setModalVisible(false);
        setSelectedRival(null);
    };

    const notifyByChat = async (challengeId: string, rival: Rival) => {
        if (!profile) return null;
        setNotifying(true);
        try {
            const p1 = profile.id < rival.id ? profile.id : rival.id;
            const p2 = profile.id < rival.id ? rival.id : profile.id;

            const { data: existingConv, error: convSelectErr } = await supabase
                .from('conversations')
                .select('id')
                .eq('participant1_id', p1)
                .eq('participant2_id', p2)
                .maybeSingle();
            if (convSelectErr) throw convSelectErr;

            let convId = existingConv?.id ?? null;

            if (!convId) {
                const { data: newConv, error: convErr } = await supabase
                    .from('conversations')
                    .insert({ participant1_id: p1, participant2_id: p2 })
                    .select()
                    .single();
                if (convErr) throw convErr;
                convId = newConv.id;
            }

            const { error: msgErr } = await supabase.from('messages').insert({
                conversation_id: convId,
                sender_id: profile.id,
                content: 'Te desafié a un partido.',
                message_type: 'challenge',
                metadata: { challenge_id: challengeId },
            });
            if (msgErr) throw msgErr;

            return convId;
        } catch (e: any) {
            console.warn('[RivalsScreen] notifyByChat error:', e.message);
            return null;
        } finally {
            setNotifying(false);
        }
    };

    const handleChallengeCreated = async (challengeId: string) => {
        const rival = selectedRival;
        closeChallengeModal();
        if (!rival) return;

        const convId = await notifyByChat(challengeId, rival);

        Alert.alert(
            'Desafío enviado',
            `Se le notificó a ${rival.full_name ?? rival.username}. Podrá aceptarlo o reproponer fecha y sede.`,
            [
                { text: 'Ver desafío', onPress: () => router.push(`/challenge/${challengeId}` as any) },
                convId
                    ? { text: 'Ver chat', onPress: () => router.push(`/chat/${convId}` as any) }
                    : undefined,
                { text: 'OK' },
            ].filter(Boolean) as any
        );
    };

    const winrate = (r: Rival) => {
        const total = r.wins + r.losses;
        return total > 0 ? Math.round((r.wins / total) * 100) : 0;
    };

    const eloDiff = (r: Rival) => r.elo - (profile?.elo ?? 1000);

    const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
        { key: 'all', label: 'Todos', icon: 'apps-outline' },
        { key: 'level', label: 'Tu nivel', icon: 'speedometer-outline' },
        { key: 'city', label: 'Cerca de ti', icon: 'location-outline' },
        { key: 'online', label: 'En línea', icon: 'radio-button-on' },
    ];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Buscar Rival</Text>
                <Text style={styles.subtitle}>Encontrá oponentes para tu próximo partido</Text>
            </View>

            <View style={styles.searchWrap}>
                <View style={styles.searchBox}>
                    <Ionicons name="search-outline" size={20} color={Colors.onSurfaceVariant} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Buscar por nombre o usuario..."
                        placeholderTextColor={Colors.onSurfaceVariant}
                        autoCapitalize="none"
                        style={styles.searchInput}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={18} color={Colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.filtersRow}>
                {FILTERS.map(f => {
                    const active = filter === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            onPress={() => setFilter(f.key)}
                            style={[styles.filterChip, active && styles.filterChipActive]}
                            activeOpacity={0.85}
                        >
                            <Ionicons
                                name={f.icon}
                                size={14}
                                color={active ? Colors.onPrimary : Colors.onSurfaceVariant}
                            />
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={r => r.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.list}
                    renderItem={({ item: rival }) => {
                        const diff = eloDiff(rival);
                        const diffLabel = diff === 0 ? 'Igual ELO' : `${diff > 0 ? '+' : ''}${diff} ELO`;
                        const diffColor = diff > 0 ? Colors.error : diff < 0 ? Colors.primary : Colors.onSurfaceVariant;

                        return (
                            <Card style={styles.rivalCard}>
                                <TouchableOpacity
                                    style={styles.rivalTop}
                                    onPress={() => router.push(`/profile/${rival.id}` as any)}
                                    activeOpacity={0.85}
                                >
                                    <View style={styles.avatarWrap}>
                                        <Avatar uri={rival.avatar_url} size={56} online={rival.is_online} />
                                    </View>

                                    <View style={styles.rivalInfo}>
                                        <Text style={styles.rivalName}>{rival.full_name}</Text>
                                        <View style={styles.rivalMetaRow}>
                                            <Ionicons name="location-outline" size={12} color={Colors.onSurfaceVariant} />
                                            <Text style={styles.rivalMetaText}>{rival.city ?? 'Sin ciudad'}</Text>
                                            <View style={styles.metaDot} />
                                            <Text style={styles.rivalMetaText}>{winrate(rival)}% WR</Text>
                                        </View>
                                        <View style={styles.badgeRow}>
                                            <Badge
                                                label={rival.level ?? 'Amateur I'}
                                                color={Colors.primaryContainer}
                                                textColor={Colors.primary}
                                            />
                                            <Text style={[styles.diffText, { color: diffColor }]}>{diffLabel}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.challengeBtn}
                                    onPress={() => openChallengeModal(rival)}
                                    disabled={notifying}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="flash" size={16} color={Colors.onPrimary} />
                                    <Text style={styles.challengeBtnText}>DESAFIAR</Text>
                                </TouchableOpacity>
                            </Card>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="people-outline" size={48} color={Colors.onSurfaceVariant} />
                            <Text style={styles.emptyText}>
                                {filter === 'all'
                                    ? 'No se encontraron jugadores'
                                    : 'Nadie coincide con este filtro todavía'}
                            </Text>
                            {filter !== 'all' && (
                                <TouchableOpacity onPress={() => setFilter('all')}>
                                    <Text style={styles.emptyAction}>Ver todos los jugadores</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                />
            )}

            {selectedRival && (
                <CreateChallengeModal
                    visible={modalVisible}
                    onClose={closeChallengeModal}
                    rivalId={selectedRival.id}
                    rivalName={selectedRival.full_name ?? selectedRival.username}
                    rivalAvatar={selectedRival.avatar_url ?? null}
                    onCreated={handleChallengeCreated}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    title: { fontFamily: 'Lexend_700Bold', fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5 },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },

    searchWrap: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surfaceContainerLow,
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
        minHeight: 56,
    },
    searchInput: {
        flex: 1,
        ...Typography.bodyLg,
        color: Colors.onSurface,
        paddingVertical: 0,
    },

    filtersRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.md,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterChipText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    filterChipTextActive: { color: Colors.onPrimary },

    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: 100 },

    rivalCard: { gap: Spacing.md, ...Shadow.ambient },
    rivalTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    avatarWrap: { position: 'relative' },
    rivalInfo: { flex: 1, gap: 4 },
    rivalName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: Colors.onSurface },
    rivalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rivalMetaText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    metaDot: {
        width: 3, height: 3, borderRadius: 1.5,
        backgroundColor: Colors.onSurfaceVariant, marginHorizontal: 2,
    },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
    diffText: { fontFamily: 'Lexend_600SemiBold', fontSize: 12 },

    challengeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        borderRadius: Radius.full,
        paddingVertical: Spacing.sm + 2,
    },
    challengeBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: Colors.onPrimary, letterSpacing: 0.5 },

    empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
    emptyAction: { ...Typography.labelLg, color: Colors.primary },
});