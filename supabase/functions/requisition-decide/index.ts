import { createClient } from 'npm:@supabase/supabase-js@2';
import { creditRequisitionWallet } from '../_shared/requisitionWalletCredit.ts';

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
      .select('id, employee_email, employee_name, amount, currency, purpose, category, status, approved_at')
      .single();
    if (upErr) throw upErr;

    // On approval, credit the requester's wallet (idempotent + ledger-backed).
    let creditError: string | null = null;
    let walletCredit: unknown = null;
    if (body.action === 'approve') {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', updated.employee_email)
        .maybeSingle();
      if (!profile?.id) {
        creditError = 'No user profile matches ' + updated.employee_email;
        await admin.from('employee_requisitions').update({ wallet_credit_status: 'failed' }).eq('id', body.id);
      } else {
        const result = await creditRequisitionWallet({
          admin,
          sourceTable: 'employee_requisitions',
          requisitionId: body.id,
          requisitionCode: String(updated.id).slice(0, 8).toUpperCase(),
          userId: profile.id,
          approverId: userId,
          amount: Number(updated.amount),
          currency: updated.currency || 'UGX',
          purpose: updated.purpose,
          category: updated.category,
          status: 'approved',
          approvedAt: updated.approved_at,
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
          deviceInfo: req.headers.get('user-agent'),
        });
        walletCredit = result;
        if (!result.ok) creditError = result.error ?? result.message;
        else if (!result.already_credited) {
          await admin.from('employee_requisitions').update({ status: 'paid' }).eq('id', body.id);
        }
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

    return json({ ok: true, credit_error: creditError, wallet_credit: walletCredit }, 200);
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
