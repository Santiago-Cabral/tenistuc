import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { NotificationBody } from './NotificationBody';
import { useContentBlur } from '../hooks/useContentBlur';
import { useDismissGesture } from '../hooks/useDismissGesture';
import { useDynamicNotifications } from '../hooks/useDynamicNotifications';
import { useNotificationContentStyle } from '../hooks/useNotificationContentStyle';
import type { INotificationContent } from '../types';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

/**
 * La tarjeta de contenido: se posiciona sobre la gota y se escala con la
 * animación. Se puede arrastrar hacia arriba para descartarla.
 */
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
    const blur = useContentBlur({ reveal });
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

                <AnimatedBlurView
                    pointerEvents="none"
                    tint="light"
                    blurMethod="dimezisBlurView"
                    animatedProps={blur.animatedProps}
                    style={[StyleSheet.absoluteFill, { borderRadius: layout.cardRadius }, styles.blur, blur.animatedStyle]}
                />
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
    blur: {
        borderCurve: 'continuous',
    },
});
