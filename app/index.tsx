import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../src/theme/index';

export default function Index() {
    const { profile, session, initialized } = useAuthStore();

    // Falta el perfil (se está cargando tras el sign-in): mostramos loader
    // en vez de volver a /login. Esto evita tener que iniciar sesión 2 veces.
    if (!initialized || (session && !profile)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    if (!session || !profile) {
        return <Redirect href="/login" />;
    }

    if (profile.role === 'organizer') {
        return <Redirect href="/organizerTabs/dashboard" />;
    }

    return <Redirect href="/athleteTabs" />;
}