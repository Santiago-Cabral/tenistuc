import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'

// expo-notifications NO se importa en el top-level NI siquiera cuando se
// está en Expo Go. En Android + Expo Go (SDK 53+) la importación devuelve
// un módulo roto (funciones undefined) y el error real no es capturable con
// try/catch. Por eso se detecta el entorno ANTES de importar y se corta ahí.

export function isPushAvailable(): boolean {
  if (Platform.OS === 'web') return false
  const inExpoGo = Constants.executionEnvironment === 'storeClient'
  return !(Platform.OS === 'android' && inExpoGo)
}

async function loadNotifications() {
  try {
    return await import('expo-notifications')
  } catch (e) {
    console.warn('[Notifications] expo-notifications no disponible en este entorno:', e)
    return null
  }
}

async function loadDevice() {
  try {
    return await import('expo-device')
  } catch (e) {
    console.warn('[Notifications] expo-device no disponible:', e)
    return null
  }
}

let handledSetup = false
async function setupNotificationHandler() {
  if (handledSetup) return
  handledSetup = true
  const Notifications = await loadNotifications()
  if (!Notifications) return

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!isPushAvailable()) {
    console.warn('[Notifications] Push no disponible en Expo Go (Android). Usá un development build.')
    return null
  }

  await setupNotificationHandler()

  const Notifications = await loadNotifications()
  const Device = await loadDevice()
  if (!Notifications || !Device) {
    console.warn('[Notifications] Sin soporte de expo-notifications')
    return null
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Solo funciona en dispositivo físico')
    return null
  }

  const granted = await ensureNotificationPermission(Notifications)
  if (!granted) {
    console.warn('[Notifications] Permiso denegado')
    return null
  }

  const projectId = (await import('expo-constants')).default.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    console.error('[Notifications] Falta EAS projectId en app.json')
    return null
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    return token
  } catch (e: any) {
    // Android + dev build sin FCM configurado: getExpoPushTokenAsync tira
    // "Unable to get Firebase Messaging instance". No debe romper la app.
    console.warn('[Notifications] No se pudo obtener el push token:', e.message ?? e)
    return null
  }
}

// Crea el canal de Android y pide el permiso de notificaciones (POST_NOTIFICATIONS
// en Android 13+). Se llama al abrir la app, sin depender de que haya sesión.
export async function ensureNotificationPermission(
  notifications?: any,
): Promise<boolean> {
  if (!isPushAvailable()) return false

  const Notifications = notifications ?? (await loadNotifications())
  if (!Notifications) return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TenisTuc',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2D6A4F',
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true

  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function savePushToken(userId: string, token: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)

  if (error) console.error('[Notifications] Error guardando token:', error)
}

export async function clearPushToken(userId: string) {
  await supabase
    .from('profiles')
    .update({ expo_push_token: null })
    .eq('id', userId)
}