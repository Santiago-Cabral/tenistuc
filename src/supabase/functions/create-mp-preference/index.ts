// Removed explicit Deno lib references to avoid missing lib error in the
// TypeScript build environment. The runtime provides necessary globals.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MP_MARKETPLACE_CODE = process.env.MERCADOPAGO_MARKETPLACE ?? ''
const APP_FEE_PCT = Number(process.env.MERCADOPAGO_APP_FEE_PCT ?? 0)

interface Tournament {
  id: string
  name: string
  status: string
  entry_fee: number | null
  organizer_id: string
}

export default async function handler(req: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser(
      req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    )
    if (!user) {
      return json({ error: 'No autorizado' }, 401)
    }

    const { tournament_id } = await req.json().catch(() => ({}))
    if (!tournament_id) {
      return json({ error: 'Falta tournament_id' }, 400)
    }

    const { data: tournament, error: tournError } = await supabase
      .from('tournaments')
      .select('id, name, status, entry_fee, organizer_id')
      .eq('id', tournament_id)
      .single()
    if (tournError || !tournament) {
      return json({ error: 'Torneo no encontrado' }, 404)
    }
    if (tournament.status !== 'open') {
      return json({ error: 'La inscripción para este torneo está cerrada' }, 409)
    }
    const entryFee = tournament.entry_fee ?? 0
    if (entryFee <= 0) {
      return json({ error: 'Este torneo no tiene arancel' }, 409)
    }

    const { data: mpAccount, error: mpError } = await supabase
      .from('organizer_mp_accounts')
      .select('access_token')
      .eq('organizer_id', tournament.organizer_id)
      .single()

    // si no existe (single devuelve error), avisar que el organizador no conectó MP
    const sellerToken = !mpError ? mpAccount?.access_token : undefined
    if (!sellerToken) {
      return json(
        { error: 'El organizador todavía no vinculó su cuenta de MercadoPago' },
        409
      )
    }

    // alta de la inscripción (el trigger valida lista abierta y cupo)
    const { data: inserted, error: insertError } = await supabase
      .from('tournament_registrations')
      .insert({ tournament_id, player_id: user.id })
      .select('id, payment_status, mp_preference_id, mp_status')
      .maybeSingle()
    if (insertError) {
      return json({ error: insertError.message }, 409)
    }

    let registration = inserted
    if (!registration) {
      const { data: existing, error: existingError } = await supabase
        .from('tournament_registrations')
        .select('id, payment_status, mp_preference_id, mp_status')
        .eq('tournament_id', tournament_id)
        .eq('player_id', user.id)
        .single()
      if (existingError || !existing) {
        return json({ error: 'No se pudo registrar la inscripción' }, 500)
      }
      registration = existing
    }

    if (registration.payment_status === 'paid') {
      return json({ already_paid: true, init_point: null })
    }

    // reutilizar la preferencia pendiente si ya existe
    if (registration.mp_preference_id && registration.mp_status === 'pending') {
      const prefRes = await fetch(
        `https://api.mercadopago.com/checkout/preferences/${registration.mp_preference_id}`,
        { headers: { Authorization: `Bearer ${sellerToken}` } }
      )
      if (prefRes.ok) {
        const pref = await prefRes.json()
        return json({ init_point: pref.init_point, already_paid: false })
      }
    }

    const commission = Number((entryFee * APP_FEE_PCT / 100).toFixed(2))

    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: tournament.id,
            title: `Inscripción: ${tournament.name}`,
            quantity: 1,
            unit_price: entryFee,
            currency_id: 'ARS',
          },
        ],
        payer: { email: user.email },
        external_reference: registration.id,
        ...(MP_MARKETPLACE_CODE ? {
          marketplace: MP_MARKETPLACE_CODE,
          marketplace_fee: commission,
        } : {}),
        back_urls: {
          success: 'tenistuc://checkout/success',
          pending: 'tenistuc://checkout/pending',
          failure: 'tenistuc://checkout/failure',
        },
        auto_return: 'approved',
        notification_url:
          `${process.env.SUPABASE_URL}/functions/v1/mp-webhook`,
        statement_descriptor: 'TenisTuc',
      }),
    })

    if (!prefRes.ok) {
      const text = await prefRes.text()
      console.error('[create-mp-preference] MP error', prefRes.status, text)
      return json({ error: 'No se pudo crear el pago en MercadoPago' }, 502)
    }

    const pref = await prefRes.json()

    await supabase
      .from('tournament_registrations')
      .update({
        mp_preference_id: pref.id,
        mp_status: 'pending',
        commission_amount: commission,
      })
      .eq('id', registration.id)

    return json({
      init_point: pref.init_point,
      already_paid: false,
      preference_id: pref.id,
    })
  } catch (err) {
    console.error('[create-mp-preference]', err)
    return json({ error: 'Error interno' }, 500)
  }
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}