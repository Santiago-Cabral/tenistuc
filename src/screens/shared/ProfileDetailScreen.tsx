import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { showAlert } from '../../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../theme';
import { Avatar, Badge, Button, Card, SectionHeader, SkeletonList } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ageCategoryLabel } from '../../constants/ageCategories';
import { matchesService } from '../../services/matchService';
import { isActuallyOnline } from '../../services/presenceService';
import { useDoubles } from '../../hooks/useDoubles';
import { inviteToDoubles } from '../../services/doublesService';
import CreateChallengeModal from '../../components/challenges/CreateChallengeModal';

function timeAgo(iso?: string | null): string {
    if (!iso) return 'desconocida';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'recién';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d} d`;
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const hasDoublesWith = (
    teams: Array<{ player1_id: string; player2_id: string; status: string }>,
    otherId: string
) => teams.some((t) =>
    (t.status === 'invited' || t.status === 'ready') &&
    (t.player1_id === otherId || t.player2_id === otherId)
);

export default function ProfileDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile: myProfile } = useAuthStore();
    const { myTeams, activeTeam, reload: reloadDoubles } = useDoubles();
    const [player, setPlayer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [globalRank, setGlobalRank] = useState<number | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [inviting, setInviting] = useState(false);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, role, city, club, elo, level, age_category, wins, losses, play_style, bio, is_online, last_seen, created_at')
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
                if (error) {
                    console.warn('[ProfileDetailScreen] load error:', error.message);
                    setLoadError(error.message);
                } else if (data) {
                    setPlayer(data);
                    if (data.elo) {
                        supabase
                            .from('profiles')
                            .select('id', { count: 'exact', head: true })
                            .gt('elo', data.elo)
                            .then(({ count }) => setGlobalRank(count !== null ? count + 1 : null));
                    }
                }
                setLoading(false);
            });
    }, [id, reloadKey]);

    const isMe = myProfile?.id === id;
    const hasActiveDoubles = !!player && (
        hasDoublesWith(myTeams, player.id) ||
        (!!activeTeam && hasDoublesWith([activeTeam], player.id))
    );

    const winrate = player && (player.wins + player.losses) > 0
        ? Math.round((player.wins / (player.wins + player.losses)) * 100)
        : 0;

    // Abre el formulario de creación de desafío (fecha y sede obligatorias).
    // Tras crearlo, navega al detalle del desafío real.
    const handleChallenge = () => {
        if (!player) return;
        setModalVisible(true);
    };

    const handleChallengeCreated = async (challengeId: string) => {
        setModalVisible(false);
        if (!myProfile || !player) return;

        try {
            const convId = await matchesService.getOrCreateConversation(myProfile.id, player.id);
            if (convId) {
                await supabase.from('messages').insert({
                    conversation_id: convId,
                    sender_id: myProfile.id,
                    content: 'Te desafié a un partido.',
                    message_type: 'challenge',
                    metadata: { challenge_id: challengeId },
                });
            }
        } catch (e: any) {
            console.warn('[ProfileDetailScreen] notifyByChat error:', e.message);
        }

        showAlert(
            'Desafío enviado',
            `Se le notificó a ${player.full_name ?? player.username}. Podrá aceptarlo o reproponer fecha y sede.`,
            [
                { text: 'Ver desafío', onPress: () => router.push(`/challenge/${challengeId}` as any) },
                { text: 'OK' },
            ] as any
        );
    };

    const handleMessage = async () => {
        if (!myProfile || !player) return;

        try {
            const convId = await matchesService.getOrCreateConversation(myProfile.id, player.id);
            if (convId) router.push(`/chat/${convId}` as any);
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo abrir el chat');
        }
    };

    const handleInviteDoubles = () => {
        if (!player || hasActiveDoubles || inviting) return;
        const name = player.full_name ?? player.username;

        showAlert('Invitar a dobles', `¿Querés invitar a ${name} a formar una dupla?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Invitar',
                onPress: async () => {
                    setInviting(true);
                    try {
                        await inviteToDoubles(player.id);
                        await reloadDoubles();
                        showAlert('¡Listo!', `Le enviamos la invitación a ${name}.`);
                    } catch (e: any) {
                        showAlert('No se pudo enviar la invitación', e.message ?? 'Intentá de nuevo.');
                    } finally {
                        setInviting(false);
                    }
                },
            },
        ]);
    };

    if (loading) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface }} edges={['top']}>
            <SkeletonList count={5} />
        </SafeAreaView>
    );

    if (!player) return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl }}>
            <Ionicons
                name={loadError ? 'alert-circle-outline' : 'person-outline'}
                size={40}
                color={Colors.onSurfaceVariant}
            />
            <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' }}>
                {loadError
                    ? 'No se pudo cargar el perfil del jugador.'
                    : 'Jugador no encontrado'}
            </Text>
            <TouchableOpacity onPress={() => setReloadKey(k => k + 1)}>
                <Text style={{ ...Typography.labelLg, color: Colors.primary }}>Reintentar</Text>
            </TouchableOpacity>
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
                    <View style={styles.statusRow}>
                        {isActuallyOnline(player) ? (
                            <>
                                <View style={styles.onlineDot} />
                                <Text style={styles.statusText}>En línea</Text>
                            </>
                        ) : (
                            <Text style={styles.statusText}>Última conexión {timeAgo(player.last_seen)}</Text>
                        )}
                    </View>
                    <View style={styles.levelWrap}>
                        <Badge
                            label={player.level ?? '6ta'}
                            color="rgba(183,228,199,0.25)"
                            textColor={Colors.primaryContainer}
                        />
                        {ageCategoryLabel(player.age_category) && (
                            <Badge
                                label={ageCategoryLabel(player.age_category)!}
                                color="rgba(255,255,255,0.18)"
                                textColor={Colors.onPrimary}
                            />
                        )}
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
                                <Text style={styles.rankValue}>#{globalRank ?? '—'}</Text>
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

                    {Array.isArray(player.play_style) && player.play_style.length > 0 && (
                        <Card>
                            <SectionHeader title="Estilo de juego" />
                            <View style={styles.chipsRow}>
                                {player.play_style.map((s: string) => (
                                    <View key={s} style={styles.chip}>
                                        <Text style={styles.chipText}>{s}</Text>
                                    </View>
                                ))}
                            </View>
                        </Card>
                    )}

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
                            {
                                icon: 'calendar-outline',
                                label: player.created_at
                                    ? `Miembro desde ${new Date(player.created_at).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
                                    : 'Miembro desde hace tiempo',
                            },
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

                    {!isMe && player.role === 'athlete' && (
                        <TouchableOpacity
                            style={[
                                styles.actionBtnCustom,
                                styles.actionBtnSecondary,
                                styles.inviteBtn,
                                (hasActiveDoubles || inviting) && styles.actionBtnDisabled,
                            ]}
                            onPress={handleInviteDoubles}
                            disabled={hasActiveDoubles || inviting}
                            activeOpacity={0.85}
                        >
                            <Ionicons
                                name="people-outline"
                                size={18}
                                color={hasActiveDoubles ? Colors.onSurfaceVariant : Colors.primary}
                            />
                            <Text style={[
                                styles.actionBtnTextSecondary,
                                (hasActiveDoubles || inviting) && styles.actionBtnTextDisabled,
                            ]}>
                                {hasActiveDoubles ? 'Ya tienen una dupla' : 'Invitar a dobles'}
                            </Text>
                        </TouchableOpacity>
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

            <CreateChallengeModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                rivalId={player.id}
                rivalName={player.full_name ?? player.username}
                rivalAvatar={player.avatar_url ?? null}
                onCreated={handleChallengeCreated}
            />
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
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    onlineDot: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: '#4ade80',
    },
    statusText: { ...Typography.labelSm, color: 'rgba(183,228,199,0.75)' },
    levelWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
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
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
    chip: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.base,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHigh,
    },
    chipText: { ...Typography.bodySm, color: Colors.onSurface },
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
    inviteBtn: { marginTop: Spacing.sm, ...Shadow.ambient },
    actionBtnDisabled: {
        backgroundColor: Colors.surfaceContainerHigh,
        borderColor: Colors.outlineVariant,
    },
    actionBtnTextPrimary: {
        ...Typography.labelLg,
        color: '#fff',
    },
    actionBtnTextSecondary: {
        ...Typography.labelLg,
        color: Colors.primary,
    },
    actionBtnTextDisabled: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
    },
});