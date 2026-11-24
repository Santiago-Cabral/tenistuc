import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/services/appAlert';
import { useDoubles } from '../../src/hooks/useDoubles';
import type { DoublesChallenge } from '../../src/services/doublesService';
import {
    acceptDoublesChallenge, cancelDoublesChallenge, challengeDoubles, rejectDoublesChallenge,
    isAthleteChallenge,
} from '../../src/services/doublesService';
import { Colors, Typography, Spacing } from '../../src/theme';
import { Badge, Button, Card, SectionHeader } from '../../src/components/ui';
import {
    DoublesScreen, DoublesEmpty, DoublesLoader, DoublesNotice, ChallengeDetails,
    ChallengeFormModal, formatDate, teamLabel, errorMessage,
    type ChallengeFormPayload,
} from '../../src/components/doubles/DoublesUi';

interface ActionOptions {
    successTitle: string;
    successMessage: string;
    errorTitle: string;
    goToMatches?: boolean;
}

export default function DoublesOpenScreen() {
    const router = useRouter();
    const {
        myTeams, activeTeam, openChallenges, directChallenges,
        loading, refreshing, error, refresh, reload,
    } = useDoubles();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [publishVisible, setPublishVisible] = useState(false);

    useEffect(() => {
        if (error) showAlert('Error', error);
    }, [error]);

    const myTeamIds = new Set(myTeams.map(team => team.id));
    const isMine = (teamId: string | null | undefined) => !!teamId && myTeamIds.has(teamId);
    const canChallenge = activeTeam?.status === 'ready';

    const openSent = openChallenges.filter(
        challenge => isAthleteChallenge(challenge) && isMine(challenge.challenger_team_id)
    );
    const openReceived = openChallenges.filter(
        challenge => isAthleteChallenge(challenge) && !isMine(challenge.challenger_team_id)
    );
    const directReceived = directChallenges.filter(
        challenge => isAthleteChallenge(challenge) &&
            !!challenge.challenged_team_id && isMine(challenge.challenged_team_id)
    );
    const directSent = directChallenges.filter(
        challenge => isAthleteChallenge(challenge) &&
            !!challenge.challenged_team_id && isMine(challenge.challenger_team_id)
    );

    const requireReady = () => {
        if (canChallenge) return true;
        showAlert(
            'Necesitás una pareja',
            'Tené una dupla lista antes de aceptar o publicar desafíos.'
        );
        return false;
    };

    const execute = async (
        challengeId: string,
        action: () => Promise<unknown>,
        options: ActionOptions
    ) => {
        setBusyId(challengeId);
        try {
            await action();
            showAlert(options.successTitle, options.successMessage);
            reload();
            if (options.goToMatches) router.push('/matches' as any);
        } catch (e) {
            showAlert(options.errorTitle, errorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    const acceptOpen = (challenge: DoublesChallenge) => {
        if (!requireReady() || !activeTeam) return;
        execute(challenge.id, () => acceptDoublesChallenge(challenge.id, activeTeam.id), {
            successTitle: '¡Desafío aceptado!',
            successMessage: 'El partido ya está cargado en Mis Partidos.',
            errorTitle: 'No se pudo aceptar el desafío',
            goToMatches: true,
        });
    };

    const acceptDirect = (challenge: DoublesChallenge) => {
        execute(challenge.id, () => acceptDoublesChallenge(challenge.id), {
            successTitle: '¡Desafío aceptado!',
            successMessage: 'El partido ya está cargado en Mis Partidos.',
            errorTitle: 'No se pudo aceptar el desafío',
            goToMatches: true,
        });
    };

    const rejectDirect = (challenge: DoublesChallenge) => {
        execute(challenge.id, () => rejectDoublesChallenge(challenge.id), {
            successTitle: 'Desafío rechazado',
            successMessage: 'La otra pareja ya fue notificada.',
            errorTitle: 'No se pudo rechazar el desafío',
        });
    };

    const cancelChallenge = (challenge: DoublesChallenge) => {
        execute(challenge.id, () => cancelDoublesChallenge(challenge.id), {
            successTitle: 'Desafío cancelado',
            successMessage: 'El reto ya no está disponible.',
            errorTitle: 'No se pudo cancelar el desafío',
        });
    };

    const publishOpen = async ({ date, venue, message }: ChallengeFormPayload) => {
        if (!activeTeam || !canChallenge) return;
        try {
            await challengeDoubles({ teamId: activeTeam.id, date, venue, message });
            showAlert('¡Desafío publicado!', 'Ya está disponible para las otras parejas.');
            setPublishVisible(false);
            reload();
        } catch (e) {
            showAlert('No se pudo publicar el desafío', errorMessage(e));
        }
    };

    const renderCard = (
        challenge: DoublesChallenge,
        label: string,
        actions: React.ReactNode
    ) => (
        <Card key={challenge.id} style={styles.card}>
            <View style={styles.cardTop}>
                <Badge
                    label={label}
                    color={Colors.primaryContainer}
                    textColor={Colors.primary}
                />
                <Text style={styles.createdAt}>{formatDate(challenge.created_at)}</Text>
            </View>
            <ChallengeDetails challenge={challenge} />
            {challenge.challenged_team ? (
                <View style={styles.targetRow}>
                    <Ionicons name="swap-horizontal-outline" size={14} color={Colors.onSurfaceVariant} />
                    <Text style={styles.targetText}>
                        Desafiando a {teamLabel(challenge.challenged_team)}
                    </Text>
                </View>
            ) : null}
            {actions}
        </Card>
    );

    return (
        <DoublesScreen
            title="Desafíos"
            subtitle="Retos abiertos y directos de dobles"
            refreshing={refreshing}
            onRefresh={refresh}
        >
            <Button
                label="Publicar desafío abierto"
                uppercase={false}
                onPress={() => setPublishVisible(true)}
                disabled={!canChallenge}
            />
            {!canChallenge ? (
                <DoublesNotice text="Para aceptar o publicar desafíos necesitás una pareja lista. Armá tu dupla desde «Mi pareja»." />
            ) : null}

            {loading ? (
                <DoublesLoader label="Cargando desafíos..." />
            ) : (
                <>
                    <View style={styles.section}>
                        <SectionHeader title="Desafíos abiertos" />
                        {openReceived.length === 0 ? (
                            <DoublesEmpty
                                icon="flash-outline"
                                title="Sin desafíos abiertos"
                                message="Cuando otra pareja publique un reto, aparece acá."
                            />
                        ) : openReceived.map(challenge => renderCard(
                            challenge,
                            'ABIERTO',
                            <Button
                                label="Aceptar"
                                uppercase={false}
                                onPress={() => acceptOpen(challenge)}
                                loading={busyId === challenge.id}
                                disabled={busyId === challenge.id || !canChallenge}
                            />
                        ))}

                        <Text style={styles.subHeader}>Enviados</Text>
                        {openSent.length === 0 ? (
                            <DoublesEmpty
                                icon="paper-plane-outline"
                                title="No publicaste desafíos"
                                message="Publicá un reto abierto para invitar a otras duplas."
                            />
                        ) : openSent.map(challenge => renderCard(
                            challenge,
                            'ENVIADO',
                            <Button
                                label="Cancelar"
                                variant="secondary"
                                uppercase={false}
                                onPress={() => cancelChallenge(challenge)}
                                loading={busyId === challenge.id}
                                disabled={busyId === challenge.id}
                            />
                        ))}
                    </View>

                    <View style={styles.section}>
                        <SectionHeader title="Desafíos directos" />

                        <Text style={styles.subHeader}>Recibidos</Text>
                        {directReceived.length === 0 ? (
                            <DoublesEmpty
                                icon="mail-outline"
                                title="Sin desafíos directos"
                                message="Los retos que otra pareja te mande aparecen acá."
                            />
                        ) : directReceived.map(challenge => renderCard(
                            challenge,
                            'RECIBIDO',
                            <View style={styles.actionRow}>
                                <Button
                                    label="Rechazar"
                                    variant="secondary"
                                    uppercase={false}
                                    onPress={() => rejectDirect(challenge)}
                                    loading={busyId === challenge.id}
                                    disabled={busyId === challenge.id}
                                    style={styles.actionBtn}
                                />
                                <Button
                                    label="Aceptar"
                                    uppercase={false}
                                    onPress={() => acceptDirect(challenge)}
                                    loading={busyId === challenge.id}
                                    disabled={busyId === challenge.id}
                                    style={styles.actionBtn}
                                />
                            </View>
                        ))}

                        <Text style={styles.subHeader}>Enviados</Text>
                        {directSent.length === 0 ? (
                            <DoublesEmpty
                                icon="send-outline"
                                title="Sin desafíos enviados"
                                message="Cuando desafíes a una pareja, el reto aparece acá."
                            />
                        ) : directSent.map(challenge => renderCard(
                            challenge,
                            'ENVIADO',
                            <Button
                                label="Cancelar"
                                variant="secondary"
                                uppercase={false}
                                onPress={() => cancelChallenge(challenge)}
                                loading={busyId === challenge.id}
                                disabled={busyId === challenge.id}
                            />
                        ))}
                    </View>
                </>
            )}

            <ChallengeFormModal
                visible={publishVisible}
                title="Publicar desafío abierto"
                subtitle="Cualquier pareja va a poder aceptarlo"
                onClose={() => setPublishVisible(false)}
                onSubmit={publishOpen}
            />
        </DoublesScreen>
    );
}

const styles = StyleSheet.create({
    card: { gap: Spacing.md },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    createdAt: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    section: { gap: Spacing.sm },
    subHeader: {
        fontFamily: 'Lexend_600SemiBold',
        fontSize: 14,
        color: Colors.onSurface,
        marginTop: Spacing.sm,
    },
    targetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    targetText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
    actionRow: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: { flex: 1 },
});
