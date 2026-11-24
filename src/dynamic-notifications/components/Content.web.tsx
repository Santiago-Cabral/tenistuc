import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { NotificationBody } from './NotificationBody';
import { useDismissGesture } from '../hooks/useDismissGesture';
import { useDynamicNotifications } from '../hooks/useDynamicNotifications';
import { useNotificationContentStyle } from '../hooks/useNotificationContentStyle';
import type { INotificationContent } from '../types';

export const Content = memo<INotificationContent>(({ style }) => {
    const { layout, notification, isVisible, drop, expand, reveal, dragY, dismiss } =
        useDynamicNotifications();

    const animated = useNotificationContentStyle({
        drop,
        expand,
        reveal,
        offset: dragY,
        layout,
    });
    const gesture = useDismissGesture({
        offset: dragY,
        onDismiss: dismiss,
        onPress: notification?.onPress,
    });

    if (!notification) return null;

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                pointerEvents={isVisible ? 'auto' : 'none'}
                style={[
                    styles.content,
                    {
                        top: layout.cardTop,
                        left: layout.cardLeft,
                        width: layout.cardWidth,
                        height: layout.cardHeight,
                        borderRadius: layout.cardRadius,
                    },
                    animated,
                    style,
                ]}
            >
                {notification.render ? (
                    notification.render(notification)
                ) : (
                    <NotificationBody notification={notification} />
                )}
            </Animated.View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    content: {
        position: 'absolute',
        overflow: 'hidden',
        borderCurve: 'continuous',
    },
});
