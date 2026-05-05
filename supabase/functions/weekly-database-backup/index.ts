import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["joshwanda17@gmail.com", "weliletechnologies@gmail.com"];
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const TABLES = [
  "ledger_account_groups", "ledger_accounts", "profiles", "user_roles", "wallets",
  "landlords", "lc1_chairpersons", "vendors", "product_categories", "products",
  "product_images", "conversations", "conversation_participants", "messages",
  "notifications", "referrals", "referral_rewards", "agent_advances",
  "agent_advance_ledger", "agent_advance_topups", "agent_collections",
  "agent_commission_payouts", "agent_earnings", "agent_float_limits",
  "agent_goals", "agent_rebalance_records", "agent_receipts", "agent_subagents",
  "agent_visits", "ai_chat_messages", "audit_logs", "cart_items",
  "credit_access_limits", "credit_request_details", "deposit_requests",
  "earning_baselines", "earning_predictions", "float_requests", "general_ledger",
  "investment_withdrawal_requests", "investor_portfolios",
  "landlord_ambassador_referrals", "ledger_entries", "ledger_transactions",
  "liquidity_alerts", "loan_applications", "location_requests",
  "money_requests", "onboarding_targets", "operations_departments",
  "opportunity_summaries", "otp_verifications", "payment_tokens",
  "pending_wallet_operations", "product_orders", "product_reviews",
  "push_subscriptions", "receipt_numbers", "rent_history_records",
  "rent_requests", "repayments", "review_images", "review_responses",
  "review_votes", "staff_profiles", "subscription_charge_logs",
  "subscription_charges", "supporter_agreement_acceptance", "supporter_invites",
  "supporter_referrals", "supporter_roi_payments", "system_events",
  "tenant_agreement_acceptance", "tenant_merchant_payments", "tenant_ratings",
  "tenant_replacements", "transaction_approvals", "user_activity_log",
  "user_loan_repayments", "user_loans", "user_locations", "user_receipts",
  "user_reviews", "user_risk_scores", "voided_ledger_entries",
  "wallet_deposits", "wallet_transactions", "welile_homes_subscriptions",
  "wishlists", "withdrawal_requests", "backup_runs",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const fileName = `welile_export_${stamp}.sql`;
  const storagePath = `${startedAt.getUTCFullYear()}/${fileName}`;

  let dump = `-- Welile Weekly Database Backup\n-- Generated: ${startedAt.toISOString()}\n\nBEGIN;\n\n`;
  dump += `DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','moderator','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n\n`;

  let totalRows = 0;
  let tablesProcessed = 0;

  try {
    for (const tableName of TABLES) {
      let allRows: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: rows, error } = await supabase
          .from(tableName).select("*").range(offset, offset + pageSize - 1);
        if (error) {
          dump += `-- Error reading ${tableName}: ${error.message}\n\n`;
          hasMore = false; break;
        }
        if (rows && rows.length > 0) {
          allRows = allRows.concat(rows);
          offset += pageSize;
          hasMore = rows.length === pageSize;
        } else { hasMore = false; }
      }
      tablesProcessed++;
      if (allRows.length > 0) {
        const cols = Object.keys(allRows[0]);
        dump += `-- Table: ${tableName} (${allRows.length} rows)\n`;
        for (const row of allRows) {
          const values = cols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
            if (typeof v === "number") return String(v);
            if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          dump += `INSERT INTO public.${tableName} (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;\n`;
        }
        dump += `\n`;
        totalRows += allRows.length;
      } else {
        dump += `-- Table: ${tableName} (0 rows)\n\n`;
      }
    }
    dump += `COMMIT;\n`;

    const bytes = new TextEncoder().encode(dump);
    const sizeBytes = bytes.byteLength;

    const { error: upErr } = await supabase.storage
      .from("db-backups")
      .upload(storagePath, bytes, {
        contentType: "application/sql",
        upsert: false,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from("db-backups")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed) throw new Error(`Sign failed: ${signErr?.message}`);

    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);

    // Send email to each recipient
    for (const email of RECIPIENTS) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "database-backup-ready",
            recipientEmail: email,
            idempotencyKey: `db-backup-${stamp}-${email}`,
            templateData: {
              downloadUrl: signed.signedUrl,
              fileName,
              sizeMb,
              tableCount: tablesProcessed,
              rowCount: totalRows,
              generatedAt: startedAt.toISOString(),
              expiresInHours: 168,
            },
          },
        });
      } catch (e) {
        console.error(`Failed to email ${email}:`, e);
      }
    }

    await supabase.from("backup_runs").insert({
      storage_path: storagePath,
      size_bytes: sizeBytes,
      table_count: tablesProcessed,
      row_count: totalRows,
      status: "success",
      recipients: RECIPIENTS,
    });

    return new Response(JSON.stringify({
      success: true, storagePath, sizeBytes, tableCount: tablesProcessed, rowCount: totalRows,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Backup failed:", msg);
    await supabase.from("backup_runs").insert({
      storage_path: storagePath, status: "failed", error_message: msg, recipients: RECIPIENTS,
    });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});