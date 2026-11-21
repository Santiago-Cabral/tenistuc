import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { isPushAvailable, registerForPushNotifications, savePushToken } from '../notifications/notificationService'
import { navigateToNotification } from '../notifications/notificationNavigation'
import { supabase } from '../lib/supabase'

// expo-notifications se carga de forma lazy (ver notificationService.ts):
// en Android + Expo Go (SDK 53+) la importación lanza excepción, así que
// acá la app sigue viva aunque no haya soporte push en el host actual.

export function useNotifications() {
  const { session } = useAuthStore()
  const notifListener = useRef<{ remove: () => void } | null>(null)
  const responseListener = useRef<{ remove: () => void } | null>(null)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    if (!isPushAvailable()) {
      console.warn('[Notifications] Notificaciones no disponibles en Expo Go (Android). Usá un development build.')
      return
    }

    let mounted = true

    const register = () => {
      registerForPushNotifications().then(async (token) => {
        if (!token || !mounted) return
        const saved = await savePushToken(userId, token)
        if (!saved) {
          console.warn('[Notifications] El token se obtuvo pero no se pudo guardar.')
        }
      })
    }

    // Registrar token
    register()

    // Al volver a primer plano reintentamos: el primer intento puede fallar
    // si FCM todavía no está listo (típico en Android al abrir la app).
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') register()
    })

    // Listeners solo si expo-notifications está disponible en este entorno
    ;(async () => {
      const Notifications = await loadNotificationsModule()
      if (!Notifications) return
      if (!mounted) return

      notifListener.current = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[Notification received]', notification.request.content)
      })

      responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, string>
        handleTap(data)
      })
    })()

    return () => {
      mounted = false
      appStateSub.remove()
      notifListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [session?.user?.id])
}

async function loadNotificationsModule() {
  try {
    return await import('expo-notifications')
  } catch (e) {
    console.warn('[Notifications] expo-notifications no disponible en este entorno:', e)
    return null
  }
}

function handleTap(data: Record<string, string>) {
  navigateToNotification(data);
}

// Hook separado para badge de no leídas
export function useUnreadNotificationsCount() {
  const { session } = useAuthStore()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    // Fetch inicial
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count: c }) => setCount(c ?? 0))

    // Realtime para actualizaciones en vivo
    const channel = supabase
      .channel('notifications-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false)
            .then(({ count: c }) => setCount(c ?? 0))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id])

  return count
}

// Cuenta las notificaciones de tipo 'message' sin leer. Se usa para el punto
// rojo en el ícono de Mensajes (se limpia al abrir la bandeja o el chat).
export function useUnreadMessagesCount() {
  const { session } = useAuthStore()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) { setCount(0); return }

    let mounted = true
    const load = () => {
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'message')
        .eq('read', false)
        .then(({ count: c }) => { if (mounted) setCount(c ?? 0) })
    }

    load()

    const channel = supabase
      .channel(`messages-unread:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        load
      )
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [session?.user?.id])

  return count
}