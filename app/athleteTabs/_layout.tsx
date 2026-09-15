import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../src/theme/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AthleteTabsLayout() {
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.onSurfaceVariant,
                tabBarStyle: {
                    height: 56 + insets.bottom,
                    paddingBottom: insets.bottom + 4,
                    paddingTop: 8,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Inicio",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="rivals"
                options={{
                    title: "Rivales",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="flash-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="ranking"
                options={{
                    title: "Ranking",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="trophy-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="tournament"
                options={{
                    title: "Torneos",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="calendar-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="messages"
                options={{
                    title: "Mensajes",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="chatbubble-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: "Perfil",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person-outline" color={color} size={size} />
                    ),
                }}
            />
        </Tabs>
    );
}