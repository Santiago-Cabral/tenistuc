// send-push: envía una notificación push a un usuario.
//
// Requiere el JWT del usuario que la invoca (verify_jwt = true en config.toml).
// El token del destinatario se lee con la service_role key, de modo que
// `profiles.expo_push_token` ya no necesita ser legible por el cliente.
//
// Reemplaza al antiguo sendPushToUser() del cliente, que leía el token
// del otro usuario directamente desde la tabla `profiles`.

import { createClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://api.expo.dev/v2/push/send'

const getEnv = (name: string): string | undefined =>
  (globalThis as any).Deno?.env?.get?.(name) ?? (globalThis as any).process?.env?.[name]

interface SendPushBody {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let payload: SendPushBody
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { userId, title, body, data } = payload
  if (!userId || !title) {
    return new Response('Missing userId/title', { status: 400 })
  }

  const supabaseUrl = getEnv('SUPABASE_URL')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') ?? getEnv('SUPABASE_SECRET_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-push] missing environment configuration')
    return new Response('Server misconfigured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .single()

  if (!profile?.expo_push_token?.startsWith('ExponentPushToken')) {
    return new Response(
      JSON.stringify({
        sent: false,
        reason: 'no-token',
        error: 'Este dispositivo no tiene un token push registrado. Activá las notificaciones primero.',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'default',
    }),
  })

  const json = await res.json().catch(() => null)
  const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data

  if (!res.ok || ticket?.status === 'error') {
    const message =
      ticket?.message ?? `Expo push error ${res.status}`
    console.error('[send-push] Expo push error', message, ticket?.details ?? '')

    // Token inválido/desinstalado: limpiarlo para no reintentar siempre.
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', userId)
    }

    return new Response(
      JSON.stringify({ sent: false, error: message, details: ticket?.details ?? null }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export default { fetch: handler }
