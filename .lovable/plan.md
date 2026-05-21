## Daily Agent Performance Report

Generate a per-agent daily report showing how much each agent collected vs. expected, plus the principal the company has paid out for their tenants. One row per agent.

### Output
- PDF: `/mnt/documents/agent_daily_performance_YYYY-MM-DD.pdf` (landscape A4)
- Companion CSV: `/mnt/documents/agent_daily_performance_YYYY-MM-DD.csv`
- Default report date = yesterday (full closed day); can be overridden

### Columns (one row per agent)
1. Agent name
2. Phone
3. Active tenants (rent_requests in funded/disbursed/repaying/active)
4. Expected today (sum of `daily_repayment` for active tenants)
5. Collected today (sum of `agent_collections.amount` where `created_at` is on report date)
6. Collection rate % (Collected / Expected)
7. # tenants who paid today (distinct `tenant_id` in collections)
8. Principal paid by company (sum of `rent_amount` on active rent_requests — same exposure figure as previous report)
9. Outstanding balance (Principal + fees − amount_repaid, clamped ≥ 0)
10. Status badge (Critical <25%, Low 25–49%, Moderate 50–74%, Good 75–94%, Excellent ≥95%)

Totals row at the bottom.

### Data sources
- `rent_requests` — active tenants, `daily_repayment`, `rent_amount`, `total_repayment`, `amount_repaid`
- `agent_collections` — actual collections on the report date
- `profiles` — agent name + phone

### How to run
Direct script execution (no app code changes):
1. SQL query joining the three tables, grouped by `agent_id`, parameterised by date
2. Python + reportlab generates the PDF (reuse the layout from `agent_company_exposure.pdf`)
3. QA each page via `pdftoppm` before delivering

### Options to confirm
- **Report date**: yesterday (default) or a specific date you'll provide
- **Include zero-collection agents?** Yes by default (so you can see who didn't collect)
- **Sort order**: by collection rate ascending (worst performers first), or by collected amount descending

Once you approve, I'll generate the PDF for the chosen date.
