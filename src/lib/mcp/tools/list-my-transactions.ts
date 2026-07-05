import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_transactions",
  title: "List my recent transactions",
  description:
    "List the signed-in user's most recent wallet ledger entries (deposits, withdrawals, commissions). Amounts are in UGX.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .describe("How many recent entries to return. Defaults to 20; capped at 100.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    // User-facing ledger filter (memory rule): exclude admin corrections.
    const { data, error } = await supabaseForUser(ctx)
      .from("general_ledger")
      .select("id, created_at, category, entry_type, amount, description, wallet_bucket")
      .eq("user_id", ctx.getUserId())
      .neq("classification", "admin_correction")
      .neq("category", "system_balance_correction")
      .order("created_at", { ascending: false })
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const summary = rows
      .map(
        (r) =>
          `${new Date(r.created_at as string).toISOString().slice(0, 10)} · ${r.category} · ${r.entry_type} UGX ${Number(r.amount).toLocaleString()}`,
      )
      .join("\n");
    return {
      content: [{ type: "text", text: summary || "No transactions found." }],
      structuredContent: { transactions: rows },
    };
  },
});