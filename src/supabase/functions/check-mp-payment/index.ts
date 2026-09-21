// Removed explicit Deno lib references to avoid missing lib error in the
// TypeScript build environment. The runtime provides necessary globals.

// Consulta el estado del pago de MercadoPago para la inscripción del usuario
// y, si está aprobado, marca la inscripción como paga y notifica.
// Se llama desde la app al volver del checkout (y como re-chequeo forzado).

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export default async function handler(req: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser(
      req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    )
    if (!user) {
      return json({ error: 'No autorizado' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const tournamentId = body.tournament_id
    if (!tournamentId) {
      return json({ error: 'Falta tournament_id' }, 400)
    }

    const { data: registration } = await supabase
      .from('tournament_registrations')
      .select('id, payment_status, mp_preference_id, player_id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id)
      .single()

    if (!registration) {
      return json({ error: 'No hay inscripción para este torneo' }, 404)
    }
    if (registration.payment_status === 'paid' || !registration.mp_preference_id) {
      return json({ payment_status: registration.payment_status })
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('organizer_id')
      .eq('id', tournamentId)
      .single()
    if (!tournament) {
      return json({ error: 'Torneo no encontrado' }, 404)
    }

    const { data: account } = await supabase
      .from('organizer_mp_accounts')
      .select('access_token')
      .eq('organizer_id', tournament.organizer_id)
      .single()
    if (!account) {
      return json({ payment_status: registration.payment_status })
    }

    const searchRes = await fetch(
      `https://api.mercadopago.com/v1/payments/search` +
        `?preference_id=${encodeURIComponent(registration.mp_preference_id)}` +
        `&sort=date_created&criteria=desc&limit=1`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )
    if (!searchRes.ok) {
      console.error('[check-mp-payment] search failed', await searchRes.text())
      return json({ payment_status: registration.payment_status }, 502)
    }

    const search = await searchRes.json()
    const payment = search?.results?.[0]
    if (!payment) {
      return json({ payment_status: registration.payment_status })
    }

    if (payment.status === 'approved' && registration.payment_status !== 'paid') {
      await supabase.from('tournament_registrations').update({
        payment_status: 'paid',
        mp_payment_id: String(payment.id),
        mp_status: payment.status,
        paid_amount: payment.net_received_amount ?? payment.transaction_amount ?? 0,
        commission_amount: payment.marketplace_fee ?? 0,
        paid_at: payment.date_approved ?? new Date().toISOString(),
      }).eq('id', registration.id)

      await notifyPlayer(registration.player_id, tournamentId)
      return json({ payment_status: 'paid', mp_status: payment.status })
    }

    return json({ payment_status: registration.payment_status, mp_status: payment.status })
  } catch (err) {
    console.error('[check-mp-payment]', err)
    return json({ error: 'Error interno' }, 500)
  }
}

async function notifyPlayer(playerId: string, tournamentId: string) {
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .single()
  const tournamentName = tournament?.name ?? 'el torneo'

  await supabase.from('notifications').insert({
    user_id: playerId,
    type: 'tournament_registration',
    title: 'Inscripción confirmada 🎾',
    body: `Tu pago fue acreditado. Quedaste inscripto en ${tournamentName}`,
    related_id: tournamentId,
    data: { type: 'tournament_registration', tournament_id: tournamentId },
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', playerId)
    .single()

  if (profile?.expo_push_token?.startsWith('ExponentPushToken')) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: 'Inscripción confirmada 🎾',
        body: `Tu pago fue acreditado. Quedaste inscripto en ${tournamentName}`,
        data: { type: 'tournament_registration', tournament_id: tournamentId },
        sound: 'default',
      }),
    })
  }
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}