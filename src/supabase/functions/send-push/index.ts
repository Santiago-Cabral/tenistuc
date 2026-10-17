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

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .single()

  if (!profile?.expo_push_token?.startsWith('ExponentPushToken')) {
    return new Response(JSON.stringify({ sent: false, reason: 'no-token' }), {
      headers: { 'Content-Type': 'application/json' },
    })
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
    }),
  })

  if (!res.ok) {
    console.error('[send-push] Expo push error', res.status, await res.text())
    return new Response(JSON.stringify({ sent: false }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export default { fetch: handler }
