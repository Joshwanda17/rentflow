import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return toHex(hash)
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toHex(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const HMAC_SECRET = Deno.env.get('NFC_CARD_HMAC_SECRET')

    if (!HMAC_SECRET) {
      return new Response(JSON.stringify({ error: 'Card signing key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const requesterId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const card = body?.card
    const amountRaw = Number(body?.amount ?? 0)
    const pin = body?.pin ? String(body.pin) : null
    const reason = body?.reason ? String(body.reason).slice(0, 500) : null

    if (!card || typeof card !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid card payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { card_id, user_id, pinless_limit, issued_at, hmac_signature } = card as Record<string, any>
    if (!card_id || !user_id || !issued_at || !hmac_signature || typeof pinless_limit !== 'number') {
      return new Response(JSON.stringify({ error: 'Card payload incomplete' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const amount = Math.floor(amountRaw)

    // 1) Verify HMAC signature
    const expectedSig = await hmacSha256Hex(
      HMAC_SECRET,
      `${card_id}|${user_id}|${pinless_limit}|${issued_at}`
    )
    if (!timingSafeEqual(expectedSig, String(hmac_signature))) {
      return new Response(JSON.stringify({ error: 'Card signature invalid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2) Lookup card record & status
    const { data: cardRow, error: cardErr } = await (adminClient.from('nfc_cards') as any)
      .select('id, user_id, status, pin_hash, pinless_limit')
      .eq('card_id', card_id)
      .maybeSingle()

    if (cardErr || !cardRow) {
      return new Response(JSON.stringify({ error: 'Card not registered' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cardRow.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Card is blocked or revoked' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cardRow.user_id !== user_id) {
      return new Response(JSON.stringify({ error: 'Card owner mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cardRow.user_id === requesterId) {
      return new Response(JSON.stringify({ error: 'Cannot charge your own card' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3) PIN required if amount exceeds limit
    const limit = Number(cardRow.pinless_limit ?? 0)
    if (amount > limit) {
      if (!pin) {
        return new Response(
          JSON.stringify({ error: 'PIN required', pin_required: true, limit }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const pinHash = await sha256Hex(`${card_id}:${pin}`)
      if (!timingSafeEqual(pinHash, String(cardRow.pin_hash))) {
        return new Response(JSON.stringify({ error: 'Incorrect PIN' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 4) Create money request charged to card owner
    const { data: requesterProfile } = await (adminClient.from('profiles') as any)
      .select('full_name')
      .eq('id', requesterId)
      .maybeSingle()

    const { error: insertErr } = await (adminClient.from('money_requests') as any).insert({
      requester_id: requesterId,
      recipient_id: cardRow.user_id,
      amount,
      description: reason || `Card payment via Welile (${card_id.slice(0, 8)})`,
    })

    if (insertErr) {
      console.error('money_requests insert error', insertErr)
      return new Response(JSON.stringify({ error: 'Failed to create payment request' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        amount,
        recipient_id: cardRow.user_id,
        requester_name: requesterProfile?.full_name ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('verify-nfc-card error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})