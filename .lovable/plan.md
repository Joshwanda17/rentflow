I found why this is still appearing on iOS.

The screenshot is not an iOS cache issue. The live backend still has the old database function definition for `public.recompute_agent_earned_vouch(uuid,text,uuid,numeric)`. It is still trying to write this invalid column:

```sql
welile_trust_score_cache.updated_at
```

But the real table only has:

```sql
last_calculated_at
```

I also checked the migration history table and the previous local fix file is not recorded as applied on the live backend, so the app is still hitting the broken function when you press Confirm Payment.

There is one more related issue that should be fixed in the same pass: the current `agent_collections` trigger calls `capture_trust_signal` with the wrong argument shape. The current visible error happens first, but after fixing `updated_at`, that trigger can expose the next failure unless corrected.

Plan to fix:

1. Apply a new backend migration that replaces the live 4-argument `recompute_agent_earned_vouch` function.
   - Use `last_calculated_at`, not `updated_at`.
   - Include required `ai_id` values for new trust score cache rows.
   - Preserve the agent vouch limit audit history logic.
   - Keep `SET search_path = public`.

2. Replace `trg_recompute_agent_vouch_on_collection` so allocation inserts do not crash.
   - Recompute agent vouch on insert/update/delete.
   - Capture the trust signal in a best-effort block so observability never blocks payment allocation.
   - Use the correct `capture_trust_signal` signature, or skip safely if required GPS fields are unavailable for this allocation path.

3. Verify directly against the live backend after migration.
   - Read `pg_get_functiondef` for both functions and confirm no `updated_at` reference remains in `welile_trust_score_cache` writes.
   - Confirm the trigger points to the corrected function.
   - Confirm the `welile_trust_score_cache` schema remains unchanged and uses `last_calculated_at`.

4. Confirm the user-facing allocation path.
   - The Confirm Payment flow should no longer show: `column "updated_at" of relation "welile_trust_score_cache" does not exist`.
   - No client-side/iOS code change should be needed, because the error is coming from the backend function invoked by the allocation flow.

After approval, I’ll implement the backend migration and verify the live definitions.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
  <lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>