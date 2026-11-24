import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/services/appAlert';
import { useDoubles } from '../../src/hooks/useDoubles';
import { useAuthStore } from '../../src/stores/authStore';
import type { DoublesTeam } from '../../src/services/doublesService';
import {
    getOrCreateDoublesChat, keepDoublesTeam, leaveDoublesTeam, respondDoublesInvite,
} from '../../src/services/doublesService';
import { Colors, Typography, Spacing } from '../../src/theme';
import { Avatar, Badge, Button, Card, SectionHeader } from '../../src/components/ui';
import {
    DoublesScreen, DoublesEmpty, DoublesLoader, NavRow,
    TeamIdentity, TeamBadges, errorMessage,
} from '../../src/components/doubles/DoublesUi';

export default function DoublesIndexScreen() {
    const router = useRouter();
    const { profile } = useAuthStore();
    const {
        myTeams, receivedInvites, loading, refreshing, error, refresh, reload,
    } = useDoubles();
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        if (error) showAlert('Error', error);
    }, [error]);

    const readyTeam = useMemo(
        () => myTeams.find(team => team.status === 'ready') ?? null,
        [myTeams]
    );
    const receivedIds = useMemo(
        () => new Set(receivedInvites.map(team => team.id)),
        [receivedInvites]
    );
    const sentInvite = useMemo(() => {
        const invited = myTeams.filter(team => team.status === 'invited');
        return invited.find(team => team.created_by === profile?.id)
            ?? invited.find(team => !receivedIds.has(team.id))
            ?? null;
    }, [myTeams, profile?.id, receivedIds]);

    const handleRespond = async (team: DoublesTeam, accept: boolean) => {
        setBusyId(team.id);
        try {
            await respondDoublesInvite(team.id, accept);
            showAlert(
                accept ? '¡Listo!' : 'Invitación rechazada',
                accept ? 'Ya son pareja. ¡A jugar!' : 'La invitación quedó rechazada.'
            );
            reload();
        } catch (e) {
            showAlert('No se pudo responder', errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const handleKeep = async (team: DoublesTeam) => {
        setBusyId(team.id);
        try {
            const alreadyPermanent = await keepDoublesTeam(team.id);
            showAlert(
                alreadyPermanent ? '¡Dupla conservada!' : 'Esperando a tu compañero',
                alreadyPermanent
                    ? 'Tu dupla permanente ya está lista para desafiar.'
                    : 'Tu compañero todavía no confirmó. Cuando lo haga, la dupla queda guardada.'
            );
            reload();
        } catch (e) {
            showAlert('No se pudo conservar la dupla', errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const handleOpenChat = async (team: DoublesTeam) => {
        const key = `chat-${team.id}`;
        setBusyId(key);
        try {
            const chatId = await getOrCreateDoublesChat(team.id);
            router.push(`/chat/${chatId}` as any);
        } catch (e) {
            showAlert('No se pudo abrir el chat de la dupla', errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const handleLeave = (team: DoublesTeam, confirm = true) => {
        const leave = async () => {
            setBusyId(team.id);
            try {
                await leaveDoublesTeam(team.id);
                showAlert('Listo', 'Ya no estás en esa pareja.');
                reload();
            } catch (e) {
                showAlert('No se pudo salir de la pareja', errorMessage(e));
            } finally {
                setBusyId(null);
            }
        };

        if (!confirm) {
            leave();
            return;
        }
        showAlert('Salir de la pareja', '¿Estás seguro? La dupla se va a disolver.', [
            { text: 'No', style: 'cancel' },
            { text: 'Sí, salir', style: 'destructive', onPress: leave },
        ]);
    };

    return (
        <DoublesScreen
            title="Mi pareja"
            subtitle="Formá tu dupla y jugá en equipo"
            refreshing={refreshing}
            onRefresh={refresh}
        >
            {loading ? (
                <DoublesLoader label="Cargando tu pareja..." />
            ) : (
                <>
                    {readyTeam ? (
                        <Card style={styles.teamCard}>
                            <View style={styles.cardTop}>
                                <Text style={styles.eyebrow}>TU DUPLA</Text>
                                <Badge
                                    label={readyTeam.is_permanent ? 'DUPLA PERMANENTE' : 'DUPLA ACTIVA'}
                                    color={readyTeam.is_permanent ? Colors.primaryContainer : Colors.surfaceContainerHigh}
                                    textColor={readyTeam.is_permanent ? Colors.primary : Colors.onSurfaceVariant}
                                />
                            </View>
                            <TeamIdentity team={readyTeam} size={52} />
                            <TeamBadges team={readyTeam} />
                            <View style={styles.divider} />
                            <View style={styles.actions}>
                                <Button
                                    label="Desafiar"
                                    onPress={() => router.push('/doubles/teams' as any)}
                                    style={styles.primaryBtn}
                                />
                                <View style={styles.secondaryActions}>
                                    <Button
                                        label="Chat dupla"
                                        variant="secondary"
                                        uppercase={false}
                                        onPress={() => handleOpenChat(readyTeam)}
                                        loading={busyId === `chat-${readyTeam.id}`}
                                        disabled={busyId === `chat-${readyTeam.id}`}
                                        style={styles.actionBtn}
                                    />
                                    <Button
                                        label="Conservar dupla"
                                        variant="secondary"
                                        uppercase={false}
                                        onPress={() => handleKeep(readyTeam)}
                                        loading={busyId === readyTeam.id}
                                        disabled={busyId === readyTeam.id}
                                        style={styles.actionBtn}
                                    />
                                </View>
                            </View>
                            <Button
                                label="Salir de la pareja"
                                variant="ghost"
                                uppercase={false}
                                onPress={() => handleLeave(readyTeam)}
                                disabled={busyId === readyTeam.id}
                                style={styles.leaveBtn}
                            />
                        </Card>
                    ) : sentInvite ? (
                        <Card style={styles.waitingCard}>
                            <Badge
                                label="INVITACIÓN ENVIADA"
                                color={Colors.tertiaryContainer}
                                textColor={Colors.onTertiaryContainer}
                            />
                            <Ionicons name="time-outline" size={32} color={Colors.primary} />
                            <Text style={styles.waitingTitle}>
                                Esperando a que tu compañero responda
                            </Text>
                            <Text style={styles.waitingText}>
                                La invitación ya fue enviada. Te vamos a avisar cuando acepte.
                            </Text>
                            <Button
                                label="Cancelar"
                                variant="secondary"
                                uppercase={false}
                                onPress={() => handleLeave(sentInvite, false)}
                                loading={busyId === sentInvite.id}
                                disabled={busyId === sentInvite.id}
                                style={styles.waitingBtn}
                            />
                        </Card>
                    ) : (
                        <DoublesEmpty
                            icon="people-outline"
                            title="Todavía no tenés pareja"
                            message="Buscá rivales para encontrar compañero o mirá las duplas ya formadas."
                        >
                            <Button
                                label="Buscar rivales"
                                onPress={() => router.push('/athleteTabs/rivals' as any)}
                            />
                        </DoublesEmpty>
                    )}

                    <View style={styles.section}>
                        <SectionHeader title="Invitaciones recibidas" />
                        {receivedInvites.length === 0 ? (
                            <DoublesEmpty
                                icon="mail-outline"
                                title="Sin invitaciones"
                                message="Cuando alguien te invite a formar dupla, va a aparecer acá."
                            />
                        ) : receivedInvites.map(team => (
                            <Card key={team.id} style={styles.inviteCard}>
                                <View style={styles.inviteHeader}>
                                    <Avatar uri={team.p1?.avatar_url} size={44} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.inviteName}>
                                            {team.p1?.full_name ?? 'Un jugador'}
                                        </Text>
                                        <Text style={styles.inviteText}>
                                            Te invitó a formar una dupla
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.inviteActions}>
                                    <Button
                                        label="Rechazar"
                                        variant="secondary"
                                        uppercase={false}
                                        onPress={() => handleRespond(team, false)}
                                        loading={busyId === team.id}
                                        disabled={busyId === team.id}
                                        style={styles.inviteBtn}
                                    />
                                    <Button
                                        label="Aceptar"
                                        uppercase={false}
                                        onPress={() => handleRespond(team, true)}
                                        loading={busyId === team.id}
                                        disabled={busyId === team.id}
                                        style={styles.inviteBtn}
                                    />
                                </View>
                            </Card>
                        ))}
                    </View>

                    <View style={styles.section}>
                        <SectionHeader title="Explorar dobles" />
                        <NavRow
                            icon="trophy-outline"
                            label="Parejas y desafíos"
                            detail="Ranking de duplas permanentes"
                            onPress={() => router.push('/doubles/teams' as any)}
                        />
                        <NavRow
                            icon="flash-outline"
                            label="Desafíos abiertos"
                            detail="Aceptá retos o publicá el tuyo"
                            onPress={() => router.push('/doubles/open' as any)}
                        />
                    </View>
                </>
            )}
        </DoublesScreen>
    );
}

const styles = StyleSheet.create({
    teamCard: { gap: Spacing.md },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { ...Typography.labelLg, color: Colors.onSurfaceVariant, letterSpacing: 0.8 },
    divider: { height: 1, backgroundColor: Colors.surfaceContainerHigh },
    actions: { gap: Spacing.md },
    secondaryActions: { flexDirection: 'row', gap: Spacing.md },
    primaryBtn: { minHeight: 44, paddingHorizontal: Spacing.lg },
    actionBtn: { flex: 1, minHeight: 44, paddingHorizontal: Spacing.xs },
    leaveBtn: { alignSelf: 'center' },

    waitingCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
    waitingTitle: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 17,
        color: Colors.onSurface,
        textAlign: 'center',
    },
    waitingText: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
    },
    waitingBtn: { width: '70%' },

    section: { gap: Spacing.sm, marginTop: Spacing.md },
    inviteCard: { gap: Spacing.md },
    inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    inviteName: { fontFamily: 'Lexend_600SemiBold', fontSize: 15, color: Colors.onSurface },
    inviteText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    inviteActions: { flexDirection: 'row', gap: Spacing.sm },
    inviteBtn: { flex: 1 },
});
