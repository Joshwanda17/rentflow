// Resend the latest stored partner agreement PDF without regenerating it.
// Used when an already counter-signed agreement needs to be resent, including
// a direct partnerships mailbox copy for audit even if the partner address is suppressed.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PARTNERSHIP_EMAIL = 'partnership@welile.com'

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion']

function threeDigits(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h > 0) parts.push(`${ONES[h]} Hundred`)
  if (r > 0) {
    if (r < 20) parts.push(ONES[r])
    else {
      const t = Math.floor(r / 10)
      const o = r % 10
      parts.push(o > 0 ? `${TENS[t]}-${ONES[o]}` : TENS[t])
    }
  }
  return parts.join(' ')
}

function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value || 0))
  if (n === 0) return 'Zero'
  const groups: number[] = []
  let rem = n
  while (rem > 0) {
    groups.push(rem % 1000)
    rem = Math.floor(rem / 1000)
  }
  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const chunk = threeDigits(groups[i])
    const scale = SCALES[i]
    words.push(scale ? `${chunk} ${scale}` : chunk)
  }
  return words.join(' ').replace(/\s+/g, ' ').trim()
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function isAuthorized(admin: ReturnType<typeof createClient>, userId: string) {
  const [{ data: isOps }, { data: isManager }, { data: isSuperAdmin }] = await Promise.all([
    admin.rpc('is_ops_role', { _user_id: userId }),
    admin.rpc('has_role', { _user_id: userId, _role: 'manager' }),
    admin.rpc('has_role', { _user_id: userId, _role: 'super_admin' }),
  ])
  return isOps === true || isManager === true || isSuperAdmin === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

    const admin = createClient(supabaseUrl, serviceKey)
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401)
    if (!(await isAuthorized(admin, userData.user.id))) return json({ error: 'Insufficient permissions' }, 403)

    const body = await req.json().catch(() => ({}))
    const partnerId = String(body?.partnerId || '').trim()
    const forcePartner = body?.forcePartner === true
    const processNow = body?.processNow !== false
    if (!partnerId) return json({ error: 'partnerId is required' }, 400)

    const { data: row, error: rowErr } = await admin
      .from('partner_agreements')
      .select('*')
      .eq('partner_id', partnerId)
      .maybeSingle()
    if (rowErr) return json({ error: rowErr.message }, 500)
    if (!row) return json({ error: 'Agreement not found' }, 404)
    if (!row.generated_pdf_path) return json({ error: 'No generated agreement PDF is stored for this partner' }, 422)

    const { data: signed, error: signErr } = await admin.storage
      .from('partner-agreements')
      .createSignedUrl(row.generated_pdf_path, 60 * 60 * 24 * 365)
    if (signErr) return json({ error: signErr.message }, 500)

    const amountNum = Math.max(0, Math.floor(Number(row.partnership_amount) || 0))
    const payoutSummary = row.payout_mode !== 'momo'
      ? [row.bank_name, row.bank_account_number].filter(Boolean).join(' ') || 'Bank Transfer'
      : [row.momo_provider, row.momo_number].filter(Boolean).join(' ') || 'Mobile Money'

    const templateData = {
      partner_name: row.full_name || 'Partner',
      partner_email: row.email || '',
      partner_reference: row.reference || `PA-${partnerId.slice(0, 8).toUpperCase()}`,
      partnership_amount: `UGX ${amountNum.toLocaleString('en-US')}`,
      partnership_amount_words: row.partnership_amount_words || numberToWords(amountNum),
      monthly_return: '15%',
      payout_summary: payoutSummary,
      agreement_download_url: signed?.signedUrl || 'https://welileapp.com',
      company_name: 'WELILE TECHNOLOGIES LTD',
    }

    const results: Record<string, unknown> = {}

    if (row.email) {
      const normalized = String(row.email).toLowerCase()
      if (forcePartner) {
        await admin.from('suppressed_emails').delete().eq('email', normalized)
        await admin.from('email_unsubscribe_tokens').update({ used_at: null }).eq('email', normalized)
      }

      const { data, error } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'tenant-partnership-agreement',
          recipientEmail: row.email,
          idempotencyKey: `partner-agreement-resend-${row.id}-${crypto.randomUUID()}`,
          templateData,
        },
      })
      results.partner = error ? { error: error.message } : data
    }

    const { data: partnershipData, error: partnershipError } = await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'tenant-partnership-agreement',
        recipientEmail: PARTNERSHIP_EMAIL,
        idempotencyKey: `partner-agreement-copy-${row.id}-${crypto.randomUUID()}`,
        templateData: {
          ...templateData,
          original_partner_email: row.email || null,
          audit_copy_reason: forcePartner ? 'forced_partner_resend' : 'partner_agreement_resend',
        },
      },
    })
    results.partnership = partnershipError ? { error: partnershipError.message } : partnershipData

    if (processNow) {
      const processRes = await fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'partner_agreement_resend' }),
      })
      results.processed = await processRes.json().catch(() => ({ ok: processRes.ok }))
    }

    return json({ ok: true, partnerEmail: row.email || null, partnershipEmail: PARTNERSHIP_EMAIL, results })
  } catch (error) {
    console.error('resend-partner-agreement-email error:', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})