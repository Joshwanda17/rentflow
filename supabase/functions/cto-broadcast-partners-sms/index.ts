import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ROLES = ['coo', 'ceo', 'cto', 'super_admin', 'manager'];

function formatPhoneInternational(phone: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('256')) return `+${digits}`;
  if (digits.startsWith('0')) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

function isValidPhone(p: string | null | undefined): boolean {
  if (!p) return false;
  const t = String(p).trim();
  if (!t || t === '-') return false;
  return t.replace(/\D/g, '').length >= 7;
}

async function sendBatch(numbers: string[], message: string) {
  const apiKey = Deno.env.get('AFRICASTALKING_API_KEY');
  const username = Deno.env.get('AFRICASTALKING_USERNAME');
  if (!apiKey || !username) return { ok: false, sent: 0, failed: numbers.length, reason: 'missing_credentials' };
  const isSandbox = username.toLowerCase() === 'sandbox';
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  const params = new URLSearchParams({
    username,
    to: numbers.join(','),
    message,
    from: 'WELILE',
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', apiKey, Accept: 'application/json' },
      body: params.toString(),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }
    const recipients: any[] = data?.SMSMessageData?.Recipients || [];
    let sent = 0, failed = 0;
    for (const r of recipients) {
      if (r.statusCode === 101 || r.statusCode === 100 || r.statusCode === 102) sent++;
      else failed++;
    }
    if (recipients.length === 0) failed = numbers.length;
    return { ok: res.ok, sent, failed, raw: data ?? text };
  } catch (e) {
    return { ok: false, sent: 0, failed: numbers.length, reason: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const caller = userData.user;

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', caller.id);
    const allowed = (roles || []).some((r: any) => ALLOWED_ROLES.includes(r.role));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const message = (body.message || '').toString().trim();
    const dryRun = !!body.dry_run;
    const testPhoneRaw = (body.test_phone || '').toString().trim();
    const isTest = !!testPhoneRaw;

    if (!isTest && !dryRun && (!message || message.length < 2)) {
      return new Response(JSON.stringify({ error: 'Message body is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (message.length > 800) {
      return new Response(JSON.stringify({ error: 'Message too long (max 800 chars / 5 SMS segments)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build audience: every distinct portfolio-holding partner with a valid phone.
    const CHUNK = 100;
    const phones = new Set<string>();
    const recipients: { user_id: string; phone: string }[] = [];

    if (isTest) {
      const p = formatPhoneInternational(testPhoneRaw);
      if (!p || p.replace(/\D/g, '').length < 9) {
        return new Response(JSON.stringify({ error: 'Invalid test phone' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      recipients.push({ user_id: caller.id, phone: p });
    } else {
      const { data: portRows, error: portErr } = await admin
        .from('investor_portfolios').select('investor_id');
      if (portErr) throw portErr;
      const userIds = Array.from(new Set((portRows || []).map((r: any) => r.investor_id))).filter(Boolean);
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const slice = userIds.slice(i, i + CHUNK);
        const { data: profs } = await admin
          .from('profiles').select('id, phone').in('id', slice);
        for (const prof of profs || []) {
          if (!isValidPhone((prof as any).phone)) continue;
          const intl = formatPhoneInternational((prof as any).phone);
          if (!intl || phones.has(intl)) continue;
          phones.add(intl);
          recipients.push({ user_id: (prof as any).id, phone: intl });
        }
      }
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, dry_run: true, recipient_count: recipients.length,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Send in AT-friendly batches.
    const BATCH = 100;
    let sent = 0, failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH).map((r) => r.phone);
      const result = await sendBatch(batch, message);
      sent += result.sent;
      failed += result.failed;
      if (!result.ok && result.reason) errors.push(result.reason);
    }

    await admin.from('audit_logs').insert({
      user_id: caller.id,
      action_type: isTest ? 'cto_partner_sms_broadcast_test' : 'cto_partner_sms_broadcast_sent',
      table_name: 'profiles',
      record_id: caller.id,
      reason: isTest
        ? 'CTO partner SMS broadcast TEST send'
        : 'CTO partner SMS broadcast to portfolio-holding partners',
      metadata: {
        message_length: message.length,
        segments: Math.max(1, Math.ceil(message.length / 160)),
        sent, failed,
        total: recipients.length,
        test_phone: isTest ? testPhoneRaw : null,
        errors_sample: errors.slice(0, 5),
      },
    });

    return new Response(JSON.stringify({
      success: true,
      test: isTest,
      sent, failed,
      total: recipients.length,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('cto-broadcast-partners-sms error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});