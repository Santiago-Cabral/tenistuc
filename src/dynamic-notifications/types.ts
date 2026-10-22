import type { ComponentProps, ReactNode } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';

/** Nombre de un ícono de Ionicons (funciona en Android e iOS). */
export type DynamicNotificationIcon = ComponentProps<typeof Ionicons>['name'];

/** La notificación que se muestra en el overlay. */
export interface IDynamicNotification {
    id?: string;
    title: string;
    message?: string;
    /** URL del avatar. Si no viene, se dibuja el ícono en un círculo. */
    avatar?: string;
    /** Ícono de Ionicons (reemplaza al SymbolView de SF Symbols, que es iOS-only). */
    icon?: DynamicNotificationIcon;
    /** Color de acento. Si no viene, se usa el del provider. */
    accent?: string;
    /** Duración en ms. `null` = no se descarta sola. */
    duration?: number | null;
    /** Se dispara al tocar la notificación (después se descarta). */
    onPress?: () => void;
    /** Render custom. Si viene, reemplaza el body por defecto. */
    render?: (notification: IDynamicNotification) => ReactNode;
}

/** Props del provider (`<DynamicNotifications>`). */
export interface IDynamicNotifications {
    children: ReactNode;

    /** 0-1: define el blur del efecto gooey. */
    strength?: number;
    /** Override directo del blur. */
    blur?: number;
    /** Ganancia de la ColorMatrix de Skia. */
    gain?: number;
    /** Umbral de la ColorMatrix de Skia. */
    threshold?: number;

    islandWidth?: number;
    islandHeight?: number;
    islandTop?: number;
    islandColor?: string;

    cardWidth?: number;
    cardHeight?: number;
    cardRadius?: number;
    cardColor?: string;
    shadowColor?: string;
    accent?: string;

    /** Separación entre la isla y la tarjeta. */
    gap?: number;
    /** Duración por defecto en ms. `null` = no se descarta sola. */
    duration?: number | null;

    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
    onDismiss?: (notification: IDynamicNotification) => void;
}

/** Geometría del layout (depende del ancho de pantalla). */
export interface INotificationLayout {
    width: number;
    centerX: number;
    islandWidth: number;
    islandHeight: number;
    islandTop: number;
    islandBottom: number;
    islandCenterY: number;
    islandRadius: number;
    cardWidth: number;
    cardHeight: number;
    cardRadius: number;
    cardTop: number;
    cardLeft: number;
    cardCenterY: number;
    dropSize: number;
    neckWidth: number;
    canvasHeight: number;
}

export interface IBuildNotificationGeometry {
    drop: number;
    expand: number;
    layout: INotificationLayout;
}

/** Geometría calculada en el worklet (posición de cada figura). */
export interface INotificationGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    neckX: number;
    neckY: number;
    neckWidth: number;
    neckHeight: number;
    neckRadius: number;
    shadowOpacity: number;
    offsetY: number;
    widthRatio: number;
}

export interface INotificationGeometryInput {
    drop: SharedValue<number>;
    expand: SharedValue<number>;
    layout: INotificationLayout;
}

export type INotificationGeometryValues = {
    [K in keyof INotificationGeometry]: DerivedValue<number>;
};

export interface IBuildGooMatrix {
    gain: number;
    threshold: number;
}

export interface INotificationGooey {
    blur?: number;
    gain?: number;
    threshold?: number;
    islandColor?: string;
    cardColor?: string;
    shadowColor?: string;
}

export interface INotificationContent {
    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

export interface INotificationBody {
    notification: IDynamicNotification;
}

export interface INotificationOverlay {
    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

export interface INotificationTimeline {
    drop: SharedValue<number>;
    expand: SharedValue<number>;
    reveal: SharedValue<number>;
    tint: SharedValue<number>;
    dragY: SharedValue<number>;
    notification: IDynamicNotification | null;
    isVisible: boolean;
    trigger: (notification: IDynamicNotification) => void;
    dismiss: () => void;
}

export interface INotificationTimelineOptions {
    onDismiss?: (notification: IDynamicNotification) => void;
    duration?: number | null;
}

export interface IDynamicNotificationsTheme {
    islandColor: string;
    cardColor: string;
    shadowColor: string;
    accent: string;
    blur: number;
    gain: number;
    threshold: number;
}

/** Lo que expone `useDynamicNotifications()`. */
export interface IDynamicNotificationsContext extends IDynamicNotificationsTheme {
    trigger: (notification: IDynamicNotification) => void;
    dismiss: () => void;
    isVisible: boolean;
    notification: IDynamicNotification | null;
    layout: INotificationLayout;
    drop: SharedValue<number>;
    expand: SharedValue<number>;
    reveal: SharedValue<number>;
    tint: SharedValue<number>;
    dragY: SharedValue<number>;
}
