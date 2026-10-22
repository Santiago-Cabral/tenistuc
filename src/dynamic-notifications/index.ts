/**
 * Overlay de notificaciones dinámicas ("gooey").
 *
 * Port de expo-dynamic-notifications adaptado al tema de TenisTuc:
 *   · sin expo-symbols (es iOS-only) → íconos de Ionicons
 *   · colores del tema de la app
 *   · sin react-native-teleport (no se usaba): el overlay se dibuja como
 *     hermano del children dentro del provider, por encima de la app.
 *
 * Uso:
 *   <DynamicNotifications accent={Colors.primary}>
 *     <App />
 *   </DynamicNotifications>
 *
 *   const { trigger } = useDynamicNotifications();
 *   trigger({ title: 'Nuevo desafío', message: 'Te desafió Ana', icon: 'tennisball' });
 */

import { Content } from './components/Content';
import { Gooey } from './components/Gooey';
import { NotificationBody } from './components/NotificationBody';
import { Overlay } from './components/Overlay';
import { Root } from './components/Root';

export const DynamicNotifications = Object.assign(Root, {
    Overlay,
    Gooey,
    Content,
    Body: NotificationBody,
});

export { useDynamicNotifications } from './hooks/useDynamicNotifications';
export { PALETTE } from './palette';
export type {
    DynamicNotificationIcon,
    IDynamicNotification,
    IDynamicNotifications,
    IDynamicNotificationsContext,
    INotificationLayout,
} from './types';
