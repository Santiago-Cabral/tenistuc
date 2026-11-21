// src/hooks/usePushNotifications.ts
// Estado de las notificaciones push + acciones para activarlas y probarlas.
//
// Antes la app pedía el permiso "a ciegas" al abrir y no informaba nada si
// fallaba (Expo Go en Android, permiso ya denegado, token que no se pudo
// registrar). Con este hook la UI puede mostrar el estado real y dejar que
// el usuario active las notificaciones cuando quiera.

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import {
  getPushState,
  enablePushNotifications,
  type PushState,
} from '../notifications/notificationService';
import { showAlert } from '../services/appAlert';

export function usePushNotifications() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const [state, setState] = useState<PushState | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await getPushState());
    } catch (e) {
      console.warn('[usePushNotifications] refresh error:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    // El registro del token corre en paralelo (useNotifications). Reintentamos
    // una vez para que la tarjeta no quede en "falta registrar" sin motivo.
    const timer = setTimeout(refresh, 2500);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [refresh, userId]);

  const enable = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { ok, state: next } = await enablePushNotifications(userId);
      setState(next);
      showAlert(
        ok ? 'Notificaciones activadas' : 'No se pudieron activar',
        next.message,
      );
    } catch (e: any) {
      console.warn('[usePushNotifications] enable error:', e);
      showAlert('Error', e?.message ?? 'No se pudieron activar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { state, loading, refresh, enable };
}
