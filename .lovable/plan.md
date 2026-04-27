# Add Reject Action to Landlord Ops Verification Queue

## What you'll get

In **Executive Hub → Landlord Ops → Verification Queue**, every listing card currently shows a single purple **"Verify → CFO"** button. We'll add a second button next to it: **"Reject"**, which opens a dialog asking the operator for a comment (minimum 10 characters). On submit:

1. The listing's `status` flips to `rejected` (it disappears from the verification queue).
2. The action is logged to `audit_logs` with the comment.
3. The **agent who created the listing** receives a notification on their dashboard explaining which listing was rejected and why.

The agent will see the notification in a new **bell icon** in their Agent Dashboard header, with a red unread-count badge. Clicking the bell opens a dropdown list of recent notifications (rejections, registration prompts, etc.) and lets them mark items as read.

## Steps

1. **Database migration** — create a `SECURITY DEFINER` RPC `reject_house_listing(listing_id, reason)` that:
   - Verifies the caller has `super_admin`, `ceo`, `cto`, or `manager` role (Landlord Ops staff).
   - Updates `house_listings.status = 'rejected'`.
   - Inserts an `audit_logs` row (`action_type = 'listing_rejected'`).
   - Inserts a `notifications` row for the listing's `agent_id` (bypasses the `block_all_notification_inserts` trigger via SECURITY DEFINER, matching the pattern used by `notify_agent_landlord_registration`).
   - Notification title: `🚫 Listing Rejected`, type: `warning`, metadata includes `listing_id`, `listing_title`, `reason`, `rejected_by`.

2. **Wire the existing `EmptyHouseActionDialog`** to call the new RPC instead of a direct table update when `actionType === 'reject'`. This keeps delete/delist behavior unchanged but ensures rejection always fires the notification atomically.

3. **Add the Reject button to the Verification Queue card** in `src/components/executive/LandlordOpsDashboard.tsx` (around line 1219). Layout becomes a 2-column grid:
   - Left: outline destructive **"Reject"** button → opens `EmptyHouseActionDialog` with `type: 'reject'`.
   - Right: existing **"Verify → Auto-Pay UGX 5K"** button.

4. **Build an Agent Notification Bell** (`src/components/agent/AgentNotificationBell.tsx`):
   - Bell icon with unread-count badge in the Agent Dashboard top bar.
   - Dropdown (Popover) listing the most recent 20 notifications with title, message, time-ago, and a colored dot for unread.
   - Click a notification → marks it read; "Mark all read" button at the top.
   - Realtime subscription to `notifications` table filtered by `user_id = current agent` so new rejections appear instantly.

5. **Mount the bell** in `src/components/dashboards/AgentDashboard.tsx` header area.

## Technical details

- **Files created**:
  - `supabase/migrations/<timestamp>_reject_house_listing_rpc.sql` — new RPC + grant `EXECUTE` to `authenticated`.
  - `src/components/agent/AgentNotificationBell.tsx`.
- **Files edited**:
  - `src/components/executive/landlord-ops/EmptyHouseActionDialog.tsx` — use RPC for the reject path; keep delete/delist as today.
  - `src/components/executive/LandlordOpsDashboard.tsx` — add Reject button in the Verification Queue (`view === 'verify'` block).
  - `src/components/dashboards/AgentDashboard.tsx` — mount `<AgentNotificationBell />` in header.
- **Realtime**: enable `supabase_realtime` publication for the `notifications` table if not already; apply only if missing (idempotent migration check).
- **No edits** to `src/integrations/supabase/{client,types}.ts` — types regenerate automatically after migration.

## Out of scope

- Re-listing / un-rejecting a listing (operator can already use the existing edit/delist flow).
- SMS/WhatsApp notification to the agent (only in-app notification per request; can be added later).
- Notification bells for non-agent roles (this plan only targets the agent who listed).
