import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  token: string;
  employee_name: string;
  employee_id?: string;
  department?: string;
  employee_phone?: string;
  employee_email: string;
  purpose: string;
  category: string;
  amount: number;
  currency?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  required_by?: string | null;
  description?: string;
  attachment_urls?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body.token || !body.employee_name || !body.employee_email || !body.purpose || !body.category) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'invalid_amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: link, error: linkErr } = await admin
      .from('requisition_links')
      .select('id, is_active, expires_at, max_submissions, submission_count, revoked_at, department')
      .eq('token', body.token)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) return json({ error: 'invalid_token' }, 404);
    if (!link.is_active || link.revoked_at) return json({ error: 'revoked' }, 403);
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json({ error: 'expired' }, 403);
    }
    if (link.max_submissions && link.submission_count >= link.max_submissions) {
      return json({ error: 'exhausted' }, 403);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    // Simple per-IP rate limit: max 5 submissions per hour per IP
    if (ip) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('employee_requisitions')
        .select('id', { count: 'exact', head: true })
        .eq('submitter_ip', ip)
        .gte('submitted_at', hourAgo);
      if ((count ?? 0) >= 5) return json({ error: 'rate_limited' }, 429);
    }

    const { data: inserted, error: insErr } = await admin
      .from('employee_requisitions')
      .insert({
        link_id: link.id,
        employee_name: body.employee_name.trim().slice(0, 200),
        employee_id: body.employee_id?.trim().slice(0, 100) || null,
        department: (body.department || link.department || '').trim().slice(0, 100) || null,
        employee_phone: body.employee_phone?.trim().slice(0, 40) || null,
        employee_email: body.employee_email.trim().slice(0, 200),
        purpose: body.purpose.trim().slice(0, 300),
        category: body.category.trim().slice(0, 100),
        amount,
        currency: (body.currency || 'UGX').slice(0, 8),
        priority: body.priority ?? 'normal',
        required_by: body.required_by || null,
        description: body.description?.slice(0, 4000) || null,
        attachment_urls: Array.isArray(body.attachment_urls) ? body.attachment_urls.slice(0, 10) : [],
        submitter_ip: ip,
      })
      .select('id')
      .single();

    if (insErr) throw insErr;

    await admin
      .from('requisition_links')
      .update({ submission_count: link.submission_count + 1 })
      .eq('id', link.id);

    // Emit system event
    try {
      await admin.from('system_events').insert({
        event_type: 'requisition.submitted',
        payload: { id: inserted.id, amount, employee_name: body.employee_name },
      } as never);
    } catch (_) { /* non-fatal */ }

    // Notify CFOs in-app
    try {
      const { data: cfoRows } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'cfo');
      const notifs = (cfoRows ?? []).map((r: { user_id: string }) => ({
        user_id: r.user_id,
        title: 'New Requisition Submitted',
        message: `${body.employee_name} • ${body.currency ?? 'UGX'} ${amount.toLocaleString()} — ${body.purpose}`,
        type: 'requisition',
        metadata: { requisition_id: inserted.id },
      }));
      if (notifs.length) await admin.from('notifications').insert(notifs as never);
    } catch (_) { /* non-fatal */ }

    return json({ ok: true, id: inserted.id }, 200);
  } catch (e) {
    console.error('submit error', e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
