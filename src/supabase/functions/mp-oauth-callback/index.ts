// Removed explicit Deno lib references to avoid missing lib error in the
// TypeScript build environment. The runtime provides necessary globals.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MP_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID!
const MP_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET!
const REDIRECT_URI =
  process.env.MERCADOPAGO_OAUTH_REDIRECT_URI ??
  `${process.env.SUPABASE_URL}/functions/v1/mp-oauth-callback`

function fail(message: string, promoText?: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:48px">
      <h2>${message}</h2>
      ${promoText ?? '<p>Ya podés cerrar esta ventana y volver a la app.</p>'}
      </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}

function redirectToApp(): Response {
  return new Response(
    `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=tenistuc://mp-oauth"></head>
      <body><p>Conectando tu cuenta de MercadoPago…</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')

  if (!state) {
    return fail('Error: no se recibió el estado OAuth.')
  }

  const { data: stateRow, error: stateError } = await supabase
    .from('mp_oauth_states')
    .select('organizer_id')
    .eq('state', state)
    .single()

  if (stateError || !stateRow) {
    return fail('Error: el enlace de conexión es inválido o expiró.', '<p>Volvé a intentar desde la app.</p>')
  }

  // el estado es de un solo uso
  await supabase.from('mp_oauth_states').delete().eq('state', state)

  if (error || !code) {
    return fail('La conexión fue cancelada.')
  }

  // intercambiar code por tokens con la cuenta marketplace de la plataforma
  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[mp-oauth-callback] token exchange failed', await tokenRes.text())
    return fail('Error al conectar tu cuenta de MercadoPago.', '<p>Probá de nuevo en unos minutos.</p>')
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    public_key?: string
    user_id?: number | string
  }

  await supabase.from('organizer_mp_accounts').upsert(
    {
      organizer_id: stateRow.organizer_id,
      mp_user_id: String(tokens.user_id ?? ''),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      public_key: tokens.public_key ?? null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organizer_id' }
  )

  return redirectToApp()
}