// Removed explicit Deno lib references to avoid missing lib error in the TypeScript
// build environment. The runtime provides necessary Deno globals.

import { createClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://api.expo.dev/v2/push/send'

interface PushPayload {
  user_id: string
  title: string
  body: string
  data: Record<string, unknown>
  type: string
}

// Export a handler compatible with Supabase Edge Functions (uses Web Fetch API)
export default async function handler(req: Request) {
  // Verificar secret para que solo Supabase pueda llamar esta función
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await req.json()
  const { type, table, record, old_record } = payload

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const notifications: PushPayload[] = []

  // ── DESAFÍO RECIBIDO ────────────────────────────────────────────────────────
  if (table === 'challenges' && type === 'INSERT') {
    const { data: challenger } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', record.challenger_id)
      .single()

    notifications.push({
      user_id: record.challenged_id,
      title: 'Nuevo desafío',
      body: `${challenger?.full_name ?? 'Alguien'} te desafió a un partido`,
      data: { type: 'challenge', challenge_id: record.id },
      type: 'challenge',
    })
  }

  // ── TORNEO NUEVO ────────────────────────────────────────────────────────────
  else if (table === 'tournaments' && type === 'INSERT') {
    const { data: athletes } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'athlete')

    for (const athlete of athletes ?? []) {
      notifications.push({
        user_id: athlete.id,
        title: 'Nuevo torneo disponible',
        body: `Se abrió la inscripción: ${record.name}`,
        data: { type: 'tournament_new', tournament_id: record.id },
        type: 'tournament_new',
      })
    }
  }

  // ── TORNEO INICIADO ─────────────────────────────────────────────────────────
  else if (
    table === 'tournaments' &&
    type === 'UPDATE' &&
    record.status === 'in_progress' &&
    old_record?.status !== 'in_progress'
  ) {
    const { data: athletes } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'athlete')

    for (const athlete of athletes ?? []) {
      notifications.push({
        user_id: athlete.id,
        title: 'Torneo iniciado',
        body: `Comenzó el torneo: ${record.name}`,
        data: { type: 'tournament_start', tournament_id: record.id },
        type: 'tournament_start',
      })
    }
  }

  // ── MENSAJE NUEVO ───────────────────────────────────────────────────────────
  else if (table === 'messages' && type === 'INSERT') {
    const { data: conv } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', record.conversation_id)
      .single()

    if (conv) {
      const recipient_id =
        conv.participant1_id === record.sender_id
          ? conv.participant2_id
          : conv.participant1_id

      const { data: sender } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', record.sender_id)
        .single()

      const preview =
        record.content.length > 60
          ? record.content.substring(0, 60) + '...'
          : record.content

      notifications.push({
        user_id: recipient_id,
        title: sender?.full_name ?? 'Nuevo mensaje',
        body: preview,
        data: { type: 'message', conversation_id: record.conversation_id },
        type: 'message',
      })
    }
  }

  // ── ENVIAR ──────────────────────────────────────────────────────────────────
  const expoPushMessages: object[] = []

  for (const notif of notifications) {
    // Guardar en notifications table
    await supabase.from('notifications').insert({
      user_id: notif.user_id,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      data: notif.data,
    })

    // Buscar token
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', notif.user_id)
      .single()

    if (profile?.expo_push_token?.startsWith('ExponentPushToken')) {
      expoPushMessages.push({
        to: profile.expo_push_token,
        title: notif.title,
        body: notif.body,
        data: notif.data,
        sound: 'default',
        badge: 1,
      })
    }
  }

  // Enviar en batch a Expo (máx 100 por request)
  if (expoPushMessages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(expoPushMessages),
    })
  }

  return new Response(JSON.stringify({ sent: notifications.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}