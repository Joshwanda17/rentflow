

## Fix garbled arrow (��) in Partner email CTA buttons

### Problem
The "Access Your Dashboard →" button in the **Portfolio Compounded** email renders as "Access Your Dashboard ��" in the user's mail client. The Unicode `→` (U+2192) is being mis-decoded somewhere in the Mailgun delivery pipeline (charset mismatch). Same broken arrow exists in two sibling templates that share this CTA.

### Fix
Replace the literal `→` character with the HTML entity `&rarr;` (rendered via `dangerouslySetInnerHTML` since JSX escapes entities). HTML entities are 7-bit ASCII and immune to charset/encoding issues, so they render reliably in every email client.

### Files changed (3)
All three partner emails use the same CTA block — fix them together for consistency:

1. `supabase/functions/_shared/transactional-email-templates/partner-compound.tsx` (line 159) — the "Portfolio Compounded" template the user reported.
2. `supabase/functions/_shared/transactional-email-templates/partnership-topup.tsx` (line 141)
3. `supabase/functions/_shared/transactional-email-templates/partnership-agreement.tsx` (line 216)

### Change pattern (per file)
Replace:
```tsx
<Link href={dashboard_url} style={ctaButton}>
  Access Your Dashboard&nbsp;→
</Link>
```
with:
```tsx
<Link
  href={dashboard_url}
  style={ctaButton}
  dangerouslySetInnerHTML={{ __html: 'Access Your Dashboard&nbsp;&rarr;' }}
/>
```

This keeps the visual arrow identical, removes the non-ASCII byte that's tripping the encoder, and matches the email-safe pattern.

### Out of scope
- No other glyphs (em dashes `—`, ellipses, etc.) are reported broken, so they stay as-is. If a future report shows them garbled, same fix pattern applies.
- No changes to email subject, sender, schedule, or send logic.
- No DB or RPC changes.

### Verification
After deploy, trigger a re-send of the Portfolio Compounded email (or use the test-email function) and confirm the arrow renders as `→` instead of `��`.

