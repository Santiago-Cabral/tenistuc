// Removed explicit Deno lib references to avoid missing lib error in the TypeScript
// build environment. The runtime provides necessary Deno globals.

import { createClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://api.expo.dev/v2/push/send'

const getEnv = (name: string): string | undefined =>
  (globalThis as any).Deno?.env?.get?.(name) ?? (globalThis as any).process?.env?.[name]

interface PushPayload {
  user_id: string
  title: string
  body: string
  data: Record<string, unknown>
  type: string
}

// Export a handler compatible with Supabase Edge Functions (uses Web Fetch API)
async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verificar secret para que solo Supabase pueda llamar esta función
  const notifySecret = getEnv('NOTIFY_SECRET')
  const supabaseUrl = getEnv('SUPABASE_URL')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') ?? getEnv('SUPABASE_SECRET_KEY')

  if (!notifySecret || !supabaseUrl || !serviceRoleKey) {
    console.error('[notify] missing environment configuration')
    return new Response('Server misconfigured', { status: 500 })
  }

  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${notifySecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }
  const { type, table, record, old_record } = payload

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const notifications: PushPayload[] = []

  // ── DESAFÍO RECIBIDO ────────────────────────────────────────────────────────
  if (table === 'challenges' && type === 'INSERT') {
    const { data: challenger } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', record.challenger_id)
      .single()

    notifications.push({
      user_id: record.challenged_id,
      title: 'Nuevo desafío',
      body: `${challenger?.full_name ?? 'Alguien'} te desafió a un partido`,
      data: {
        type: 'challenge',
        challenge_id: record.id,
        avatar_url: challenger?.avatar_url ?? null,
      },
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
        title: record.status === 'open' ? 'Nuevo torneo disponible' : 'Nuevo torneo',
        body: record.status === 'open'
          ? `Se abrió la inscripción: ${record.name}`
          : `Nuevo torneo: ${record.name}`,
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

  // ── LISTA CERRADA / REABIERTA ───────────────────────────────────────────────
  else if (
    table === 'tournaments' &&
    type === 'UPDATE' &&
    old_record?.status !== record.status &&
    (record.status === 'closed' || record.status === 'open')
  ) {
    const { data: registrations } = await supabase
      .from('tournament_registrations')
      .select('player_id')
      .eq('tournament_id', record.id)

    const action =
      record.status === 'closed'
        ? 'cerró la lista de inscripción para'
        : 'reabrió la lista de inscripción para'

    for (const { player_id } of registrations ?? []) {
      notifications.push({
        user_id: player_id,
        title: record.status === 'closed' ? 'Lista cerrada' : 'Lista reabierta',
        body: `Se ${action} ${record.name}`,
        data: { type: 'tournament_update', tournament_id: record.id },
        type: 'tournament_update',
      })
    }
  }

  // ── CAMBIO DE ESTADO (próximo / finalizado, etc.) ──────────────────────────
  else if (
    table === 'tournaments' &&
    type === 'UPDATE' &&
    old_record?.status !== record.status
  ) {
    const statusLabels: Record<string, string> = {
      upcoming: 'próximamente',
      open: 'inscripciones abiertas',
      closed: 'lista cerrada',
      in_progress: 'en juego',
      completed: 'finalizado',
    }

    const { data: registrations } = await supabase
      .from('tournament_registrations')
      .select('player_id')
      .eq('tournament_id', record.id)

    for (const { player_id } of registrations ?? []) {
      notifications.push({
        user_id: player_id,
        title: 'Estado del torneo',
        body: `${record.name} ahora está ${statusLabels[record.status] ?? record.status}. Mirá el fixture para ver novedades.`,
        data: { type: 'tournament_update', tournament_id: record.id },
        type: 'tournament_update',
      })
    }
  }

  // ── NUEVO INSCRIPTO (aviso al organizador) ─────────────────────────────────
  else if (table === 'tournament_registrations' && type === 'INSERT') {
    const { data: player } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', record.player_id)
      .single()

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('name, organizer_id')
      .eq('id', record.tournament_id)
      .single()

    if (tournament && player) {
      notifications.push({
        user_id: tournament.organizer_id,
        title: 'Nueva inscripción',
        body: `${player.full_name} se inscribió en ${tournament.name}`,
        data: { type: 'tournament_registration', tournament_id: record.tournament_id },
        type: 'tournament_registration',
      })
    }
  }

  // ── PARTIDO PROGRAMADO (aviso a ambos jugadores) ────────────────────────────
  else if (
    table === 'matches' &&
    type === 'UPDATE' &&
    !!record.scheduled_at &&
    record.scheduled_at !== old_record?.scheduled_at
  ) {
    const when = new Date(record.scheduled_at).toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Tucuman',
    })
    const where = record.location ? ` en ${record.location}` : ''
    const recipients = [record.player1_id, record.player2_id].filter(Boolean)

    for (const playerId of recipients) {
      notifications.push({
        user_id: playerId,
        title: 'Partido programado',
        body: `Tu partido se juega el ${when}${where}`,
        data: { type: 'match_scheduled', match_id: record.id },
        type: 'match_scheduled',
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
        .select('full_name, avatar_url')
        .eq('id', record.sender_id)
        .single()

      const content = String(record.content ?? 'Nuevo mensaje')
      const preview =
        content.length > 60
          ? content.substring(0, 60) + '...'
          : content

      notifications.push({
        user_id: recipient_id,
        title: sender?.full_name ?? 'Nuevo mensaje',
        body: preview,
        data: {
          type: 'message',
          conversation_id: record.conversation_id,
          avatar_url: sender?.avatar_url ?? null,
        },
        type: 'message',
      })
    }
  }

  // ── ENVIAR ──────────────────────────────────────────────────────────────────
  // channelId + priority son obligatorios en Android 8+ para que la
  // notificación aparezca como heads-up (y no quede silenciada en un canal
  // secundario). Sin channelId, Expo usa un canal por defecto que puede tener
  // importancia baja.
  const expoPushMessages: {
    to: string
    title: string
    body: string
    data: Record<string, unknown>
    sound: string
    badge: number
    priority: 'high'
    channelId: string
  }[] = []

  for (const notif of notifications) {
    // Guardar en notifications table
    const { error: insertError } = await supabase.from('notifications').insert({
      user_id: notif.user_id,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      related_id: (notif.data.challenge_id ??
        notif.data.tournament_id ??
        notif.data.conversation_id ??
        notif.data.match_id) as string | null,
      data: notif.data,
    })
    if (insertError) {
      console.error('[notify] notification insert failed', insertError)
    }

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
        priority: 'high',
        channelId: 'default',
      })
    }
  }

  // Enviar a Expo en lotes de máx 100 por request.
  const tokensToClear: string[] = []

  for (let i = 0; i < expoPushMessages.length; i += 100) {
    const chunk = expoPushMessages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!res.ok) {
        console.error('[notify] Expo push error', res.status, await res.text())
        continue
      }

      // Expo responde 200 incluso cuando el envío falla: el error viene en
      // cada ticket. Antes se ignoraba y el push se perdía en silencio.
      const json = await res.json().catch(() => null)
      const tickets = Array.isArray(json?.data) ? json.data : []

      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status !== 'error') return

        const token = chunk[index]?.to
        console.error(
          '[notify] Expo ticket error',
          token,
          ticket.message,
          ticket.details ?? '',
        )

        // Token inválido/desinstalado: limpiarlo para no reintentar siempre.
        if (ticket?.details?.error === 'DeviceNotRegistered' && token) {
          tokensToClear.push(token)
        }
      })
    } catch (err) {
      console.error('[notify] Expo push fetch failed', err)
    }
  }

  if (tokensToClear.length > 0) {
    await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .in('expo_push_token', tokensToClear)
  }

  return new Response(JSON.stringify({ sent: notifications.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export default { fetch: handler }