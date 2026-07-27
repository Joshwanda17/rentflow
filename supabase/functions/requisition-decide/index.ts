import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Confirm caller has CFO/manager/super_admin role
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const okRoles = new Set(['cfo', 'super_admin', 'manager']);
    if (!(roles ?? []).some((r: { role: string }) => okRoles.has(r.role))) {
      return json({ error: 'forbidden' }, 403);
    }

    const body = await req.json() as { id: string; action: 'approve' | 'reject'; reason?: string; amount?: number };
    if (!body?.id || !['approve', 'reject'].includes(body.action)) return json({ error: 'bad_request' }, 400);
    if (body.action === 'reject' && (!body.reason || body.reason.trim().length < 10)) {
      return json({ error: 'reason_required' }, 400);
    }

    // Optional CFO amount override on approval
    let overrideAmount: number | null = null;
    if (body.action === 'approve' && body.amount != null) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) return json({ error: 'invalid_amount' }, 400);
      overrideAmount = Math.round(n * 100) / 100;
    }

    const patch = body.action === 'approve'
      ? {
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
          ...(overrideAmount != null ? { amount: overrideAmount } : {}),
        }
      : { status: 'rejected', approved_by: userId, approved_at: new Date().toISOString(), rejection_reason: body.reason!.trim() };

    const { data: updated, error: upErr } = await admin
      .from('employee_requisitions')
      .update(patch)
      .eq('id', body.id)
      .select('id, employee_email, employee_name, amount, currency, purpose, category')
      .single();
    if (upErr) throw upErr;

    // On approval, credit the requester's wallet via CFO Direct Credit.
    let creditError: string | null = null;
    if (body.action === 'approve') {
      try {
        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .ilike('email', updated.employee_email)
          .maybeSingle();
        if (!profile?.id) {
          creditError = 'No user profile matches ' + updated.employee_email;
        } else {
          const { data: cc, error: ccErr } = await admin.functions.invoke('cfo-direct-credit', {
            body: {
              target_user_id: profile.id,
              amount: Number(updated.amount),
              operation: 'credit',
              recipient_type: 'user',
              wallet_category: 'payroll_expense',
              platform_category: 'payroll_expense',
              financial_impact: 'expense',
              category_label: 'Employee Requisition',
              sub_category: updated.category,
              reason: `Requisition ${updated.id.slice(0, 8)}: ${updated.purpose}`,
              manual_credit: true,
            },
          });
          if (ccErr || (cc as { error?: string })?.error) {
            creditError = (cc as { error?: string })?.error ?? ccErr?.message ?? 'credit_failed';
          } else {
            await admin
              .from('employee_requisitions')
              .update({ status: 'paid' })
              .eq('id', body.id);
          }
        }
      } catch (e) {
        creditError = String((e as Error).message ?? e);
      }
    }

    // Audit
    try {
      await admin.from('audit_logs').insert({
        action_type: body.action === 'approve' ? 'requisition_approved' : 'requisition_rejected',
        table_name: 'employee_requisitions',
        record_id: body.id,
        performed_by: userId,
        reason: body.action === 'approve'
          ? `CFO approval via portal (${updated.currency} ${Number(updated.amount).toLocaleString()})`
          : body.reason!.trim(),
      } as never);
    } catch (_) { /* non-fatal */ }

    // Best-effort email to employee
    try {
      const subject = body.action === 'approve'
        ? 'Requisition Approved'
        : 'Requisition Rejected';
      const html = body.action === 'approve'
        ? `<p>Hello ${updated.employee_name},</p><p>Your requisition for <b>${updated.currency} ${Number(updated.amount).toLocaleString()}</b> — ${updated.purpose} — has been approved and forwarded to Finance.</p>`
        : `<p>Hello ${updated.employee_name},</p><p>Your requisition for <b>${updated.currency} ${Number(updated.amount).toLocaleString()}</b> — ${updated.purpose} — was rejected.</p><p><b>Reason:</b> ${body.reason}</p>`;
      await admin.functions.invoke('send-email', {
        body: { to: updated.employee_email, subject, html },
      });
    } catch (_) { /* non-fatal */ }

    return json({ ok: true, credit_error: creditError }, 200);
  } catch (e) {
    console.error('decide error', e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
