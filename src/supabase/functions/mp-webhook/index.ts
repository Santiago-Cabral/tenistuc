// Removed explicit Deno lib references to avoid missing lib error in the
// TypeScript build environment. The runtime provides necessary globals.

// Webhook de MercadoPago: llega el pago, se marca la inscripción como paga
// y se notifica al jugador (in-app + push Expo).
//
// Responder siempre 200 aunque falles: MP reintenta si no lo hacés.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export default async function handler(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}))
    const paymentId = payload?.data?.id
    if (!payload || payload.type !== 'payment' || !paymentId) {
      return ok()
    }

    const collectorId = String(payload.user_id ?? '')

    const account = collectorId
      ? (
          await supabase
            .from('organizer_mp_accounts')
            .select('access_token, organizer_id')
            .eq('mp_user_id', collectorId)
            .single()
        ).data
      : null

    if (!account) return ok()

    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )
    if (!paymentRes.ok) return ok()
    const payment = await paymentRes.json()

    if (payment.status !== 'approved') return ok()

    const { data: byPaymentId } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id, player_id, mp_preference_id')
      .eq('mp_payment_id', payment.id)
      .maybeSingle()

    const reg =
      byPaymentId ??
      (
        await supabase
          .from('tournament_registrations')
          .select('id, tournament_id, player_id, mp_preference_id')
          .eq('id', payment.external_reference)
          .maybeSingle()
      ).data

    if (!reg) return ok()

    await markPaid(reg.id, payment)
    await notifyPlayer(reg.player_id, reg.tournament_id)

    return ok()
  } catch (err) {
    console.error('[mp-webhook]', err)
    return ok()
  }
}

async function markPaid(
  registrationId: string,
  payment: {
    id: string
    status: string
    transaction_amount?: number
    net_received_amount?: number
    marketplace_fee?: number
    date_approved?: string
    preference_id?: string
  }
) {
  await supabase.from('tournament_registrations').update({
    payment_status: 'paid',
    mp_payment_id: String(payment.id),
    mp_status: payment.status,
    mp_preference_id: payment.preference_id ?? undefined,
    paid_amount: payment.net_received_amount ?? payment.transaction_amount ?? 0,
    commission_amount: payment.marketplace_fee ?? 0,
    paid_at: payment.date_approved ?? new Date().toISOString(),
  }).eq('id', registrationId)
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

function ok(): Response {
  return new Response('ok', { status: 200 })
}