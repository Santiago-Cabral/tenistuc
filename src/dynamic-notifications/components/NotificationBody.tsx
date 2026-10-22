import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../palette';
import { useDynamicNotifications } from '../hooks/useDynamicNotifications';
import type { INotificationBody } from '../types';

/**
 * Body por defecto de la notificación: avatar (o ícono en un círculo),
 * título y mensaje.
 */
export const NotificationBody = memo<INotificationBody>(({ notification }: INotificationBody) => {
    const context = useDynamicNotifications();
    const accent = notification.accent ?? context.accent;

    return (
        <View style={styles.body}>
            {notification.avatar ? (
                <Image
                    source={{ uri: notification.avatar }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={180}
                    cachePolicy="memory-disk"
                />
            ) : notification.icon ? (
                <View style={[styles.avatar, styles.avatarIcon, { backgroundColor: `${accent}1A` }]}>
                    <Ionicons name={notification.icon} size={24} color={accent} />
                </View>
            ) : (
                <View style={styles.avatar} />
            )}

            <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.title, { color: accent }]}>
                    {notification.title}
                </Text>
                {notification.message ? (
                    <Text numberOfLines={1} style={styles.message}>
                        {notification.message}
                    </Text>
                ) : null}
            </View>

            {notification.icon && notification.avatar ? (
                <Ionicons name={notification.icon} size={22} color={accent} />
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    body: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 13,
        paddingRight: 18,
        gap: 12,
    },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: PALETTE.avatar,
    },
    avatarIcon: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    copy: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.35,
    },
    message: {
        marginTop: 1,
        fontSize: 13.5,
        fontWeight: '500',
        letterSpacing: -0.2,
        color: PALETTE.message,
    },
});
