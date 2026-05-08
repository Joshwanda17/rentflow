// RETIRED: This edge function has been retired.
// All wallet → platform debits MUST go through the CFO Direct Debit action
// (`cfo-direct-credit` edge function with operation: 'debit').
//
// CFO Direct Debit posts a balanced double-entry to general_ledger and
// updates the wallet cache via apply_wallet_movement. It does NOT create
// any debt row (no agent_advances, no advance_balance change), so a user's
// future deposits are not silently swallowed to repay anything.
//
// This stub is kept so any stale client / scheduler / curl test gets a
// clear, loud failure instead of a quiet successful debit through the
// deprecated path.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "RETIRED",
      message:
        "wallet-deduction is retired. Use CFO Direct Debit (cfo-direct-credit, operation: 'debit') instead.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
