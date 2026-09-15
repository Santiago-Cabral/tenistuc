import { useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { isPushAvailable, registerForPushNotifications, savePushToken } from '../notifications/notificationService'
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

    // Registrar token
    registerForPushNotifications().then((token) => {
      if (token && mounted) savePushToken(userId, token)
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
  switch (data?.type) {
    case 'challenge':
      router.push('/matches' as any)
      break
    case 'tournament_new':
    case 'tournament_start':
      data.tournament_id
        ? router.push(`/tournament/${data.tournament_id}` as any)
        : router.push('/athleteTabs/tournament' as any)
      break
    case 'message':
      data.conversation_id
        ? router.push(`/chat/${data.conversation_id}` as any)
        : router.push('/athleteTabs/messages' as any)
      break
  }
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