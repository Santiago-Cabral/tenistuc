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
import { Colors } from "../src/theme";
import { useNotifications } from "../src/hooks/useNotifications";
import { usePresence } from "../src/hooks/usePresence";
import { AppAlertHost } from "../src/services/appAlert";
import { ensureNotificationPermission } from "../src/notifications/notificationService";

export default function RootLayout() {
    const { initialize, initialized, session } = useAuthStore();
    const router = useRouter();
    const segments = useSegments();
    useNotifications();
    usePresence();

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
    }, [session, initialized]);

    if (!initialized || !fontsLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.surface }}>
                <ActivityIndicator color={Colors.primary} />
            </View>
        );
    }

    return (
        <>
            <Stack screenOptions={{ headerShown: false }} />
            <AppAlertHost />
        </>
    );
}