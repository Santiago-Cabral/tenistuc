import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    RefreshControl,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/theme/index';
import { Badge, Avatar, Button, Card, SectionHeader } from '../../src/components/ui';
import AthleteFixtureSection from '../../src/components/tournament/AthleteFixtureSection';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import {
    isRegistrationOpen, TOURNAMENT_STATUS_LABEL, TournamentStatus,
} from '../../src/services/organizerService';

export default function TournamentDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile } = useAuthStore();
    const [tournament, setTournament] = useState<any>(null);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [myRegistration, setMyRegistration] = useState<any>(null);
    const [joining, setJoining] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [fixtureKey, setFixtureKey] = useState(0);
    const [showAllParticipants, setShowAllParticipants] = useState(false);
    const championName = Array.isArray(tournament?.champion)
        ? tournament.champion[0]?.full_name
        : tournament?.champion?.full_name;

    const refreshMyRegistration = async () => {
        if (!profile || !id) return;
        const { data } = await supabase
            .from('tournament_registrations')
            .select('*')
            .eq('tournament_id', id)
            .eq('player_id', profile.id)
            .maybeSingle();
        setMyRegistration(data ?? null);
    };

    const loadAll = useCallback(async () => {
        if (!id) return;
        const [tRes, regRes] = await Promise.all([
            supabase
                .from('tournaments')
                .select('*, organizer:profiles!tournaments_organizer_id_fkey(full_name, avatar_url), champion:profiles!tournaments_champion_id_fkey(full_name)')
                .eq('id', id)
                .single(),
            supabase
                .from('tournament_registrations')
                // el id del jugador tiene que venir en el select embebido:
                // se usa para navegar a su perfil al tocarlo
                .select('*, player:profiles(id, full_name, avatar_url, elo, level)')
                .eq('tournament_id', id)
                .order('registered_at', { ascending: false }),
        ]);

        if (tRes.data) setTournament(tRes.data);
        if (regRes.data) setRegistrations(regRes.data);

        await refreshMyRegistration();
    }, [id, profile]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const onRefresh = async () => {
        setRefreshing(true);
        setFixtureKey(k => k + 1);
        await loadAll();
        setRefreshing(false);
    };

    const handleJoin = async () => {
        if (!profile || !tournament) return;
        if (!isRegistrationOpen(tournament.status)) {
            showAlert(
                'Inscripción no disponible',
                `Este torneo está ${TOURNAMENT_STATUS_LABEL[tournament.status as TournamentStatus]?.toLowerCase() ?? 'cerrado'}.`,
            );
            return;
        }
        if (!eligible) {
            showAlert('No podés inscribirte', `Este torneo es ${notEligibleReason}.`);
            return;
        }
        setJoining(true);
        try {
            const { error } = await supabase.from('tournament_registrations')
                .insert({
                    tournament_id: tournament.id,
                    player_id: profile.id,
                    payment_status: 'pending',
                });
            if (error) throw error;
            // recarga inscriptos + mi estado (para verme en la lista y el estado
            // de "habilitado" apenas el organizador acepte)
            await loadAll();
            showAlert(
                '¡Inscripto!',
                `Quedaste anotado en ${tournament.name}. El organizador tiene que habilitar tu lugar.`,
            );
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo completar la inscripción');
        } finally {
            setJoining(false);
        }
    };

    const statusColor: Record<string, string> = {
        upcoming: Colors.surfaceContainerHigh, open: Colors.primaryContainer,
        closed: Colors.tertiaryContainer, in_progress: Colors.tertiaryContainer,
        completed: Colors.surfaceContainerHighest,
    };
    const statusTextColor: Record<string, string> = {
        upcoming: Colors.onSurfaceVariant, open: Colors.primary,
        closed: Colors.tertiary, in_progress: Colors.tertiary,
        completed: Colors.onSurfaceVariant,
    };

    const closedStatusMessage: Record<string, string> = {
        upcoming: 'La inscripción todavía no abrió. Esperá a que el organizador la habilite.',
        closed: 'Este torneo terminó de recibir inscripciones.',
        in_progress: 'El torneo ya comenzó, no se aceptan inscripciones nuevas.',
        completed: 'El torneo finalizó. Mirá el fixture y los resultados.',
    };

    if (!tournament) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant }}>Cargando...</Text>
            </SafeAreaView>
        );
    }

    // Torneo exclusivo: ¿el jugador cumple los requisitos para inscribirse?
    const genderRestricted = tournament.allowed_gender === 'femenino' || tournament.allowed_gender === 'masculino';
    const levelRestricted = !!tournament.allowed_level && tournament.allowed_level !== 'todas';
    const eligible = (!genderRestricted || profile?.gender === tournament.allowed_gender)
        && (!levelRestricted || profile?.level === tournament.allowed_level);

    const restrictionParts: string[] = [];
    if (genderRestricted && profile?.gender !== tournament.allowed_gender) {
        restrictionParts.push(tournament.allowed_gender === 'femenino' ? 'solo para mujeres' : 'solo para hombres');
    }
    if (levelRestricted && profile?.level !== tournament.allowed_level) {
        restrictionParts.push(`solo para la categoría ${tournament.allowed_level}`);
    }
    const notEligibleReason = restrictionParts.join(' y ');
    const genderMissing = genderRestricted && profile?.gender == null;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={(
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                )}
            >
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
                            label={(TOURNAMENT_STATUS_LABEL[tournament.status as TournamentStatus] ?? tournament.status).toUpperCase()}
                            color={statusColor[tournament.status] ?? Colors.surfaceContainerHigh}
                            textColor={statusTextColor[tournament.status] ?? Colors.onSurfaceVariant}
                        />
                        <Text style={styles.heroTitle}>{tournament.name}</Text>
                        {tournament.category && (
                            <Text style={styles.heroCategory}>{tournament.category}</Text>
                        )}
                        {(genderRestricted || levelRestricted) && (
                            <View style={styles.heroChips}>
                                {genderRestricted && (
                                    <View style={styles.heroChip}>
                                        <Text style={styles.heroChipText}>
                                            {tournament.allowed_gender === 'femenino' ? 'SOLO MUJERES' : 'SOLO HOMBRES'}
                                        </Text>
                                    </View>
                                )}
                                {levelRestricted && (
                                    <View style={styles.heroChip}>
                                        <Text style={styles.heroChipText}>SOLO {tournament.allowed_level.toUpperCase()}</Text>
                                    </View>
                                )}
                            </View>
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

                    {tournament.champion_elo_applied && championName && (
                        <Card style={styles.infoCard}>
                            <View style={styles.championRow}>
                                <Ionicons name="trophy" size={18} color={Colors.primary} />
                                <Text style={styles.championText}>
                                    Campeón: {championName} · +{tournament.champion_elo} pts acreditados
                                </Text>
                            </View>
                        </Card>
                    )}

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

                    {/* Fixture público: lo ve cualquiera, esté o no inscripto */}
                    <AthleteFixtureSection
                        tournamentId={tournament.id}
                        myPlayerId={profile?.id}
                        reloadKey={fixtureKey}
                    />

                    {/* Participants */}
                    <SectionHeader title={`Participantes (${registrations.length})`} />
                    {(showAllParticipants ? registrations : registrations.slice(0, 8)).map((r, i) => (
                        <TouchableOpacity
                            key={r.id}
                            style={styles.participantRow}
                            onPress={() => r.player?.id && router.push(`/profile/${r.player.id}`)}
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
                                label={r.payment_status === 'paid' ? 'HABILITADO' : 'PENDIENTE'}
                                color={r.payment_status === 'paid' ? Colors.primaryContainer : Colors.tertiaryContainer}
                                textColor={r.payment_status === 'paid' ? Colors.primary : Colors.tertiary}
                            />
                        </TouchableOpacity>
                    ))}
                    {registrations.length > 8 && (
                        <TouchableOpacity
                            style={styles.moreBtn}
                            onPress={() => setShowAllParticipants(v => !v)}
                        >
                            <Text style={styles.moreBtnText}>
                                {showAllParticipants
                                    ? 'Ver menos'
                                    : `Ver todos los ${registrations.length} participantes`}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* CTA */}
                    <View style={styles.ctaSection}>
                        {!isRegistrationOpen(tournament.status) && !myRegistration ? (
                            <Card style={styles.registeredCard}>
                                <View style={styles.registeredIconWrap}>
                                    <Ionicons name="lock-closed" size={28} color={Colors.tertiary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.registeredTitle, { color: Colors.tertiary }]}>
                                        {TOURNAMENT_STATUS_LABEL[tournament.status as TournamentStatus] ?? 'Inscripción cerrada'}
                                    </Text>
                                    <Text style={styles.registeredSub}>
                                        {closedStatusMessage[tournament.status] ?? 'No se aceptan inscripciones nuevas.'}
                                    </Text>
                                </View>
                            </Card>
                        ) : myRegistration ? (
                            <Card style={styles.registeredCard}>
                                <View style={styles.registeredIconWrap}>
                                    <Ionicons
                                        name={myRegistration.payment_status === 'paid' ? 'checkmark-circle' : 'time-outline'}
                                        size={28}
                                        color={myRegistration.payment_status === 'paid' ? Colors.primary : Colors.tertiary}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={[
                                            styles.registeredTitle,
                                            myRegistration.payment_status !== 'paid' && { color: Colors.tertiary },
                                        ]}
                                    >
                                        {myRegistration.payment_status === 'paid'
                                            ? '¡Estás habilitado!'
                                            : 'Inscripción pendiente'}
                                    </Text>
                                    <Text style={styles.registeredSub}>
                                        {myRegistration.payment_status === 'paid'
                                            ? 'El organizador confirmó tu lugar. Seguí el fixture y tus horarios en esta pantalla.'
                                            : 'El organizador tiene que habilitar tu lugar.'}
                                    </Text>
                                </View>
                            </Card>
                        ) : !eligible ? (
                            <Card style={styles.registeredCard}>
                                <View style={[styles.registeredIconWrap, { backgroundColor: `${Colors.error}14` }]}>
                                    <Ionicons name="lock-closed" size={28} color={Colors.error} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.registeredTitle, { color: Colors.error }]}>
                                        No disponible para vos
                                    </Text>
                                    <Text style={styles.registeredSub}>
                                        {`Este torneo es ${notEligibleReason}.`}
                                        {genderMissing ? ' Configurá tu género en tu perfil para poder inscribirte.' : ''}
                                    </Text>
                                </View>
                            </Card>
                        ) : (
                            <>
                                <Text style={styles.ctaNote}>
                                    Quedan {Math.max((tournament.max_players ?? 0) - registrations.length, 0)} lugares disponibles
                                </Text>
                                <Button
                                    label="INSCRIBIRSE"
                                    onPress={handleJoin}
                                    loading={joining}
                                    uppercase={false}
                                />
                            </>
                        )}
                    </View>
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
    heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    heroChip: {
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    },
    heroChipText: {
        fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10,
        color: '#fff', letterSpacing: 0.5,
    },
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
    championRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    championText: { ...Typography.labelMd, color: Colors.primaryDim, flex: 1 },
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