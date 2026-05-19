import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://barett07.github.io'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Write-Token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const token = req.headers.get('X-Write-Token')
  if (!token || token !== Deno.env.get('WRITE_SECRET')) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }

  let body: { key?: string; value?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { key, value } = body
  if (!key) return new Response('Missing key', { status: 400, headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error } = await supabase
    .from('app_data')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return new Response(error.message, { status: 500, headers: CORS })
  return new Response(null, { status: 204, headers: CORS })
})
