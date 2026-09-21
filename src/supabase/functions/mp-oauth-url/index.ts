// Removed explicit Deno lib references to avoid missing lib error in the
// TypeScript build environment. The runtime provides necessary globals.
// Patrón igual que notify/index.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MP_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID!
const REDIRECT_URI =
  process.env.MERCADOPAGO_OAUTH_REDIRECT_URI ??
  `${process.env.SUPABASE_URL}/functions/v1/mp-oauth-callback`

export default async function handler(req: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser(
      req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    )
    if (!user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'organizer') {
      return new Response(JSON.stringify({ error: 'Solo organizadores' }), { status: 403 })
    }

    const { data: stateRow, error: stateError } = await supabase
      .from('mp_oauth_states')
      .insert({ organizer_id: user.id })
      .select('state')
      .single()
    if (stateError || !stateRow) {
      return new Response(JSON.stringify({ error: 'No se pudo iniciar la conexión' }), { status: 500 })
    }

    const params = new URLSearchParams({
      client_id: MP_CLIENT_ID,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: REDIRECT_URI,
      state: stateRow.state,
    })
    const authUrl = `https://auth.mercadopago.com.ar/authorization?${params.toString()}`

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[mp-oauth-url]', err)
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 })
  }
}