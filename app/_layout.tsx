import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useAuthStore } from "../src/stores/authStore";
import { useFonts } from "expo-font";
import {
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
} from "@expo-google-fonts/lexend";
import {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Colors } from "../src/theme";
import { useNotifications } from "../src/hooks/useNotifications";
import { usePresence } from "../src/hooks/usePresence";
import { useLiveProfile } from "../src/hooks/useLiveProfile";
import { useDynamicNotificationFeed } from "../src/hooks/useDynamicNotificationFeed";
import { DynamicNotifications, PALETTE } from "../src/dynamic-notifications";
import { AppAlertHost } from "../src/services/appAlert";
import { ensureNotificationPermission } from "../src/notifications/notificationService";

export default function RootLayout() {
    const { initialize, initialized, session } = useAuthStore();
    const router = useRouter();
    const segments = useSegments();
    useNotifications();
    usePresence();
    useLiveProfile();

    const [fontsLoaded] = useFonts({
        Lexend_500Medium,
        Lexend_600SemiBold,
        Lexend_700Bold,
        Lexend_800ExtraBold,
        PlusJakartaSans_400Regular,
        PlusJakartaSans_500Medium,
        PlusJakartaSans_600SemiBold,
    });

    useEffect(() => {
        initialize();
    }, []);

    // Pedir permiso de notificaciones apenas abre la app (independiente del login)
    useEffect(() => {
        ensureNotificationPermission().catch(() => {});
    }, []);

    useEffect(() => {
        if (!initialized) return;

        const seg0 = segments[0] as string | undefined;

        // El link del mail de recuperación crea la sesión en esta pantalla: no redirigir
        if (seg0 === "reset-password") return;

        const inAuthScreens =
            seg0 === "login" ||
            seg0 === "register" ||
            seg0 === "forgot-password" ||
            seg0 === "auth";

        if (!session && !inAuthScreens) {
            router.replace("/login");
        }

        if (session && inAuthScreens) {
            router.replace("/");
        }
    }, [session, initialized, segments, router]);

    if (!initialized || !fontsLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.surface }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    return (
        // GestureHandlerRootView es obligatorio para que funcione el gesto de
        // descartar (arrastrar) de la notificación dinámica.
        <GestureHandlerRootView style={{ flex: 1 }}>
            <DynamicNotifications
                accent={Colors.primary}
                islandColor={Colors.primary}
                cardColor={PALETTE.card}
                shadowColor={PALETTE.shadow}
            >
                <AppShell />
            </DynamicNotifications>
        </GestureHandlerRootView>
    );
}

/**
 * Va dentro de <DynamicNotifications> porque usa useDynamicNotificationFeed(),
 * que necesita el contexto del overlay para disparar las notificaciones.
 */
function AppShell() {
    useDynamicNotificationFeed();

    return (
        <>
            <Stack screenOptions={{ headerShown: false }} />
            <AppAlertHost />
        </>
    );
}