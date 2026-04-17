import { createClient } from "npm:@supabase/supabase-js@2";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Treasury guard: scheduled payouts must respect maintenance freeze
  const guardBlock = await checkTreasuryGuard(adminClient, "any");
  if (guardBlock) return guardBlock;

  try {
    const now = new Date();

    // Find all enabled scheduled payouts where next_run_at <= now
    const { data: duePays, error: fetchErr } = await adminClient
      .from("scheduled_payouts")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", now.toISOString());

    if (fetchErr) {
      console.error("[process-scheduled-payouts] Fetch error:", fetchErr.message);
      throw fetchErr;
    }

    if (!duePays?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No due payouts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const payout of duePays) {
      try {
        // Look up category config to get wallet/platform categories
        const catMap: Record<string, { walletCat: string; platformCat: string; impact: string }> = {
          roi_payout: { walletCat: 'roi_wallet_credit', platformCat: 'roi_expense', impact: 'expense' },
          agent_commission: { walletCat: 'agent_commission_earned', platformCat: 'agent_commission_earned', impact: 'expense' },
          marketing_expenses: { walletCat: 'system_balance_correction', platformCat: 'system_balance_correction', impact: 'expense' },
          research_development: { walletCat: 'system_balance_correction', platformCat: 'system_balance_correction', impact: 'expense' },
          operational_expense: { walletCat: 'system_balance_correction', platformCat: 'system_balance_correction', impact: 'expense' },
          correction_credit: { walletCat: 'system_balance_correction', platformCat: 'system_balance_correction', impact: 'neutral' },
          wallet_transfer_out: { walletCat: 'wallet_transfer', platformCat: 'wallet_transfer', impact: 'neutral' },
        };

        const catConfig = catMap[payout.category_id] || catMap['operational_expense'];
        const subLabel = payout.sub_category ? ` → ${payout.sub_category}` : '';

        // Call cfo-direct-credit via internal fetch with service role
        const res = await fetch(`${supabaseUrl}/functions/v1/cfo-direct-credit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            target_user_id: payout.target_user_id,
            amount: Number(payout.amount),
            reason: `[Automated] ${payout.reason}${subLabel}`,
            operation: 'credit',
            wallet_category: catConfig.walletCat,
            platform_category: catConfig.platformCat,
            financial_impact: catConfig.impact,
            category_label: `Auto: ${payout.category_id}${subLabel}`,
            sub_category: payout.sub_category,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.error(`[process-scheduled-payouts] Failed for payout ${payout.id}:`, errBody);
          failed++;
          continue;
        }

        // Advance next_run_at by one month
        const nextRun = new Date(payout.next_run_at);
        nextRun.setMonth(nextRun.getMonth() + 1);

        await adminClient.from("scheduled_payouts").update({
          last_run_at: now.toISOString(),
          next_run_at: nextRun.toISOString(),
        }).eq("id", payout.id);

        processed++;
      } catch (innerErr) {
        console.error(`[process-scheduled-payouts] Error processing ${payout.id}:`, innerErr);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed, failed, total: duePays.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-scheduled-payouts] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
