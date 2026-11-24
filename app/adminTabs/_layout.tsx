import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function AdminTabsLayout() {
    const insets = useSafeAreaInsets();
    const isWeb = Platform.OS === 'web';

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
                tabBarLabelStyle: isWeb ? { fontSize: 10, marginTop: 2 } : undefined,
                tabBarItemStyle: isWeb ? { paddingHorizontal: 2 } : undefined,
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: 'Panel',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="speedometer-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="users"
                options={{
                    title: 'Usuarios',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="people-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="tournaments"
                options={{
                    title: 'Torneos',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="trophy-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="account"
                options={{
                    title: 'Cuenta',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="shield-checkmark-outline" color={typeof color === 'string' ? color : Colors.onSurfaceVariant} size={size} />
                    ),
                }}
            />
        </Tabs>
    );
}
