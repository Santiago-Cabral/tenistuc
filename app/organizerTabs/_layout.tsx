import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../src/theme/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, StyleSheet, Platform } from "react-native";
import { useUnreadMessagesCount } from "../../src/hooks/useNotifications";

export default function OrganizerTabsLayout() {
    const insets = useSafeAreaInsets();
    const unreadMessages = useUnreadMessagesCount();
    const isWeb = Platform.OS === "web";

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.onSurfaceVariant,
                tabBarStyle: {
                    height: isWeb ? 76 : 56 + insets.bottom,
                    paddingBottom: isWeb ? 24 : insets.bottom + 4,
                    paddingTop: 8,
                },
                tabBarLabelStyle: isWeb ? { fontSize: 9, marginTop: 1 } : undefined,
                tabBarItemStyle: isWeb ? { paddingHorizontal: 0 } : undefined,
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: "Panel",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="speedometer-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="tournaments"
                options={{
                    title: "Torneos",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="trophy-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="courts"
                options={{
                    title: "Canchas",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="business-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="payments"
                options={{
                    title: "Jugadores",
                    tabBarLabel: isWeb ? "Jugador" : "Jugadores",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="people-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="messages"
                options={{
                    title: "Mensajes",
                    tabBarLabel: isWeb ? "Chats" : "Mensajes",
                    tabBarIcon: ({ color, size }) => (
                        <View>
                            <Ionicons name="chatbubbles-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                            {unreadMessages > 0 && <View style={styles.dot} />}
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="fixture"
                options={{
                    title: "Fixture",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="git-branch-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: "Perfil",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    dot: {
        position: "absolute",
        top: -2,
        right: -3,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.error,
        borderWidth: 1.5,
        borderColor: Colors.surface,
    },
});