import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../src/theme/index';

export default function Index() {
    const { profile, initialized } = useAuthStore();

    if (!initialized) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    if (!profile) {
        return <Redirect href="/login" />;
    }

    if (profile.role === 'organizer') {
        return <Redirect href="/organizerTabs/dashboard" />;
    }

    return <Redirect href="/athleteTabs" />;
}