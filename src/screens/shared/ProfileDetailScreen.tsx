import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';
import { Avatar, Badge, Button, Card, SectionHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { matchesService } from '../../services/matchService';

export default function ProfileDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile: myProfile } = useAuthStore();
    const [player, setPlayer] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single()
            .then(({ data }) => {
                if (data) setPlayer(data);
                setLoading(false);
            });
    }, [id]);

    const isMe = myProfile?.id === id;

    const winrate = player && (player.wins + player.losses) > 0
        ? Math.round((player.wins / (player.wins + player.losses)) * 100)
        : 0;

    // Ya no crea el reto acá — lo manda al formulario, que es donde se elige
    // modalidad, fecha y lugar (obligatorios)
    const handleChallenge = () => {
        if (!player) return;
        router.push(`/challenge/${player.id}` as any);
    };

    const handleMessage = async () => {
        if (!myProfile || !player) return;

        try {
            const convId = await matchesService.getOrCreateConversation(myProfile.id, player.id);
            if (convId) router.push(`/chat/${convId}` as any);
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'No se pudo abrir el chat');
        }
    };

    if (loading) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} size="large" />
        </SafeAreaView>
    );

    if (!player) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant }}>
                Jugador no encontrado
            </Text>
        </SafeAreaView>
    );

    const stats = [
        { label: 'Partidos', value: (player.wins ?? 0) + (player.losses ?? 0) },
        { label: 'Victorias', value: player.wins ?? 0 },
        { label: 'Derrotas', value: player.losses ?? 0 },
        { label: 'Winrate', value: `${winrate}%` },
    ];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false}>
                <LinearGradient
                    colors={[Colors.primary, Colors.primaryDim]}
                    style={styles.headerGradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>

                    <View style={styles.avatarWrap}>
                        {player.avatar_url ? (
                            <Image
                                source={{ uri: player.avatar_url }}
                                style={styles.avatar}
                                contentFit="cover"
                            />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons name="person" size={40} color="#fff" />
                            </View>
                        )}
                    </View>

                    <Text style={styles.name}>{player.full_name}</Text>
                    <Text style={styles.username}>@{player.username}</Text>
                    <View style={styles.levelWrap}>
                        <Badge
                            label={player.level ?? 'Amateur I'}
                            color="rgba(183,228,199,0.25)"
                            textColor={Colors.primaryContainer}
                        />
                    </View>
                </LinearGradient>

                <View style={styles.content}>
                    <Card style={styles.eloCard}>
                        <View style={styles.eloRow}>
                            <View style={styles.eloLeft}>
                                <Text style={styles.eloLabel}>PUNTOS ELO</Text>
                                <Text style={styles.eloValue}>
                                    {(player.elo ?? 1000).toLocaleString('es')}
                                </Text>
                            </View>
                            <View style={styles.eloRight}>
                                <Text style={styles.rankLabel}>RANKING</Text>
                                <Text style={styles.rankValue}>#{player.ranking ?? '—'}</Text>
                            </View>
                        </View>
                    </Card>

                    <View style={styles.statsGrid}>
                        {stats.map(s => (
                            <Card key={s.label} style={styles.statCard}>
                                <Text style={styles.statValue}>{s.value}</Text>
                                <Text style={styles.statLabel}>{s.label}</Text>
                            </Card>
                        ))}
                    </View>

                    {player.bio && (
                        <Card>
                            <SectionHeader title="Bio" />
                            <Text style={styles.bioText}>{player.bio}</Text>
                        </Card>
                    )}

                    <Card style={styles.infoCard}>
                        {[
                            { icon: 'location-outline', label: player.city ?? 'Sin ciudad' },
                            { icon: 'tennisball-outline', label: player.club ?? 'Sin club' },
                        ].map((item, i) => (
                            <View key={i} style={styles.infoRow}>
                                <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
                                <Text style={styles.infoText}>{item.label}</Text>
                            </View>
                        ))}
                    </Card>

                    {!isMe && (
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={[styles.actionBtnCustom, styles.actionBtnPrimary]}
                                onPress={handleChallenge}
                            >
                                <Ionicons name="flash-outline" size={18} color="#fff" />
                                <Text style={styles.actionBtnTextPrimary}>Desafiar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionBtnCustom, styles.actionBtnSecondary]}
                                onPress={handleMessage}
                            >
                                <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />
                                <Text style={styles.actionBtnTextSecondary}>Mensaje</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {isMe && (
                        <Button
                            label="Editar perfil"
                            variant="secondary"
                            onPress={() => router.push('/edit-profile')}
                        />
                    )}
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
    backBtn: {
        alignSelf: 'flex-start',
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarWrap: {
        width: 96, height: 96,
        borderRadius: 48,
        overflow: 'hidden',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.4)',
        marginTop: Spacing.md,
    },
    avatar: { width: '100%', height: '100%' },
    avatarPlaceholder: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 24, color: Colors.primaryContainer, letterSpacing: -0.5,
    },
    username: { ...Typography.bodyMd, color: 'rgba(183,228,199,0.75)' },
    levelWrap: { marginTop: Spacing.sm },
    content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, gap: Spacing.lg },
    eloCard: {},
    eloRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eloLeft: { gap: 2 },
    eloRight: { alignItems: 'flex-end', gap: 2 },
    eloLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1 },
    eloValue: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 36, color: Colors.primary, letterSpacing: -1,
    },
    rankLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1 },
    rankValue: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5,
    },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    statCard: { flex: 1, minWidth: '45%', alignItems: 'center', gap: 4 },
    statValue: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5,
    },
    statLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
    bioText: { ...Typography.bodyMd, color: Colors.onSurface, lineHeight: 22, marginTop: Spacing.sm },
    infoCard: { gap: Spacing.md },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    infoText: { ...Typography.bodyMd, color: Colors.onSurface },
    actions: { flexDirection: 'row', gap: Spacing.md },
    actionBtnCustom: {
        flex: 1,
        height: 52,
        borderRadius: Radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    actionBtnPrimary: {
        backgroundColor: Colors.primary,
    },
    actionBtnSecondary: {
        backgroundColor: Colors.primaryContainer,
        borderWidth: 1,
        borderColor: Colors.primary + '33',
    },
    actionBtnTextPrimary: {
        ...Typography.labelLg,
        color: '#fff',
    },
    actionBtnTextSecondary: {
        ...Typography.labelLg,
        color: Colors.primary,
    },
});