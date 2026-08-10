import { useMemo, useState } from 'react';
import { ChevronLeft, Paperclip, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Minimal shape needed to render an extracted transaction email in a
 * Gmail-like inbox row. Mirrors the `gmail_transactions` columns the
 * Email Transaction Extractor already loads.
 */
export interface GmailStyleRow {
  id: string;
  from_email?: string | null;
  from_name?: string | null;
  subject?: string | null;
  snippet?: string | null;
  amount?: number | null;
  transaction_id?: string | null;
  internal_date?: string | null;
  direction?: string | null;
  channel?: string | null;
  counterparty?: string | null;
  fee?: number | null;
  balance?: number | null;
}

const AVATAR_TONES = [
  'bg-rose-600', 'bg-amber-600', 'bg-emerald-600', 'bg-sky-600',
  'bg-indigo-600', 'bg-violet-600', 'bg-teal-600', 'bg-orange-600',
];

function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function senderName(r: GmailStyleRow) {
  return (r.from_name || r.from_email || 'Unknown sender').trim();
}

/** Gmail-style date column: time for today, "MMM d" otherwise. */
function gmailDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtUgx(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return null;
  return `UGX ${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Renders the extracted money-in / money-out emails exactly the way Gmail
 * shows an inbox: avatar, bold sender, subject followed by a muted snippet on
 * one line, and a right-aligned date. Tapping a row opens a Gmail-style
 * reading pane with the full header block and body text.
 *
 * Purely presentational — routing/charging actions stay in the detailed ops
 * view, reachable via the "Ops view" switch in the parent header.
 */
export function GmailStyleEmailList({ rows }: { rows: GmailStyleRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Always present the newest email first, even if the parent list order drifts
  // (e.g. realtime inserts, focus-direction resets, or cached presets).
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = a.internal_date ? new Date(a.internal_date).getTime() : 0;
        const tb = b.internal_date ? new Date(b.internal_date).getTime() : 0;
        return tb - ta;
      }),
    [rows],
  );
  const open = openId ? sortedRows.find((r) => r.id === openId) ?? null : null;

  if (open) {
    const name = senderName(open);
    const amount = fmtUgx(open.amount);
    return (
      <div className="bg-background">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setOpenId(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="px-4 sm:px-6 py-4">
          <h3 className="text-lg sm:text-xl font-normal leading-snug break-words">
            {open.subject || '(no subject)'}
          </h3>
          <div className="mt-4 flex items-start gap-3">
            <span
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-semibold ${toneFor(name)}`}
              aria-hidden
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold">{name}</span>
                {open.from_email && (
                  <span className="text-xs text-muted-foreground break-all">
                    &lt;{open.from_email}&gt;
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                to me
                {open.internal_date
                  ? ` · ${new Date(open.internal_date).toLocaleString()}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {open.snippet || 'No message body was captured for this email.'}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {amount && (
              <span className="rounded-full border px-2.5 py-1 font-mono tabular-nums">
                {amount}
              </span>
            )}
            {open.transaction_id && (
              <span className="rounded-full border px-2.5 py-1 font-mono">
                Ref {open.transaction_id}
              </span>
            )}
            {open.channel && (
              <span className="rounded-full border px-2.5 py-1 capitalize">{open.channel}</span>
            )}
            {open.counterparty && (
              <span className="rounded-full border px-2.5 py-1">{open.counterparty}</span>
            )}
            {fmtUgx(open.fee) && (
              <span className="rounded-full border px-2.5 py-1 font-mono tabular-nums">
                Fee {fmtUgx(open.fee)}
              </span>
            )}
            {fmtUgx(open.balance) && (
              <span className="rounded-full border px-2.5 py-1 font-mono tabular-nums">
                Balance {fmtUgx(open.balance)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        No emails in this view.
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((r) => {
        const name = senderName(r);
        const amount = fmtUgx(r.amount);
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              className="w-full text-left flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/50 hover:shadow-[inset_0_-1px_0_hsl(var(--border))] transition-colors"
            >
              <Star className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
              <span
                className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-semibold ${toneFor(name)}`}
                aria-hidden
              >
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="w-28 sm:w-44 shrink-0 truncate text-sm font-semibold">
                {name}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{r.subject || '(no subject)'}</span>
                {r.snippet && (
                  <span className="text-muted-foreground"> &ndash; {r.snippet}</span>
                )}
              </span>
              {amount && (
                <span className="hidden md:inline shrink-0 text-xs font-mono tabular-nums text-muted-foreground">
                  {amount}
                </span>
              )}
              {r.transaction_id && (
                <Paperclip className="hidden lg:block h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
              <span className="shrink-0 w-14 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {gmailDate(r.internal_date)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
