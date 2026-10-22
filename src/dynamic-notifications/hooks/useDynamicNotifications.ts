import { useContext } from 'react';
import { DynamicNotificationsContext } from '../context';
import type { IDynamicNotificationsContext } from '../types';

/**
 * Acceso a la API del overlay. Lanza si se usa fuera del provider.
 */
export function useDynamicNotifications(): IDynamicNotificationsContext {
    const context = useContext(DynamicNotificationsContext);

    if (!context) {
        throw new Error(
            'useDynamicNotifications() debe usarse dentro de <DynamicNotifications>.',
        );
    }

    return context;
}
