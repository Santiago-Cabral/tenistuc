import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { supabase } from '../lib/supabase'

const PUSH_TOKEN_KEY = 'tenistuc:expo-push-token'

// expo-notifications NO se importa en el top-level NI siquiera cuando se
// está en Expo Go. En Android + Expo Go (SDK 53+) la importación devuelve
// un módulo roto (funciones undefined) y el error real no es capturable con
// try/catch. Por eso se detecta el entorno ANTES de importar y se corta ahí.

export function isPushAvailable(): boolean {
  if (Platform.OS === 'web') return false
  const inExpoGo =
    Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient'
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
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'TenisTuc',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2D6A4F',
      })
    } catch (e: any) {
      console.warn('[Notifications] No se pudo crear el canal de Android:', e.message ?? e)
    }
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true

  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function savePushToken(userId: string, token: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)
    .select('id')

  if (error || !data?.length) {
    console.error('[Notifications] Error guardando token:', error ?? 'sin filas actualizadas')
    return false
  }

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {})
  return true
}

export async function clearPushToken(userId: string) {
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => {})
  await supabase
    .from('profiles')
    .update({ expo_push_token: null })
    .eq('id', userId)
}

/**
 * Push de prueba real (pasa por Expo Push, no es local). Devuelve el error
 * exacto que reporta Expo para poder diagnosticar credenciales FCM/APNs.
 */
export async function sendTestPush(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: {
      userId,
      title: 'TenisTuc',
      body: 'Las notificaciones push funcionan correctamente.',
      data: { type: 'test' },
    },
  })

  if (error) {
    let message = error.message
    try {
      const context = (error as any).context
      const payload = await context?.json?.()
      if (payload?.error) message = payload.error
    } catch {
      // nos quedamos con el mensaje genérico
    }
    return { ok: false, error: message }
  }

  if (data?.sent) return { ok: true }
  return {
    ok: false,
    error: data?.error ?? 'No se pudo enviar el push (sin token registrado).',
  }
}

// ─── Estado de las notificaciones (para mostrarlo en la UI) ────────────────────

export type PushStatus =
  | 'granted'          // permiso concedido y token registrado
  | 'denied'           // el usuario lo bloqueó (o el sistema)
  | 'undetermined'     // todavía no se preguntó
  | 'unsupported'      // web / Expo Go en Android
  | 'no-device'        // emulador (no hay push)
  | 'error'            // falló el registro del token

export interface PushState {
  status: PushStatus
  /** Texto corto para explicar el estado al usuario. */
  message: string
  /** ¿Se puede pedir el permiso desde la app? */
  canRequest: boolean
}

/**
 * Estado real de las notificaciones en este dispositivo/host.
 * Antes esto no se podía consultar, y la app pedía permiso "a ciegas":
 * si fallaba (Expo Go en Android, permiso ya denegado) no se veía nada.
 */
export async function getPushState(): Promise<PushState> {
  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      message: 'Las notificaciones push no funcionan en la web.',
      canRequest: false,
    }
  }

  const inExpoGo =
    Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android'
  if (inExpoGo) {
    return {
      status: 'unsupported',
      message:
        'Estás en Expo Go: las notificaciones push no funcionan en Android. Instalá la app de desarrollo para recibirlas.',
      canRequest: false,
    }
  }

  const Notifications = await loadNotifications()
  if (!Notifications) {
    return {
      status: 'unsupported',
      message: 'Este entorno no soporta notificaciones push.',
      canRequest: false,
    }
  }

  const Device = await loadDevice()
  if (Device && !Device.isDevice) {
    return {
      status: 'no-device',
      message: 'Las notificaciones push sólo funcionan en un teléfono físico.',
      canRequest: false,
    }
  }

  const { status } = await Notifications.getPermissionsAsync()

  if (status === 'granted') {
    // El permiso del sistema puede estar concedido y aun así no haber token
    // registrado (p. ej. falló FCM la primera vez). Sin token no llega nada
    // fuera de la app, así que sólo damos por activado si lo guardamos.
    const savedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => null)
    if (savedToken) {
      return { status: 'granted', message: 'Notificaciones activadas.', canRequest: false }
    }
    return {
      status: 'undetermined',
      message: 'El permiso está dado, pero falta registrar este dispositivo. Tocá para activar.',
      canRequest: true,
    }
  }
  if (status === 'denied') {
    return {
      status: 'denied',
      message:
        'Las notificaciones están bloqueadas. Activalas desde los ajustes del sistema (Ajustes → Aplicaciones → TenisTuc → Notificaciones).',
      canRequest: false,
    }
  }

  return {
    status: 'undetermined',
    message: 'Las notificaciones están desactivadas. Tocá para activarlas.',
    canRequest: true,
  }
}

/**
 * Pide el permiso (si hace falta), registra el token de push en el backend y
 * devuelve el resultado. Es el botón que la app expone en la UI.
 */
export async function enablePushNotifications(
  userId: string,
): Promise<{ ok: boolean; state: PushState }> {
  const before = await getPushState()
  if (before.status === 'unsupported' || before.status === 'no-device') {
    return { ok: false, state: before }
  }

  const Notifications = await loadNotifications()
  if (!Notifications) {
    return {
      ok: false,
      state: { status: 'unsupported', message: 'Sin soporte de notificaciones.', canRequest: false },
    }
  }

  const granted = await ensureNotificationPermission(Notifications)
  if (!granted) {
    const after = await getPushState()
    return {
      ok: false,
      state:
        after.status === 'denied'
          ? after
          : {
              status: 'denied',
              message:
                'No se pudo activar el permiso de notificaciones. Activalo desde los ajustes del sistema.',
              canRequest: false,
            },
    }
  }

  const token = await registerForPushNotifications()
  if (!token) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'Permiso concedido, pero no se pudo registrar el dispositivo para push. Revisá la configuración de Firebase en el build.',
        canRequest: false,
      },
    }
  }

  const saved = await savePushToken(userId, token)
  if (!saved) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'Se obtuvo el token, pero no se pudo guardar en tu perfil. Revisá tu conexión e intentá de nuevo.',
        canRequest: true,
      },
    }
  }

  return {
    ok: true,
    state: { status: 'granted', message: 'Notificaciones activadas.', canRequest: false },
  }
}
