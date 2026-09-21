import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/theme/index';
import { Badge, Avatar, Button, Card, SectionHeader } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { createMpPreference, openCheckout, checkPayment } from '../../src/services/paymentsService';

export default function TournamentDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile } = useAuthStore();
    const [tournament, setTournament] = useState<any>(null);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [myRegistration, setMyRegistration] = useState<any>(null);
    const [joining, setJoining] = useState(false);

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

        refreshMyRegistration();
    }, [id, profile]);

    const handleJoin = async () => {
        if (!profile || !tournament) return;
        if (tournament.status !== 'open') {
            showAlert('Lista cerrada', 'La inscripción para este torneo está cerrada.');
            return;
        }
        setJoining(true);
        try {
            if (Number(tournament.entry_fee) > 0) {
                // Inscripción con pago vía MercadoPago
                const pref = await createMpPreference(tournament.id);
                await refreshMyRegistration();

                if (pref.already_paid) {
                    showAlert('¡Inscripto!', `Ya estabas inscripto en ${tournament.name}`);
                    return;
                }
                if (!pref.init_point) throw new Error('No se pudo iniciar el pago');

                await openCheckout(pref.init_point);

                // al volver del checkout verificamos el estado (idempotente)
                const status = await checkPayment(tournament.id);
                await refreshMyRegistration();

                if (status === 'paid') {
                    showAlert('¡Inscripción confirmada!', `Estás inscripto en ${tournament.name}.`);
                } else {
                    showAlert(
                        'Pago en proceso',
                        'Si ya pagaste, tu lugar se confirmará en unos segundos.'
                    );
                }
            } else {
                // Torneo gratuito
                const { error } = await supabase.from('tournament_registrations')
                    .insert({ tournament_id: tournament.id, player_id: profile.id });
                if (error) throw error;
                await refreshMyRegistration();
                showAlert('¡Inscripto!', `Estás inscripto en ${tournament.name}`);
            }
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo completar la inscripción');
        } finally {
            setJoining(false);
        }
    };

    const handlePay = async () => {
        if (!tournament) return;
        setJoining(true);
        try {
            const pref = await createMpPreference(tournament.id);
            if (!pref.init_point) return;
            await openCheckout(pref.init_point);
            const status = await checkPayment(tournament.id);
            await refreshMyRegistration();
            if (status === 'paid') {
                showAlert('¡Inscripción confirmada!', `Estás inscripto en ${tournament.name}.`);
            } else {
                showAlert('Pago en proceso', 'Si ya pagaste, tu lugar se confirmará en unos segundos.');
            }
        } catch (e: any) {
            showAlert('Error', e.message ?? 'No se pudo procesar el pago');
        } finally {
            setJoining(false);
        }
    };

    const statusLabel: Record<string, string> = {
        upcoming: 'PRÓXIMAMENTE', open: 'INSCRIPCIONES ABIERTAS',
        closed: 'LISTA CERRADA', in_progress: 'EN JUEGO', completed: 'FINALIZADO',
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
                    {tournament.status === 'closed' && !myRegistration ? (
                        <View style={styles.ctaSection}>
                            <Card style={styles.registeredCard}>
                                <View style={styles.registeredIconWrap}>
                                    <Ionicons name="lock-closed" size={28} color={Colors.tertiary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.registeredTitle, { color: Colors.tertiary }]}>
                                        Lista cerrada
                                    </Text>
                                    <Text style={styles.registeredSub}>
                                        Este torneo terminó de recibir inscripciones.
                                    </Text>
                                </View>
                            </Card>
                        </View>
                    ) : tournament.status === 'open' || myRegistration ? (
                        <View style={styles.ctaSection}>
                            {myRegistration?.payment_status === 'paid' ? (
                                <Card style={styles.registeredCard}>
                                    <View style={styles.registeredIconWrap}>
                                        <Ionicons name="checkmark-circle" size={28} color={Colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.registeredTitle}>¡Estás inscripto!</Text>
                                        <Text style={styles.registeredSub}>
                                            {Number(tournament.entry_fee) > 0
                                                ? 'Pago confirmado. Te avisaremos cuando comiencen los partidos.'
                                                : 'Te avisaremos cuando comiencen los partidos.'}
                                        </Text>
                                    </View>
                                </Card>
                            ) : myRegistration && Number(tournament.entry_fee) > 0 ? (
                                <>
                                    <Card style={styles.registeredCard}>
                                        <View style={styles.registeredIconWrap}>
                                            <Ionicons name="time-outline" size={28} color={Colors.tertiary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.registeredTitle, { color: Colors.tertiary }]}>
                                                Falta confirmar tu pago
                                            </Text>
                                            <Text style={styles.registeredSub}>
                                                Tenés un lugar reservado. Completá tu inscripción.
                                            </Text>
                                        </View>
                                    </Card>
                                    <Button
                                        label={`CONFIRMAR PAGO — $${Number(tournament.entry_fee).toLocaleString('es')}`}
                                        onPress={handlePay}
                                        loading={joining}
                                        uppercase={false}
                                    />
                                </>
                            ) : tournament.status === 'open' ? (
                                <>
                                    <Text style={styles.ctaNote}>
                                        Quedan {Math.max(tournament.max_players - registrations.length, 0)} lugares disponibles
                                    </Text>
                                    <Button
                                        label={Number(tournament.entry_fee) > 0
                                            ? `INSCRIBIRSE Y PAGAR — $${Number(tournament.entry_fee).toLocaleString('es')}`
                                            : 'INSCRIBIRSE'}
                                        onPress={handleJoin}
                                        loading={joining}
                                        uppercase={false}
                                    />
                                </>
                            ) : null}
                        </View>
                    ) : null}
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