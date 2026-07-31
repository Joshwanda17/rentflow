/**
 * Contributed principal = money the partner actually put in
 * (creation amount + prior top-ups), EXCLUDING ROI that was
 * compounded into investor_portfolios.investment_amount.
 *
 * roi_compounded events are logged in audit_logs
 * (table_name = 'investor_portfolios', record_id = portfolio id,
 *  metadata.roi_amount = the ROI folded into principal).
 */
export async function getContributedPrincipal(
  supabase: any,
  portfolioId: string,
  currentInvestmentAmount: number,
): Promise<number> {
  const current = Number(currentInvestmentAmount) || 0;
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("metadata")
      .eq("action_type", "roi_compounded")
      .eq("table_name", "investor_portfolios")
      .eq("record_id", portfolioId);
    if (error) throw error;
    const compounded = (data ?? []).reduce(
      (sum: number, row: any) => sum + (Number(row?.metadata?.roi_amount) || 0),
      0,
    );
    return Math.max(0, current - compounded);
  } catch (e) {
    console.warn("[contributed-principal] fallback to raw investment_amount:", e);
    return current;
  }
}
