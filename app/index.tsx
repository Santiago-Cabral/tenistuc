import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { Colors } from '../src/theme/index';

export default function Index() {
    const { profile, session, initialized, authError, fetchProfile, signOut } = useAuthStore();

    // Falta el perfil (se está cargando tras el sign-in): mostramos loader
    // en vez de volver a /login. Esto evita tener que iniciar sesión 2 veces.
    if (!initialized || (session && !profile && !authError)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    // No pudimos cargar el perfil con una sesión activa: mostramos el error
    // real en lugar de quedar en un loader infinito.
    if (session && !profile && authError) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface, padding: 24, gap: 16 }}>
                <Text style={{ color: Colors.onSurface, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
                    No pudimos cargar tu perfil
                </Text>
                <Text style={{ color: Colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>{authError}</Text>
                <Pressable
                    onPress={() => fetchProfile()}
                    style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
                </Pressable>
                <Pressable onPress={() => signOut()}>
                    <Text style={{ color: Colors.onSurfaceVariant, fontSize: 13 }}>Cerrar sesión</Text>
                </Pressable>
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
