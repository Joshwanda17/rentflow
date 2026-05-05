---
name: User-facing ledger filter
description: End-user wallet views and balance RPCs filter system_balance_correction ONLY when paired with admin_correction; production reversals stay visible
type: constraint
---
End-user wallet balance reads (`v_user_wallet_strict`, `get_user_wallet_view`, `get_user_available_balance`, and any frontend `general_ledger` query that drives a user-visible figure) MUST exclude rows that are BOTH `classification = 'admin_correction'` AND `category = 'system_balance_correction'`.

They MUST NOT exclude `system_balance_correction` rows that are classified `production` — those are legitimate operational reversals (e.g., reversing a bogus pending top-up wallet credit, payroll-growth credits) and they have to count toward the user's balance, otherwise the user sees a phantom balance that the cache doesn't have.

**Why:** Prior to 2026-05-05 the filter was a blanket `category <> 'system_balance_correction'`, which silently dropped production reversals. Real-world impact: tenant LUYIMA SOLOMON SAMUEL (`22f6cdf9-…`) saw UGX 100,000 withdrawable that did not exist — the April 17 production reversal of his parked top-up was being filtered out.

**How to apply:**
- SQL: `NOT (COALESCE(classification,'') = 'admin_correction' AND COALESCE(category,'') = 'system_balance_correction')`
- Supabase JS (frontend): `.not('and', '(classification.eq.admin_correction,category.eq.system_balance_correction)')` — or restructure the filter so production-classified corrections survive.

CFO/ops dashboards remain exempt and may include all classifications.
