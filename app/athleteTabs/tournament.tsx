import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';
import OrganizerScreen from '../../src/screens/organizer/OrganizerScreen';
import PlayerTournamentsScreen from '../../src/screens/athlete/PlayerTournamentsScreen';
import { Colors } from '../../src/theme/index';

export default function TournamentTab() {
    const role = useAuthStore(s => s.profile?.role);

    if (!role) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    return role === 'organizer' ? <OrganizerScreen /> : <PlayerTournamentsScreen />;
}