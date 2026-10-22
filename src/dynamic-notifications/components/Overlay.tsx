import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Content } from './Content';
import { Gooey } from './Gooey';
import { useDynamicNotifications } from '../hooks/useDynamicNotifications';
import type { INotificationOverlay } from '../types';

/**
 * Capa que se dibuja por encima de la app: el efecto gooey (Skia) y la
 * tarjeta de contenido.
 */
export const Overlay = memo<INotificationOverlay>(({ style }) => {
    const { layout } = useDynamicNotifications();

    return (
        <View pointerEvents="box-none" style={[styles.overlay, { height: layout.canvasHeight }, style]}>
            <Gooey />
            <Content />
        </View>
    );
});

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
});
