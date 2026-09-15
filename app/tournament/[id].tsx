import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/theme/index';
import { Badge, Avatar, Button, Card, SectionHeader } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';

export default function TournamentDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile } = useAuthStore();
    const [tournament, setTournament] = useState<any>(null);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [isRegistered, setIsRegistered] = useState(false);
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        if (!id) return;
        supabase.from('tournaments').select('*, organizer:profiles!tournaments_organizer_id_fkey(full_name, avatar_url)')
            .eq('id', id).single()
            .then(({ data }) => { if (data) setTournament(data); });

        supabase.from('tournament_registrations')
            .select('*, player:profiles(full_name, avatar_url, elo, level)')
            .eq('tournament_id', id)
            .order('registered_at', { ascending: false })
            .then(({ data }) => { if (data) setRegistrations(data); });

        if (profile) {
            supabase.from('tournament_registrations')
                .select('id').eq('tournament_id', id).eq('player_id', profile.id).single()
                .then(({ data }) => setIsRegistered(!!data));
        }
    }, [id, profile]);

    const handleJoin = async () => {
        if (!profile || !tournament) return;
        setJoining(true);
        try {
            const { error } = await supabase.from('tournament_registrations')
                .insert({ tournament_id: tournament.id, player_id: profile.id });
            if (error) throw error;
            setIsRegistered(true);
            Alert.alert('¡Inscripto!', `Estás inscripto en ${tournament.name}`);
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'No se pudo inscribir');
        } finally {
            setJoining(false);
        }
    };

    const statusLabel: Record<string, string> = {
        upcoming: 'PRÓXIMAMENTE', open: 'INSCRIPCIONES ABIERTAS',
        in_progress: 'EN JUEGO', completed: 'FINALIZADO',
    };
    const statusColor: Record<string, string> = {
        upcoming: Colors.surfaceContainerHigh, open: Colors.primaryContainer,
        in_progress: Colors.tertiaryContainer, completed: Colors.surfaceContainerHighest,
    };
    const statusTextColor: Record<string, string> = {
        upcoming: Colors.onSurfaceVariant, open: Colors.primary,
        in_progress: Colors.tertiary, completed: Colors.onSurfaceVariant,
    };

    if (!tournament) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant }}>Cargando...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={styles.hero}>
                    <Image
                        source={{ uri: tournament.image_url ?? 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800' }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                    />
                    <LinearGradient
                        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.7)']}
                        style={StyleSheet.absoluteFill}
                    />
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.heroContent}>
                        <Badge
                            label={statusLabel[tournament.status] ?? tournament.status.toUpperCase()}
                            color={statusColor[tournament.status] ?? Colors.surfaceContainerHigh}
                            textColor={statusTextColor[tournament.status] ?? Colors.onSurfaceVariant}
                        />
                        <Text style={styles.heroTitle}>{tournament.name}</Text>
                        {tournament.category && (
                            <Text style={styles.heroCategory}>{tournament.category}</Text>
                        )}
                    </View>
                </View>

                <View style={styles.content}>
                    {/* Stats row */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                ${Number(tournament.prize_money).toLocaleString('es')}
                            </Text>
                            <Text style={styles.statLabel}>PREMIOS</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{tournament.elo_points}</Text>
                            <Text style={styles.statLabel}>ELO PTS</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{registrations.length}/{tournament.max_players}</Text>
                            <Text style={styles.statLabel}>JUGADORES</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                ${Number(tournament.entry_fee).toLocaleString('es')}
                            </Text>
                            <Text style={styles.statLabel}>ENTRADA</Text>
                        </View>
                    </View>

                    {/* Info cards */}
                    <Card style={styles.infoCard}>
                        {tournament.starts_at && (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}>
                                    <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                                </View>
                                <View>
                                    <Text style={styles.infoLabel}>FECHA</Text>
                                    <Text style={styles.infoValue}>
                                        {new Date(tournament.starts_at).toLocaleDateString('es', {
                                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                                        })}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {tournament.location && (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}>
                                    <Ionicons name="location-outline" size={18} color={Colors.primary} />
                                </View>
                                <View>
                                    <Text style={styles.infoLabel}>SEDE</Text>
                                    <Text style={styles.infoValue}>{tournament.location}</Text>
                                </View>
                            </View>
                        )}
                        <View style={styles.infoRow}>
                            <View style={styles.infoIconWrap}>
                                <Ionicons name="trophy-outline" size={18} color={Colors.primary} />
                            </View>
                            <View>
                                <Text style={styles.infoLabel}>FORMATO</Text>
                                <Text style={styles.infoValue}>
                                    {tournament.format === 'elimination' ? 'Eliminación directa'
                                        : tournament.format === 'round_robin' ? 'Todos contra todos'
                                            : 'Sistema suizo'}
                                </Text>
                            </View>
                        </View>
                        {tournament.organizer && (
                            <View style={styles.infoRow}>
                                <View style={styles.infoIconWrap}>
                                    <Ionicons name="person-outline" size={18} color={Colors.primary} />
                                </View>
                                <View>
                                    <Text style={styles.infoLabel}>ORGANIZADOR</Text>
                                    <Text style={styles.infoValue}>{tournament.organizer.full_name}</Text>
                                </View>
                            </View>
                        )}
                    </Card>

                    {/* Description */}
                    {tournament.description && (
                        <Card>
                            <Text style={styles.descLabel}>ACERCA DEL TORNEO</Text>
                            <Text style={styles.descText}>{tournament.description}</Text>
                        </Card>
                    )}

                    {/* Participants */}
                    <SectionHeader title={`Participantes (${registrations.length})`} />
                    {registrations.slice(0, 8).map((r, i) => (
                        <TouchableOpacity
                            key={r.id}
                            style={styles.participantRow}
                            onPress={() => router.push(`/profile/${r.player?.id}`)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.participantRank}>{i + 1}</Text>
                            <Avatar uri={r.player?.avatar_url} size={44} />
                            <View style={styles.participantInfo}>
                                <Text style={styles.participantName}>{r.player?.full_name ?? '—'}</Text>
                                <Text style={styles.participantLevel}>{r.player?.level ?? ''}</Text>
                            </View>
                            <Text style={styles.participantElo}>{r.player?.elo ?? '—'} ELO</Text>
                            <Badge
                                label={r.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                                color={r.payment_status === 'paid' ? Colors.primaryContainer : Colors.tertiaryContainer}
                                textColor={r.payment_status === 'paid' ? Colors.primary : Colors.tertiary}
                            />
                        </TouchableOpacity>
                    ))}
                    {registrations.length > 8 && (
                        <TouchableOpacity style={styles.moreBtn}>
                            <Text style={styles.moreBtnText}>
                                Ver todos los {registrations.length} participantes
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* CTA */}
                    {tournament.status === 'open' && (
                        <View style={styles.ctaSection}>
                            {isRegistered ? (
                                <Card style={styles.registeredCard}>
                                    <View style={styles.registeredIconWrap}>
                                        <Ionicons name="checkmark-circle" size={28} color={Colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.registeredTitle}>¡Estás inscripto!</Text>
                                        <Text style={styles.registeredSub}>
                                            Te avisaremos cuando comiencen los partidos.
                                        </Text>
                                    </View>
                                </Card>
                            ) : (
                                <>
                                    <Text style={styles.ctaNote}>
                                        Quedan {tournament.max_players - registrations.length} lugares disponibles
                                    </Text>
                                    <Button
                                        label={`INSCRIBIRSE — $${Number(tournament.entry_fee).toLocaleString('es')}`}
                                        onPress={handleJoin}
                                        loading={joining}
                                        uppercase={false}
                                    />
                                </>
                            )}
                        </View>
                    )}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    hero: { height: 280, position: 'relative', justifyContent: 'flex-end' },
    backBtn: {
        position: 'absolute', top: 16, left: 16,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center', justifyContent: 'center',
    },
    heroContent: { padding: Spacing.xl, gap: 6 },
    heroTitle: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 32, color: '#fff',
        letterSpacing: -1, lineHeight: 36,
    },
    heroCategory: { ...Typography.bodyMd, color: 'rgba(255,255,255,0.75)' },
    content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl, paddingTop: Spacing.xl },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl,
        padding: Spacing.base,
        ...Shadow.ambient,
    },
    statItem: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { fontFamily: 'Lexend_700Bold', fontSize: 18, color: Colors.onSurface, letterSpacing: -0.3 },
    statLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, fontSize: 9 },
    statDivider: { width: 1, backgroundColor: Colors.surfaceContainerHighest },
    infoCard: { gap: Spacing.md },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    infoIconWrap: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    infoLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginBottom: 2 },
    infoValue: { ...Typography.titleMd, color: Colors.onSurface },
    descLabel: { ...Typography.labelLg, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
    descText: { ...Typography.bodyMd, color: Colors.onSurface, lineHeight: 22 },
    participantRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
    },
    participantRank: { ...Typography.titleMd, color: Colors.onSurfaceVariant, width: 20, textAlign: 'center' },
    participantInfo: { flex: 1 },
    participantName: { ...Typography.titleMd, color: Colors.onSurface },
    participantLevel: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    participantElo: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: Colors.onSurface },
    moreBtn: {
        alignItems: 'center', paddingVertical: Spacing.md,
        borderRadius: Radius.lg,
        borderWidth: 1, borderColor: Colors.surfaceContainerHighest,
    },
    moreBtnText: { ...Typography.bodyMd, color: Colors.primary, fontFamily: 'PlusJakartaSans_600SemiBold' },
    ctaSection: { gap: Spacing.md },
    ctaNote: { ...Typography.bodySm, color: Colors.onSurfaceVariant, textAlign: 'center' },
    registeredCard: {
        flexDirection: 'row', alignItems: 'center',
        gap: Spacing.md, paddingVertical: Spacing.lg,
    },
    registeredIconWrap: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center',
    },
    registeredTitle: { ...Typography.titleLg, color: Colors.primary },
    registeredSub: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
});