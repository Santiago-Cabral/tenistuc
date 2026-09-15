// src/screens/athlete/RankingScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';
import { Avatar, Badge, Card } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import CreateChallengeModal from '../../components/challenges/CreateChallengeModal';

interface RankedPlayer {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
    city: string | null;
    elo: number;
    level: string;
    wins: number;
    losses: number;
}

export default function RankingScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const [players, setPlayers] = useState<RankedPlayer[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedRival, setSelectedRival] = useState<RankedPlayer | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [notifying, setNotifying] = useState(false);

    const loadPlayers = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, city, elo, level, wins, losses')
            .order('elo', { ascending: false })
            .limit(100);

        if (error) {
            Alert.alert('Error', 'No se pudo cargar el ranking');
        } else if (data) {
            setPlayers(data as RankedPlayer[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadPlayers(); }, [loadPlayers]);

    const openChallengeModal = (player: RankedPlayer) => {
        if (player.id === profile?.id) return;
        setSelectedRival(player);
        setModalVisible(true);
    };

    const closeChallengeModal = () => {
        setModalVisible(false);
        setSelectedRival(null);
    };

    // Crea/encuentra la conversación y avisa por chat, igual que en RivalsScreen.
    const notifyByChat = async (challengeId: string, rival: RankedPlayer) => {
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
            console.warn('[RankingScreen] notifyByChat error:', e.message);
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

    const winrate = (p: RankedPlayer) => {
        const total = p.wins + p.losses;
        return total > 0 ? Math.round((p.wins / total) * 100) : 0;
    };

    const rankBadgeColor = (position: number) => {
        if (position === 1) return { bg: '#FFE08A', text: '#7A5B00' };
        if (position === 2) return { bg: '#E2E2E2', text: '#555' };
        if (position === 3) return { bg: '#E8C39E', text: '#6B3E14' };
        return { bg: Colors.surfaceContainerHigh, text: Colors.onSurfaceVariant };
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.loader}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Ranking</Text>
                <Text style={styles.subtitle}>{players.length} jugadores</Text>
            </View>

            <FlatList
                data={players}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.list}
                renderItem={({ item: player, index }) => {
                    const position = index + 1;
                    const badge = rankBadgeColor(position);
                    const isMe = player.id === profile?.id;

                    return (
                        <Card style={[styles.row, isMe && styles.rowMe]}>
                            <View style={[styles.rankCircle, { backgroundColor: badge.bg }]}>
                                <Text style={[styles.rankNumber, { color: badge.text }]}>{position}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.playerLeft}
                                onPress={() => router.push(`/profile/${player.id}` as any)}
                                activeOpacity={0.8}
                            >
                                <Avatar uri={player.avatar_url} size={48} />
                                <View style={styles.playerInfo}>
                                    <Text style={styles.playerName}>
                                        {player.full_name}{isMe ? ' (Vos)' : ''}
                                    </Text>
                                    <View style={styles.playerMeta}>
                                        <Badge
                                            label={player.level ?? 'Amateur I'}
                                            color={Colors.primaryContainer}
                                            textColor={Colors.primary}
                                        />
                                        <Text style={styles.playerWinrate}>{winrate(player)}% WR</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            <View style={styles.right}>
                                <Text style={styles.eloValue}>{player.elo ?? 1000}</Text>
                                <Text style={styles.eloLabel}>ELO</Text>
                                {!isMe && (
                                    <TouchableOpacity
                                        style={styles.challengeBtn}
                                        onPress={() => openChallengeModal(player)}
                                        disabled={notifying}
                                    >
                                        <Ionicons name="flash-outline" size={18} color={Colors.primary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="trophy-outline" size={48} color={Colors.onSurfaceVariant} />
                        <Text style={styles.emptyText}>Todavía no hay jugadores en el ranking</Text>
                    </View>
                }
            />

            {selectedRival && (
                <CreateChallengeModal
                    visible={modalVisible}
                    onClose={closeChallengeModal}
                    rivalId={selectedRival.id}
                    rivalName={selectedRival.full_name ?? selectedRival.username}
                    onCreated={handleChallengeCreated}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    title: { fontFamily: 'Lexend_700Bold', fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5 },
    subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    list: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: 100 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    rowMe: { borderWidth: 1, borderColor: Colors.primary },
    rankCircle: {
        width: 32, height: 32, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    rankNumber: { fontFamily: 'Lexend_700Bold', fontSize: 14 },
    playerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    playerInfo: { flex: 1, gap: 3 },
    playerName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: Colors.onSurface },
    playerMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
    playerWinrate: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    right: { alignItems: 'center', gap: 2 },
    eloValue: { fontFamily: 'Lexend_700Bold', fontSize: 18, color: Colors.primary, letterSpacing: -0.5 },
    eloLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    challengeBtn: {
        marginTop: Spacing.sm,
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
});