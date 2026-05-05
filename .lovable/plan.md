I found the current CEO Angel Pool delete flow is only doing a client-side `UPDATE status='deleted'`, then immediately showing success. The dashboard list is filtered to `status='confirmed'`, so if the update truly succeeds the shareholder should disappear and their shares should automatically be counted as available again. Since SSENKAALI PIUS still has a `confirmed` Angel Pool investment in the database, the update is not reliably affecting the row even though the UI says success.

Plan:

1. Replace the fragile client-side delete/suspend/edit updates with a backend-controlled action RPC for Angel Pool shareholder actions.
   - The RPC will check that the caller is CEO/manager.
   - It will require the mandatory 10+ character reason.
   - For delete, it will update all confirmed rows for that investor to `deleted` and return the number of rows changed, shares released, and amount released.
   - For suspend, it will update confirmed rows to `suspended` and return the count.
   - For edit, it will safely update allocation values and return the count.

2. Make the CEO dashboard fail loudly if nothing was changed.
   - If delete returns `0` affected rows, the UI will show an error instead of “success”.
   - If delete succeeds, the toast will confirm how many shares were released back to the pool.
   - The row will be removed from “All Shareholders” because the list only includes confirmed investments.

3. Ensure released shares are reflected in the pool immediately.
   - The dashboard already calculates `Shares Sold` and `Shares Left` from confirmed investments only.
   - After delete, invalidate/refetch both `angel-pool-management-investors` and the shared `angel-pool-data` queries so all Angel Pool widgets update.

4. Improve profile fetching for the shareholder profile dialog.
   - Fetch profile data with a CEO/manager-safe backend RPC or broaden the existing profile read policy for CEO if needed.
   - Keep the view audit log.
   - Show fallback profile fields when some values are missing, instead of blank profile information.

5. Verify the specific record after implementation.
   - Test against SSENKAALI PIUS’ current confirmed investment.
   - Confirm the database status changes from `confirmed` to `deleted` or is soft-deleted.
   - Confirm the shareholder disappears from the CEO “All Shareholders” list.
   - Confirm `Shares Left` increases by the deleted shareholder’s shares.