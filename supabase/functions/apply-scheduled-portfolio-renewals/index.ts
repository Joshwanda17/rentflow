import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Batch-fetch every portfolio whose scheduled effective date has arrived,
    // joining the investor profile so we resolve name + email in one round-trip.
    const { data: scheduledDue, error: dueErr } = await admin
      .from("investor_portfolios")
      .select(
        `id, portfolio_code, account_name, investor_id, investment_amount,
         roi_percentage, duration_months, maturity_date, pending_renewal_effective_date,
         pending_renewal_request_id,
         investor:profiles!investor_portfolios_investor_id_fkey(email, full_name)`,
      )
      .not("pending_renewal_effective_date", "is", null)
      .lte("pending_renewal_effective_date", todayStr)
      .limit(1000);

    if (dueErr) throw dueErr;

    // Also auto-renew any ACTIVE portfolio that has silently passed its
    // maturity date without a scheduled renewal — otherwise expired portfolios
    // sit un-rolled and payouts run against a matured principal.
    const { data: expiredNoSchedule, error: expErr } = await admin
      .from("investor_portfolios")
      .select(
        `id, portfolio_code, account_name, investor_id, investment_amount,
         roi_percentage, duration_months, maturity_date, pending_renewal_effective_date,
         pending_renewal_request_id,
         investor:profiles!investor_portfolios_investor_id_fkey(email, full_name)`,
      )
      .eq("status", "active")
      .not("maturity_date", "is", null)
      .lte("maturity_date", todayStr)
      .is("pending_renewal_effective_date", null)
      .limit(1000);
    if (expErr) throw expErr;

    const seen = new Set<string>();
    const due = [...(scheduledDue || []), ...(expiredNoSchedule || [])].filter((r: any) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // Resolve a system actor once (cron has no auth.uid())
    let systemActor: string | null = null;
    const { data: cfo } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "cfo")
      .limit(1)
      .maybeSingle();
    systemActor = cfo?.user_id ?? null;
    if (!systemActor) {
      const { data: mgr } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager")
        .limit(1)
        .maybeSingle();
      systemActor = mgr?.user_id ?? null;
    }
    if (!systemActor) return json({ error: "no_system_actor" }, 500);

    let renewed = 0;
    let emailed = 0;
    const errors: Array<{ portfolio_id: string; error: string }> = [];

    for (const row of due ?? []) {
      try {
        const { data: res, error: renewErr } = await admin.rpc(
          "apply_portfolio_renewal",
          {
            p_portfolio_id: row.id,
            p_renewed_by: systemActor,
            p_reason: "Nightly auto-renewal at scheduled maturity",
          },
        );
        if (renewErr) throw renewErr;
        renewed++;

        const investor: any = (row as any).investor;
        const email: string | null = investor?.email ?? null;
        const isRealEmail =
          !!email &&
          !email.endsWith("@welile.user") &&
          !email.endsWith("@noapp.welile.user");
        if (isRealEmail) {
          const r: any = res;
          const emailRes = await fetch(
            `${supabaseUrl}/functions/v1/send-transactional-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                templateName: "portfolio-renewal",
                recipientEmail: email,
                idempotencyKey: `portfolio-auto-renewed-${row.id}-${todayStr}`,
                templateData: {
                  partner_name: investor?.full_name || "Partner",
                  portfolio_name:
                    r?.account_name || row.account_name || row.portfolio_code,
                  portfolio_id: r?.portfolio_code || row.portfolio_code,
                  amount: Number(r?.investment_amount ?? row.investment_amount ?? 0),
                  new_principal: Number(
                    r?.investment_amount ?? row.investment_amount ?? 0,
                  ),
                  return_rate: `${r?.roi_percentage ?? row.roi_percentage}%`,
                  renewal_date: fmtDate(new Date(r?.new_start || Date.now())),
                  maturity_date: fmtDate(
                    new Date(`${r?.new_maturity_date}T00:00:00Z`),
                  ),
                  duration: `${r?.duration_months ?? row.duration_months} months`,
                  currency: "UGX",
                  company_name: "Welile",
                  logo_url: "https://welileapp.com/welile-logo.png",
                  unsubscribe_url: "https://welile.com/unsubscribe",
                  terms_url: "https://welileapp.com/partners-terms",
                  privacy_url: "https://welileapp.com/privacy",
                  days_remaining: 0,
                  days_remaining_label: "Applied today",
                },
              }),
            },
          );
          if (emailRes.ok) emailed++;
        }
      } catch (e) {
        errors.push({ portfolio_id: row.id, error: (e as Error).message });
      }
    }

    return json({
      ok: true,
      due_count: due?.length ?? 0,
      renewed,
      emailed,
      errors,
    });
  } catch (err) {
    console.error("[apply-scheduled-portfolio-renewals] failed", err);
    return json({ error: (err as Error).message || "internal_error" }, 500);
  }
});