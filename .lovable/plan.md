## Wallets View Migration

Rename `public.wallets` → `wallets_physical`, then create a view named `wallets` that derives `balance` and the three buckets live from `v_user_wallet_strict`. Frontend queries (`supabase.from('wallets')`) keep working but always reflect ledger truth.

### Why I'm deviating from the SQL you pasted (3 small but critical patches)

Running your SQL exactly as written will break production. I will execute the same architecture but with these three fixes:

1. **Re-point `profiles.wallet_id` FK** to `wallets_physical(id)` before the rename. Otherwise the FK breaks.
2. **`security_invoker = true`** on the view, and **drop `anon`** from the GRANT. Without this, the view bypasses RLS and exposes every user's balance to anonymous callers.
3. **Pass-through bucket UPDATEs** to `wallets_physical` in the INSTEAD OF trigger. The sole-writer `apply_wallet_movement` updates `withdrawable_balance` / `float_balance` / `advance_balance` — your version silently drops those, freezing the physical row forever and disabling every CFO drift/sweep/reconciliation tool. The view's reads are still strict ledger-derived; the existing `enforce_wallet_ledger_only` fortress trigger continues to gate writes via `sync_authorized`.

Net result is exactly what you asked for — every read in the app, including the CFO Reconciliation tabs, reflects ledger truth — without breaking FKs, RLS, or the wallet writer pipeline.

### Migration steps

1. `ALTER TABLE profiles DROP CONSTRAINT profiles_wallet_id_fkey`
2. `ALTER TABLE wallets RENAME TO wallets_physical`
3. Recreate `profiles_wallet_id_fkey` against `wallets_physical(id)`
4. `CREATE VIEW public.wallets WITH (security_invoker = true) AS SELECT … FROM wallets_physical wp LEFT JOIN v_user_wallet_strict vs ON vs.user_id = wp.user_id` — `balance`, `withdrawable_balance`, `float_balance`, `advance_balance` come from `vs`; `id`, `user_id`, `created_at`, `updated_at`, `locked_balance`, `currency` come from `wp`
5. `GRANT SELECT ON public.wallets TO authenticated, service_role` (no anon)
6. `CREATE FUNCTION wallets_view_dml()` — INSERT routes to `wallets_physical`; UPDATE passes `balance` + 3 buckets + `locked_balance` + `currency` through with COALESCE; DELETE removes the physical row
7. `CREATE TRIGGER instead_of_wallets_dml INSTEAD OF INSERT OR UPDATE OR DELETE ON wallets`
8. `NOTIFY pgrst, 'reload schema'`

### Verification after migration

- `SELECT balance, withdrawable_balance, float_balance, advance_balance FROM wallets WHERE user_id = '<test agent>'` should match `SELECT total_visible, withdrawable, float_balance, advance_balance FROM v_user_wallet_strict WHERE user_id = '<test agent>'`.
- CFO → Reconciliation panels (`PhantomDriftPanel`, `AnchoredCacheDriftPanel`, `WalletDeductionPanel`, `CacheSweepPanel`) keep functioning because they read `wallets_physical` indirectly via the same view, which still surfaces strict figures (drift between cache and strict will now appear as zero from the view's perspective; operator panels that need raw cache will be repointed to `wallets_physical` in a follow-up if needed — flagged below).
- `INSERT INTO wallets (user_id) VALUES (…)` from edge functions still creates a physical row.
- `apply_wallet_movement` continues to mutate buckets through the trigger.

### Known follow-ups (not blocking this migration)

- A handful of operator dashboards intentionally compare cached vs strict to detect drift. After this migration, "cache" reads via `wallets` equal "strict" by construction. If you want those panels to keep showing the raw physical cache, I'll repoint them to `wallets_physical` directly in a follow-up PR.
- `sync_wallet_from_ledger` and other internal sync functions remain no-ops as designed.

### Memory updates

- New: `mem://architecture/wallets-view-architecture` documenting that `public.wallets` is a view over `wallets_physical + v_user_wallet_strict`, the INSTEAD OF trigger contract, and the rule that operator panels needing raw cache must read `wallets_physical`.
- Update Core rule: "Wallets are UI caches…" → "`wallets` is a strict ledger-derived view; `wallets_physical` is the cache row, written only by `apply_wallet_movement` via the INSTEAD OF trigger."
