import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

const fmtIsoDay = (iso: string | null | undefined): string => {
  if (!iso) return "none";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "none";
  return d.toISOString().slice(0, 10);
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildTemplateData(opts: {
  partner_name: string;
  partnership_reference: string;
  portfolio_id: string;
  partnership_amount: number;
  start_date: string;
  maturity_date: string;
  currency: string;
}) {
  return {
    partner_name: opts.partner_name,
    partnership_reference: opts.partnership_reference,
    portfolio_id: opts.portfolio_id,
    partnership_amount: opts.partnership_amount,
    start_date: opts.start_date,
    maturity_date: opts.maturity_date,
    currency: opts.currency,
    company_name: "Welile",
    logo_url: "https://welilereceipts.com/welile-logo.png",
    dashboard_url: "https://welilereceipts.com/auth",
    unsubscribe_url: "https://welile.com/unsubscribe",
    terms_url: "https://welilereceipts.com/partners-terms",
    privacy_url: "https://welilereceipts.com/privacy",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // COO / Manager / Super Admin / CTO / Partner-Ops guard
    const [{ data: managerRoles, error: roleErr }, { data: staffPerms, error: permErr }] = await Promise.all([
      adminClient.from("user_roles").select("role")
        .eq("user_id", caller.id).in("role", ["manager", "coo", "super_admin", "cto"]),
      adminClient.from("staff_permissions").select("permitted_dashboard")
        .eq("user_id", caller.id).eq("permitted_dashboard", "partner-ops"),
    ]);
    if (roleErr) return json({ error: `Role check failed: ${roleErr.message}` }, 500);
    if (permErr) return json({ error: `Permission check failed: ${permErr.message}` }, 500);
    const hasRole = (managerRoles?.length ?? 0) > 0;
    const hasPartnerOps = (staffPerms?.length ?? 0) > 0;
    if (!hasRole && !hasPartnerOps) {
      return json({ error: "Only Welile Operations (COO, Manager, Super Admin, Partner Ops) can perform this action" }, 403);
    }

    const body = await req.json().catch(() => ({})) as {
      test?: boolean;
      testEmail?: string;
      partnerIds?: string[];
    };

    const dispatch = async (payload: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.warn("[bulk-send-maturity-notice] send failed:", res.status, txt);
          return false;
        }
        return true;
      } catch (e) {
        console.warn("[bulk-send-maturity-notice] send threw:", e);
        return false;
      }
    };

    // ─── TEST MODE: single sample email ───
    if (body.test) {
      const testEmail = (body.testEmail || "").trim();
      if (!testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
        return json({ error: "A valid testEmail is required for test mode" }, 400);
      }
      const now = new Date();
      const maturity = new Date(now);
      maturity.setMonth(maturity.getMonth() + 12);
      const ok = await dispatch({
        templateName: "partnership-maturity-notice",
        recipientEmail: testEmail,
        idempotencyKey: `partnership-maturity-notice-test-${Date.now()}`,
        templateData: buildTemplateData({
          partner_name: "Sarah Nakato",
          partnership_reference: "PF-TEST-001",
          portfolio_id: "PF-TEST-001",
          partnership_amount: 5_600_000,
          start_date: fmtDate(now.toISOString()),
          maturity_date: fmtDate(maturity.toISOString()),
          currency: "UGX",
        }),
      });
      return json({ ok, test: true, recipient: testEmail }, ok ? 200 : 502);
    }

    // ─── BULK MODE: send to active partnerships with a maturity date ───
    const partnerIds = Array.isArray(body.partnerIds)
      ? body.partnerIds.filter((id) => typeof id === "string" && UUID.test(id))
      : null;

    let query = adminClient
      .from("investor_portfolios")
      .select("id, portfolio_code, account_name, investment_amount, created_at, maturity_date, display_currency, status, investor_id, agent_id")
      .not("maturity_date", "is", null)
      .in("status", ["active", "funded", "repaying"]);

    if (partnerIds && partnerIds.length > 0) {
      query = query.in("investor_id", partnerIds);
    }

    const { data: portfolios, error: pErr } = await query;
    if (pErr) return json({ error: `Failed to load portfolios: ${pErr.message}` }, 500);

    if (!portfolios || portfolios.length === 0) {
      return json({ ok: true, sent: 0, skipped: 0, failed: 0, total: 0, message: "No matching partnerships with a maturity date" }, 200);
    }

    // Resolve recipient emails in one batch.
    const recipientIds = Array.from(
      new Set(portfolios.map((p: any) => p.investor_id || p.agent_id).filter(Boolean)),
    );
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("id", recipientIds);
    const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
    for (const pr of profiles ?? []) profileMap.set(pr.id, { email: pr.email, full_name: pr.full_name });

    let sent = 0, skipped = 0, failed = 0;

    for (const p of portfolios as any[]) {
      const recipientId = p.investor_id || p.agent_id;
      const profile = recipientId ? profileMap.get(recipientId) : null;
      const email = profile?.email?.trim();
      if (!email) { skipped++; continue; }

      const ref = p.portfolio_code || `PF-${String(p.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const ok = await dispatch({
        templateName: "partnership-maturity-notice",
        recipientEmail: email,
        idempotencyKey: `partnership-maturity-notice-${p.id}-${fmtIsoDay(p.maturity_date)}`,
        templateData: buildTemplateData({
          partner_name: profile?.full_name || "Partner",
          partnership_reference: ref,
          portfolio_id: ref,
          partnership_amount: Number(p.investment_amount) || 0,
          start_date: fmtDate(p.created_at),
          maturity_date: fmtDate(p.maturity_date),
          currency: p.display_currency || "UGX",
        }),
      });
      if (ok) sent++; else failed++;
    }

    return json({ ok: true, sent, skipped, failed, total: portfolios.length }, 200);
  } catch (err) {
    console.error("[bulk-send-maturity-notice] fatal:", err);
    return json({ error: (err as Error)?.message || "Unexpected error" }, 500);
  }
});