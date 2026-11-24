import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { showAlert } from '../../src/services/appAlert';
import { useDoubles } from '../../src/hooks/useDoubles';
import type { DoublesTeam } from '../../src/services/doublesService';
import { challengeDoubles, isAthleteTeam } from '../../src/services/doublesService';
import { Colors, Typography, Spacing } from '../../src/theme';
import { Button, Card, SectionHeader } from '../../src/components/ui';
import {
    DoublesScreen, DoublesEmpty, DoublesLoader, DoublesNotice,
    TeamIdentity, TeamBadges, ChallengeFormModal, teamLabel, errorMessage,
    type ChallengeFormPayload,
} from '../../src/components/doubles/DoublesUi';

export default function DoublesTeamsScreen() {
    const {
        activeTeam, permanentTeams, loading, refreshing, error, refresh, reload,
    } = useDoubles();
    const [selectedTeam, setSelectedTeam] = useState<DoublesTeam | null>(null);

    useEffect(() => {
        if (error) showAlert('Error', error);
    }, [error]);

    const myIds = useMemo(
        () => new Set(
            [activeTeam?.player1_id, activeTeam?.player2_id]
                .filter((id): id is string => !!id)
        ),
        [activeTeam]
    );
    const teams = useMemo(
        () => permanentTeams.filter(team =>
            isAthleteTeam(team) && !myIds.has(team.player1_id) && !myIds.has(team.player2_id)
        ),
        [permanentTeams, myIds]
    );
    const canChallenge = activeTeam?.status === 'ready';

    const submitChallenge = async ({ date, venue, message }: ChallengeFormPayload) => {
        if (!activeTeam || !selectedTeam || !canChallenge) return;
        try {
            await challengeDoubles({
                teamId: activeTeam.id,
                targetTeamId: selectedTeam.id,
                date,
                venue,
                message,
            });
            showAlert('¡Desafío enviado!', `Le avisamos a ${teamLabel(selectedTeam)}.`);
            setSelectedTeam(null);
            reload();
        } catch (e) {
            showAlert('No se pudo enviar el desafío', errorMessage(e));
        }
    };

    return (
        <DoublesScreen
            title="Parejas"
            subtitle="Ranking de duplas permanentes"
            refreshing={refreshing}
            onRefresh={refresh}
        >
            {!canChallenge ? (
                <DoublesNotice text="Necesitás una pareja lista para desafiar. Armá tu dupla desde «Mi pareja»." />
            ) : null}

            {loading ? (
                <DoublesLoader label="Cargando parejas..." />
            ) : (
                <>
                    <SectionHeader title="Ranking por ELO" />
                    {teams.length === 0 ? (
                        <DoublesEmpty
                            icon="trophy-outline"
                            title="No hay parejas para desafiar"
                            message="Todavía no hay duplas permanentes disponibles. Volvé a mirar más tarde."
                        />
                    ) : teams.map((team, index) => (
                        <Card key={team.id} style={styles.card}>
                            <View style={styles.topRow}>
                                <Text style={styles.rank}>#{index + 1}</Text>
                                <TeamIdentity team={team} size={42} />
                            </View>
                            <TeamBadges team={team} />
                            <Button
                                label="Desafiar"
                                uppercase={false}
                                onPress={() => setSelectedTeam(team)}
                                disabled={!canChallenge}
                                style={styles.challengeBtn}
                            />
                        </Card>
                    ))}
                </>
            )}

            <ChallengeFormModal
                visible={!!selectedTeam}
                title="Desafiar pareja"
                subtitle={selectedTeam ? `vs. ${teamLabel(selectedTeam)}` : undefined}
                onClose={() => setSelectedTeam(null)}
                onSubmit={submitChallenge}
            />
        </DoublesScreen>
    );
}

const styles = StyleSheet.create({
    card: { gap: Spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    rank: { ...Typography.titleLg, color: Colors.primary, minWidth: 38 },
    challengeBtn: { alignSelf: 'flex-start' },
});
