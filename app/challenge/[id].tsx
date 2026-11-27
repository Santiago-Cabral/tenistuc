// app/challenge/[id].tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Modal,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography, Spacing, Radius } from '../../src/theme';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { useChallenges, Challenge, ChallengeProfile } from '../../src/hooks/useChallenges';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { Avatar } from '../../src/components/ui/Avatar';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { MATCH_TYPE_LABELS, affectsElo } from '../../src/services/matchService';
import { isActuallyOnline } from '../../src/services/presenceService';
import { VenueChips } from '../../src/components/ui/VenueChips';
import { CUSTOM_VENUE, normalizeVenue } from '../../src/constants/venues';

const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; textColor: string }
> = {
    pending: { label: 'Pendiente', color: Colors.tertiaryContainer, textColor: Colors.tertiary },
    accepted: { label: 'Aceptado', color: Colors.primaryContainer, textColor: Colors.primaryDim },
    rejected: { label: 'Rechazado', color: '#F9DEDC', textColor: Colors.error },
    expired: { label: 'Expirado', color: Colors.surfaceContainerHigh, textColor: Colors.onSurfaceVariant },
};

function formatDate(value: string | null): string {
    if (!value) return 'Sin fecha propuesta';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// Convierte "2026-06-20 18:00" (lo que escribe el usuario) a ISO 8601.
// Es hora LOCAL interpretada sin zona horaria → se manda a timestamptz.
function parseLocalDateTime(input: string): string | null {
    const m = input.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[\sT](\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m;
    const date = new Date(+y, +mo - 1, +d, +h, +mi);
    if (isNaN(date.getTime())) return null;
    if (
        date.getFullYear() !== +y ||
        date.getMonth() !== +mo - 1 ||
        date.getDate() !== +d
    ) return null;
    return date.toISOString();
}

// Convierte ISO 8601 (timestamptz guardado en DB) a "YYYY-MM-DD HH:MM" en hora
// local, el mismo formato que acepta parseLocalDateTime. Así el prefill del
// repropose no se rompe con el sufijo de zona horaria que devuelve PostgREST.
function formatLocalDateTime(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DOUBLES_PROFILE_FIELDS = 'id, full_name, avatar_url, elo, level, is_online, last_seen';

function isDoublesChallenge(c: Challenge | null): boolean {
    if (!c) return false;
    return c.match_format === 'doubles'
        || (!!c.team1_id && !!c.team2_id)
        || (!!c.challenger_team_id && !!c.challenged_team_id)
        || !!(c.partner1_id || c.partner2_id || c.challenger_partner_id || c.challenged_partner_id);
}

function getDoublesPartnerIds(c: Challenge): { challenger: string | null; challenged: string | null } {
    return {
        challenger: c.partner1_id ?? c.challenger_partner_id ?? null,
        challenged: c.partner2_id ?? c.challenged_partner_id ?? null,
    };
}

function ChallengeSkeleton() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.headerRow}>
                <Skeleton width={26} height={26} radius={Radius.full} />
                <Skeleton width={100} height={20} />
                <Skeleton width={26} height={26} radius={Radius.full} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Card style={styles.playersCard}>
                    <View style={styles.skeletonPlayer}>
                        <Skeleton width={64} height={64} radius={Radius.full} />
                        <Skeleton width="80%" height={14} />
                        <Skeleton width={44} height={11} />
                    </View>
                    <Skeleton width={24} height={18} />
                    <View style={styles.skeletonPlayer}>
                        <Skeleton width={64} height={64} radius={Radius.full} />
                        <Skeleton width="80%" height={14} />
                        <Skeleton width={44} height={11} />
                    </View>
                </Card>

                <Skeleton width={96} height={26} radius={Radius.full} />

                <Card style={styles.detailsCard}>
                    {[0, 1, 2].map((item) => (
                        <React.Fragment key={item}>
                            <View style={styles.skeletonDetailRow}>
                                <Skeleton width={20} height={20} radius={Radius.full} />
                                <View style={styles.detailTextCol}>
                                    <Skeleton width={90} height={11} />
                                    <Skeleton width="65%" height={16} />
                                </View>
                            </View>
                            {item < 2 && <View style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </Card>

                <View style={styles.actionsCol}>
                    <Skeleton height={48} radius={Radius.lg} />
                    <Skeleton height={48} radius={Radius.lg} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export default function ChallengeDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { profile } = useAuthStore();
    const {
        getChallenge,
        acceptChallenge,
        rejectChallenge,
        cancelChallenge,
        reproposeChallenge,
    } = useChallenges();

    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [doublesProfiles, setDoublesProfiles] = useState<Record<string, ChallengeProfile>>({});
    const [fetching, setFetching] = useState(true);
    const [actionLoading, setActionLoading] = useState<
        'accept' | 'reject' | 'cancel' | 'repropose' | null
    >(null);

    const [reproposeVisible, setReproposeVisible] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newVenue, setNewVenue] = useState('');
    const [customVenue, setCustomVenue] = useState('');

    const hasLoadedRef = useRef(false);
    const requestRef = useRef(0);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        if (!id) {
            setFetching(false);
            return;
        }
        if (!hasLoadedRef.current) setFetching(true);
        const request = ++requestRef.current;
        const data = await getChallenge(id);
        if (request !== requestRef.current) return;
        setChallenge(data);
        setDoublesProfiles({});
        if (data && isDoublesChallenge(data)) {
            const partnerIds = getDoublesPartnerIds(data);
            const ids = [partnerIds.challenger, partnerIds.challenged]
                .filter((v): v is string => !!v);
            if (ids.length) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select(DOUBLES_PROFILE_FIELDS)
                    .in('id', ids);
                if (request !== requestRef.current) return;
                const byId: Record<string, ChallengeProfile> = {};
                (profiles ?? []).forEach((p: any) => { byId[p.id] = p as ChallengeProfile; });
                setDoublesProfiles(byId);
            }
        }
        hasLoadedRef.current = true;
        setFetching(false);
    }, [id, getChallenge]);

    const scheduleLoad = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            load();
        }, 120);
    }, [load]);

    useEffect(() => {
        hasLoadedRef.current = false;
        load();
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, [load]);

    useLiveRefresh('challenges', scheduleLoad, id ? `id=eq.${id}` : undefined);

    if (fetching) return <ChallengeSkeleton />;

    if (!challenge) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={40} color={Colors.onSurfaceVariant} />
                    <Text style={styles.emptyText}>No se encontró el desafío</Text>
                </View>
            </SafeAreaView>
        );
    }

    const isChallenger = profile?.id === challenge.challenger_id;
    const isChallenged = profile?.id === challenge.challenged_id;
    const rival: ChallengeProfile | undefined = isChallenger
        ? challenge.challenged
        : challenge.challenger;
    const me: ChallengeProfile | undefined = isChallenger
        ? challenge.challenger
        : challenge.challenged;

    const isDoubles = isDoublesChallenge(challenge);
    const doublesPartnerIds = isDoubles ? getDoublesPartnerIds(challenge) : null;
    const challengerPartner = doublesPartnerIds?.challenger
        ? doublesProfiles[doublesPartnerIds.challenger] : undefined;
    const challengedPartner = doublesPartnerIds?.challenged
        ? doublesProfiles[doublesPartnerIds.challenged] : undefined;

    const isPending = challenge.status === 'pending';
    const lastProposalIsMine = challenge.proposed_by === profile?.id;
    const canRespond = isPending && !lastProposalIsMine && (isChallenger || isChallenged);
    const canCancel = isPending && isChallenger;
    const statusInfo = STATUS_CONFIG[challenge.status] ?? STATUS_CONFIG.expired;

    const handleAccept = async () => {
        setActionLoading('accept');
        const ok = await acceptChallenge(challenge.id);
        setActionLoading(null);
        if (ok) {
            showAlert('Listo', 'Desafío aceptado, el partido fue agendado.');
            scheduleLoad();
        } else {
            showAlert('No se pudo aceptar', 'Intentá de nuevo en unos segundos.');
        }
    };

    const handleReject = async () => {
        showAlert('Rechazar desafío', '¿Seguro que querés rechazar este desafío?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Rechazar',
                style: 'destructive',
                onPress: async () => {
                    setActionLoading('reject');
                    const ok = await rejectChallenge(challenge.id);
                    setActionLoading(null);
                    if (ok) scheduleLoad();
                },
            },
        ]);
    };

    const handleCancel = async () => {
        showAlert('Cancelar desafío', '¿Querés cancelar este desafío?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Sí, cancelar',
                style: 'destructive',
                onPress: async () => {
                    setActionLoading('cancel');
                    const ok = await cancelChallenge(challenge.id);
                    setActionLoading(null);
                    if (ok) scheduleLoad();
                },
            },
        ]);
    };

    const openRepropose = () => {
        setNewDate(formatLocalDateTime(challenge.proposed_date));
        const venue = normalizeVenue(challenge.proposed_venue);
        setNewVenue(venue ?? (challenge.proposed_venue && challenge.proposed_venue !== CUSTOM_VENUE ? CUSTOM_VENUE : ''));
        setCustomVenue(venue || !challenge.proposed_venue || challenge.proposed_venue === CUSTOM_VENUE ? '' : challenge.proposed_venue);
        setReproposeVisible(true);
    };

    const handleRepropose = async () => {
        const venue = newVenue === CUSTOM_VENUE ? customVenue.trim() : newVenue;
        if (!newDate || !venue) {
            showAlert('Falta info', 'Elegí fecha y sede');
            return;
        }
        const iso = parseLocalDateTime(newDate);
        if (!iso) {
            showAlert('Fecha inválida', 'Usá el formato 2026-06-20 18:00');
            return;
        }
        setActionLoading('repropose');
        const ok = await reproposeChallenge({
            challengeId: challenge.id,
            proposedDate: iso,
            proposedVenue: venue,
        });
        setActionLoading(null);
        if (ok) {
            setReproposeVisible(false);
            scheduleLoad();
        } else {
            showAlert('No se pudo actualizar', 'Intentá de nuevo.');
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Desafío</Text>
                <View style={{ width: 26 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Card style={styles.playersCard}>
                    {isDoubles ? (
                        <>
                            <View style={styles.doublesTeamCol}>
                                <Text style={styles.doublesTeamLabel}>
                                    Pareja A{isChallenger ? ' (vos)' : ''}
                                </Text>
                                <Avatar
                                    uri={challenge.challenger?.avatar_url ?? null} size={56}
                                    online={isActuallyOnline(challenge.challenger)}
                                />
                                <Text style={styles.playerName}>
                                    {challenge.challenger?.full_name ?? '?'}
                                </Text>
                                <Avatar
                                    uri={challengerPartner?.avatar_url ?? null} size={44}
                                    online={isActuallyOnline(challengerPartner)}
                                />
                                <Text style={styles.playerName}>
                                    {challengerPartner?.full_name ?? '?'}
                                </Text>
                            </View>

                            <View style={styles.vsCol}>
                                <Text style={styles.vsText}>VS</Text>
                                <Ionicons name="tennisball-outline" size={20} color={Colors.primary} />
                            </View>

                            <View style={styles.doublesTeamCol}>
                                <Text style={styles.doublesTeamLabel}>
                                    Pareja B{isChallenged ? ' (vos)' : ''}
                                </Text>
                                <Avatar
                                    uri={challenge.challenged?.avatar_url ?? null} size={56}
                                    online={isActuallyOnline(challenge.challenged)}
                                />
                                <Text style={styles.playerName}>
                                    {challenge.challenged?.full_name ?? '?'}
                                </Text>
                                <Avatar
                                    uri={challengedPartner?.avatar_url ?? null} size={44}
                                    online={isActuallyOnline(challengedPartner)}
                                />
                                <Text style={styles.playerName}>
                                    {challengedPartner?.full_name ?? '?'}
                                </Text>
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={styles.playerCol}>
                                <Avatar uri={me?.avatar_url ?? null} size={64} online={isActuallyOnline(me)} />
                                <Text style={styles.playerName}>{me?.full_name ?? 'Vos'}</Text>
                                <Text style={styles.playerLevel}>{me?.level}</Text>
                            </View>

                            <View style={styles.vsCol}>
                                <Text style={styles.vsText}>VS</Text>
                                <Ionicons name="tennisball-outline" size={20} color={Colors.primary} />
                            </View>

                            <View style={styles.playerCol}>
                                <Avatar uri={rival?.avatar_url ?? null} size={64} online={isActuallyOnline(rival)} />
                                <Text style={styles.playerName}>{rival?.full_name ?? 'Rival'}</Text>
                                <Text style={styles.playerLevel}>{rival?.level}</Text>
                            </View>
                        </>
                    )}
                </Card>

                <View style={styles.statusRow}>
                    <Badge
                        label={statusInfo.label}
                        color={statusInfo.color}
                        textColor={statusInfo.textColor}
                    />
                    {isPending && (
                        <Text style={styles.proposedByText}>
                            {lastProposalIsMine
                                ? 'Esperando confirmación del rival'
                                : 'Propuesta a tu favor, podés responder'}
                        </Text>
                    )}
                </View>

                <Card style={styles.detailsCard}>
                    <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                        <View style={styles.detailTextCol}>
                            <Text style={styles.detailLabel}>Fecha y hora</Text>
                            <Text style={styles.detailValue}>
                                {formatDate(challenge.proposed_date)}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.detailRow}>
                        <Ionicons name="location-outline" size={20} color={Colors.primary} />
                        <View style={styles.detailTextCol}>
                            <Text style={styles.detailLabel}>Sede</Text>
                            <Text style={styles.detailValue}>
                                {challenge.proposed_venue ?? 'Sin definir'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.detailRow}>
                        <Ionicons
                            name={affectsElo(challenge.match_type) ? 'trophy-outline' : 'tennisball-outline'}
                            size={20}
                            color={Colors.primary}
                        />
                        <View style={styles.detailTextCol}>
                            <Text style={styles.detailLabel}>Tipo de desafío</Text>
                            <Text style={styles.detailValue}>
                                {MATCH_TYPE_LABELS[challenge.match_type] ?? challenge.match_type}
                            </Text>
                            {challenge.match_type === 'competitive' && (
                                <Text style={styles.detailHint}>El ganador suma 5 puntos.</Text>
                            )}
                        </View>
                    </View>

                    {!!challenge.message && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Ionicons
                                    name="chatbubble-ellipses-outline"
                                    size={20}
                                    color={Colors.primary}
                                />
                                <View style={styles.detailTextCol}>
                                    <Text style={styles.detailLabel}>Mensaje</Text>
                                    <Text style={styles.detailValue}>{challenge.message}</Text>
                                </View>
                            </View>
                        </>
                    )}
                </Card>

                {isPending && (
                    <View style={styles.actionsCol}>
                        {canRespond && (
                            <>
                                <Button
                                    label="Aceptar desafío"
                                    onPress={handleAccept}
                                    loading={actionLoading === 'accept'}
                                    disabled={!!actionLoading}
                                />
                                <Button
                                    label="Proponer otra fecha/sede"
                                    onPress={openRepropose}
                                    variant="secondary"
                                    disabled={!!actionLoading}
                                />
                                <Button
                                    label="Rechazar"
                                    onPress={handleReject}
                                    variant="ghost"
                                    loading={actionLoading === 'reject'}
                                    disabled={!!actionLoading}
                                />
                            </>
                        )}

                        {lastProposalIsMine && !canCancel && (
                            <Text style={styles.waitingText}>
                                Esperando que {rival?.full_name ?? 'el rival'} confirme tu propuesta.
                            </Text>
                        )}

                        {canCancel && (
                            <Button
                                label="Cancelar desafío"
                                onPress={handleCancel}
                                variant="ghost"
                                loading={actionLoading === 'cancel'}
                                disabled={!!actionLoading}
                            />
                        )}
                    </View>
                )}

                {challenge.status === 'accepted' && challenge.match_id && (
                    <Button
                        label="Ver partido"
                        onPress={() => router.push(`/matches` as any)}
                        style={{ marginTop: Spacing.lg }}
                    />
                )}
            </ScrollView>

            <Modal visible={reproposeVisible} transparent animationType="slide">
                <View style={styles.overlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Nueva propuesta</Text>

                        <TextInput
                            placeholder="Fecha y hora (2026-06-20 18:00)"
                            placeholderTextColor={Colors.onSurfaceVariant}
                            value={newDate}
                            onChangeText={setNewDate}
                            style={styles.input}
                        />

                        <Text style={styles.modalLabel}>Sede</Text>
                        <ScrollView style={styles.venueScroll}>
                            <VenueChips selected={newVenue || null} onSelect={setNewVenue} />
                        </ScrollView>
                        {newVenue === CUSTOM_VENUE && (
                            <TextInput
                                placeholder="Escribí el lugar..."
                                placeholderTextColor={Colors.onSurfaceVariant}
                                value={customVenue}
                                onChangeText={setCustomVenue}
                                style={styles.input}
                            />
                        )}

                        <View style={styles.modalActions}>
                            <Button
                                label="Cancelar"
                                onPress={() => setReproposeVisible(false)}
                                variant="ghost"
                                style={{ flex: 1 }}
                            />
                            <Button
                                label="Enviar"
                                onPress={handleRepropose}
                                loading={actionLoading === 'repropose'}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
    emptyText: { ...Typography.titleMd, color: Colors.onSurfaceVariant },

    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.base,
    },
    headerTitle: { ...Typography.titleMd, color: Colors.onSurface },

    content: { padding: Spacing.lg, paddingBottom: Spacing.xxxxl, gap: Spacing.lg },

    playersCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.xl,
    },
    playerCol: { flex: 1, alignItems: 'center', gap: Spacing.xs },
    doublesTeamCol: { flex: 1, alignItems: 'center', gap: Spacing.xs },
    doublesTeamLabel: { ...Typography.labelSm, color: Colors.primary, textAlign: 'center' },
    playerName: { ...Typography.labelLg, color: Colors.onSurface, textAlign: 'center' },
    playerLevel: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    vsCol: { alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm },
    vsText: { ...Typography.titleMd, color: Colors.primary },

    skeletonPlayer: { flex: 1, alignItems: 'center', gap: Spacing.sm },
    skeletonDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.base },

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, flexWrap: 'wrap' },
    proposedByText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, flex: 1 },

    detailsCard: { gap: Spacing.base },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.base },
    detailTextCol: { flex: 1, gap: 2 },
    detailLabel: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    detailValue: { ...Typography.bodyLg, color: Colors.onSurface },
    detailHint: { ...Typography.bodySm, color: Colors.primary, marginTop: 2 },
    divider: { height: 1, backgroundColor: Colors.surfaceContainerHigh },

    actionsCol: { gap: Spacing.base },
    waitingText: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
        paddingVertical: Spacing.base,
    },

    overlay: {
        flex: 1,
        backgroundColor: '#0008',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    modalContainer: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.lg,
        padding: Spacing.xl,
        gap: Spacing.base,
    },
    modalTitle: { ...Typography.titleMd, color: Colors.onSurface },
    modalLabel: { ...Typography.labelLg, color: Colors.onSurface, marginTop: Spacing.sm },
    input: {
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHigh,
        borderRadius: Radius.md,
        padding: Spacing.base,
        color: Colors.onSurface,
        ...Typography.bodyMd,
    },
    venueScroll: { maxHeight: 260 },
    modalActions: { flexDirection: 'row', gap: Spacing.base, marginTop: Spacing.base },
});