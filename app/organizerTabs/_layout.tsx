import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../src/theme/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function OrganizerTabsLayout() {
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
                name="dashboard"
                options={{
                    title: "Panel",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="speedometer-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="tournaments"
                options={{
                    title: "Torneos",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="trophy-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="courts"
                options={{
                    title: "Canchas",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="business-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="payments"
                options={{
                    title: "Cobros",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="card-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="messages"
                options={{
                    title: "Mensajes",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="chatbubbles-outline" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="fixture"
                options={{
                    title: "Fixture",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="git-branch-outline" color={color} size={size} />
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