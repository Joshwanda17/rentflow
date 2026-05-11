import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SENDER_DOMAIN = 'notify.welile.com';
const FROM_DOMAIN = 'welile.com';
const FROM_HEADER = `Welile Partnerships <partnership@${FROM_DOMAIN}>`;
const ALLOWED_ROLES = ['coo', 'ceo', 'cto', 'super_admin', 'manager'];

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHtml(input: string): string {
  // strip <script>, <style>, on* handlers, javascript: urls
  let html = input || '';
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/ on[a-z]+="[^"]*"/gi, '');
  html = html.replace(/ on[a-z]+='[^']*'/gi, '');
  html = html.replace(/javascript:/gi, '');
  return html;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h\d|br)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wrapEmail(subject: string, bodyHtml: string, unsubUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:620px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
      <div style="font-size:12px;letter-spacing:2px;opacity:0.85;text-transform:uppercase;">Welile Partnerships</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(subject)}</div>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;line-height:1.6;font-size:15px;">
      ${bodyHtml}
    </div>
    <div style="text-align:center;font-size:12px;color:#6b7280;margin-top:18px;">
      You're receiving this as a Welile partner.<br/>
      <a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a>
    </div>
  </div>
</body></html>`;
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

    const { data: roles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id);
    const allowed = (roles || []).some((r: any) => ALLOWED_ROLES.includes(r.role));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. COO/CEO/super_admin only.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const subject = (body.subject || '').toString().trim();
    const rawHtml = (body.html || '').toString();
    const dryRun = !!body.dry_run;

    if (!subject || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Subject is required (max 200 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const bodyHtml = sanitizeHtml(rawHtml);
    const plainProbe = htmlToText(bodyHtml);
    if (!plainProbe || plainProbe.length < 2) {
      return new Response(JSON.stringify({ error: 'Message body cannot be empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (bodyHtml.length > 100000) {
      return new Response(JSON.stringify({ error: 'Message body too large' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve all distinct partner (supporter role) emails
    const { data: roleRows, error: roleErr } = await admin
      .from('user_roles').select('user_id').eq('role', 'supporter');
    if (roleErr) throw roleErr;
    const userIds = Array.from(new Set((roleRows || []).map((r: any) => r.user_id))).filter(Boolean);

    const emails = new Set<string>();
    const recipients: { user_id: string; email: string }[] = [];
    // Page through profiles to keep below 1000-row default
    const CHUNK = 100;
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const slice = userIds.slice(i, i + CHUNK);
      const { data: profs, error: profErr } = await admin
        .from('profiles').select('id, email').in('id', slice);
      if (profErr) throw profErr;
      for (const p of profs || []) {
        const e = (p.email || '').toString().trim().toLowerCase();
        if (!e || !e.includes('@') || e.endsWith('.welile.user') || e.endsWith('.noapp.welile.user')) continue;
        if (emails.has(e)) continue;
        emails.add(e);
        recipients.push({ user_id: p.id, email: e });
      }
    }

    // Filter out suppressed emails
    const allEmails = recipients.map((r) => r.email);
    const suppressed = new Set<string>();
    if (allEmails.length) {
      for (let i = 0; i < allEmails.length; i += CHUNK) {
        const slice = allEmails.slice(i, i + CHUNK);
        const { data: sup } = await admin
          .from('email_suppressions').select('email').in('email', slice);
        for (const s of sup || []) suppressed.add((s as any).email);
      }
    }
    const finalRecipients = recipients.filter((r) => !suppressed.has(r.email));

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, dry_run: true,
        recipient_count: finalRecipients.length,
        suppressed_count: suppressed.size,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const unsubBase = `${supabaseUrl.replace('.supabase.co', '.supabase.co')}/functions/v1/handle-email-unsubscribe`;

    let queued = 0;
    const errors: string[] = [];
    for (const r of finalRecipients) {
      const messageId = crypto.randomUUID();
      // upsert unsubscribe token
      let unsubToken = '';
      const { data: existing } = await admin
        .from('email_unsubscribe_tokens').select('token, used_at').eq('email', r.email).maybeSingle();
      if (existing && !(existing as any).used_at) {
        unsubToken = (existing as any).token;
      } else {
        unsubToken = generateToken();
        await admin.from('email_unsubscribe_tokens').upsert(
          { token: unsubToken, email: r.email },
          { onConflict: 'email', ignoreDuplicates: true },
        );
        const { data: stored } = await admin
          .from('email_unsubscribe_tokens').select('token').eq('email', r.email).maybeSingle();
        if (stored) unsubToken = (stored as any).token;
      }
      const unsubUrl = `${unsubBase}?token=${encodeURIComponent(unsubToken)}`;

      const html = wrapEmail(subject, bodyHtml, unsubUrl);
      const text = `${subject}\n\n${htmlToText(bodyHtml)}\n\nUnsubscribe: ${unsubUrl}`;

      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'coo-partner-broadcast',
        recipient_email: r.email,
        status: 'pending',
      });

      const { error: enqErr } = await admin.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: r.email,
          from: FROM_HEADER,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'coo-partner-broadcast',
          idempotency_key: messageId,
          unsubscribe_token: unsubToken,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqErr) {
        errors.push(`${r.email}: ${enqErr.message}`);
        await admin.from('email_send_log').insert({
          message_id: messageId,
          template_name: 'coo-partner-broadcast',
          recipient_email: r.email,
          status: 'failed',
          error_message: 'enqueue_email failed',
        });
      } else {
        queued++;
      }
    }

    await admin.from('audit_logs').insert({
      user_id: caller.id,
      action_type: 'coo_partner_broadcast_sent',
      table_name: 'email_send_log',
      record_id: caller.id,
      reason: 'COO mass broadcast to partners',
      metadata: {
        subject,
        queued,
        suppressed: suppressed.size,
        total_partner_emails: recipients.length,
        errors_count: errors.length,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      queued,
      suppressed: suppressed.size,
      total: recipients.length,
      errors: errors.slice(0, 10),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('coo-broadcast-partners error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
