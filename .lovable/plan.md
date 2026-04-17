

The user wants:
- A single referral link for the chatbot to share
- Format: `domain/{code}` (no `/r/` prefix — just `welilereceipts.com/WLEQ`)
- Tracks every click (so we know which users came via the bot)
- I should generate the link and give it to them

Existing setup uses `/r/:code`. They specifically want `domain/{code}` directly. That means a new top-level route that doesn't collide with existing routes.

Keep this minimal — they declined the big plan. No dashboard, no per-source tagging UI, just: one link + click tracking.

## Plan — Single Bot Referral Link with Click Tracking

### What I'll build

**1. DB migration (minimal)**
- Add `click_count int default 0` and `last_clicked_at timestamptz` to existing `short_links`
- New table `short_link_clicks` (id, code, clicked_at, user_agent, referrer) — one row per visit
- New RPC `record_short_link_click(p_code, p_user_agent, p_referrer)` — increments counter + inserts row, callable by anon

**2. New route `/:code` (top-level, format `welilereceipts.com/WLEQ`)**
- New page `TrackedRedirect.tsx` — looks up code in `short_links`, fires click-tracking RPC, redirects to target
- Added in `App.tsx` as the LAST route (after all named routes) so it only catches unknown 4–8 char paths
- Guard: only treat path as a code if it matches `/^[A-Za-z0-9]{4,8}$/` and isn't a known route — otherwise fall through to NotFound

**3. Generate the actual bot link (one-time)**
- After migration runs, I'll insert one `short_links` row with `target_path='/auth'`, `target_params={source:'bot'}`, owned by your account
- Then output the final URL like `https://welilereceipts.com/WLEQ7p` for you to give to the bot

**4. Tiny click stats query helper**
- Add a one-line readonly view so you can later check `select code, click_count, last_clicked_at from short_links` to see how many bot visitors came in

### Files
- `supabase/migrations/<new>.sql` — columns, clicks table, RPC, RLS
- `src/pages/TrackedRedirect.tsx` — new
- `src/App.tsx` — add catch-route at end
- One DB insert to mint your bot's link

### Format
`https://welilereceipts.com/{CODE}` — exactly as you asked. No `/r/`.

### After implementation
I'll reply with the actual generated link (e.g. `https://welilereceipts.com/Kx9Mq2`) ready for the bot.

